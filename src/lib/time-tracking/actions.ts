"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getActiveCompany,
  getCurrentUserAccess,
  getOtherBranchManagerEmployeeIds,
} from "@/lib/foundation/queries";
import { syncEmployeeAccruals } from "@/lib/work-rules/actions";
import { sanitizeMultilineText, sanitizeString } from "@/lib/security/sanitizer";
import { getWeekBounds, type ClockEventType, type TimeClockLocationEvent, type TimeEntryRecord } from "./schema";

type ClockActionState = {
  entry?: TimeEntryRecord;
  ok: boolean;
  message: string;
};

type CorrectionActionState = {
  ok: boolean;
  message: string;
};

type TimeEntryActionState = {
  ok: boolean;
  message: string;
};

const managerCalendarMigrationMessage =
  "Manager calendar actions are not active yet. Apply the Supabase migration, then retry.";

function isMissingManagerCalendarRpc(error: { code?: string; message?: string }) {
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.message?.includes("schema cache") ||
    error.message?.includes("create_managed_draft_time_entry_for_date") ||
    error.message?.includes("load_managed_leave_request_time_entries")
  );
}

function firstRel<T>(rel: T[] | T | null | undefined): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

type ScopedAccess = Awaited<ReturnType<typeof getCurrentUserAccess>>;

async function checkEmployeeWorkstationScope(
  companyId: string,
  employeeId: string,
  access: ScopedAccess,
): Promise<string | null> {
  if (!access.isScopedBranchManager) return null;
  if (!access.scopedWorkstationId) {
    return "No workstation is assigned to your branch manager profile.";
  }

  const otherBranchManagerIds = await getOtherBranchManagerEmployeeIds(companyId, access.employeeId);
  if (otherBranchManagerIds.has(employeeId)) {
    return "Branch managers cannot manage another branch manager's leave or timesheets.";
  }

  const adminClient = createSupabaseAdminClient();
  const { data: employee, error } = await adminClient
    .from("employees")
    .select("workstation_id")
    .eq("id", employeeId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !employee || employee.workstation_id !== access.scopedWorkstationId) {
    return "You can only manage records for employees in your assigned workstation.";
  }
  return null;
}

async function checkTimeEntriesWorkstationScope(
  companyId: string,
  timeEntryIds: string[],
  access: ScopedAccess,
): Promise<string | null> {
  if (!access.isScopedBranchManager) return null;
  if (!access.scopedWorkstationId) {
    return "No workstation is assigned to your branch manager profile.";
  }
  if (timeEntryIds.length === 0) return null;

  const adminClient = createSupabaseAdminClient();
  const { data: entries, error } = await adminClient
    .from("time_entries")
    .select("id, employee_id, workstation_id, employees(workstation_id)")
    .eq("company_id", companyId)
    .in("id", timeEntryIds)
    .is("deleted_at", null);

  if (error || !entries || entries.length !== timeEntryIds.length) {
    return "One or more timesheets could not be verified for your workstation.";
  }

  if (access.employeeId && entries.some((entry) => entry.employee_id === access.employeeId)) {
    return "Branch managers cannot approve their own timesheets or drafts.";
  }

  const otherBranchManagerIds = await getOtherBranchManagerEmployeeIds(companyId, access.employeeId);
  if (entries.some((entry) => otherBranchManagerIds.has(entry.employee_id))) {
    return "Branch managers cannot interact with another branch manager's timesheets.";
  }

  const hasOutOfScope = entries.some((entry) => {
    const emp = firstRel(entry.employees);
    const effectiveWorkstationId = entry.workstation_id || emp?.workstation_id;
    return effectiveWorkstationId !== access.scopedWorkstationId;
  });

  return hasOutOfScope
    ? "You can only interact with timesheets in your assigned workstation."
    : null;
}

async function checkCorrectionsWorkstationScope(
  companyId: string,
  correctionIds: string[],
  access: ScopedAccess,
): Promise<string | null> {
  if (!access.isScopedBranchManager) return null;
  if (!access.scopedWorkstationId) {
    return "No workstation is assigned to your branch manager profile.";
  }
  if (correctionIds.length === 0) return null;

  const adminClient = createSupabaseAdminClient();
  const { data: requests, error } = await adminClient
    .from("timesheet_correction_requests")
    .select("id, employee_id, employees(workstation_id)")
    .eq("company_id", companyId)
    .in("id", correctionIds)
    .is("deleted_at", null);

  if (error || !requests || requests.length !== correctionIds.length) {
    return "One or more correction requests could not be verified for your workstation.";
  }

  if (access.employeeId && requests.some((req) => req.employee_id === access.employeeId)) {
    return "Branch managers cannot review or approve their own correction requests.";
  }

  const otherBranchManagerIds = await getOtherBranchManagerEmployeeIds(companyId, access.employeeId);
  if (requests.some((req) => otherBranchManagerIds.has(req.employee_id))) {
    return "Branch managers cannot review another branch manager's correction requests.";
  }

  const hasOutOfScope = requests.some((req) => {
    const emp = firstRel(req.employees);
    return emp?.workstation_id !== access.scopedWorkstationId;
  });

  return hasOutOfScope
    ? "You can only review correction requests for employees in your assigned workstation."
    : null;
}

