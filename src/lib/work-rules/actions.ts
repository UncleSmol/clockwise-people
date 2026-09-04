"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, getCurrentUserAccess, requireUser } from "@/lib/foundation/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  leaveAccrualLoadFormSchema,
  leaveAccrualPreviewFormSchema,
  leaveAssignmentFormSchema,
  leaveRequestFormSchema,
  leaveTypeFormSchema,
  publicHolidayFormSchema,
  updateLeaveTypeFormSchema,
  updateWorkScheduleFormSchema,
  workScheduleFormSchema,
  type LeaveAdvisor,
  type LeaveCalculation,
} from "./schema";
import type { CustomPayrollRule, PayrollPeriodConfig } from "@/lib/reports/payroll-periods";

type ActionState = {
  calculation?: LeaveCalculation;
  advisor?: LeaveAdvisor;
  ok: boolean;
  message: string;
  preview?: Array<{
    accrued_hours: number;
    employee_id: string;
    employee_number: string;
    full_name: string;
    hours_worked: number;
  }>;
};

function numberOrNull(value: string | undefined) {
  return value?.trim() ? Number(value) : null;
}

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function createWorkSchedule(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = workScheduleFormSchema.safeParse({
    daily_hours: String(formData.get("daily_hours") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    lunch_minutes: String(formData.get("lunch_minutes") ?? ""),
    name: String(formData.get("name") ?? ""),
    start_time: String(formData.get("start_time") ?? ""),
    working_days: formData.getAll("working_days").map(String),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_company_work_schedule", {
    daily_hours: numberOrNull(parsed.data.daily_hours),
    lunch_minutes: Number(parsed.data.lunch_minutes || 0),
    schedule_name: parsed.data.name,
    target_company_id: company.id,
    work_end: parsed.data.end_time,
    work_start: parsed.data.start_time,
    working_days: parsed.data.working_days.map(Number),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/employees");
  return { ok: true, message: "Work rule created." };
}

export async function updateWorkSchedule(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateWorkScheduleFormSchema.safeParse({
    daily_hours: String(formData.get("daily_hours") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    is_active: String(formData.get("is_active") ?? ""),
    lunch_minutes: String(formData.get("lunch_minutes") ?? ""),
    name: String(formData.get("name") ?? ""),
    start_time: String(formData.get("start_time") ?? ""),
    work_schedule_id: String(formData.get("work_schedule_id") ?? ""),
    working_days: formData.getAll("working_days").map(String),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_company_work_schedule", {
    active_rule: parsed.data.is_active === "on",
    daily_hours: numberOrNull(parsed.data.daily_hours),
    lunch_minutes: Number(parsed.data.lunch_minutes || 0),
    schedule_name: parsed.data.name,
    target_schedule_id: parsed.data.work_schedule_id,
    work_end: parsed.data.end_time,
    work_start: parsed.data.start_time,
    working_days: parsed.data.working_days.map(Number),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard");
  return { ok: true, message: "Work rule updated." };
}

export async function createLeaveType(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = leaveTypeFormSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    is_paid: String(formData.get("is_paid") ?? ""),
    name: String(formData.get("name") ?? ""),
    requires_attachment: String(formData.get("requires_attachment") ?? ""),
    yearly_hours: String(formData.get("yearly_hours") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_company_leave_type", {
    leave_category: parsed.data.category,
    leave_name: parsed.data.name,
    needs_attachment: parsed.data.requires_attachment === "on",
    paid_leave: parsed.data.is_paid === "on",
    target_company_id: company.id,
    yearly_hours: numberOrNull(parsed.data.yearly_hours),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  return { ok: true, message: "Leave rule created." };
}

export async function updateLeaveType(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateLeaveTypeFormSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    is_active: String(formData.get("is_active") ?? ""),
    is_paid: String(formData.get("is_paid") ?? ""),
    leave_type_id: String(formData.get("leave_type_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    requires_attachment: String(formData.get("requires_attachment") ?? ""),
    yearly_hours: String(formData.get("yearly_hours") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_company_leave_type", {
    active_rule: parsed.data.is_active === "on",
    leave_category: parsed.data.category,
    leave_name: parsed.data.name,
    needs_attachment: parsed.data.requires_attachment === "on",
    paid_leave: parsed.data.is_paid === "on",
    target_leave_type_id: parsed.data.leave_type_id,
    yearly_hours: numberOrNull(parsed.data.yearly_hours),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  return { ok: true, message: "Leave rule updated." };
}

export async function assignLeaveBalance(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = leaveAssignmentFormSchema.safeParse({
    balance_hours: String(formData.get("balance_hours") ?? ""),
    employee_id: String(formData.get("employee_id") ?? ""),
    leave_type_id: String(formData.get("leave_type_id") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_employee_leave_balance", {
    balance_hours: Number(parsed.data.balance_hours),
    target_employee_id: parsed.data.employee_id,
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  return { ok: true, message: "Leave balance assigned." };
}

export async function previewLeaveAccruals(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = leaveAccrualPreviewFormSchema.safeParse({
    leave_type_id: String(formData.get("leave_type_id") ?? ""),
    period_end: String(formData.get("period_end") ?? ""),
    period_start: String(formData.get("period_start") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  if (parsed.data.period_end < parsed.data.period_start) {
    return { ok: false, message: "Period end must be after period start." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calculate_company_leave_accruals", {
    period_end: parsed.data.period_end,
    period_start: parsed.data.period_start,
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const preview = (data ?? []) as Array<{
    accrued_hours: number;
    employee_id: string;
    employee_number: string;
    full_name: string;
    hours_worked: number;
  }>;

  if (preview.length === 0) {
    return { ok: false, message: "No active employees were found for this period." };
  }

  return {
    ok: true,
    message: `${preview.length} accrual row${preview.length === 1 ? "" : "s"} calculated for the selected period.`,
    preview,
  };
}

export async function loadLeaveAccruals(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const addToBalance = String(formData.get("add_to_balance") ?? "") === "on";

  const rawEntries: Array<{ accrued_hours: string; employee_id: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("accrued_")) {
      const employeeId = key.slice("accrued_".length);
      rawEntries.push({ accrued_hours: String(value), employee_id: employeeId });
    }
  }

  const parsed = leaveAccrualLoadFormSchema.safeParse({
    add_to_balance: addToBalance ? "on" : undefined,
    entries: rawEntries,
    leave_type_id: leaveTypeId,
    period_end: periodEnd,
    period_start: periodStart,
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const entries = parsed.data.entries.filter((entry) => entry.accrued_hours > 0);

  if (entries.length === 0) {
    return { ok: false, message: "Enter accrual hours for at least one employee." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accrue_company_leave_balances", {
    add_to_balance: addToBalance,
    entries: entries.map((entry) => ({
      accrued_hours: entry.accrued_hours,
      employee_id: entry.employee_id,
    })),
    period_end: parsed.data.period_end,
    period_start: parsed.data.period_start,
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const affected = Number((data as { affected?: number } | null)?.affected ?? 0);

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${affected} balance${affected === 1 ? "" : "s"} updated (${addToBalance ? "added to" : "overwritten in"} the accrual run).`,
  };
}

export async function createPublicHoliday(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = publicHolidayFormSchema.safeParse({
    holiday_date: String(formData.get("holiday_date") ?? ""),
    is_paid: String(formData.get("is_paid") ?? ""),
    name: String(formData.get("name") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_company_public_holiday", {
    holiday_name: parsed.data.name,
    paid_holiday: parsed.data.is_paid === "on",
    target_company_id: company.id,
    target_holiday_date: parsed.data.holiday_date,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  return { ok: true, message: "Public holiday saved." };
}

export async function calculateLeaveRequestHours(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();

  if (!leaveTypeId || !startDate || !endDate) {
    return { ok: false, message: "Choose leave type, start date, and end date first." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calculate_own_leave_request_hours", {
    request_end_date: endDate,
    request_start_date: startDate,
    target_leave_type_id: leaveTypeId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    calculation: data as LeaveCalculation,
    ok: true,
    message: "Hours calculated from your work rule.",
  };
}

export async function calculateLeaveAdvisor(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();

  if (!leaveTypeId || !startDate || !endDate) {
    return { ok: false, message: "Choose leave type, start date, and end date first." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calculate_own_leave_advisor", {
    request_end_date: endDate,
    request_start_date: startDate,
    target_leave_type_id: leaveTypeId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const advisor = data as LeaveAdvisor;

  return {
    advisor,
    calculation: {
      available_hours: advisor.available_hours,
      days: advisor.days,
      exceeds_balance: advisor.exceeds_balance,
      leave_type_name: advisor.leave_type_name,
      non_working_days: advisor.non_working_days,
      public_holidays: advisor.public_holidays,
      remaining_hours: advisor.remaining_hours,
      total_hours: advisor.total_hours,
      working_days: advisor.working_days,
    },
    ok: true,
    message: "Leave advice prepared from your work rule.",
  };
}

export async function submitLeaveRequest(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = leaveRequestFormSchema.safeParse({
    attachment_url: String(formData.get("attachment_url") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    leave_type_id: String(formData.get("leave_type_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    start_date: String(formData.get("start_date") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_own_leave_request", {
    request_attachment_url: parsed.data.attachment_url || null,
    request_end_date: parsed.data.end_date,
    request_reason: parsed.data.reason || null,
    request_start_date: parsed.data.start_date,
    request_total_hours: null,
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Leave request sent." };
}

export async function accrueToilBalance(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ActionState> {
  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();

  const [settingsResult, overtimeResult, toilTypeResult] = await Promise.all([
    supabase
      .from("company_settings")
      .select("toil_rules")
      .eq("company_id", company.id)
      .single(),
    supabase
      .from("time_entries")
      .select("overtime_hours")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd),
    supabase
      .from("leave_types")
      .select("id")
      .eq("company_id", company.id)
      .eq("category", "toil_taken")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (settingsResult.error) return { ok: false, message: settingsResult.error.message };
  if (overtimeResult.error) return { ok: false, message: overtimeResult.error.message };
  if (toilTypeResult.error) return { ok: false, message: toilTypeResult.error.message };

  const toilRules = settingsResult.data?.toil_rules as Record<string, unknown> | undefined;
  const multiplier = Number(toilRules?.accrual_multiplier ?? 1.5);
  const totalOvertime = (overtimeResult.data ?? []).reduce(
    (sum, entry) => sum + Number(entry.overtime_hours ?? 0),
    0,
  );
  const earnedHours = Number((totalOvertime * multiplier).toFixed(2));

  if (earnedHours <= 0) {
    return { ok: false, message: "No overtime hours found in the selected period." };
  }

  if (!toilTypeResult.data) {
    return { ok: false, message: "No TOIL leave type exists. Create a leave type with category 'Toil Taken' first." };
  }

  const { error } = await supabase.rpc("assign_employee_leave_balance", {
    balance_hours: earnedHours,
    target_employee_id: employeeId,
    target_leave_type_id: toilTypeResult.data.id,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  return { ok: true, message: `${earnedHours}h TOIL accrued from ${totalOvertime}h overtime (×${multiplier}).` };
}

export async function convertOvertimeToToil(
  _previousState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previousState;
  void _formData;
  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();
  const { employeeId } = await getCurrentUserAccess();

  if (!employeeId) {
    return { ok: false, message: "No employee is linked to this account." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const periodResult = await supabase
    .from("payroll_periods")
    .select("period_start, period_end")
    .eq("company_id", company.id)
    .eq("status", "open")
    .lte("period_start", today)
    .gte("period_end", today)
    .is("deleted_at", null)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (periodResult.error) {
    return { ok: false, message: periodResult.error.message };
  }

  if (!periodResult.data) {
    return { ok: false, message: "No open payroll period covers today's date." };
  }

  return accrueToilBalance(
    employeeId,
    periodResult.data.period_start,
    periodResult.data.period_end,
  );
}

export async function reviewLeaveRequest(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leaveRequestId = String(formData.get("leave_request_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim();

  if (!leaveRequestId) {
    return { ok: false, message: "Choose a request to review." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose approve or reject." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_managed_leave_request", {
    approve_request: decision === "approve",
    manager_notes: notes || null,
    target_leave_request_id: leaveRequestId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Leave request ${decision === "approve" ? "approved" : "rejected"}.`,
  };
}

export async function updateWorkRuleAutomationPolicy(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const autoEndLunch =
    formData.get("auto_end_lunch_on_lapse") === "on" ||
    formData.get("auto_end_lunch_on_lapse") === "true" ||
    formData.get("auto_clockout_after_lunch") === "on" ||
    formData.get("auto_clockout_after_lunch") === "true";
  const defaultLunchMinutes = Number(formData.get("default_lunch_minutes") ?? 60);

  const autoClockoutBasedOnSchedule =
    formData.get("auto_clockout_based_on_schedule") === "on" ||
    formData.get("auto_clockout_based_on_schedule") === "true" ||
    formData.get("auto_clockout_after_shift_end") === "on" ||
    formData.get("auto_clockout_after_shift_end") === "true";
  const autoClockoutGraceMinutes = Number(formData.get("auto_clockout_grace_minutes") ?? 0);

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();

  const { data: currentSettings, error: fetchError } = await supabase
    .from("company_settings")
    .select("approval_rules")
    .eq("company_id", company.id)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }

  const existingApprovalRules = (currentSettings?.approval_rules ?? {}) as Record<string, unknown>;
  const updatedApprovalRules = {
    ...existingApprovalRules,
    auto_end_lunch_on_lapse: autoEndLunch,
    auto_clockout_after_lunch: autoEndLunch,
    default_lunch_minutes: defaultLunchMinutes > 0 ? defaultLunchMinutes : 60,
    auto_clockout_based_on_schedule: autoClockoutBasedOnSchedule,
    auto_clockout_after_shift_end: autoClockoutBasedOnSchedule,
    auto_clockout_grace_minutes: autoClockoutGraceMinutes >= 0 ? autoClockoutGraceMinutes : 0,
  };

  const { error: updateError } = await supabase
    .from("company_settings")
    .update({
      approval_rules: updatedApprovalRules,
      default_lunch_minutes: defaultLunchMinutes > 0 ? defaultLunchMinutes : 60,
    })
    .eq("company_id", company.id);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time");

  const summary = [];
  if (autoEndLunch) {
    summary.push(`Auto lunch clock-out / return active (${defaultLunchMinutes}m lapse)`);
  } else {
    summary.push("Auto lunch lapse disabled");
  }
  if (autoClockoutBasedOnSchedule) {
    summary.push(
      `Auto shift clock-out on schedule end${
        autoClockoutGraceMinutes > 0 ? ` (+${autoClockoutGraceMinutes}m grace)` : ""
      }`,
    );
  } else {
    summary.push("Auto shift clock-out disabled");
  }

  return {
    ok: true,
    message: `Work rule automation updated: ${summary.join(" & ")}.`,
  };
}

export const updateAutoLunchClockoutPolicy = updateWorkRuleAutomationPolicy;
export const updateLunchBreakRule = updateWorkRuleAutomationPolicy;

/**
 * Synchronizes and updates employee leave accruals based on the Basic Conditions
 * of Employment Act (BCEA, Act 75 of 1997) of South Africa:
 *
 * 1. Annual Leave (BCEA Section 20(2)(c)):
 *    - Statutory entitlement of 21 consecutive days (15 working days / 120 hours per annual cycle for 5-day week).
 *    - Calculated as: 1 hour of paid annual leave for every 17 hours worked / entitled to be paid.
 *    - Pro-rated yearly formula: yearly_hours * (hours_worked / standard_annual_hours), guaranteed >= statutory 1:17.
 *
 * 2. Overtime TOIL (BCEA Section 10(3)(b)):
 *    - 1.5 hours of paid time-off in lieu (TOIL) for every 1 hour of overtime worked.
 *
 * 3. Sick Leave (BCEA Section 22):
 *    - 1 day per 26 days worked during first 6 months, or 30/36 days over a 36-month cycle.
 *
 * 4. Family Responsibility Leave (BCEA Section 27):
 *    - 3 days (24h) statutory entitlement per annual cycle.
 */
export async function syncEmployeeAccruals(
  targetEmployeeId?: string,
  targetCompanyId?: string,
): Promise<{
  ok: boolean;
  message: string;
  affectedCount?: number;
  details?: Array<{
    employeeId: string;
    employeeName: string;
    totalHoursWorked: number;
    totalOvertimeHours: number;
    annualAccrued: number;
    toilAccrued: number;
  }>;
}> {
  const supabase = await createSupabaseServerClient();
  let companyId = targetCompanyId;
  if (!companyId) {
    const { company } = await getActiveCompany();
    companyId = company.id;
  }

  // 1. Fetch company settings
  const { data: settingsData } = await supabase
    .from("company_settings")
    .select("standard_monthly_hours, standard_daily_hours, leave_rules, toil_rules")
    .eq("company_id", companyId)
    .maybeSingle();

  const standardMonthlyHours = Number(settingsData?.standard_monthly_hours ?? 173.33);
  const standardDailyHours = Number(settingsData?.standard_daily_hours ?? 8);
  const standardAnnualHours = Math.max(1, standardMonthlyHours * 12);
  const leaveRules = (settingsData?.leave_rules ?? {}) as Record<string, unknown>;
  const toilRules = (settingsData?.toil_rules ?? {}) as Record<string, unknown>;
  const carryOverCap =
    typeof leaveRules.carry_over_hours === "number"
      ? leaveRules.carry_over_hours
      : typeof leaveRules.carry_over_hours === "string" && leaveRules.carry_over_hours.trim() !== ""
        ? Number(leaveRules.carry_over_hours)
        : null;
  const toilMultiplier = Number(toilRules.accrual_multiplier ?? 1.5);

  // 2. Fetch active leave types
  const { data: leaveTypes, error: leaveTypesError } = await supabase
    .from("leave_types")
    .select("id, name, category, is_paid, accrual_rules")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (leaveTypesError || !leaveTypes || leaveTypes.length === 0) {
    return { ok: false, message: leaveTypesError?.message ?? "No active leave types found." };
  }

  // 3. Fetch target employees
  let employeeQuery = supabase
    .from("employees")
    .select("id, full_name, employee_number, employment_status, start_date")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (targetEmployeeId) {
    employeeQuery = employeeQuery.eq("id", targetEmployeeId);
  } else {
    employeeQuery = employeeQuery.eq("employment_status", "active");
  }

  const { data: employees, error: empError } = await employeeQuery;
  if (empError || !employees || employees.length === 0) {
    return { ok: false, message: empError?.message ?? "No active employees found." };
  }

  const employeeIds = employees.map((e) => e.id);

  // 4. Fetch all time entries for these employees
  const { data: timeEntries, error: timeError } = await supabase
    .from("time_entries")
    .select("employee_id, normal_hours, paid_hours, overtime_hours, status, work_date")
    .eq("company_id", companyId)
    .in("employee_id", employeeIds)
    .is("deleted_at", null)
    .in("status", ["submitted", "approved", "locked"]);

  if (timeError) {
    return { ok: false, message: timeError.message };
  }

  // 5. Fetch all approved leave requests to compute taken hours
  const { data: leaveRequests, error: reqError } = await supabase
    .from("leave_requests")
    .select("employee_id, leave_type_id, total_hours, status")
    .eq("company_id", companyId)
    .in("employee_id", employeeIds)
    .eq("status", "approved")
    .is("deleted_at", null);

  if (reqError) {
    return { ok: false, message: reqError.message };
  }

  // 6. Fetch existing leave balances
  const { data: existingBalances, error: balError } = await supabase
    .from("leave_balances")
    .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, adjusted_hours")
    .eq("company_id", companyId)
    .in("employee_id", employeeIds);

  if (balError) {
    return { ok: false, message: balError.message };
  }

  const today = new Date().toISOString().slice(0, 10);
  const details: Array<{
    employeeId: string;
    employeeName: string;
    totalHoursWorked: number;
    totalOvertimeHours: number;
    annualAccrued: number;
    toilAccrued: number;
  }> = [];

  let totalUpdated = 0;

  for (const emp of employees) {
    const empEntries = (timeEntries ?? []).filter((e) => e.employee_id === emp.id);
    const totalNormalHours = empEntries.reduce((sum, e) => sum + Number(e.normal_hours ?? 0), 0);
    const totalPaidHours = empEntries.reduce(
      (sum, e) => sum + Number(e.paid_hours ?? e.normal_hours ?? 0),
      0,
    );
    const totalOvertimeHours = empEntries.reduce(
      (sum, e) => sum + Number(e.overtime_hours ?? 0),
      0,
    );
    const totalWorkedHours = totalPaidHours > 0 ? totalPaidHours : totalNormalHours;

    let empAnnualAccrued = 0;
    let empToilAccrued = 0;

    for (const lt of leaveTypes) {
      // Calculate taken hours from approved leave requests
      const empLeaveReqs = (leaveRequests ?? []).filter(
        (r) => r.employee_id === emp.id && r.leave_type_id === lt.id,
      );
      const takenHours = Number(
        empLeaveReqs.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0).toFixed(2),
      );

      // Find existing balance
      const existingBal = (existingBalances ?? []).find(
        (b) => b.employee_id === emp.id && b.leave_type_id === lt.id,
      );
      const adjustedHours = Number(existingBal?.adjusted_hours ?? 0);

      let accruedHours = 0;
      const accrualRules = (lt.accrual_rules ?? {}) as Record<string, unknown>;
      const yearlyHours =
        typeof accrualRules.yearly_hours === "number"
          ? accrualRules.yearly_hours
          : Number(accrualRules.yearly_hours ?? 0) || 0;

      if (lt.category === "annual") {
        // BCEA Section 20(2)(c): 1 hour for every 17 hours worked, or pro-rated against configured yearly entitlement
        const bceaMinimumAccrual = Number((totalWorkedHours / 17.0).toFixed(2));
        if (yearlyHours > 0) {
          const proRataAccrual = Number(
            ((yearlyHours * totalWorkedHours) / standardAnnualHours).toFixed(2),
          );
          accruedHours = Math.max(proRataAccrual, bceaMinimumAccrual);
        } else {
          accruedHours = bceaMinimumAccrual;
        }
        empAnnualAccrued = accruedHours;
      } else if (lt.category === "toil_taken") {
        // BCEA Section 10(3)(b): 1.5 hours of TOIL for every 1 hour of overtime
        accruedHours = Number((totalOvertimeHours * toilMultiplier).toFixed(2));
        empToilAccrued = accruedHours;
      } else if (lt.category === "sick") {
        // BCEA Section 22: Sick leave entitlement
        if (yearlyHours > 0) {
          accruedHours = Number(
            Math.min(yearlyHours, (yearlyHours * totalWorkedHours) / standardAnnualHours).toFixed(2),
          );
        } else {
          accruedHours = Number((totalWorkedHours / 26.0).toFixed(2));
        }
      } else if (lt.category === "family_responsibility") {
        // BCEA Section 27: 3 days (24h)
        accruedHours = yearlyHours > 0 ? yearlyHours : Number((3 * standardDailyHours).toFixed(2));
      } else {
        // Custom leave types
        if (yearlyHours > 0) {
          accruedHours = Number(
            ((yearlyHours * totalWorkedHours) / standardAnnualHours).toFixed(2),
          );
        }
      }

      // Calculate net balance
      let balanceHours = Math.max(0, Number((accruedHours + adjustedHours - takenHours).toFixed(2)));

      // Apply carry-over cap if configured
      if (carryOverCap !== null && Number.isFinite(carryOverCap) && balanceHours > carryOverCap) {
        balanceHours = carryOverCap;
      }

      // Upsert into leave_balances
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
          company_id: companyId,
          employee_id: emp.id,
          leave_type_id: lt.id,
          accrued_hours: accruedHours,
          balance_hours: balanceHours,
          taken_hours: takenHours,
          adjusted_hours: 0,
          as_of_date: today,
        });
      }
      totalUpdated++;
    }

    details.push({
      employeeId: emp.id,
      employeeName: emp.full_name,
      totalHoursWorked: totalWorkedHours,
      totalOvertimeHours,
      annualAccrued: empAnnualAccrued,
      toilAccrued: empToilAccrued,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard/employees");

  return {
    ok: true,
    affectedCount: totalUpdated,
    message: `BCEA South African Labour Law accruals synchronized for ${employees.length} employee${
      employees.length === 1 ? "" : "s"
    } (${totalUpdated} balance records updated).`,
    details,
  };
}

export async function autoSyncOwnLeaveAccruals(
  _previousState?: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const { employeeId } = await getCurrentUserAccess();
  const { company } = await getActiveCompany();

  if (!employeeId) {
    return { ok: false, message: "No employee profile is linked to this account." };
  }

  const result = await syncEmployeeAccruals(employeeId, company.id);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const empDetail = result.details?.[0];
  const summaryMsg = empDetail
    ? `Accruals synchronized via SA BCEA (1h/17h worked): ${empDetail.totalHoursWorked.toFixed(2)}h worked \u2192 ${empDetail.annualAccrued.toFixed(2)}h annual leave, ${empDetail.totalOvertimeHours.toFixed(2)}h overtime \u2192 ${empDetail.toilAccrued.toFixed(2)}h TOIL.`
    : result.message;

  return {
    ok: true,
    message: summaryMsg,
  };
}

export async function autoSyncCompanyLeaveAccruals(
  _previousState?: ActionState,
  formData?: FormData,
): Promise<ActionState> {
  const { company } = await getActiveCompany();
  const targetEmployeeId = String(formData?.get("employee_id") ?? "").trim() || undefined;

  const result = await syncEmployeeAccruals(targetEmployeeId, company.id);
  return {
    ok: result.ok,
    message: result.message,
  };
}

export async function saveCompanyPayrollRulesAction(payload: {
  rules: CustomPayrollRule[];
  assignments: Record<string, string>;
  activeRuleId?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const { company } = await getActiveCompany();
    const access = await getCurrentUserAccess();
    if (!access.canManageCompany && !access.canReviewBranchTime && !access.canViewPayroll) {
      return { ok: false, message: "Only administrators can configure company payroll rules." };
    }

    const supabase = await createSupabaseServerClient();

    // Fetch existing approval_rules to preserve other settings (e.g. auto lunch, grace period)
    const { data: currentSettings, error: fetchError } = await supabase
      .from("company_settings")
      .select("approval_rules")
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchError) {
      return { ok: false, message: fetchError.message };
    }

    const existingApprovalRules = (currentSettings?.approval_rules ?? {}) as Record<string, unknown>;

    // Determine primary/default rule to set company-wide payroll_period_config & payroll_cycle
    const defaultRule =
      payload.rules.find((r) => r.id === (payload.activeRuleId ?? "company-default")) ||
      payload.rules.find((r) => r.id === "company-default") ||
      payload.rules[0];

    const payrollConfig: PayrollPeriodConfig | undefined = defaultRule
      ? {
          id: defaultRule.id,
          name: defaultRule.name,
          frequency: defaultRule.frequency,
          startDate: defaultRule.startDate,
          endDate: defaultRule.endDate,
          anchorDate: defaultRule.anchorDate || defaultRule.startDate,
          customCycleDays: defaultRule.customCycleDays,
          startDayOfMonth: defaultRule.startDayOfMonth,
          endDayOfMonth: defaultRule.endDayOfMonth,
          startDayOfWeek: defaultRule.startDayOfWeek,
          payDayOffsetDays: defaultRule.payDayOffsetDays,
          description: defaultRule.description,
        }
      : undefined;

    const updatedApprovalRules = {
      ...existingApprovalRules,
      payroll_rules: payload.rules,
      payroll_assignments: payload.assignments,
      ...(payrollConfig ? { payroll_period_config: payrollConfig } : {}),
    };

    const { error: updateError } = await supabase
      .from("company_settings")
      .upsert(
        {
          company_id: company.id,
          approval_rules: updatedApprovalRules,
        },
        { onConflict: "company_id" },
      );

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    if (defaultRule) {
      // Also update company.payroll_cycle
      await supabase
        .from("companies")
        .update({ payroll_cycle: defaultRule.frequency })
        .eq("id", company.id);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/reports");

    return { ok: true, message: "Payroll rules and employee assignments saved successfully to database." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save payroll rules." };
  }
}

