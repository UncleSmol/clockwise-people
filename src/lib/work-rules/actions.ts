"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/foundation/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  leaveAssignmentFormSchema,
  leaveRequestFormSchema,
  leaveTypeFormSchema,
  workScheduleFormSchema,
} from "./schema";

type ActionState = {
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
  return { ok: true, message: "Time off rule created." };
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
  return { ok: true, message: "Time off balance assigned." };
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
    total_hours: String(formData.get("total_hours") ?? ""),
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
    request_total_hours: Number(parsed.data.total_hours),
    target_leave_type_id: parsed.data.leave_type_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Time off request sent." };
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
    message: `Time off request ${decision === "approve" ? "approved" : "rejected"}.`,
  };
}