async function checkLeaveRequestsWorkstationScope(
  companyId: string,
  leaveRequestIds: string[],
  access: ScopedAccess,
): Promise<string | null> {
  if (!access.isScopedBranchManager) return null;
  if (!access.scopedWorkstationId) {
    return "No workstation is assigned to your branch manager profile.";
  }
  if (leaveRequestIds.length === 0) return null;

  const adminClient = createSupabaseAdminClient();
  const { data: requests, error } = await adminClient
    .from("leave_requests")
    .select("id, employee_id, employees(workstation_id)")
    .eq("company_id", companyId)
    .in("id", leaveRequestIds)
    .is("deleted_at", null);

  if (error || !requests || requests.length !== leaveRequestIds.length) {
    return "One or more leave requests could not be verified for your workstation.";
  }

  if (access.employeeId && requests.some((req) => req.employee_id === access.employeeId)) {
    return "Branch managers cannot load or approve their own leave requests.";
  }

  const otherBranchManagerIds = await getOtherBranchManagerEmployeeIds(companyId, access.employeeId);
  if (requests.some((req) => otherBranchManagerIds.has(req.employee_id))) {
    return "Branch managers cannot load another branch manager's leave requests.";
  }

  const hasOutOfScope = requests.some((req) => {
    const emp = firstRel(req.employees);
    return emp?.workstation_id !== access.scopedWorkstationId;
  });

  return hasOutOfScope
    ? "You can only load leave requests for employees in your assigned workstation."
    : null;
}

