"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserAccess } from "@/lib/foundation/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBalanceEligibleLeaveType } from "@/lib/work-rules/realtime-accrual";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

export type SupportedDatabaseTable =
  | "time_entries"
  | "leave_requests"
  | "leave_balances"
  | "employees"
  | "company_workstations"
  | "leave_types";

export type DatabaseMaintenanceResult<T = unknown> = {
  ok: boolean;
  message: string;
  data?: T;
};

/**
 * Fetch rows for a specific company and table with search and pagination
 */
export async function getCompanyDatabaseRowsAction(params: {
  companyId: string;
  table: SupportedDatabaseTable;
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<DatabaseMaintenanceResult<{ rows: Record<string, unknown>[]; totalCount: number }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const { companyId, table, page = 1, pageSize = 50, search = "" } = params;
  const admin = createSupabaseAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // Pre-fetch employee, workstation, and leave type lookups when querying related tables
    const needsLookup =
      table === "time_entries" || table === "leave_requests" || table === "leave_balances";

    let empMap = new Map<string, { id: string; full_name: string; email: string | null; employee_number: string | null }>();
    let wsMap = new Map<string, string>();
    let ltMap = new Map<string, { id: string; name: string; category?: string | null }>();

    if (needsLookup) {
      const [empsRes, wsRes, ltRes] = await Promise.all([
        admin
          .from("employees")
          .select("id, full_name, email, employee_number")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        admin
          .from("company_workstations")
          .select("id, name")
          .eq("company_id", companyId),
        admin
          .from("leave_types")
          .select("id, name, category")
          .eq("company_id", companyId)
          .is("deleted_at", null),
      ]);

      empMap = new Map((empsRes.data || []).map((e) => [e.id, e]));
      wsMap = new Map((wsRes.data || []).map((w) => [w.id, w.name]));
      ltMap = new Map((ltRes.data || []).map((l) => [l.id, l]));
    }

    let query = admin.from(table).select("*", { count: "exact" }).eq("company_id", companyId);

    // Filter out deleted records where applicable
    if (
      table === "employees" ||
      table === "company_workstations" ||
      table === "leave_types" ||
      table === "time_entries"
    ) {
      query = query.is("deleted_at", null);
    }

    // Apply table-specific ordering
    if (table === "time_entries") {
      query = query.order("work_date", { ascending: false });
    } else if (table === "leave_requests") {
      query = query.order("start_date", { ascending: false });
    } else if (table === "leave_balances") {
      query = query.order("updated_at", { ascending: false });
    } else if (table === "employees") {
      query = query.order("full_name", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    // Apply search filter if provided
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      const lowerSearch = trimmedSearch.toLowerCase();

      if (table === "time_entries") {
        const matchedEmpIds = Array.from(empMap.values())
          .filter(
            (e) =>
              e.full_name.toLowerCase().includes(lowerSearch) ||
              (e.email && e.email.toLowerCase().includes(lowerSearch)) ||
              (e.employee_number && e.employee_number.toLowerCase().includes(lowerSearch)),
          )
          .map((e) => e.id);

        if (matchedEmpIds.length > 0) {
          query = query.or(
            `work_date.ilike.${term},notes.ilike.${term},status.ilike.${term},employee_id.in.(${matchedEmpIds.join(",")})`,
          );
        } else {
          query = query.or(`work_date.ilike.${term},notes.ilike.${term},status.ilike.${term}`);
        }
      } else if (table === "leave_requests") {
        const matchedEmpIds = Array.from(empMap.values())
          .filter(
            (e) =>
              e.full_name.toLowerCase().includes(lowerSearch) ||
              (e.email && e.email.toLowerCase().includes(lowerSearch)) ||
              (e.employee_number && e.employee_number.toLowerCase().includes(lowerSearch)),
          )
          .map((e) => e.id);

        if (matchedEmpIds.length > 0) {
          query = query.or(
            `start_date.ilike.${term},end_date.ilike.${term},reason.ilike.${term},status.ilike.${term},employee_id.in.(${matchedEmpIds.join(",")})`,
          );
        } else {
          query = query.or(`start_date.ilike.${term},end_date.ilike.${term},reason.ilike.${term},status.ilike.${term}`);
        }
      } else if (table === "leave_balances") {
        const matchedEmpIds = Array.from(empMap.values())
          .filter(
            (e) =>
              e.full_name.toLowerCase().includes(lowerSearch) ||
              (e.email && e.email.toLowerCase().includes(lowerSearch)) ||
              (e.employee_number && e.employee_number.toLowerCase().includes(lowerSearch)),
          )
          .map((e) => e.id);

        const matchedLtIds = Array.from(ltMap.values())
          .filter((l) => l.name.toLowerCase().includes(lowerSearch))
          .map((l) => l.id);

        const orClauses: string[] = [];
        if (matchedEmpIds.length > 0) {
          orClauses.push(`employee_id.in.(${matchedEmpIds.join(",")})`);
        }
        if (matchedLtIds.length > 0) {
          orClauses.push(`leave_type_id.in.(${matchedLtIds.join(",")})`);
        }

        if (orClauses.length > 0) {
          query = query.or(orClauses.join(","));
        } else {
          // Force empty result when search doesn't match any employee or leave type
          return { ok: true, message: "No matching leave balance records.", data: { rows: [], totalCount: 0 } };
        }
      } else if (table === "employees") {
        query = query.or(`full_name.ilike.${term},email.ilike.${term},employee_number.ilike.${term},job_title.ilike.${term}`);
      } else if (table === "company_workstations" || table === "leave_types") {
        query = query.ilike("name", term);
      }
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { ok: false, message: error.message };
    }

    // Enrich rows with employee, workstation, and leave type names for readability
    let enrichedRows: Record<string, unknown>[] = (data || []) as Record<string, unknown>[];

    if (needsLookup) {
      enrichedRows = enrichedRows.map((r) => {
        const emp = empMap.get(r.employee_id as string);
        const wsName = wsMap.get(r.workstation_id as string);
        const lt = ltMap.get(r.leave_type_id as string);

        return {
          ...r,
          _employee_name: emp ? `${emp.full_name} (${emp.employee_number || emp.email || "Staff"})` : (r.employee_id || "--"),
          _employee_number: emp?.employee_number || "",
          _workstation_name: wsName || (r.workstation_id ? "Unknown" : "--"),
          _leave_type_name: lt?.name || (r.leave_type_id ? "Unknown" : "--"),
          _leave_type_category: lt?.category || "",
        };
      });
    }

    return {
      ok: true,
      message: "Data retrieved successfully.",
      data: {
        rows: enrichedRows,
        totalCount: count ?? 0,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to query database table.",
    };
  }
}

/**
 * Directly update a row in the database
 */
export async function updateDatabaseRowAction(params: {
  companyId: string;
  table: SupportedDatabaseTable;
  rowId: string;
  values: Record<string, unknown>;
}): Promise<DatabaseMaintenanceResult> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const { companyId, table, rowId, values } = params;
  const admin = createSupabaseAdminClient();

  // Strip calculated meta fields
  const cleanValues: Record<string, unknown> = {};
  const numericFields = new Set([
    "balance_hours",
    "accrued_hours",
    "taken_hours",
    "adjusted_hours",
    "gross_hours",
    "lunch_hours",
    "paid_hours",
    "normal_hours",
    "overtime_hours",
    "total_hours",
    "hourly_rate",
    "monthly_salary",
    "radius_meters",
  ]);

  for (const [key, val] of Object.entries(values)) {
    if (!key.startsWith("_") && key !== "id" && key !== "company_id" && key !== "created_at") {
      if (numericFields.has(key) && val !== null && val !== undefined && val !== "") {
        const parsed = Number(val);
        cleanValues[key] = Number.isFinite(parsed) ? parsed : val;
      } else {
        cleanValues[key] = val === "" ? null : val;
      }
    }
  }

  cleanValues["updated_at"] = new Date().toISOString();

  const { error } = await admin
    .from(table)
    .update(cleanValues)
    .eq("id", rowId)
    .eq("company_id", companyId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/timesheets");
  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/employees");

  return { ok: true, message: "Record successfully updated." };
}

/**
 * Directly delete a row from the database
 */
export async function deleteDatabaseRowAction(params: {
  companyId: string;
  table: SupportedDatabaseTable;
  rowId: string;
}): Promise<DatabaseMaintenanceResult> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const { companyId, table, rowId } = params;
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from(table)
    .delete()
    .eq("id", rowId)
    .eq("company_id", companyId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/timesheets");
  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/employees");

  return { ok: true, message: "Record deleted successfully." };
}

/**
 * Directly insert a row into the database
 */
export async function insertDatabaseRowAction(params: {
  companyId: string;
  table: SupportedDatabaseTable;
  values: Record<string, unknown>;
}): Promise<DatabaseMaintenanceResult<{ id: string }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const { companyId, table, values } = params;
  const admin = createSupabaseAdminClient();

  const cleanValues: Record<string, unknown> = {
    ...values,
    company_id: companyId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from(table).insert(cleanValues).select("id").single();

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/timesheets");
  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/employees");

  return { ok: true, message: "Record inserted successfully.", data: { id: data.id } };
}

/**
 * Clear all time entries and leave requests for a company
 */
export async function clearCompanyTimesheetsAndLeaveAction(
  companyId: string,
): Promise<DatabaseMaintenanceResult<{ deletedTimeEntries: number; deletedLeaveRequests: number }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const admin = createSupabaseAdminClient();

  try {
    // 1. Count before deletion
    const { count: teCount } = await admin
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    const { count: lrCount } = await admin
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    // 2. Perform deletions
    const { error: teErr } = await admin.from("time_entries").delete().eq("company_id", companyId);
    if (teErr) throw new Error(`Failed to delete time entries: ${teErr.message}`);

    const { error: lrErr } = await admin.from("leave_requests").delete().eq("company_id", companyId);
    if (lrErr) throw new Error(`Failed to delete leave requests: ${lrErr.message}`);

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/timesheets");
    revalidatePath("/dashboard/leave");

    return {
      ok: true,
      message: `Cleared ${teCount ?? 0} timesheet entries and ${lrCount ?? 0} leave requests.`,
      data: {
        deletedTimeEntries: teCount ?? 0,
        deletedLeaveRequests: lrCount ?? 0,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to clear company timesheets and leave.",
    };
  }
}

/**
 * Upload and execute the Talane and Associates migration spreadsheet
 */
export async function executeTalaneMigrationAction(
  companyId: string,
): Promise<DatabaseMaintenanceResult<{ insertedShifts: number; insertedLeaves: number; skippedCount: number }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const admin = createSupabaseAdminClient();
  const filePath = path.join(
    process.cwd(),
    "workforce-clockins",
    "Talane & Associates",
    "clockwise_timesheets_filled_10_Oct_26_07h28.xlsx",
  );

  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `Migration file not found at ${filePath}` };
  }

  try {
    // 1. Read Excel workbook
    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets["Timesheets"];
    if (!ws) {
      return { ok: false, message: "Worksheet 'Timesheets' not found in migration workbook." };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    // 2. Pre-fetch company lookups
    const { data: employees } = await admin
      .from("employees")
      .select("id, full_name, email, employee_number")
      .eq("company_id", companyId);
    const empByEmail = new Map(
      (employees || []).map((e) => [String(e.email || "").toLowerCase().trim(), e]),
    );
    const empByNum = new Map(
      (employees || []).filter((e) => e.employee_number).map((e) => [String(e.employee_number || "").toLowerCase().trim(), e]),
    );

    const { data: workstations } = await admin
      .from("company_workstations")
      .select("id, name")
      .eq("company_id", companyId);
    const wsByName = new Map(
      (workstations || []).map((w) => [String(w.name).toLowerCase().trim(), w.id]),
    );

    const { data: leaveTypes } = await admin
      .from("leave_types")
      .select("id, name, is_paid")
      .eq("company_id", companyId);
    const ltByName = new Map(
      (leaveTypes || []).map((l) => [String(l.name).toLowerCase().trim(), l]),
    );

    // Ensure all employees have a parent timesheet
    const { data: existingTimesheets } = await admin
      .from("timesheets")
      .select("id, employee_id")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    const tsMap = new Map((existingTimesheets || []).map((t) => [t.employee_id, t.id]));

    const missingEmpTimesheets = (employees || []).filter((e) => !tsMap.has(e.id));
    if (missingEmpTimesheets.length > 0) {
      const { data: newTsList } = await admin
        .from("timesheets")
        .insert(
          missingEmpTimesheets.map((e) => ({
            company_id: companyId,
            employee_id: e.id,
            status: "approved",
            notes: "Talane official historical migration",
          })),
        )
        .select("id, employee_id");
      (newTsList || []).forEach((t) => tsMap.set(t.employee_id, t.id));
    }

    // 3. Process rows into time_entries and leave_requests
    const timeEntriesToInsert: Array<Record<string, unknown>> = [];
    const leaveRequestsToInsert: Array<Record<string, unknown>> = [];
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

        // Add to time_entries as leave entry
        timeEntriesToInsert.push({
          company_id: companyId,
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

        // Add to leave_requests if leaveTypeId is present
        if (leaveTypeId) {
          leaveRequestsToInsert.push({
            company_id: companyId,
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
        // Worked shift
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
          company_id: companyId,
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

    // 4. Batch insert into time_entries (chunks of 200)
    for (let i = 0; i < timeEntriesToInsert.length; i += 200) {
      const chunk = timeEntriesToInsert.slice(i, i + 200);
      const { error: insErr } = await admin.from("time_entries").insert(chunk);
      if (insErr) {
        console.error("Batch insert error in time_entries:", insErr);
        throw new Error(`Failed to insert time_entries batch: ${insErr.message}`);
      }
    }

    // 5. Batch insert into leave_requests (chunks of 200)
    for (let i = 0; i < leaveRequestsToInsert.length; i += 200) {
      const chunk = leaveRequestsToInsert.slice(i, i + 200);
      const { error: lrErr } = await admin.from("leave_requests").insert(chunk);
      if (lrErr) {
        console.error("Batch insert error in leave_requests:", lrErr);
        // Continue even if leave_requests has duplicates
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/timesheets");
    revalidatePath("/dashboard/leave");
    revalidatePath("/dashboard/reports");

    const workShiftsCount = timeEntriesToInsert.filter((t) => !t.leave_type_id).length;
    const leaveShiftsCount = timeEntriesToInsert.filter((t) => Boolean(t.leave_type_id)).length;

    return {
      ok: true,
      message: `Migration uploaded successfully! Inserted ${workShiftsCount} worked shifts and ${leaveShiftsCount} leave records (${leaveRequestsToInsert.length} leave requests). Skipped ${skippedCount} unmapped rows.`,
      data: {
        insertedShifts: workShiftsCount,
        insertedLeaves: leaveShiftsCount,
        skippedCount,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to execute Talane migration.",
    };
  }
}

export type CompanyAccrualEmployee = {
  id: string;
  full_name: string;
  employee_number: string | null;
  email: string | null;
  employment_status: string;
};

export type CompanyAccrualLeaveType = {
  id: string;
  name: string;
  category: string;
  is_paid: boolean;
};

export type CompanyAccrualBalanceRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  balance_hours: number;
  accrued_hours: number;
  taken_hours: number;
  adjusted_hours: number;
  as_of_date: string;
};

export type CompanyAccrualContext = {
  employees: CompanyAccrualEmployee[];
  leaveTypes: CompanyAccrualLeaveType[];
  balances: CompanyAccrualBalanceRow[];
  standardDailyHours: number;
};

/**
 * Load employees, leave types, company daily hours, and existing leave balances
 * for the Super Admin Accrual Top-Up / Overwrite console.
 */
export async function getCompanyAccrualContextAction(
  companyId: string,
): Promise<DatabaseMaintenanceResult<CompanyAccrualContext>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const admin = createSupabaseAdminClient();

  try {
    const [empRes, ltRes, balRes, settingsRes] = await Promise.all([
      admin
        .from("employees")
        .select("id, full_name, employee_number, email, employment_status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true }),
      admin
        .from("leave_types")
        .select("id, name, category, is_paid")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      admin
        .from("leave_balances")
        .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, adjusted_hours, as_of_date")
        .eq("company_id", companyId),
      admin
        .from("company_settings")
        .select("standard_daily_hours, toil_rules")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (empRes.error) throw new Error(empRes.error.message);
    if (ltRes.error) throw new Error(ltRes.error.message);
    if (balRes.error) throw new Error(balRes.error.message);

    const toilEnabled = Boolean(
      (settingsRes.data?.toil_rules as Record<string, unknown> | undefined)?.enabled,
    );
    const eligibleLeaveTypes = (ltRes.data || []).filter((lt) =>
      isBalanceEligibleLeaveType(lt.name, lt.category, toilEnabled),
    );
    const eligibleLeaveTypeIds = new Set(eligibleLeaveTypes.map((lt) => lt.id));

    return {
      ok: true,
      message: "Accrual context loaded.",
      data: {
        employees: (empRes.data || []) as CompanyAccrualEmployee[],
        leaveTypes: eligibleLeaveTypes as CompanyAccrualLeaveType[],
        balances: (balRes.data || [])
          .filter((b) => eligibleLeaveTypeIds.has(String(b.leave_type_id)))
          .map((b) => ({
            id: String(b.id),
            employee_id: String(b.employee_id),
            leave_type_id: String(b.leave_type_id),
            balance_hours: Number(b.balance_hours ?? 0),
            accrued_hours: Number(b.accrued_hours ?? 0),
            taken_hours: Number(b.taken_hours ?? 0),
            adjusted_hours: Number(b.adjusted_hours ?? 0),
            as_of_date: String(b.as_of_date || ""),
          })),
        standardDailyHours: Number(settingsRes.data?.standard_daily_hours ?? 8) || 8,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to load company accrual context.",
    };
  }
}

export type AccrualMaintenanceMode =
  | "top_up"
  | "overwrite_balance"
  | "overwrite_accrued";

/**
 * Super Admin tool to either top up (+ / -) employees' leave accruals
 * or overwrite their available balance / accrued hours directly.
 */
export async function maintainEmployeeAccrualsAction(params: {
  companyId: string;
  mode: AccrualMaintenanceMode;
  employeeIds: string[];
  leaveTypeId: string;
  amountHours: number;
  resetAdjustmentsOnOverwrite?: boolean;
  reason?: string;
}): Promise<DatabaseMaintenanceResult<{ processedCount: number }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const {
    companyId,
    mode,
    employeeIds,
    leaveTypeId,
    amountHours,
    resetAdjustmentsOnOverwrite = true,
    reason,
  } = params;

  if (!companyId || !leaveTypeId) {
    return { ok: false, message: "Company and leave type are required." };
  }

  if (!Number.isFinite(amountHours)) {
    return { ok: false, message: "Please provide a valid numeric amount of hours." };
  }

  if (mode === "top_up" && amountHours === 0) {
    return { ok: false, message: "Top-up amount cannot be 0 hours." };
  }

  if (mode !== "top_up" && amountHours < 0) {
    return { ok: false, message: "Overwrite value cannot be negative." };
  }

  const admin = createSupabaseAdminClient();

  try {
    // 1. Validate leave type belongs to company & supports balance tracking
    const [{ data: leaveType, error: ltErr }, { data: settingsRow }] = await Promise.all([
      admin
        .from("leave_types")
        .select("id, name, category")
        .eq("id", leaveTypeId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("company_settings")
        .select("toil_rules")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (ltErr || !leaveType) {
      return { ok: false, message: "Selected leave type was not found for this company." };
    }

    const toilEnabled = Boolean(
      (settingsRow?.toil_rules as Record<string, unknown> | undefined)?.enabled,
    );
    if (!isBalanceEligibleLeaveType(leaveType.name, leaveType.category, toilEnabled)) {
      return {
        ok: false,
        message: `Leave balances are not tracked for "${leaveType.name}" (unpaid leave, public holidays, or disabled TOIL).`,
      };
    }

    // 2. Resolve target employee IDs
    const includeAllActive = employeeIds.includes("ALL");
    let empQuery = admin
      .from("employees")
      .select("id, full_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (includeAllActive) {
      empQuery = empQuery.eq("employment_status", "active");
    } else if (employeeIds.length > 0) {
      empQuery = empQuery.in("id", employeeIds);
    } else {
      return { ok: false, message: "Please select at least one employee." };
    }

    const { data: targetEmployees, error: empErr } = await empQuery;
    if (empErr) throw new Error(empErr.message);
    if (!targetEmployees || targetEmployees.length === 0) {
      return { ok: false, message: "No matching employees found in this company." };
    }

    const resolvedIds = targetEmployees.map((e) => e.id);

    // 3. Fetch existing leave_balances for target employees & leave type
    const { data: existingRows, error: balErr } = await admin
      .from("leave_balances")
      .select("id, employee_id, balance_hours, accrued_hours, taken_hours, adjusted_hours")
      .eq("company_id", companyId)
      .eq("leave_type_id", leaveTypeId)
      .in("employee_id", resolvedIds);

    if (balErr) throw new Error(balErr.message);

    const existingMap = new Map((existingRows || []).map((r) => [r.employee_id, r]));
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const upsertPayloads: Array<Record<string, unknown>> = [];
    const auditEntries: Array<Record<string, unknown>> = [];

    // Look up current actor's app user ID for audit logging (optional)
    const actorUserId = access.appUserId ?? null;

    for (const emp of targetEmployees) {
      const prev = existingMap.get(emp.id);
      const curBal = Number(prev?.balance_hours ?? 0);
      const curAccrued = Number(prev?.accrued_hours ?? 0);
      const curTaken = Number(prev?.taken_hours ?? 0);
      const curAdj = Number(prev?.adjusted_hours ?? 0);

      let newBalance = curBal;
      let newAccrued = curAccrued;
      let newAdjusted = curAdj;

      if (mode === "top_up") {
        // Add delta cleanly to accrued, adjusted, and available balance
        newAccrued = Number(Math.max(0, curAccrued + amountHours).toFixed(2));
        newAdjusted = Number((curAdj + amountHours).toFixed(2));
        newBalance = Number(Math.max(0, curBal + amountHours).toFixed(2));
      } else if (mode === "overwrite_balance") {
        // Set exact available balance, and align accrued_hours = target + taken so invariant holds
        const target = Math.max(0, amountHours);
        newBalance = Number(target.toFixed(2));
        newAccrued = Number((target + curTaken).toFixed(2));
        newAdjusted = resetAdjustmentsOnOverwrite ? 0 : curAdj;
      } else if (mode === "overwrite_accrued") {
        // Set exact accrued_hours and recompute net available balance
        const target = Math.max(0, amountHours);
        newAccrued = Number(target.toFixed(2));
        newAdjusted = resetAdjustmentsOnOverwrite ? 0 : curAdj;
        newBalance = Number(Math.max(0, newAccrued + newAdjusted - curTaken).toFixed(2));
      }

      upsertPayloads.push({
        company_id: companyId,
        employee_id: emp.id,
        leave_type_id: leaveTypeId,
        balance_hours: newBalance,
        accrued_hours: newAccrued,
        taken_hours: curTaken,
        adjusted_hours: newAdjusted,
        as_of_date: today,
        updated_at: nowIso,
      });

      auditEntries.push({
        company_id: companyId,
        user_id: actorUserId,
        action: "adjust",
        affected_table: "leave_balances",
        record_id: prev?.id || null,
        old_value: prev
          ? {
              balance_hours: curBal,
              accrued_hours: curAccrued,
              taken_hours: curTaken,
              adjusted_hours: curAdj,
            }
          : null,
        new_value: {
          mode,
          amount_hours: amountHours,
          balance_hours: newBalance,
          accrued_hours: newAccrued,
          taken_hours: curTaken,
          adjusted_hours: newAdjusted,
          leave_type_name: leaveType.name,
        },
        reason:
          reason?.trim() ||
          `Super Admin ${mode === "top_up" ? "accrual top-up" : "accrual overwrite"} (${amountHours >= 0 ? "+" : ""}${amountHours}h)`,
      });
    }

    // 4. Upsert in chunks of 200
    for (let i = 0; i < upsertPayloads.length; i += 200) {
      const chunk = upsertPayloads.slice(i, i + 200);
      const { error: upErr } = await admin
        .from("leave_balances")
        .upsert(chunk, { onConflict: "company_id,employee_id,leave_type_id" });
      if (upErr) throw new Error(upErr.message);
    }

    // 5. Best-effort audit logging
    try {
      for (let i = 0; i < auditEntries.length; i += 200) {
        await admin.from("audit_logs").insert(auditEntries.slice(i, i + 200));
      }
    } catch {
      // Non-fatal if audit log user FK differs across cross-tenant super admin switch
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leave");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/employees");

    const modeLabel =
      mode === "top_up"
        ? `Topped up ${amountHours >= 0 ? "+" : ""}${amountHours.toFixed(2)}h`
        : mode === "overwrite_balance"
          ? `Overwrote available balance to ${amountHours.toFixed(2)}h`
          : `Overwrote accrued hours to ${amountHours.toFixed(2)}h`;

    return {
      ok: true,
      message: `${modeLabel} on "${leaveType.name}" for ${targetEmployees.length} employee${targetEmployees.length === 1 ? "" : "s"}.`,
      data: { processedCount: targetEmployees.length },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to update employee accruals.",
    };
  }
}

