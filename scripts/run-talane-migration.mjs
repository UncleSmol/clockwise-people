import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as path from "node:path";
import * as fs from "node:fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE credentials in environment");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TALANE_COMPANY_ID = "be6a1fb3-2cac-4cf8-b01b-b1339ee07095";

async function main() {
  console.log(`Starting Talane & Associates data migration for Company: ${TALANE_COMPANY_ID}...`);

  // 1. Verify company exists
  const { data: company, error: compErr } = await admin
    .from("companies")
    .select("id, name")
    .eq("id", TALANE_COMPANY_ID)
    .single();

  if (compErr || !company) {
    console.error("Failed to find company:", compErr);
    process.exit(1);
  }
  console.log(`Verified Company: ${company.name} (${company.id})`);

  // 2. Count current records
  const { count: currentTe } = await admin
    .from("time_entries")
    .select("*", { count: "exact", head: true })
    .eq("company_id", TALANE_COMPANY_ID);
  const { count: currentLr } = await admin
    .from("leave_requests")
    .select("*", { count: "exact", head: true })
    .eq("company_id", TALANE_COMPANY_ID);

  console.log(`Current records in DB: ${currentTe} time entries, ${currentLr} leave requests.`);

  // 3. Clear existing time_entries and leave_requests
  console.log("Clearing existing time_entries and leave_requests for Talane & Associates...");
  const { error: teDelErr } = await admin
    .from("time_entries")
    .delete()
    .eq("company_id", TALANE_COMPANY_ID);
  if (teDelErr) {
    console.error("Error deleting time_entries:", teDelErr);
    process.exit(1);
  }

  const { error: lrDelErr } = await admin
    .from("leave_requests")
    .delete()
    .eq("company_id", TALANE_COMPANY_ID);
  if (lrDelErr) {
    console.error("Error deleting leave_requests:", lrDelErr);
    process.exit(1);
  }

  console.log("Existing records cleared successfully.");

  // 4. Read Excel workbook
  const filePath = path.join(
    process.cwd(),
    "workforce-clockins",
    "Talane & Associates",
    "clockwise_timesheets_filled_10_Oct_26_07h28.xlsx"
  );
  console.log(`Reading migration workbook from: ${filePath}`);
  const fileBuffer = fs.readFileSync(filePath);
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const ws = wb.Sheets["Timesheets"];
  if (!ws) {
    console.error("Worksheet 'Timesheets' not found in file!");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`Parsed ${rows.length} rows from Excel sheet.`);

  // 5. Lookups
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name, email, employee_number")
    .eq("company_id", TALANE_COMPANY_ID);
  
  const empByEmail = new Map(
    (employees || []).map((e) => [String(e.email || "").toLowerCase().trim(), e])
  );
  const empByNum = new Map(
    (employees || []).filter((e) => e.employee_number).map((e) => [String(e.employee_number || "").toLowerCase().trim(), e])
  );

  console.log(`Found ${employees?.length || 0} employees in Talane & Associates.`);

  const { data: workstations } = await admin
    .from("company_workstations")
    .select("id, name")
    .eq("company_id", TALANE_COMPANY_ID);
  const wsByName = new Map(
    (workstations || []).map((w) => [String(w.name).toLowerCase().trim(), w.id])
  );
  console.log(`Found ${workstations?.length || 0} workstations.`);

  const { data: leaveTypes } = await admin
    .from("leave_types")
    .select("id, name, is_paid")
    .eq("company_id", TALANE_COMPANY_ID);
  const ltByName = new Map(
    (leaveTypes || []).map((l) => [String(l.name).toLowerCase().trim(), l])
  );
  console.log(`Found ${leaveTypes?.length || 0} leave types.`);

  // Ensure all employees have a timesheet header
  const { data: existingTimesheets } = await admin
    .from("timesheets")
    .select("id, employee_id")
    .eq("company_id", TALANE_COMPANY_ID)
    .is("deleted_at", null);
  
  const tsMap = new Map((existingTimesheets || []).map((t) => [t.employee_id, t.id]));
  const missingEmpTimesheets = (employees || []).filter((e) => !tsMap.has(e.id));
  if (missingEmpTimesheets.length > 0) {
    console.log(`Creating timesheet records for ${missingEmpTimesheets.length} employees...`);
    const { data: newTsList, error: tsErr } = await admin
      .from("timesheets")
      .insert(
        missingEmpTimesheets.map((e) => ({
          company_id: TALANE_COMPANY_ID,
          employee_id: e.id,
          status: "approved",
          notes: "Talane official historical migration",
        }))
      )
      .select("id, employee_id");
    if (tsErr) {
      console.error("Error creating timesheets:", tsErr);
      process.exit(1);
    }
    (newTsList || []).forEach((t) => tsMap.set(t.employee_id, t.id));
  }

  // 6. Map rows
  const timeEntriesToInsert = [];
  const leaveRequestsToInsert = [];
  let skippedCount = 0;

  for (const r of rows) {
    const email = String(r.employee_email || "").toLowerCase().trim();
    const empNum = String(r.employee_number || "").toLowerCase().trim();
    const emp = empByEmail.get(email) || empByNum.get(empNum);

    if (!emp) {
      skippedCount++;
      continue;
    }

    const workDate = String(r.work_date || "").slice(0, 10);
    if (!workDate) {
      skippedCount++;
      continue;
    }

    const timesheetId = tsMap.get(emp.id);
    if (!timesheetId) {
      skippedCount++;
      continue;
    }

    const workstationStr = String(r.workstation || "").trim();
    const workstationId = wsByName.get(workstationStr.toLowerCase()) || null;
    const rawStatus = String(r.status || "approved").toLowerCase().trim();
    const validStatus = ["approved", "submitted", "draft", "rejected"].includes(rawStatus)
      ? rawStatus
      : "approved";
    const notes = r.notes ? String(r.notes).trim() : null;

    const isLeave = r.entry_type === "leave" || Boolean(r.leave_type);

    if (isLeave) {
      const leaveTypeName = String(r.leave_type || "Annual Leave").trim();
      const ltObj = ltByName.get(leaveTypeName.toLowerCase()) || leaveTypes?.[0] || null;
      const leaveTypeId = ltObj?.id || null;
      const isPaid = ltObj ? ltObj.is_paid : true;
      const leaveHours = Number(r.leave_hours) || 8;

      timeEntriesToInsert.push({
        company_id: TALANE_COMPANY_ID,
        timesheet_id: timesheetId,
        employee_id: emp.id,
        workstation_id: workstationId,
        work_date: workDate,
        leave_type_id: leaveTypeId,
        clock_in: null,
        lunch_start: null,
        lunch_end: null,
        clock_out: null,
        gross_hours: leaveHours,
        lunch_hours: 0,
        paid_hours: isPaid ? leaveHours : 0,
        normal_hours: isPaid ? Math.min(leaveHours, 8) : 0,
        overtime_hours: 0,
        missing_clocking: false,
        late_arrival: false,
        early_departure: false,
        notes: notes ? `${leaveTypeName}: ${notes}` : leaveTypeName,
        status: validStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (leaveTypeId) {
        leaveRequestsToInsert.push({
          company_id: TALANE_COMPANY_ID,
          employee_id: emp.id,
          leave_type_id: leaveTypeId,
          start_date: workDate,
          end_date: workDate,
          total_hours: leaveHours,
          status: validStatus === "approved" ? "approved" : "submitted",
          reason: notes || leaveTypeName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      const clockIn = r.clock_in ? String(r.clock_in).trim().slice(0, 5) : null;
      const lunchStart = r.lunch_start ? String(r.lunch_start).trim().slice(0, 5) : null;
      const lunchEnd = r.lunch_end ? String(r.lunch_end).trim().slice(0, 5) : null;
      const clockOut = r.clock_out ? String(r.clock_out).trim().slice(0, 5) : null;

      let gross = 0;
      let lunch = 0;
      if (clockIn && clockOut) {
        const [inH, inM] = clockIn.split(":").map(Number);
        const [outH, outM] = clockOut.split(":").map(Number);
        let startMin = inH * 60 + (inM || 0);
        let endMin = outH * 60 + (outM || 0);
        if (endMin < startMin) endMin += 24 * 60;
        gross = Math.max(0, (endMin - startMin) / 60);
      }
      if (lunchStart && lunchEnd) {
        const [lsH, lsM] = lunchStart.split(":").map(Number);
        const [leH, leM] = lunchEnd.split(":").map(Number);
        let lStart = lsH * 60 + (lsM || 0);
        let lEnd = leH * 60 + (leM || 0);
        if (lEnd < lStart) lEnd += 24 * 60;
        lunch = Math.max(0, (lEnd - lStart) / 60);
      }

      const paid = Math.max(0, gross - lunch);
      const normal = Math.min(paid, 8);
      const overtime = Math.max(0, paid - 8);

      timeEntriesToInsert.push({
        company_id: TALANE_COMPANY_ID,
        timesheet_id: timesheetId,
        employee_id: emp.id,
        workstation_id: workstationId,
        work_date: workDate,
        leave_type_id: null,
        clock_in: clockIn,
        lunch_start: lunchStart,
        lunch_end: lunchEnd,
        clock_out: clockOut,
        gross_hours: Math.round(gross * 100) / 100,
        lunch_hours: Math.round(lunch * 100) / 100,
        paid_hours: Math.round(paid * 100) / 100,
        normal_hours: Math.round(normal * 100) / 100,
        overtime_hours: Math.round(overtime * 100) / 100,
        missing_clocking: !clockIn || !clockOut || Boolean(lunchStart && !lunchEnd),
        late_arrival: false,
        early_departure: false,
        notes,
        status: validStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Prepared ${timeEntriesToInsert.length} time entries (shifts & leave).`);
  console.log(`Prepared ${leaveRequestsToInsert.length} leave requests.`);
  console.log(`Skipped rows: ${skippedCount}`);

  // 7. Batch insert in chunks of 200
  const CHUNK_SIZE = 200;
  console.log("Inserting time_entries in chunks of 200...");
  for (let i = 0; i < timeEntriesToInsert.length; i += CHUNK_SIZE) {
    const chunk = timeEntriesToInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("time_entries").insert(chunk);
    if (error) {
      console.error(`Error inserting time_entries chunk ${i / CHUNK_SIZE + 1}:`, error);
      process.exit(1);
    }
    process.stdout.write(`Inserted ${Math.min(i + CHUNK_SIZE, timeEntriesToInsert.length)}/${timeEntriesToInsert.length} time entries\r`);
  }
  console.log("\nAll time entries successfully inserted!");

  console.log("Inserting leave_requests in chunks of 200...");
  for (let i = 0; i < leaveRequestsToInsert.length; i += CHUNK_SIZE) {
    const chunk = leaveRequestsToInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("leave_requests").insert(chunk);
    if (error) {
      console.error(`Error inserting leave_requests chunk ${i / CHUNK_SIZE + 1}:`, error);
      process.exit(1);
    }
    process.stdout.write(`Inserted ${Math.min(i + CHUNK_SIZE, leaveRequestsToInsert.length)}/${leaveRequestsToInsert.length} leave requests\r`);
  }
  console.log("\nAll leave requests successfully inserted!");

  // 8. Verification query
  const { count: finalTe } = await admin
    .from("time_entries")
    .select("*", { count: "exact", head: true })
    .eq("company_id", TALANE_COMPANY_ID);
  const { count: finalLr } = await admin
    .from("leave_requests")
    .select("*", { count: "exact", head: true })
    .eq("company_id", TALANE_COMPANY_ID);

  console.log("\n================ MIGRATION REPORT ================");
  console.log(`Company: ${company.name}`);
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Time entries in DB: ${finalTe}`);
  console.log(`Leave requests in DB: ${finalLr}`);
  console.log(`Skipped rows (non-Talane user): ${skippedCount}`);
  console.log("==================================================");
}

main().catch(console.error);
