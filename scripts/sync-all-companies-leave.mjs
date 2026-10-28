import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load environment variables from .env
const envContent = fs.readFileSync(".env", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// Target companies configuration
const TARGET_COMPANIES = [
  {
    id: "c096fb54-7018-43cb-8a4d-72f67004c785",
    name: "Formalize (S AND S KEMISTRY)",
    annualCapHours: 144,
    annualEntitlementDays: 18,
    yearlyHours: 144,
    accrualMode: "hours_worked",
  },
  {
    id: "be6a1fb3-2cac-4cf8-b01b-b1339ee07095",
    name: "Talane (TALANE AND ASSOCIATES)",
    annualCapHours: null,
    annualEntitlementDays: 21,
    yearlyHours: 168,
    accrualMode: "worked_hours",
  },
  {
    id: "ce43d3b4-494d-401d-8476-3168465dbc71",
    name: "Alora Dental (Alora Dental Care)",
    annualCapHours: null,
    annualEntitlementDays: 17,
    yearlyHours: 136,
    accrualMode: "worked_hours",
  },
];

function calculateAccrual({
  shiftsWorked,
  hoursWorked,
  overtimeHours,
  category,
  yearlyHours,
  entitlementDays,
  standardDailyHours = 8,
  annualCapHours = null,
  monthsEmployed = 12,
  toilMultiplier = 1.5,
  toilEnabled = true,
}) {
  const cat = (category || "").toLowerCase();
  const annualWorkingDays = 5 * 52; // 260 days
  const annualWorkingHours = annualWorkingDays * standardDailyHours; // 2080h

  if (shiftsWorked === 0 || hoursWorked <= 0) {
    return { accruedHours: 0, explanation: "No recorded shifts or hours worked." };
  }

  if (cat === "annual") {
    // 1. Shift-based accrual according to work rule entitlement
    const shiftAccrual = Number(((shiftsWorked * (entitlementDays * standardDailyHours)) / annualWorkingDays).toFixed(2));

    // 2. Hours-based accrual
    const hoursAccrual = Number(((hoursWorked * (entitlementDays * standardDailyHours)) / annualWorkingHours).toFixed(2));

    // 3. BCEA Section 20 statutory minimum floor: 1h per 17h worked or 1d per 17d worked
    const bceaHoursFloor = Number((hoursWorked / 17.0).toFixed(2));
    const bceaShiftsFloor = Number(((shiftsWorked / 17.0) * standardDailyHours).toFixed(2));
    const bceaFloor = Math.max(bceaHoursFloor, bceaShiftsFloor);

    let accruedHours = Math.max(shiftAccrual, hoursAccrual, bceaFloor);

    return {
      accruedHours,
      explanation: `${shiftsWorked} shifts, ${hoursWorked.toFixed(1)}h worked → ${accruedHours.toFixed(2)}h (${(accruedHours / standardDailyHours).toFixed(1)} days) accrued (entitlement: ${entitlementDays}d, BCEA floor protected).`,
    };
  }

  if (cat === "toil_taken" || cat.includes("toil")) {
    if (toilEnabled && overtimeHours > 0) {
      const accruedHours = Number((overtimeHours * toilMultiplier).toFixed(2));
      return {
        accruedHours,
        explanation: `${overtimeHours.toFixed(2)}h overtime × ${toilMultiplier} = ${accruedHours.toFixed(2)}h TOIL.`,
      };
    }
    return { accruedHours: 0, explanation: "No overtime worked." };
  }

  if (cat === "sick") {
    const sickDays = entitlementDays > 0 ? entitlementDays : 10;
    const cap = yearlyHours > 0 ? yearlyHours : sickDays * standardDailyHours;
    const shiftSick = Number(((shiftsWorked / 26.0) * standardDailyHours).toFixed(2));
    const hoursSick = Number((hoursWorked / 26.0).toFixed(2));
    const proRataSick = Number(((cap * hoursWorked) / annualWorkingHours).toFixed(2));
    const accruedHours = Math.min(cap, Math.max(shiftSick, hoursSick, proRataSick));
    return {
      accruedHours,
      explanation: `${shiftsWorked} shifts worked → ${accruedHours.toFixed(2)}h sick leave accrued (BCEA Sec 22).`,
    };
  }

  if (cat === "family_responsibility" || cat === "frl") {
    if (monthsEmployed >= 4 && shiftsWorked >= 16) {
      const frlDays = entitlementDays > 0 ? entitlementDays : 3;
      const accruedHours = yearlyHours > 0 ? yearlyHours : frlDays * standardDailyHours;
      return {
        accruedHours,
        explanation: `Qualified (employed ${monthsEmployed.toFixed(1)}m >= 4m & ${shiftsWorked} shifts >= 16): ${accruedHours.toFixed(2)}h Family Responsibility Leave.`,
      };
    }
    return { accruedHours: 0, explanation: "Requires 4+ months and 16+ shifts." };
  }

  return { accruedHours: 0, explanation: "Non-accruing leave category." };
}

async function syncCompanyLeave(companyConfig) {
  console.log(`\n======================================================`);
  console.log(`Processing: ${companyConfig.name}`);
  console.log(`======================================================`);

  // 1. Update Annual Leave Type in DB
  const updatePayload = {
    accrual_rules: {
      yearly_hours: companyConfig.yearlyHours,
      entitlement_days: companyConfig.annualEntitlementDays,
      accrual_mode: companyConfig.accrualMode,
      bcea_section: "20",
    },
    updated_at: new Date().toISOString(),
  };
  if (companyConfig.annualCapHours) {
    updatePayload.accrual_rules.annual_cap_hours = companyConfig.annualCapHours;
  }

  await supabase
    .from("leave_types")
    .update(updatePayload)
    .eq("company_id", companyConfig.id)
    .eq("category", "annual");

  if (companyConfig.annualCapHours) {
    await supabase
      .from("company_settings")
      .update({
        leave_rules: {
          annual_leave_cap_hours: companyConfig.annualCapHours,
          accrue_on_depleted: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyConfig.id);
  }

  // 2. Fetch all active leave types
  const { data: leaveTypes, error: ltErr } = await supabase
    .from("leave_types")
    .select("id, name, category, is_paid, accrual_rules")
    .eq("company_id", companyConfig.id)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (ltErr || !leaveTypes?.length) {
    console.error("Error fetching leave types:", ltErr);
    return;
  }

  // 3. Fetch active employees
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, employee_number, employment_status, start_date, work_schedule_id")
    .eq("company_id", companyConfig.id)
    .eq("employment_status", "active")
    .is("deleted_at", null);

  if (empErr || !employees?.length) {
    console.log("No active employees found.");
    return;
  }

  console.log(`Found ${employees.length} active employees, ${leaveTypes.length} leave types.`);

  // 4. Fetch company work schedules
  const { data: schedules } = await supabase
    .from("work_schedules")
    .select("id, name, standard_daily_hours")
    .eq("company_id", companyConfig.id)
    .is("deleted_at", null);

  const employeeIds = employees.map((e) => e.id);

  // 5. Fetch all time entries with pagination
  let timeEntries = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error: timeErr } = await supabase
      .from("time_entries")
      .select("employee_id, normal_hours, paid_hours, overtime_hours, status, work_date, clock_in")
      .eq("company_id", companyConfig.id)
      .in("employee_id", employeeIds)
      .is("deleted_at", null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (timeErr) {
      console.error("Error fetching time entries:", timeErr);
      break;
    }
    if (chunk?.length) timeEntries = timeEntries.concat(chunk);
    if (!chunk || chunk.length < pageSize) break;
    page++;
  }

  // 6. Fetch approved leave requests
  const { data: leaveRequests } = await supabase
    .from("leave_requests")
    .select("employee_id, leave_type_id, total_hours, status")
    .eq("company_id", companyConfig.id)
    .in("employee_id", employeeIds)
    .eq("status", "approved")
    .is("deleted_at", null);

  // 7. Fetch existing balances
  const { data: existingBalances } = await supabase
    .from("leave_balances")
    .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, adjusted_hours")
    .eq("company_id", companyConfig.id)
    .in("employee_id", employeeIds);

  const today = new Date().toISOString().slice(0, 10);
  let updatedCount = 0;

  for (const emp of employees) {
    const empEntries = timeEntries.filter((e) => e.employee_id === emp.id);

    // Shifts and hours worked
    const shiftDates = new Set();
    let totalNormalHours = 0;
    let totalPaidHours = 0;
    let totalOvertimeHours = 0;

    for (const e of empEntries) {
      const paid = Number(e.paid_hours ?? e.normal_hours ?? 0);
      const ot = Number(e.overtime_hours ?? 0);
      if (paid > 0 || e.clock_in) {
        shiftDates.add(e.work_date);
        totalNormalHours += Number(e.normal_hours ?? 0);
        totalPaidHours += paid;
        totalOvertimeHours += ot;
      }
    }

    const shiftsWorked = shiftDates.size;
    const hoursWorked = totalPaidHours > 0 ? totalPaidHours : totalNormalHours;

    const startDate = new Date(emp.start_date || "2026-01-01");
    const monthsEmployed = Math.max(0, (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4));

    // Resolve daily hours from assigned work schedule
    const schedule = (schedules || []).find((s) => s.id === emp.work_schedule_id);
    const standardDailyHours = Number(schedule?.standard_daily_hours ?? 8);

    console.log(`\n- ${emp.full_name} (${emp.employee_number || "No #" }): ${shiftsWorked} shifts, ${hoursWorked.toFixed(1)}h worked, ${totalOvertimeHours.toFixed(1)}h OT`);

    for (const lt of leaveTypes) {
      const empLeaveReqs = (leaveRequests || []).filter(
        (r) => r.employee_id === emp.id && r.leave_type_id === lt.id
      );
      const takenHours = Number(
        empLeaveReqs.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0).toFixed(2)
      );

      const existingBal = (existingBalances || []).find(
        (b) => b.employee_id === emp.id && b.leave_type_id === lt.id
      );
      const adjustedHours = Number(existingBal?.adjusted_hours ?? 0);

      const yearlyHours = Number(lt.accrual_rules?.yearly_hours ?? 0);
      const entitlementDays = Number(
        lt.accrual_rules?.entitlement_days ??
        (yearlyHours > 0 ? Math.round(yearlyHours / standardDailyHours) : (lt.category === "annual" ? companyConfig.annualEntitlementDays : 10))
      );

      const { accruedHours } = calculateAccrual({
        shiftsWorked,
        hoursWorked,
        overtimeHours: totalOvertimeHours,
        category: lt.category,
        yearlyHours,
        entitlementDays,
        standardDailyHours,
        annualCapHours: companyConfig.annualCapHours,
        monthsEmployed,
      });

      // Calculate Net Available Balance
      let balanceHours = Math.max(0, Number((accruedHours + adjustedHours - takenHours).toFixed(2)));

      // Enforce Annual Leave Cap (e.g. 144 hours for Formalize)
      if (lt.category === "annual" && companyConfig.annualCapHours && companyConfig.annualCapHours > 0) {
        if (balanceHours > companyConfig.annualCapHours) {
          balanceHours = companyConfig.annualCapHours;
        }
      }

      // Upsert leave_balances in Supabase
      if (existingBal?.id) {
        await supabase
          .from("leave_balances")
          .update({
            accrued_hours: accruedHours,
            balance_hours: balanceHours,
            taken_hours: takenHours,
            as_of_date: today,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingBal.id);
      } else {
        await supabase.from("leave_balances").insert({
          company_id: companyConfig.id,
          employee_id: emp.id,
          leave_type_id: lt.id,
          accrued_hours: accruedHours,
          balance_hours: balanceHours,
          taken_hours: takenHours,
          adjusted_hours: 0,
          as_of_date: today,
        });
      }

      updatedCount++;
      if (lt.category === "annual") {
        console.log(`  [Annual Leave] Accrued: ${accruedHours.toFixed(2)}h | Taken: ${takenHours}h | Adj: ${adjustedHours}h | Balance: ${balanceHours.toFixed(2)}h (${(balanceHours / standardDailyHours).toFixed(1)} days)${companyConfig.annualCapHours ? ` [Capped at ${companyConfig.annualCapHours}h]` : ""}`);
      }
    }
  }

  console.log(`\n✓ Synced ${updatedCount} leave balances for ${companyConfig.name}.`);
}

async function run() {
  for (const c of TARGET_COMPANIES) {
    await syncCompanyLeave(c);
  }
  console.log("\n======================================================");
  console.log("All companies synced successfully!");
  console.log("======================================================");
}

run();
