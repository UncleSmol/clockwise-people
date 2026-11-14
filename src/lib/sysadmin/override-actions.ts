"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserAccess, getActiveCompany } from "@/lib/foundation/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncEmployeeAccruals } from "@/lib/work-rules/actions";
import { sanitizeUserFacingErrorMessage } from "@/lib/foundation/errors";

export type SuperAdminOverrideResult<T = unknown> = {
  ok: boolean;
  message: string;
  data?: T;
};

export type SuperAdminTimesheetItem = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  workstation_id: string | null;
  workstation_name?: string | null;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
  gross_hours: number | null;
  lunch_hours: number | null;
  paid_hours: number | null;
  normal_hours: number | null;
  overtime_hours: number | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled";
  notes: string | null;
  leave_type_id: string | null;
  leave_type_name?: string | null;
  employee_name: string;
  employee_number: string;
  avatar_url: string | null;
  created_at: string;
};

export type SuperAdminLeaveItem = {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  reason: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled";
  manager_notes: string | null;
  rejection_reason: string | null;
  employee_name: string;
  employee_number: string;
  avatar_url: string | null;
  submitted_at: string | null;
  created_at: string;
};

async function verifySuperAdminAccess() {
  const access = await getCurrentUserAccess();
  const isAuthorized =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.canManageCompany;
  return { isAuthorized, access };
}

/**
 * Fetch timesheets across employees and statuses for Super Admin override
 */
