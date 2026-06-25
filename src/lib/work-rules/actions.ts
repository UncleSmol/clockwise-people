"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/foundation/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  leaveAssignmentFormSchema,
  leaveRequestFormSchema,
  leaveTypeFormSchema,
  publicHolidayFormSchema,
  updateLeaveTypeFormSchema,
  updateWorkScheduleFormSchema,
  workScheduleFormSchema,
  type LeaveCalculation,
} from "./schema";

type ActionState = {
  calculation?: LeaveCalculation;
  ok: boolean;
  message: string;
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
