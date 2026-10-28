"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActiveCompany, getCurrentUserAccess, requireUser } from "@/lib/foundation/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
import { sanitizeMultilineText, sanitizeString } from "@/lib/security/sanitizer";
import { calculateSimpleLeaveAccrual } from "./engine/accrual-engine";

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
  const category = String(formData.get("category") ?? "annual");
  const name = String(formData.get("name") ?? "").trim();
  const isPaid = formData.get("is_paid") === "on";
  const requiresAttachment = formData.get("requires_attachment") === "on";
  const rawEntitlementDays =
    formData.get("entitlement_days") ||
    formData.get("entitlement_amount") ||
    formData.get("yearly_hours");
  const entitlementDays = rawEntitlementDays ? Number(rawEntitlementDays) : 17;
  const yearlyHours = entitlementDays > 40 ? entitlementDays : entitlementDays * 8;

  if (!name) {
    return { ok: false, message: "Leave rule name is required." };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();

  const accrualRules = {
    entitlement_days: Math.round(yearlyHours / 8),
    yearly_hours: yearlyHours,
  };

  const { error } = await supabase.from("leave_types").insert({
    company_id: company.id,
    name,
    category,
    is_paid: isPaid,
    requires_attachment: requiresAttachment,
    is_active: true,
    accrual_rules: accrualRules,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  try {
    await syncEmployeeAccruals(undefined, company.id);
  } catch {}

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leave");
  return {
    ok: true,
    message: `Leave rule "${name}" created (${Math.round(yearlyHours / 8)} days / ${yearlyHours}h entitlement).`,
  };
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
    yearly_hours: String(formData.get("yearly_hours") ?? formData.get("entitlement_days") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const rawNum = numberOrNull(parsed.data.yearly_hours);
  const yearlyHours = rawNum ? (rawNum <= 40 ? rawNum * 8 : rawNum) : 136;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_company_leave_type", {
    active_rule: parsed.data.is_active === "on",
    leave_category: parsed.data.category,
    leave_name: parsed.data.name,
    needs_attachment: parsed.data.requires_attachment === "on",
    paid_leave: parsed.data.is_paid === "on",
    target_leave_type_id: parsed.data.leave_type_id,
    yearly_hours: yearlyHours,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  try {
    const { company } = await getActiveCompany();
    await syncEmployeeAccruals(undefined, company.id);
  } catch {}

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leave");
  return { ok: true, message: `Leave rule "${parsed.data.name}" updated.` };
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
      leave_type_available_hours: advisor.leave_type_available_hours,
      toil_available_hours: advisor.toil_available_hours,
      toil_hours_to_use: advisor.toil_hours_to_use,
      leave_hours_to_use: advisor.leave_hours_to_use,
      load_toil_first: advisor.load_toil_first,
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

  const useToilFirst = formData.get("use_toil_first");
  let requestUseToilFirst = useToilFirst === null || useToilFirst === "true" || useToilFirst === "on";

  const isTimeOff = formData.get("is_time_off") === "true";
  const rawHours = formData.get("time_off_hours") || formData.get("request_total_hours");
  const parsedTimeOffHours = rawHours ? parseFloat(String(rawHours)) : null;
  const timeOffHours = parsedTimeOffHours && !isNaN(parsedTimeOffHours) && parsedTimeOffHours > 0 ? parsedTimeOffHours : null;

  if (isTimeOff && (!timeOffHours || timeOffHours <= 0)) {
    return { ok: false, message: "Please specify the time off hours requested (e.g. 2.5h)." };
  }

  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);
  const employeeId = access.employeeId;
  const supabase = await createSupabaseServerClient();

  // Guard: For past days, ensure no timesheets have been loaded and day is not a public holiday
  // NOTE: For Time Off (leaving early while clocked in), existing timesheets on that day are permitted!
  const todayIso = new Date().toISOString().slice(0, 10);
  if (parsed.data.start_date < todayIso && employeeId) {
    const pastStart = parsed.data.start_date;
    const pastEnd = parsed.data.end_date < todayIso ? parsed.data.end_date : todayIso;

    const { data: existingEntries } = await supabase
      .from("time_entries")
      .select("work_date, paid_hours, notes")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .gte("work_date", pastStart)
      .lte("work_date", pastEnd)
      .is("deleted_at", null);

    const loadedDates = (existingEntries ?? [])
      .filter((e) => !e.notes?.startsWith("Public holiday:"))
      .map((e) => e.work_date);

    if (!isTimeOff && loadedDates.length > 0) {
      return {
        ok: false,
        message: `Cannot request full day leave for past days with existing timesheets loaded (${loadedDates.slice(0, 3).join(", ")}${loadedDates.length > 3 ? "..." : ""}). For partial days where you clocked in but had to leave work early, select 'Time Off (Partial Day)'.`,
      };
    }

    const { data: holidays } = await supabase
      .from("company_public_holidays")
      .select("name, holiday_date")
      .eq("company_id", company.id)
      .gte("holiday_date", pastStart)
      .lte("holiday_date", pastEnd);

    if (holidays && holidays.length > 0) {
      return {
        ok: false,
        message: `Cannot request leave on public holidays (${holidays.map((h) => `${h.holiday_date} - ${h.name}`).join(", ")}).`,
      };
    }
  }

  // Guard: If TOIL engine is disabled for this company, reject TOIL requests and disable use_toil_first
  const { data: companySettings } = await supabase
    .from("company_settings")
    .select("toil_rules")
    .eq("company_id", company.id)
    .maybeSingle();

  const isToilEnabled = Boolean((companySettings?.toil_rules as Record<string, unknown> | undefined)?.enabled);
  if (!isToilEnabled) {
    requestUseToilFirst = false;

    const { data: selectedLeaveType } = await supabase
      .from("leave_types")
      .select("category, name")
      .eq("id", parsed.data.leave_type_id)
      .maybeSingle();

    if (
      selectedLeaveType?.category === "toil_taken" ||
      selectedLeaveType?.name?.toLowerCase().includes("toil")
    ) {
      return {
        ok: false,
        message: "The TOIL engine is currently disabled for your company in Company Setup.",
      };
    }
  }

  const finalReason = isTimeOff
    ? `[Time Off: ${timeOffHours}h] ${parsed.data.reason || "Left work early"}`
    : (parsed.data.reason || null);

  const { error } = await supabase.rpc("submit_own_leave_request", {
    request_attachment_url: parsed.data.attachment_url || null,
    request_end_date: parsed.data.end_date,
    request_reason: finalReason,
    request_start_date: parsed.data.start_date,
    request_total_hours: timeOffHours,
    request_use_toil_first: requestUseToilFirst,
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: isTimeOff
      ? `Time off request for ${timeOffHours}h under annual leave sent.`
      : "Leave request sent.",
  };
}

export async function ensureCompanyToilLeaveType(companyId: string) {
  const adminClient = createSupabaseAdminClient();

  // Guard: Check if TOIL engine is enabled for company
  const { data: settings } = await adminClient
    .from("company_settings")
    .select("toil_rules")
    .eq("company_id", companyId)
    .maybeSingle();

  const isEnabled = Boolean((settings?.toil_rules as Record<string, unknown> | undefined)?.enabled);
  if (!isEnabled) {
    return null;
  }

  const { data: existing } = await adminClient
    .from("leave_types")
    .select("id, name, category, is_paid, requires_attachment, accrual_rules, is_active")
    .eq("company_id", companyId)
    .eq("category", "toil_taken")
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data: inserted, error } = await adminClient
    .from("leave_types")
    .insert({
      company_id: companyId,
      name: "Time Off In Lieu (TOIL)",
      category: "toil_taken",
      is_paid: true,
      requires_attachment: false,
      is_active: true,
      accrual_rules: {
        multiplier: 1.5,
        type: "overtime_conversion",
      },
    })
    .select("id, name, category, is_paid, requires_attachment, accrual_rules, is_active")
    .single();

  if (error) {
    const { data: fallback } = await adminClient
      .from("leave_types")
      .select("id, name, category, is_paid, requires_attachment, accrual_rules, is_active")
      .eq("company_id", companyId)
      .eq("category", "toil_taken")
      .is("deleted_at", null)
      .maybeSingle();
    return fallback;
  }

  return inserted;
}

export async function ensureEmployeeToilBalance(
  companyId: string,
  employeeId: string,
  toilTypeId: string,
) {
  const adminClient = createSupabaseAdminClient();

  // Guard: Check if TOIL engine is enabled for company
  const { data: settings } = await adminClient
    .from("company_settings")
    .select("toil_rules")
    .eq("company_id", companyId)
    .maybeSingle();

  const isEnabled = Boolean((settings?.toil_rules as Record<string, unknown> | undefined)?.enabled);
  if (!isEnabled) {
    return null;
  }

  const { data: existing } = await adminClient
    .from("leave_balances")
    .select("id, balance_hours, accrued_hours, taken_hours")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .eq("leave_type_id", toilTypeId)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data: inserted, error } = await adminClient
    .from("leave_balances")
    .insert({
      company_id: companyId,
      employee_id: employeeId,
      leave_type_id: toilTypeId,
      balance_hours: 0,
      accrued_hours: 0,
      taken_hours: 0,
      adjusted_hours: 0,
      as_of_date: new Date().toISOString().slice(0, 10),
    })
    .select("id, balance_hours, accrued_hours, taken_hours")
    .single();

  if (error) {
    const { data: fallback } = await adminClient
      .from("leave_balances")
      .select("id, balance_hours, accrued_hours, taken_hours")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .eq("leave_type_id", toilTypeId)
      .maybeSingle();
    return fallback;
  }

  return inserted;
}

export async function accrueToilBalance(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  specifiedHours?: number,
): Promise<ActionState> {
  const { company } = await getActiveCompany();
  const adminClient = createSupabaseAdminClient();
  const { user } = await requireUser();

  const [settingsResult, overtimeResult] = await Promise.all([
    adminClient
      .from("company_settings")
      .select("toil_rules")
      .eq("company_id", company.id)
      .maybeSingle(),
    adminClient
      .from("time_entries")
      .select("id, overtime_hours, work_date")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd),
  ]);

  if (settingsResult.error) return { ok: false, message: settingsResult.error.message };
  if (overtimeResult.error) return { ok: false, message: overtimeResult.error.message };

  const toilRules = (settingsResult.data?.toil_rules ?? {}) as Record<string, unknown>;
  const isToilEnabled = Boolean(toilRules.enabled);
  if (!isToilEnabled) {
    return {
      ok: false,
      message: "The TOIL engine is currently disabled in Company Setup. Please enable it before converting overtime.",
    };
  }

  const multiplier = Number(toilRules.accrual_multiplier ?? 1.5);

  const totalPeriodOvertime = (overtimeResult.data ?? []).reduce(
    (sum, entry) => sum + Number(entry.overtime_hours ?? 0),
    0,
  );

  let overtimeToConvert = totalPeriodOvertime;
  if (typeof specifiedHours === "number" && specifiedHours > 0) {
    overtimeToConvert = specifiedHours;
  }

  if (overtimeToConvert <= 0) {
    return {
      ok: false,
      message: `No overtime hours found between ${periodStart} and ${periodEnd}.`,
    };
  }

  const earnedHours = Number((overtimeToConvert * multiplier).toFixed(2));
  if (earnedHours <= 0) {
    return { ok: false, message: "Calculated TOIL accrual is zero." };
  }

  const toilType = await ensureCompanyToilLeaveType(company.id);
  if (!toilType) {
    return { ok: false, message: "Could not create or locate the TOIL leave rule." };
  }

  // Check existing leave balance
  const { data: existingBalance, error: balanceQueryError } = await adminClient
    .from("leave_balances")
    .select("id, balance_hours, accrued_hours")
    .eq("company_id", company.id)
    .eq("employee_id", employeeId)
    .eq("leave_type_id", toilType.id)
    .maybeSingle();

  if (balanceQueryError) {
    return { ok: false, message: balanceQueryError.message };
  }

  const today = new Date().toISOString().slice(0, 10);
  let updatedBalanceHours = earnedHours;

  if (existingBalance) {
    const currentBalance = Number(existingBalance.balance_hours ?? 0);
    const currentAccrued = Number(existingBalance.accrued_hours ?? 0);
    updatedBalanceHours = Number((currentBalance + earnedHours).toFixed(2));
    const updatedAccruedHours = Number((currentAccrued + earnedHours).toFixed(2));

    const { error: updateError } = await adminClient
      .from("leave_balances")
      .update({
        balance_hours: updatedBalanceHours,
        accrued_hours: updatedAccruedHours,
        as_of_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingBalance.id);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }
  } else {
    const { error: insertError } = await adminClient
      .from("leave_balances")
      .insert({
        company_id: company.id,
        employee_id: employeeId,
        leave_type_id: toilType.id,
        balance_hours: earnedHours,
        accrued_hours: earnedHours,
        taken_hours: 0,
        adjusted_hours: 0,
        as_of_date: today,
      });

    if (insertError) {
      return { ok: false, message: insertError.message };
    }
  }

  // Record audit transaction in toil_transactions
  try {
    await adminClient.from("toil_transactions").insert({
      company_id: company.id,
      employee_id: employeeId,
      transaction_date: today,
      transaction_type: "overtime_converted",
      hours: earnedHours,
      reason: `Converted ${overtimeToConvert}h overtime into ${earnedHours}h TOIL (multiplier: ${multiplier}×, period: ${periodStart} to ${periodEnd})`,
      status: "approved",
      created_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to write toil_transaction audit record:", err);
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Successfully converted ${overtimeToConvert.toFixed(2)}h overtime into ${earnedHours.toFixed(2)}h TOIL (rate: ×${multiplier}). Your new TOIL balance is ${updatedBalanceHours.toFixed(2)}h.`,
  };
}

export async function convertOvertimeToToil(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { company } = await getActiveCompany();
  const { employeeId } = await getCurrentUserAccess();

  if (!employeeId) {
    return { ok: false, message: "No employee is linked to this account." };
  }

  const formPeriodStart = String(formData.get("period_start") ?? "").trim();
  const formPeriodEnd = String(formData.get("period_end") ?? "").trim();
  const rawHours = String(formData.get("hours_to_convert") ?? "").trim();
  const specifiedHours =
    rawHours && !isNaN(Number(rawHours)) && Number(rawHours) > 0
      ? Number(rawHours)
      : undefined;

  let periodStart = formPeriodStart;
  let periodEnd = formPeriodEnd;

  if (!periodStart || !periodEnd) {
    const today = new Date().toISOString().slice(0, 10);
    const adminClient = createSupabaseAdminClient();

    // 1. Try open period covering today
    const { data: activePeriod } = await adminClient
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

    if (activePeriod) {
      periodStart = activePeriod.period_start;
      periodEnd = activePeriod.period_end;
    } else {
      // 2. Try any open period
      const { data: latestOpenPeriod } = await adminClient
        .from("payroll_periods")
        .select("period_start, period_end")
        .eq("company_id", company.id)
        .eq("status", "open")
        .is("deleted_at", null)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOpenPeriod) {
        periodStart = latestOpenPeriod.period_start;
        periodEnd = latestOpenPeriod.period_end;
      } else {
        // 3. Fallback to calendar month (1st to last day of current month)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
        periodStart = `${year}-${month}-01`;
        periodEnd = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }

  return accrueToilBalance(employeeId, periodStart, periodEnd, specifiedHours);
}

export async function reviewLeaveRequest(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leaveRequestId = sanitizeString(formData.get("leave_request_id"), 64);
  const decision = sanitizeString(formData.get("decision"), 20);
  const notes = sanitizeMultilineText(formData.get("review_notes"), 1000);


  if (!leaveRequestId) {
    return { ok: false, message: "Choose a request to review." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose approve or reject." };
  }

  const access = await getCurrentUserAccess();
  const isRootAdmin =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.canAssignOwnerRole;
  const isAdmin =
    isRootAdmin ||
    access.isHrAdmin ||
    access.canManageCompany;
  const isManager =
    isAdmin ||
    access.isBranchManager ||
    access.canReviewBranchTime ||
    access.canManageDirectReports;

  if (!isManager) {
    return { ok: false, message: "You do not have permission to review leave requests." };
  }

  const supabase = await createSupabaseServerClient();
  let reviewError = (
    await supabase.rpc("review_managed_leave_request", {
      approve_request: decision === "approve",
      manager_notes: notes || null,
      target_leave_request_id: leaveRequestId,
    })
  ).error;

  if (reviewError) {
    // If the database RPC blocked due to tenant/role session context, run through adminClient
    // since we strictly verified Root Admin, Admin, or Manager authorization above.
    const adminClient = createSupabaseAdminClient();
    reviewError = (
      await adminClient.rpc("review_managed_leave_request", {
        approve_request: decision === "approve",
        manager_notes: notes || null,
        target_leave_request_id: leaveRequestId,
      })
    ).error;
  }

  if (reviewError) {
    return { ok: false, message: reviewError.message };
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

  const toilMultiplier = Number(toilRules.accrual_multiplier ?? 1.5);
  const isToilEnabled = Boolean(toilRules.enabled);

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

  // 3. Fetch target employees and company work rules
  let employeeQuery = supabase
    .from("employees")
    .select("id, full_name, employee_number, employment_status, start_date, work_schedule_id")
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

  const { data: companySchedules } = await supabase
    .from("work_schedules")
    .select("id, name, standard_daily_hours")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const employeeIds = employees.map((e) => e.id);

  // 4. Fetch time entries for these employees (with pagination to guarantee all rows fetched)
  let timeEntries: Array<{
    employee_id: string;
    normal_hours: number | null;
    paid_hours: number | null;
    overtime_hours: number | null;
    status: string;
    work_date: string;
    clock_in?: string | null;
  }> = [];

  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error: timeError } = await supabase
      .from("time_entries")
      .select("employee_id, normal_hours, paid_hours, overtime_hours, status, work_date, clock_in")
      .eq("company_id", companyId)
      .in("employee_id", employeeIds)
      .is("deleted_at", null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (timeError) {
      return { ok: false, message: timeError.message };
    }

    if (chunk && chunk.length > 0) {
      timeEntries = timeEntries.concat(chunk);
    }
    if (!chunk || chunk.length < pageSize) {
      break;
    }
    page++;
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

    // Count distinct shifts clocked in / days worked
    const shiftDateSet = new Set<string>();
    let totalNormalHours = 0;
    let totalPaidHours = 0;
    let totalOvertimeHours = 0;

    for (const e of empEntries) {
      const paid = Number(e.paid_hours ?? e.normal_hours ?? 0);
      const ot = Number(e.overtime_hours ?? 0);
      if (paid > 0 || Boolean(e.clock_in)) {
        shiftDateSet.add(e.work_date);
        totalNormalHours += Number(e.normal_hours ?? 0);
        totalPaidHours += paid;
        totalOvertimeHours += ot;
      }
    }

    const shiftsWorked = shiftDateSet.size;
    const totalWorkedHours = totalPaidHours > 0 ? totalPaidHours : totalNormalHours;

    // Calculate months employed
    const startDate = new Date(emp.start_date || "2026-01-01");
    const monthsEmployed = Math.max(0, (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4));

    let empAnnualAccrued = 0;
    let empToilAccrued = 0;

    // Resolve employee specific work schedule
    const empSchedule = (companySchedules || []).find((s) => s.id === emp.work_schedule_id);
    const empDailyHours = Number(empSchedule?.standard_daily_hours ?? standardDailyHours);
    const empWeeklyHours = empDailyHours * 5;
    const empAnnualHours = empWeeklyHours * 52;

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

      // Evaluate statutory & company accrual conforming to work rule and BCEA
      const { accruedHours } = calculateSimpleLeaveAccrual({
        shiftsWorked,
        hoursWorked: totalWorkedHours,
        overtimeHours: totalOvertimeHours,
        leaveType: lt,
        monthsEmployed,
        standardDailyHours: empDailyHours,
        workingDaysPerWeek: 5,
        standardAnnualHours: empAnnualHours,
        toilMultiplier,
        toilEnabled: isToilEnabled,
      });

      if (lt.category === "annual") {
        empAnnualAccrued = accruedHours;
      } else if (lt.category === "toil_taken") {
        empToilAccrued = accruedHours;
      }

      // Check annual leave cap (e.g. 144 hours for Formalize)
      const annualCapHours = lt.category === "annual"
        ? Number(
            (lt.accrual_rules as Record<string, unknown>)?.annual_cap_hours ??
            (lt.accrual_rules as Record<string, unknown>)?.cap_hours ??
            leaveRules.annual_leave_cap_hours ??
            0
          )
        : 0;

      // Net available balance = max(0, accrued + adjusted - taken)
      let balanceHours = Math.max(0, Number((accruedHours + adjustedHours - takenHours).toFixed(2)));
      if (annualCapHours > 0 && balanceHours > annualCapHours) {
        balanceHours = annualCapHours;
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
  revalidatePath("/dashboard/leave");

  return {
    ok: true,
    affectedCount: totalUpdated,
    message: `Leave accruals synchronized for ${employees.length} employee${
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
    ? `Accruals synchronized via SA BCEA (1h/17h worked): ${empDetail.totalHoursWorked.toFixed(2)}h worked → ${empDetail.annualAccrued.toFixed(2)}h annual leave${empDetail.toilAccrued > 0 ? `, ${empDetail.totalOvertimeHours.toFixed(2)}h overtime → ${empDetail.toilAccrued.toFixed(2)}h TOIL.` : '.'}`
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

export async function updateCompanyLeavePolicy(
  prevState: unknown,
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  try {
    const { company } = await getActiveCompany();
    const access = await getCurrentUserAccess();
    if (!access.canManageCompany) {
      return { ok: false, message: "Unauthorized. Admin access required." };
    }

    const supabase = await createSupabaseServerClient();

    const policyType = String(formData.get("policy_type") ?? "");
    const useItOrLoseItEnabled =
      policyType === "use_it_or_lose_it" ||
      (policyType === "" && formData.get("use_it_or_lose_it_enabled") === "on");
    const rawCarryCap = formData.get("carry_over_cap_hours") as string | null;
    const carryOverCapHours =
      rawCarryCap && rawCarryCap.trim() !== "" ? Number(rawCarryCap) : null;
    const lockImportedBaselines = formData.get("lock_imported_leave_baselines") === "on";
    const accrualBaselineDate = (formData.get("accrual_baseline_date") as string)?.trim() || null;
    const preventAdditiveImportStacking = formData.get("prevent_additive_import_stacking") === "on";

    const rawAnnualCap = formData.get("annual_leave_cap_hours") as string | null;
    const annualLeaveCapHours =
      rawAnnualCap && rawAnnualCap.trim() !== "" ? Number(rawAnnualCap) : null;

    const { data: existingSettings } = await supabase
      .from("company_settings")
      .select("leave_rules")
      .eq("company_id", company.id)
      .maybeSingle();

    const existingLeaveRules = (existingSettings?.leave_rules ?? {}) as Record<string, unknown>;

    const updatedLeaveRules = {
      ...existingLeaveRules,
      policy_type: useItOrLoseItEnabled ? "use_it_or_lose_it" : "carry_over",
      use_it_or_lose_it_enabled: useItOrLoseItEnabled,
      carry_over_cap_hours: carryOverCapHours,
      annual_leave_cap_hours: annualLeaveCapHours,
      lock_imported_leave_baselines: lockImportedBaselines,
      accrual_baseline_date: accrualBaselineDate,
      prevent_additive_import_stacking: preventAdditiveImportStacking,
    };

    const { error } = await supabase.from("company_settings").upsert(
      {
        company_id: company.id,
        leave_rules: updatedLeaveRules,
      },
      { onConflict: "company_id" }
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    if (annualLeaveCapHours !== null) {
      const { data: annualLt } = await supabase
        .from("leave_types")
        .select("id, accrual_rules")
        .eq("company_id", company.id)
        .eq("category", "annual")
        .maybeSingle();

      if (annualLt?.id) {
        const curRules = (annualLt.accrual_rules ?? {}) as Record<string, unknown>;
        await supabase
          .from("leave_types")
          .update({
            accrual_rules: {
              ...curRules,
              annual_cap_hours: annualLeaveCapHours,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", annualLt.id);
      }
    }

    try {
      await syncEmployeeAccruals(undefined, company.id);
    } catch {}

    revalidateTag(`company-settings-${company.id}`, "max");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/leave");

    return {
      ok: true,
      message: useItOrLoseItEnabled
        ? "Policy set to 'Use It or Lose It'. Accrued leave during the current year is available to use; expired cycle balances forfeit upon renewal."
        : `Policy set to 'Carry Over'. Unused leave carries over${
            carryOverCapHours !== null ? ` up to ${carryOverCapHours}h` : " to next cycle"
          }.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to update leave policy." };
  }
}

export async function provisionAllStandardLeaveTypesAction(): Promise<{ ok: boolean; message: string; createdCount: number }> {
  try {
    const { company } = await getActiveCompany();
    const access = await getCurrentUserAccess();
    if (!access.canManageCompany) {
      return { ok: false, message: "Unauthorized. Admin access required.", createdCount: 0 };
    }

    const supabase = await createSupabaseServerClient();

    const { data: settings } = await supabase
      .from("company_settings")
      .select("toil_rules")
      .eq("company_id", company.id)
      .maybeSingle();
    const isToilEnabled = Boolean((settings?.toil_rules as Record<string, unknown> | undefined)?.enabled);

    const STANDARD_LEAVE_TYPES = [
      { name: "Annual Leave", category: "annual", is_paid: true, requires_attachment: false },
      { name: "Sick Leave", category: "sick", is_paid: true, requires_attachment: true },
      { name: "Family Responsibility Leave", category: "family_responsibility", is_paid: true, requires_attachment: false },
      { name: "Study Leave", category: "other", is_paid: true, requires_attachment: false },
      { name: "Maternity Leave", category: "maternity", is_paid: true, requires_attachment: true },
      { name: "Parental Leave", category: "family_responsibility", is_paid: true, requires_attachment: false },
      ...(isToilEnabled ? [{ name: "TOIL / Overtime Comp Leave", category: "toil_taken", is_paid: true, requires_attachment: false }] : []),
      { name: "Unpaid Leave", category: "unpaid", is_paid: false, requires_attachment: false },
    ];

    // Get existing leave types
    const { data: existingLt } = await supabase
      .from("leave_types")
      .select("id, name, category")
      .eq("company_id", company.id)
      .is("deleted_at", null);

    const existingNames = new Set((existingLt || []).map((l) => l.name.toLowerCase()));
    let createdCount = 0;

    for (const st of STANDARD_LEAVE_TYPES) {
      if (!existingNames.has(st.name.toLowerCase())) {
        await supabase.from("leave_types").insert({
          company_id: company.id,
          name: st.name,
          category: st.category as "annual" | "sick" | "family_responsibility" | "maternity" | "unpaid" | "toil_taken" | "other",
          is_paid: st.is_paid,
          requires_attachment: st.requires_attachment,
          is_active: true,
        });
        createdCount++;
      }
    }

    // Get all active leave types for company (including newly created ones)
    const { data: allLt } = await supabase
      .from("leave_types")
      .select("id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null);

    // Get all active employees
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", company.id)
      .eq("employment_status", "active")
      .is("deleted_at", null);

    const today = new Date().toISOString().split("T")[0];

    // Ensure leave_balances row exists for each employee x leave_type
    if (allLt && allLt.length > 0 && employees && employees.length > 0) {
      for (const emp of employees) {
        for (const lt of allLt) {
          const { data: existingBal } = await supabase
            .from("leave_balances")
            .select("id")
            .eq("company_id", company.id)
            .eq("employee_id", emp.id)
            .eq("leave_type_id", lt.id)
            .maybeSingle();

          if (!existingBal) {
            await supabase.from("leave_balances").insert({
              company_id: company.id,
              employee_id: emp.id,
              leave_type_id: lt.id,
              accrued_hours: 0,
              balance_hours: 0,
              taken_hours: 0,
              adjusted_hours: 0,
              as_of_date: today,
            });
          }
        }
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/leave");

    return {
      ok: true,
      message: `Provisioned all standard leave types (${createdCount} new created) and initialized employee balance grid.`,
      createdCount,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to provision leave types.", createdCount: 0 };
  }
}

export async function updateCompanyToilPolicy(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { company } = await getActiveCompany();
    const access = await getCurrentUserAccess();
    if (!access.canManageCompany) {
      return { ok: false, message: "Unauthorized. Admin access required." };
    }

    const supabase = await createSupabaseServerClient();
    const toilEnabled = formData.get("toil_enabled") === "on";
    const rawMultiplier = formData.get("accrual_multiplier") as string | null;
    const accrualMultiplier = rawMultiplier && Number(rawMultiplier) > 0 ? Number(rawMultiplier) : 1.5;

    const { data: existingSettings } = await supabase
      .from("company_settings")
      .select("toil_rules")
      .eq("company_id", company.id)
      .maybeSingle();

    const existingToilRules = (existingSettings?.toil_rules ?? {}) as Record<string, unknown>;

    const updatedToilRules = {
      ...existingToilRules,
      enabled: toilEnabled,
      accrual_multiplier: accrualMultiplier,
    };

    const { error } = await supabase.from("company_settings").upsert(
      {
        company_id: company.id,
        toil_rules: updatedToilRules,
      },
      { onConflict: "company_id" },
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    try {
      await syncEmployeeAccruals(undefined, company.id);
    } catch {}

    revalidateTag(`company-settings-${company.id}`, "max");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/leave");
    revalidatePath("/dashboard/time");

    return {
      ok: true,
      message: toilEnabled
        ? "TOIL Engine enabled. Employees can now convert overtime into TOIL and request time off in lieu."
        : "TOIL Engine disabled. All TOIL features, balance views, and conversions are now deactivated.",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to update TOIL engine policy.",
    };
  }
}