export async function getSuperAdminTimesheetsAction(params: {
  companyId: string;
  employeeId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<SuperAdminOverrideResult<{ items: SuperAdminTimesheetItem[]; totalCount: number }>> {
  const { isAuthorized } = await verifySuperAdminAccess();
  if (!isAuthorized) {
    return { ok: false, message: "Unauthorized: Super Admin or Company Owner privileges required." };
  }

  const {
    companyId,
    employeeId,
    status = "all",
    startDate,
    endDate,
    search = "",
    page = 1,
    pageSize = 50,
  } = params;

  const admin = createSupabaseAdminClient();

  try {
    let query = admin
      .from("time_entries")
      .select(
        `id, company_id, employee_id, work_date, workstation_id,
         clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours,
         paid_hours, normal_hours, overtime_hours, status, notes, leave_type_id, created_at,
         employees(id, full_name, known_as, employee_number, avatar_url),
         company_workstations(name),
         leave_types(name)`,
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (employeeId && employeeId !== "all") {
      query = query.eq("employee_id", employeeId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("work_date", startDate);
    }

    if (endDate) {
      query = query.lte("work_date", endDate);
    }

    query = query.order("work_date", { ascending: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return { ok: false, message: error.message };
    }

    let items: SuperAdminTimesheetItem[] = (data ?? []).map((row: any) => {
      const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees;
      const ws = Array.isArray(row.company_workstations)
        ? row.company_workstations[0]
        : row.company_workstations;
      const lt = Array.isArray(row.leave_types) ? row.leave_types[0] : row.leave_types;

      return {
        id: row.id,
        company_id: row.company_id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        workstation_id: row.workstation_id,
        workstation_name: ws?.name ?? null,
        clock_in: row.clock_in,
        lunch_start: row.lunch_start,
        lunch_end: row.lunch_end,
        clock_out: row.clock_out,
        gross_hours: row.gross_hours != null ? Number(row.gross_hours) : null,
        lunch_hours: row.lunch_hours != null ? Number(row.lunch_hours) : null,
        paid_hours: row.paid_hours != null ? Number(row.paid_hours) : null,
        normal_hours: row.normal_hours != null ? Number(row.normal_hours) : null,
        overtime_hours: row.overtime_hours != null ? Number(row.overtime_hours) : null,
        status: row.status,
        notes: row.notes,
        leave_type_id: row.leave_type_id,
        leave_type_name: lt?.name ?? null,
        employee_name: emp?.known_as || emp?.full_name || "Unknown employee",
        employee_number: emp?.employee_number || "",
        avatar_url: emp?.avatar_url || null,
        created_at: row.created_at,
      };
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (it) =>
          it.employee_name.toLowerCase().includes(q) ||
          it.employee_number.toLowerCase().includes(q) ||
          (it.workstation_name && it.workstation_name.toLowerCase().includes(q)) ||
          (it.notes && it.notes.toLowerCase().includes(q)) ||
          it.work_date.includes(q),
      );
    }

    return {
      ok: true,
      message: "Timesheets loaded successfully.",
      data: {
        items,
        totalCount: count ?? items.length,
      },
    };
  } catch (err: any) {
    return { ok: false, message: sanitizeUserFacingErrorMessage(err, "Failed to load timesheets.") };
  }
}

/**
 * Fetch leave requests across employees and statuses for Super Admin override
 */
export async function getSuperAdminLeaveRequestsAction(params: {
  companyId: string;
  employeeId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<SuperAdminOverrideResult<{ items: SuperAdminLeaveItem[]; totalCount: number }>> {
  const { isAuthorized } = await verifySuperAdminAccess();
  if (!isAuthorized) {
    return { ok: false, message: "Unauthorized: Super Admin or Company Owner privileges required." };
  }

  const {
    companyId,
    employeeId,
    status = "all",
    startDate,
    endDate,
    search = "",
    page = 1,
    pageSize = 50,
  } = params;

  const admin = createSupabaseAdminClient();

  try {
    let query = admin
      .from("leave_requests")
      .select(
        `id, company_id, employee_id, leave_type_id, start_date, end_date, total_hours,
         reason, status, manager_notes, rejection_reason, submitted_at, created_at,
         employees(id, full_name, known_as, employee_number, avatar_url),
         leave_types(name)`,
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (employeeId && employeeId !== "all") {
      query = query.eq("employee_id", employeeId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("end_date", startDate);
    }

    if (endDate) {
      query = query.lte("start_date", endDate);
    }

    query = query.order("start_date", { ascending: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return { ok: false, message: error.message };
    }

    let items: SuperAdminLeaveItem[] = (data ?? []).map((row: any) => {
      const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees;
      const lt = Array.isArray(row.leave_types) ? row.leave_types[0] : row.leave_types;

      return {
        id: row.id,
        company_id: row.company_id,
        employee_id: row.employee_id,
        leave_type_id: row.leave_type_id,
        leave_type_name: lt?.name || "Leave",
        start_date: row.start_date,
        end_date: row.end_date,
        total_hours: Number(row.total_hours || 0),
        reason: row.reason,
        status: row.status,
        manager_notes: row.manager_notes,
        rejection_reason: row.rejection_reason,
        employee_name: emp?.known_as || emp?.full_name || "Unknown employee",
        employee_number: emp?.employee_number || "",
        avatar_url: emp?.avatar_url || null,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
      };
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (it) =>
          it.employee_name.toLowerCase().includes(q) ||
          it.employee_number.toLowerCase().includes(q) ||
          it.leave_type_name.toLowerCase().includes(q) ||
          (it.reason && it.reason.toLowerCase().includes(q)) ||
          it.start_date.includes(q) ||
          it.end_date.includes(q),
      );
    }

    return {
      ok: true,
      message: "Leave requests loaded successfully.",
      data: {
        items,
        totalCount: count ?? items.length,
      },
    };
  } catch (err: any) {
    return { ok: false, message: sanitizeUserFacingErrorMessage(err, "Failed to load leave requests.") };
  }
}

/**
 * Super Admin Action to mark timesheets as Approved or Rejected (bulk or single)
 */
export async function superAdminSetTimesheetsStatusAction(params: {
  companyId: string;
  timeEntryIds: string[];
  status: "approved" | "rejected";
  notes?: string;
}): Promise<SuperAdminOverrideResult<{ updatedCount: number }>> {
  const { isAuthorized, access } = await verifySuperAdminAccess();
  if (!isAuthorized) {
    return { ok: false, message: "Unauthorized: Super Admin privileges required." };
  }

  const { companyId, timeEntryIds, status, notes } = params;
  if (!timeEntryIds || timeEntryIds.length === 0) {
    return { ok: false, message: "Please pick at least one timesheet entry to update." };
  }

  const admin = createSupabaseAdminClient();

  try {
    // Resolve actor user for this company
    const { data: actorUser } = await admin
      .from("users")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("is_super_admin", { ascending: false })
      .limit(1)
      .maybeSingle();

    const actorId = actorUser?.id ?? null;
    const nowIso = new Date().toISOString();
    const cleanNotes = notes?.trim() || null;

    if (status === "approved") {
      // 1. Update time entries to approved
      for (const id of timeEntryIds) {
        const updatePayload: Record<string, unknown> = {
          status: "approved",
          approved_at: nowIso,
          updated_at: nowIso,
        };
        if (actorId) updatePayload.approved_by = actorId;
        if (cleanNotes) {
          const { data: existing } = await admin
            .from("time_entries")
            .select("notes")
            .eq("id", id)
            .maybeSingle();
          updatePayload.notes = [existing?.notes, cleanNotes].filter(Boolean).join("\n");
        }

        await admin.from("time_entries").update(updatePayload).eq("id", id).eq("company_id", companyId);
      }

      // 2. Also update parent timesheets status
      const { data: timesheetIds } = await admin
        .from("time_entries")
        .select("timesheet_id")
        .in("id", timeEntryIds)
        .not("timesheet_id", "is", null);

      const uniqueTsIds = [...new Set((timesheetIds ?? []).map((t) => t.timesheet_id).filter(Boolean))];
      if (uniqueTsIds.length > 0) {
        await admin
          .from("timesheets")
          .update({
            status: "approved",
            approved_at: nowIso,
            approved_by: actorId,
            updated_at: nowIso,
          })
          .in("id", uniqueTsIds);
      }
    } else {
      // Rejected
      for (const id of timeEntryIds) {
        const { data: existing } = await admin
          .from("time_entries")
          .select("notes")
          .eq("id", id)
          .maybeSingle();

        const noteText = cleanNotes ? `Manager rejection note: ${cleanNotes}` : "Rejected by Super Admin";
        const combined = [existing?.notes, noteText].filter(Boolean).join("\n");

        await admin
          .from("time_entries")
          .update({
            status: "rejected",
            notes: combined,
            updated_at: nowIso,
          })
          .eq("id", id)
          .eq("company_id", companyId);
      }
    }

    // Background sync of accruals
    try {
      await syncEmployeeAccruals();
    } catch {
      // non-blocking
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/time");

    return {
      ok: true,
      message: `Successfully marked ${timeEntryIds.length} timesheet${timeEntryIds.length === 1 ? "" : "s"} as ${status}.`,
      data: { updatedCount: timeEntryIds.length },
    };
  } catch (err: any) {
    return { ok: false, message: sanitizeUserFacingErrorMessage(err, "Failed to update timesheet statuses.") };
  }
}

/**
 * Super Admin Action to mark leave requests as Approved or Rejected (single or bulk)
 */
export async function superAdminSetLeaveRequestStatusAction(params: {
  companyId: string;
  leaveRequestIds: string[];
  status: "approved" | "rejected";
  notes?: string;
}): Promise<SuperAdminOverrideResult<{ updatedCount: number }>> {
  const { isAuthorized } = await verifySuperAdminAccess();
  if (!isAuthorized) {
    return { ok: false, message: "Unauthorized: Super Admin privileges required." };
  }

  const { companyId, leaveRequestIds, status, notes } = params;
  if (!leaveRequestIds || leaveRequestIds.length === 0) {
    return { ok: false, message: "Please pick at least one leave request to update." };
  }

  const admin = createSupabaseAdminClient();
  const cleanNotes = notes?.trim() || null;
  let successCount = 0;
  const errors: string[] = [];

  for (const leaveRequestId of leaveRequestIds) {
    try {
      const { data: existing, error: fetchErr } = await admin
        .from("leave_requests")
        .select("*")
        .eq("id", leaveRequestId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (fetchErr || !existing) {
        errors.push(`Leave request ${leaveRequestId} not found.`);
        continue;
      }

      if (status === "approved") {
        // Ensure status is submitted before running official review RPC to generate daily time entries and balances
        if (existing.status !== "submitted") {
          await admin
            .from("leave_requests")
            .update({ status: "submitted", updated_at: new Date().toISOString() })
            .eq("id", leaveRequestId);
        }

        const rpcRes = await admin.rpc("review_managed_leave_request", {
          target_leave_request_id: leaveRequestId,
          approve_request: true,
          manager_notes: cleanNotes || "Approved via Super Admin override",
        });

        if (rpcRes.error) {
          errors.push(`Failed to approve ${leaveRequestId}: ${rpcRes.error.message}`);
          continue;
        }
      } else {
        // Rejection
        if (existing.status === "approved") {
          // If already approved, clean up generated daily time entries
          await admin
            .from("time_entries")
            .delete()
            .eq("company_id", companyId)
            .eq("leave_request_id", leaveRequestId);

          // Refund the leave balance if it was deducted
          const { data: leaveType } = await admin
            .from("leave_types")
            .select("code, name")
            .eq("id", existing.leave_type_id)
            .maybeSingle();

          const isUntracked =
            leaveType?.code === "unpaid" ||
            leaveType?.code === "public_holiday" ||
            leaveType?.name?.toLowerCase().includes("unpaid");

          if (!isUntracked && existing.total_hours > 0) {
            const { data: bal } = await admin
              .from("leave_balances")
              .select("id, used, current_balance")
              .eq("employee_id", existing.employee_id)
              .eq("leave_type_id", existing.leave_type_id)
              .maybeSingle();

            if (bal) {
              const refundAmount = Number(existing.total_hours);
              await admin
                .from("leave_balances")
                .update({
                  used: Math.max(0, Number(bal.used || 0) - refundAmount),
                  current_balance: Number(bal.current_balance || 0) + refundAmount,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", bal.id);
            }
          }
        }

        // Update leave request to rejected
        const nowIso = new Date().toISOString();
        const rejectionMsg = cleanNotes || "Rejected via Super Admin override";

        await admin
          .from("leave_requests")
          .update({
            status: "rejected",
            rejection_reason: rejectionMsg,
            manager_notes: rejectionMsg,
            rejected_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", leaveRequestId);

        // Update any pending approval requests
        await admin
          .from("approval_requests")
          .update({
            status: "rejected",
            comments: rejectionMsg,
            resolved_at: nowIso,
            updated_at: nowIso,
          })
          .eq("leave_request_id", leaveRequestId)
          .eq("status", "pending");
      }

      successCount++;
    } catch (err: any) {
      errors.push(sanitizeUserFacingErrorMessage(err, `Failed to update ${leaveRequestId}`));
    }
  }

  try {
    await syncEmployeeAccruals();
  } catch {
    // non-blocking
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leave");

  if (successCount === 0 && errors.length > 0) {
    return { ok: false, message: sanitizeUserFacingErrorMessage(errors.join(", ")) };
  }

  return {
    ok: true,
    message: `Successfully marked ${successCount} leave request${successCount === 1 ? "" : "s"} as ${status}.${errors.length > 0 ? ` (${errors.length} failed)` : ""}`,
    data: { updatedCount: successCount },
  };
}