export async function recordClockEvent(
  eventType: ClockEventType,
  formData?: FormData,
): Promise<ClockActionState> {
  const [{ company }, supabase] = await Promise.all([
    getActiveCompany(),
    createSupabaseServerClient(),
  ]);
  const latitude = String(formData?.get("latitude") ?? "").trim();
  const longitude = String(formData?.get("longitude") ?? "").trim();
  const accuracy = String(formData?.get("accuracy") ?? "").trim();
  const capturedAt = String(formData?.get("captured_at") ?? "").trim();
  const workstationId = String(formData?.get("workstation_id") ?? "").trim();
  const requestedAt = String(formData?.get("requested_at") ?? "").trim() || null;

  if (!latitude || !longitude) {
    return {
      ok: false,
      message: "Location is required for clocking. Enable location permission and try again.",
    };
  }

  if (eventType === "clock_in") {
    const access = await getCurrentUserAccess();
    if (access.employeeId) {
      const effectiveTimezone = company.timezone || "Africa/Johannesburg";
      const today = currentDateInTimezone(effectiveTimezone);
      const bounds = getWeekBounds(today);

      const [{ data: pastDrafts }, { data: holidays }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("id, work_date, notes, status")
          .eq("employee_id", access.employeeId)
          .lt("work_date", bounds.startOfCurrentWeek)
          .in("status", ["draft", "rejected"])
          .is("deleted_at", null)
          .order("work_date", { ascending: false }),
        supabase
          .from("company_public_holidays")
          .select("holiday_date")
          .eq("company_id", company.id)
          .is("deleted_at", null),
      ]);

      const holidayDateSet = new Set(
        (holidays ?? []).map((h) => h.holiday_date as string),
      );

      const unsubmittedDrafts = (pastDrafts ?? []).filter(
        (entry) =>
          !entry.notes?.startsWith("Public holiday:") &&
          !holidayDateSet.has(entry.work_date),
      );

      if (unsubmittedDrafts.length > 0) {
        const newestDate = unsubmittedDrafts[0].work_date;
        const oldestDate = unsubmittedDrafts[unsubmittedDrafts.length - 1].work_date;
        const rangeLabel =
          oldestDate === newestDate
            ? oldestDate
            : `${oldestDate} to ${newestDate}`;
        return {
          ok: false,
          message: `Cannot clock in: You have ${unsubmittedDrafts.length} unsubmitted past draft timesheet${unsubmittedDrafts.length === 1 ? "" : "s"} (${rangeLabel}) that must be reviewed, adjusted, and submitted first.`,
        };
      }
    }
  }

  const { data, error } = await supabase.rpc("record_employee_time_event", {
    requested_event: eventType,
    workstation_id: workstationId || null,
    requested_at: requestedAt,
    target_company_id: company.id,
    device_metadata: {
      location:
        latitude && longitude
          ? {
              accuracy: accuracy ? Number(accuracy) : null,
              captured_at: capturedAt || null,
              latitude: Number(latitude),
              longitude: Number(longitude),
            }
          : null,
      source: "dashboard",
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const entry = data as TimeEntryRecord & {
    device_metadata?: {
      location?: {
        accuracy?: number | null;
        captured_at?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      };
      geofence?: {
        distance_meters?: number | null;
        status?: string | null;
        workstation_name?: string | null;
      };
    };
  };
  const metadata = entry?.device_metadata ?? {};
  const metadataLocation = metadata.location ?? {};
  const metadataGeofence = metadata.geofence ?? {};
  const eventTime =
    eventType === "clock_in"
      ? entry?.clock_in
      : eventType === "lunch_start"
        ? entry?.lunch_start
        : eventType === "lunch_end"
          ? entry?.lunch_end
          : entry?.clock_out;
  const locationEvents: TimeClockLocationEvent[] = [
    {
      id: `${entry?.id}-${eventType}`,
      event_type: eventType,
      event_at: metadataLocation.captured_at ?? new Date().toISOString(),
      local_work_date: entry?.work_date ?? "",
      local_event_time: eventTime ?? "",
      latitude:
        metadataGeofence.status === "out_of_range"
          ? null
          : metadataLocation.latitude != null
            ? Number(metadataLocation.latitude)
            : null,
      longitude:
        metadataGeofence.status === "out_of_range"
          ? null
          : metadataLocation.longitude != null
            ? Number(metadataLocation.longitude)
            : null,
      accuracy_meters:
        metadataLocation.accuracy != null ? Number(metadataLocation.accuracy) : null,
      workstationName: metadataGeofence.workstation_name ?? null,
      distance_meters:
        metadataGeofence.distance_meters != null ? Number(metadataGeofence.distance_meters) : null,
      geofence_status: metadataGeofence.status ?? null,
    },
  ];

  if (eventType === "clock_out" || eventType === "clock_in") {
    try {
      await syncEmployeeAccruals();
    } catch {
      // Non-blocking background sync
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time-tracking");
  return {
    entry: { ...(entry as TimeEntryRecord), locationEvents },
    ok: true,
    message: "Time record updated.",
  };
}

export async function clockIn(formData?: FormData) {
  return recordClockEvent("clock_in", formData);
}

export async function startLunch(formData?: FormData) {
  return recordClockEvent("lunch_start", formData);
}

export async function endLunch(formData?: FormData) {
  return recordClockEvent("lunch_end", formData);
}

export async function clockOut(formData?: FormData) {
  return recordClockEvent("clock_out", formData);
}

export async function switchWorkstation(formData?: FormData) {
  return recordClockEvent("switch_workstation", formData);
}

function optionalTime(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function submitTimesheetCorrection(
  _previousState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const timeEntryIds = [
    ...formData.getAll("time_entry_ids"),
    ...formData.getAll("time_entry_id"),
  ]
    .map((v) => sanitizeString(v, 64))
    .filter(Boolean);
  const reason = sanitizeMultilineText(formData.get("reason"), 1000);

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Choose at least one time entry to correct." };
  }

  if (!reason) {
    return { ok: false, message: "Add a reason for the correction." };
  }

  const supabase = await createSupabaseServerClient();
  const proposedClockIn = optionalTime(formData, "proposed_clock_in");
  const proposedClockOut = optionalTime(formData, "proposed_clock_out");
  const proposedLunchStart = optionalTime(formData, "proposed_lunch_start");
  const proposedLunchEnd = optionalTime(formData, "proposed_lunch_end");

  // Try bulk RPC first
  const { data, error } = await supabase.rpc("submit_timesheet_correction_requests", {
    correction_reason: reason,
    proposed_clock_in: proposedClockIn,
    proposed_clock_out: proposedClockOut,
    proposed_lunch_end: proposedLunchEnd,
    proposed_lunch_start: proposedLunchStart,
    target_time_entry_ids: timeEntryIds,
  });

  if (error) {
    // Fallback to loop over submit_timesheet_correction_request
    let successCount = 0;
    for (const tid of timeEntryIds) {
      const { error: singleError } = await supabase.rpc("submit_timesheet_correction_request", {
        correction_reason: reason,
        proposed_clock_in: proposedClockIn,
        proposed_clock_out: proposedClockOut,
        proposed_lunch_end: proposedLunchEnd,
        proposed_lunch_start: proposedLunchStart,
        target_time_entry_id: tid,
      });
      if (!singleError) {
        successCount++;
      }
    }

    if (successCount === 0) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `${successCount} correction request${successCount === 1 ? "" : "s"} submitted. Locked until a manager reviews.`,
    };
  }

  const count = Number(data ?? timeEntryIds.length);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${count} correction request${count === 1 ? "" : "s"} submitted. Locked until a manager reviews.`,
  };
}

export async function reviewTimesheetCorrection(
  _previousState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const correctionIds = [
    ...formData.getAll("correction_ids"),
    ...formData.getAll("correction_id"),
  ]
    .map((v) => sanitizeString(v, 64))
    .filter(Boolean);

  const decision = sanitizeString(formData.get("decision"), 20);
  const notes = sanitizeMultilineText(formData.get("review_notes"), 1000);

  if (correctionIds.length === 0) {
    return { ok: false, message: "Pick at least one correction request to review." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose whether to approve or reject the request." };
  }

  const access = await getCurrentUserAccess();
  const isManager =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.isBranchManager ||
    access.canReviewBranchTime ||
    access.canManageDirectReports;

  if (!isManager) {
    return { ok: false, message: "You do not have permission to review correction requests." };
  }

  if (access.isScopedBranchManager) {
    const { company } = await getActiveCompany();
    const scopeError = await checkCorrectionsWorkstationScope(company.id, correctionIds, access);
    if (scopeError) {
      return { ok: false, message: scopeError };
    }
  }

  const supabase = await createSupabaseServerClient();
  const approve = decision === "approve";

  // Try bulk RPC first
  let { data, error } = await supabase.rpc("review_timesheet_correction_requests", {
    approve_request: approve,
    manager_notes: notes || null,
    target_correction_ids: correctionIds,
  });

  if (error && isManager) {
    const adminClient = createSupabaseAdminClient();
    const adminRes = await adminClient.rpc("review_timesheet_correction_requests", {
      approve_request: approve,
      manager_notes: notes || null,
      target_correction_ids: correctionIds,
    });
    if (!adminRes.error) {
      data = adminRes.data;
      error = null;
    }
  }

  if (error) {
    // Fallback to sequential single RPC in case bulk RPC is unavailable
    let successCount = 0;
    for (const cid of correctionIds) {
      let { error: singleError } = await supabase.rpc("review_timesheet_correction_request", {
        approve_request: approve,
        manager_notes: notes || null,
        target_correction_id: cid,
      });

      if (singleError && isManager) {
        const adminClient = createSupabaseAdminClient();
        const adminSingle = await adminClient.rpc("review_timesheet_correction_request", {
          approve_request: approve,
          manager_notes: notes || null,
          target_correction_id: cid,
        });
        if (!adminSingle.error) {
          singleError = null;
        }
      }

      if (singleError) {
        return { ok: false, message: singleError.message };
      }
      successCount++;
    }

    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `${successCount} correction request${successCount === 1 ? "" : "s"} ${approve ? "approved" : "rejected"}.`,
    };
  }

  const count = Number(data ?? correctionIds.length);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${count} correction request${count === 1 ? "" : "s"} ${approve ? "approved" : "rejected"}.`,
  };
}

function currentDateInTimezone(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export async function saveDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();

  if (!timeEntryId) {
    return { ok: false, message: "Choose a timesheet to save." };
  }

  const clockIn = optionalTime(formData, "clock_in");
  const clockOut = optionalTime(formData, "clock_out");
  const lunchStart = optionalTime(formData, "lunch_start");
  const lunchEnd = optionalTime(formData, "lunch_end");

  if (lunchStart && lunchEnd && lunchEnd <= lunchStart) {
    return {
      ok: false,
      message: "Lunch out time must be after lunch in time.",
    };
  }

  if (!lunchStart && lunchEnd) {
    return {
      ok: false,
      message: "Lunch in time is required if lunch out is provided.",
    };
  }

  if (clockIn && clockOut && clockOut <= clockIn) {
    return {
      ok: false,
      message: "Clock out time must be after clock in time.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_own_draft_time_entry", {
    entry_notes: sanitizeMultilineText(formData.get("notes"), 1000) || null,
    proposed_clock_in: clockIn,
    proposed_clock_out: clockOut,
    proposed_lunch_end: lunchEnd,
    proposed_lunch_start: lunchStart,
    target_time_entry_id: timeEntryId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Timesheet saved." };
}

export async function createPastDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const workDate = String(formData.get("work_date") ?? "").trim();

  if (!workDate) {
    return { ok: false, message: "Choose a past day to add." };
  }

  const clockIn = optionalTime(formData, "clock_in");
  const clockOut = optionalTime(formData, "clock_out");
  const includeLunch = formData.get("include_lunch") !== "false";
  const lunchStart = includeLunch ? optionalTime(formData, "lunch_start") : null;
  const lunchEnd = includeLunch ? optionalTime(formData, "lunch_end") : null;
  const useTemplate = formData.get("use_template") === "true";
  const notes =
    sanitizeMultilineText(formData.get("notes"), 1000) ||
    (useTemplate
      ? includeLunch
        ? "Created via schedule template"
        : "Created via schedule template (no lunch)"
      : null);

  if (lunchStart && lunchEnd && lunchEnd <= lunchStart) {
    return { ok: false, message: "Lunch out time must be after lunch in time." };
  }

  if (!lunchStart && lunchEnd) {
    return { ok: false, message: "Lunch in time is required if lunch out is provided." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_own_draft_time_entry_for_date", {
    target_work_date: workDate,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const createdId = (data as { id?: string } | null)?.id;
  if (createdId && (clockIn || lunchStart || lunchEnd || clockOut)) {
    await supabase.rpc("update_own_draft_time_entry", {
      entry_notes: notes,
      proposed_clock_in: clockIn,
      proposed_clock_out: clockOut,
      proposed_lunch_end: lunchEnd,
      proposed_lunch_start: lunchStart,
      target_time_entry_id: createdId,
    });
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Draft timesheet added." };
}

export async function createBulkDraftTimeEntriesAction(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const startDateStr = String(formData.get("start_date") ?? "").trim();
  const endDateStr = String(formData.get("end_date") ?? "").trim();
  const excludeWeekends = formData.get("exclude_weekends") !== "false";
  const includeLunch = formData.get("include_lunch") !== "false";
  const clockIn = optionalTime(formData, "clock_in");
  const lunchStart = includeLunch ? optionalTime(formData, "lunch_start") : null;
  const lunchEnd = includeLunch ? optionalTime(formData, "lunch_end") : null;
  const clockOut = optionalTime(formData, "clock_out");
  const notes =
    sanitizeMultilineText(formData.get("notes"), 1000) ||
    (includeLunch
      ? "Bulk draft generated from work schedule template"
      : "Bulk draft generated from work schedule template (no lunch)");

  if (!startDateStr || !endDateStr) {
    return { ok: false, message: "Please select both a start date and an end date." };
  }

  if (startDateStr > endDateStr) {
    return { ok: false, message: "Start date must be before or equal to end date." };
  }

  if (lunchStart && lunchEnd && lunchEnd <= lunchStart) {
    return { ok: false, message: "Lunch out time must be after lunch in time." };
  }

  if (!lunchStart && lunchEnd) {
    return { ok: false, message: "Lunch in time is required if lunch out is provided." };
  }

  if (clockIn && clockOut && clockOut <= clockIn) {
    return { ok: false, message: "Clock out time must be after clock in time." };
  }

  const [{ company }, supabase] = await Promise.all([
    getActiveCompany(),
    createSupabaseServerClient(),
  ]);

  const effectiveTimezone = company.timezone || "Africa/Johannesburg";
  const today = currentDateInTimezone(effectiveTimezone);

  if (endDateStr >= today) {
    return {
      ok: false,
      message: "Draft timesheets can only be created for past dates (prior to today).",
    };
  }

  // Get employee ID linked to current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Authentication is required." };
  }

  const { data: actor } = await supabase
    .from("users")
    .select("employee_id")
    .eq("auth_user_id", user.id)
    .eq("company_id", company.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!actor?.employee_id) {
    return { ok: false, message: "No active employee account is linked to this login." };
  }

  // Fetch public holidays in the date range
  const { data: holidays } = await supabase
    .from("company_public_holidays")
    .select("holiday_date")
    .eq("company_id", company.id)
    .gte("holiday_date", startDateStr)
    .lte("holiday_date", endDateStr)
    .is("deleted_at", null);

  const holidayDateSet = new Set((holidays ?? []).map((h) => h.holiday_date));

  // Fetch existing time entries for this employee in the date range
  const { data: existingEntries } = await supabase
    .from("time_entries")
    .select("id, work_date, status")
    .eq("company_id", company.id)
    .eq("employee_id", actor.employee_id)
    .gte("work_date", startDateStr)
    .lte("work_date", endDateStr)
    .is("deleted_at", null);

  const existingMap = new Map<string, { id: string; status: string }>();
  (existingEntries ?? []).forEach((e) => {
    existingMap.set(e.work_date, { id: e.id, status: e.status });
  });

  // Calculate day range
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("-").map(Number);
  const startUTC = new Date(Date.UTC(sy, sm - 1, sd));
  const endUTC = new Date(Date.UTC(ey, em - 1, ed));

  const daySpan = Math.round((endUTC.getTime() - startUTC.getTime()) / (1000 * 60 * 60 * 24));
  if (daySpan > 62) {
    return { ok: false, message: "Bulk draft generator cannot exceed 62 days at a time." };
  }

  let createdCount = 0;
  let skippedCount = 0;
  const cursor = new Date(startUTC);

  while (cursor <= endUTC) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    const curDateStr = `${y}-${m}-${d}`;
    const dayOfWeek = cursor.getUTCDay();

    cursor.setUTCDate(cursor.getUTCDate() + 1);

    // Skip weekends if requested
    if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      skippedCount++;
      continue;
    }

    // Skip public holidays
    if (holidayDateSet.has(curDateStr)) {
      skippedCount++;
      continue;
    }

    const existing = existingMap.get(curDateStr);
    if (existing) {
      if (existing.status !== "draft" && existing.status !== "rejected") {
        // Skip submitted or approved records
        skippedCount++;
        continue;
      }

      // If existing is a draft, update it with the schedule template times
      const { error: updErr } = await supabase.rpc("update_own_draft_time_entry", {
        entry_notes: notes,
        proposed_clock_in: clockIn,
        proposed_clock_out: clockOut,
        proposed_lunch_end: lunchEnd,
        proposed_lunch_start: lunchStart,
        target_time_entry_id: existing.id,
      });

      if (!updErr) {
        createdCount++;
      } else {
        skippedCount++;
      }
      continue;
    }

    // Create a new draft entry via RPC
    const { data: newEntry, error: createErr } = await supabase.rpc(
      "create_own_draft_time_entry_for_date",
      { target_work_date: curDateStr },
    );

    if (createErr || !newEntry) {
      skippedCount++;
      continue;
    }

    // Update with schedule template times including mandatory lunch break
    const entryId = (newEntry as { id?: string })?.id;
    if (entryId) {
      const { error: updErr } = await supabase.rpc("update_own_draft_time_entry", {
        entry_notes: notes,
        proposed_clock_in: clockIn,
        proposed_clock_out: clockOut,
        proposed_lunch_end: lunchEnd,
        proposed_lunch_start: lunchStart,
        target_time_entry_id: entryId,
      });

      if (!updErr) {
        createdCount++;
      } else {
        skippedCount++;
      }
    }
  }

  revalidatePath("/dashboard");

  if (createdCount === 0) {
    return {
      ok: false,
      message: `No drafts were created (${skippedCount} days were skipped because of weekends, holidays, or existing timesheets).`,
    };
  }

  return {
    ok: true,
    message: `Successfully loaded ${createdCount} draft timesheet${createdCount === 1 ? "" : "s"} with schedule template (${skippedCount} skipped).`,
  };
}

export async function createManagedDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();

  if (!employeeId || !workDate) {
    return { ok: false, message: "Choose an employee and date." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const scopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (scopeError) {
    return { ok: false, message: scopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_managed_draft_time_entry_for_date", {
    target_employee_id: employeeId,
    target_work_date: workDate,
  });

  if (error) {
    if (isMissingManagerCalendarRpc(error)) {
      return { ok: false, message: managerCalendarMigrationMessage };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/time");
  return { ok: true, message: "Managed draft timesheet added." };
}

export async function loadManagedLeaveRequestsToTimesheets(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const leaveRequestIds = formData
    .getAll("leave_request_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (leaveRequestIds.length === 0) {
    return { ok: false, message: "Choose at least one approved leave request." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const scopeError = await checkLeaveRequestsWorkstationScope(company.id, leaveRequestIds, access);
  if (scopeError) {
    return { ok: false, message: scopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("load_managed_leave_request_time_entries", {
    target_leave_request_ids: leaveRequestIds,
  });

  if (error) {
    if (isMissingManagerCalendarRpc(error)) {
      return { ok: false, message: managerCalendarMigrationMessage };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/time");
  return {
    ok: true,
    message: `${Number(data ?? 0)} leave timesheet row${Number(data ?? 0) === 1 ? "" : "s"} loaded.`,
  };
}

export async function updateManagedDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();

  if (!timeEntryId || !employeeId) {
    return { ok: false, message: "Missing time entry or employee." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const empScopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (empScopeError) {
    return { ok: false, message: empScopeError };
  }
  const entryScopeError = await checkTimeEntriesWorkstationScope(company.id, [timeEntryId], access);
  if (entryScopeError) {
    return { ok: false, message: entryScopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_managed_draft_time_entry", {
    target_time_entry_id: timeEntryId,
    target_employee_id: employeeId,
    proposed_clock_in: optionalTime(formData, "clock_in"),
    proposed_lunch_start: optionalTime(formData, "lunch_start"),
    proposed_lunch_end: optionalTime(formData, "lunch_end"),
    proposed_clock_out: optionalTime(formData, "clock_out"),
    entry_notes: sanitizeMultilineText(formData.get("notes"), 1000) || null,
  });

  if (error) {
    if (isMissingManagerCalendarRpc(error)) {
      return { ok: false, message: managerCalendarMigrationMessage };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard");
  return { ok: true, message: "Timesheet updated." };
}

export async function deleteManagedDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();

  if (!timeEntryId || !employeeId) {
    return { ok: false, message: "Missing time entry or employee." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const empScopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (empScopeError) {
    return { ok: false, message: empScopeError };
  }
  const entryScopeError = await checkTimeEntriesWorkstationScope(company.id, [timeEntryId], access);
  if (entryScopeError) {
    return { ok: false, message: entryScopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_managed_draft_time_entry", {
    target_time_entry_id: timeEntryId,
    target_employee_id: employeeId,
  });

  if (error) {
    if (isMissingManagerCalendarRpc(error)) {
      return { ok: false, message: managerCalendarMigrationMessage };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard");
  return { ok: true, message: "Draft timesheet deleted." };
}

export async function deleteTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();

  if (!timeEntryId || !employeeId) {
    return { ok: false, message: "Missing time entry or employee." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const empScopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (empScopeError) {
    return { ok: false, message: empScopeError };
  }
  const entryScopeError = await checkTimeEntriesWorkstationScope(company.id, [timeEntryId], access);
  if (entryScopeError) {
    return { ok: false, message: entryScopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_time_entry", {
    target_time_entry_id: timeEntryId,
    target_employee_id: employeeId,
  });

  if (error) {
    if (isMissingManagerCalendarRpc(error)) {
      return { ok: false, message: managerCalendarMigrationMessage };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard");
  return { ok: true, message: "Time entry deleted." };
}

export async function adminDeleteCalendarLeave(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const access = await getCurrentUserAccess();
  const canManage = access.isSuperAdmin || access.isOwner || access.isHrAdmin || access.isBranchManager || access.canManageEmployees;
  if (!canManage) {
    return { ok: false, message: "Unauthorized: Admin or manager permission required." };
  }
  const { company } = await getActiveCompany();
  if (!company) {
    return { ok: false, message: "No active company found." };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();

  if (!employeeId || !workDate) {
    return { ok: false, message: "Missing employee or date." };
  }

  const delScopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (delScopeError) {
    return { ok: false, message: delScopeError };
  }

  const supabase = await createSupabaseServerClient();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 1. Soft-delete time entry
  if (timeEntryId && uuidRegex.test(timeEntryId)) {
    await supabase
      .from("time_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", timeEntryId)
      .eq("company_id", company.id);
  } else {
    await supabase
      .from("time_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("work_date", workDate)
      .not("leave_type_id", "is", null);
  }

  // 2. Adjust or delete matching leave_requests covering this date
  const { data: matchingRequests } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, total_hours")
    .eq("company_id", company.id)
    .eq("employee_id", employeeId)
    .lte("start_date", workDate)
    .gte("end_date", workDate)
    .is("deleted_at", null);

  for (const req of matchingRequests ?? []) {
    if (req.start_date === req.end_date) {
      await supabase
        .from("leave_requests")
        .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
        .eq("id", req.id);
    } else if (req.start_date === workDate) {
      const nextDate = new Date(workDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().slice(0, 10);
      await supabase
        .from("leave_requests")
        .update({
          start_date: nextDateStr,
          total_hours: Math.max(0, Number(req.total_hours) - 8),
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.id);
    } else if (req.end_date === workDate) {
      const prevDate = new Date(workDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().slice(0, 10);
      await supabase
        .from("leave_requests")
        .update({
          end_date: prevDateStr,
          total_hours: Math.max(0, Number(req.total_hours) - 8),
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.id);
    } else {
      await supabase
        .from("leave_requests")
        .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
        .eq("id", req.id);
    }
  }

  // 3. Sync employee accruals and balances
  try {
    await syncEmployeeAccruals(employeeId, company.id);
  } catch (err) {
    console.error("Error syncing accruals after leave delete:", err);
  }

  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard");
  return { ok: true, message: "Leave record deleted successfully." };
}

export async function adminUpdateCalendarLeave(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const access = await getCurrentUserAccess();
  const canManage = access.isSuperAdmin || access.isOwner || access.isHrAdmin || access.isBranchManager || access.canManageEmployees;
  if (!canManage) {
    return { ok: false, message: "Unauthorized: Admin or manager permission required." };
  }
  const { company } = await getActiveCompany();
  if (!company) {
    return { ok: false, message: "No active company found." };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();
  const hours = Math.max(0.5, Math.min(24, Number(formData.get("hours") ?? 8)));
  const notes = sanitizeMultilineText(formData.get("notes"), 1000) || "";

  if (!employeeId || !workDate || !leaveTypeId) {
    return { ok: false, message: "Please select a leave type." };
  }

  const updScopeError = await checkEmployeeWorkstationScope(company.id, employeeId, access);
  if (updScopeError) {
    return { ok: false, message: updScopeError };
  }

  const supabase = await createSupabaseServerClient();

  const { data: lt } = await supabase
    .from("leave_types")
    .select("id, name")
    .eq("id", leaveTypeId)
    .single();

  const leaveName = lt?.name ?? "Leave";
  const entryNotes = notes ? `Approved leave: ${leaveName} - ${notes}` : `Approved leave: ${leaveName}`;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let updatedEntry = false;
  if (timeEntryId && uuidRegex.test(timeEntryId)) {
    const { error: updErr } = await supabase
      .from("time_entries")
      .update({
        leave_type_id: leaveTypeId,
        normal_hours: hours,
        paid_hours: hours,
        clock_in: null,
        clock_out: null,
        notes: entryNotes,
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", timeEntryId)
      .eq("company_id", company.id);
    if (!updErr) updatedEntry = true;
  }

  if (!updatedEntry) {
    const { data: existing } = await supabase
      .from("time_entries")
      .select("id")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("work_date", workDate)
      .is("deleted_at", null)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("time_entries")
        .update({
          leave_type_id: leaveTypeId,
          normal_hours: hours,
          paid_hours: hours,
          clock_in: null,
          clock_out: null,
          notes: entryNotes,
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);
    } else {
      const { data: ts } = await supabase
        .from("timesheets")
        .select("id")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .lte("period_start", workDate)
        .gte("period_end", workDate)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      await supabase
        .from("time_entries")
        .insert({
          company_id: company.id,
          employee_id: employeeId,
          work_date: workDate,
          leave_type_id: leaveTypeId,
          normal_hours: hours,
          paid_hours: hours,
          clock_in: null,
          clock_out: null,
          notes: entryNotes,
          status: "approved",
          timesheet_id: ts?.id ?? null,
        });
    }
  }

  // Update matching leave requests if any exist
  const { data: matchingRequests } = await supabase
    .from("leave_requests")
    .select("id")
    .eq("company_id", company.id)
    .eq("employee_id", employeeId)
    .lte("start_date", workDate)
    .gte("end_date", workDate)
    .is("deleted_at", null);

  for (const req of matchingRequests ?? []) {
    await supabase
      .from("leave_requests")
      .update({
        leave_type_id: leaveTypeId,
        total_hours: hours,
        reason: notes || `Admin updated on calendar`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.id);
  }

  try {
    await syncEmployeeAccruals(employeeId, company.id);
  } catch (err) {
    console.error("Error syncing accruals after leave update:", err);
  }

  revalidatePath("/dashboard/time");
  revalidatePath("/dashboard");
  return { ok: true, message: `Leave updated to ${leaveName} (${hours}h).` };
}

export async function deleteDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();

  if (!timeEntryId) {
    return { ok: false, message: "Choose a draft timesheet to delete." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_own_draft_time_entry", {
    target_time_entry_id: timeEntryId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Draft timesheet deleted." };
}

export async function submitSelectedTimesheets(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryIds = formData
    .getAll("time_entry_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const acknowledgedIds = formData
    .getAll("acknowledged_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet to submit." };
  }

  const supabase = await createSupabaseServerClient();

  // If inline notes are submitted for any entries, persist them first
  for (const id of timeEntryIds) {
    const inlineNote = sanitizeMultilineText(formData.get(`note_${id}`), 1000);
    if (inlineNote) {
      await supabase
        .from("time_entries")
        .update({ notes: inlineNote })
        .eq("id", id)
        .in("status", ["draft", "rejected"]);
    }
  }

  const { data, error } = await supabase.rpc("submit_own_timesheets", {
    target_time_entry_ids: timeEntryIds,
    acknowledged_ids: acknowledgedIds,
  });

  if (error) {
    if (error.message?.includes("refresh_time_entry") || error.message?.includes("does not exist")) {
      return { ok: false, message: "Timesheet calculations were updated. Please click submit again." };
    }
    return { ok: false, message: error.message };
  }

  try {
    await syncEmployeeAccruals();
  } catch {
    // Non-blocking background sync
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${Number(data ?? 0)} timesheet${Number(data ?? 0) === 1 ? "" : "s"} submitted.`,
  };
}

export async function approveSubmittedTimesheets(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryIds = formData
    .getAll("time_entry_ids")
    .map((value) => sanitizeString(value, 64))
    .filter(Boolean);
  const notes = sanitizeMultilineText(formData.get("approval_notes"), 1000);

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet to approve." };
  }

  const [access, { company }] = await Promise.all([getCurrentUserAccess(), getActiveCompany()]);
  const scopeError = await checkTimeEntriesWorkstationScope(company.id, timeEntryIds, access);
  if (scopeError) {
    return { ok: false, message: scopeError };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_managed_timesheets", {
    approval_notes: notes || null,
    target_time_entry_ids: timeEntryIds,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  try {
    await syncEmployeeAccruals();
  } catch {
    // Non-blocking background sync
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${Number(data ?? 0)} timesheet${Number(data ?? 0) === 1 ? "" : "s"} approved.`,
  };
}

export async function reviewSubmittedTimesheets(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryIds = formData
    .getAll("time_entry_ids")
    .map((value) => sanitizeString(value, 64))
    .filter(Boolean);
  const decision = sanitizeString(formData.get("decision"), 20);
  const notes = sanitizeMultilineText(formData.get("approval_notes"), 1000);

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose approve or reject." };
  }

  const access = await getCurrentUserAccess();
  const isManager =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.isBranchManager ||
    access.canReviewBranchTime ||
    access.canManageDirectReports;

  if (!isManager) {
    return { ok: false, message: "You do not have permission to review timesheets." };
  }

  if (access.isScopedBranchManager) {
    const { company } = await getActiveCompany();
    const scopeError = await checkTimeEntriesWorkstationScope(company.id, timeEntryIds, access);
    if (scopeError) {
      return { ok: false, message: scopeError };
    }
  }

  const supabase = await createSupabaseServerClient();
  const rpcName =
    decision === "approve" ? "approve_managed_timesheets" : "reject_managed_timesheets";
  let { data, error } = await supabase.rpc(rpcName, {
    [decision === "approve" ? "approval_notes" : "rejection_notes"]:
      notes || null,
    target_time_entry_ids: timeEntryIds,
  });

  if (error && isManager) {
    const adminClient = createSupabaseAdminClient();
    const adminRes = await adminClient.rpc(rpcName, {
      [decision === "approve" ? "approval_notes" : "rejection_notes"]:
        notes || null,
      target_time_entry_ids: timeEntryIds,
    });
    if (!adminRes.error) {
      data = adminRes.data;
      error = null;
    }
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  if (decision === "approve") {
    try {
      await syncEmployeeAccruals();
    } catch {
      // Non-blocking background sync
    }
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${Number(data ?? 0)} timesheet${Number(data ?? 0) === 1 ? "" : "s"} ${
      decision === "approve" ? "approved" : "rejected"
    }.`,
  };
}

export async function recordLiveLocationBreadcrumb(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const accuracy = formData.get("accuracy") ? Number(formData.get("accuracy")) : null;
  const capturedAt = String(formData.get("captured_at") ?? new Date().toISOString()).trim();

  if (!timeEntryId || isNaN(latitude) || isNaN(longitude)) {
    return { ok: false, message: "Invalid location breadcrumb data." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: "Authentication required." };
  }

  try {
    const { error } = await supabase.rpc("record_employee_interaction_location", {
      target_time_entry_id: timeEntryId,
      current_latitude: latitude,
      current_longitude: longitude,
      accuracy_meters: accuracy,
      captured_at: capturedAt,
    });

    if (error) {
      console.warn("record_employee_interaction_location RPC error:", error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  } catch (e) {
    console.warn("Breadcrumb insert caught:", e);
    return { ok: false, message: "Failed to record location." };
  }
}
