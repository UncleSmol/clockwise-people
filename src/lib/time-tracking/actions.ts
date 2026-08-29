"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncEmployeeAccruals } from "@/lib/work-rules/actions";
import type { ClockEventType, TimeClockLocationEvent, TimeEntryRecord } from "./schema";

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

export async function recordClockEvent(
  eventType: ClockEventType,
  formData?: FormData,
): Promise<ClockActionState> {
  const supabase = await createSupabaseServerClient();
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

  const { data, error } = await supabase.rpc("record_employee_time_event", {
    requested_event: eventType,
    workstation_id: workstationId || null,
    requested_at: requestedAt,
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
      latitude: metadataLocation.latitude != null ? Number(metadataLocation.latitude) : null,
      longitude: metadataLocation.longitude != null ? Number(metadataLocation.longitude) : null,
      accuracy_meters:
        metadataLocation.accuracy != null ? Number(metadataLocation.accuracy) : null,
      workstationName: metadataGeofence.workstation_name ?? null,
      distance_meters:
        metadataGeofence.distance_meters != null ? Number(metadataGeofence.distance_meters) : null,
      geofence_status: metadataGeofence.status ?? null,
    },
  ];

  revalidatePath("/dashboard");
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
    .map((v) => String(v).trim())
    .filter(Boolean);
  const reason = String(formData.get("reason") ?? "").trim();

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
    .map((v) => String(v).trim())
    .filter(Boolean);

  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim();

  if (correctionIds.length === 0) {
    return { ok: false, message: "Pick at least one correction request to review." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose whether to approve or reject the request." };
  }

  const supabase = await createSupabaseServerClient();
  const approve = decision === "approve";

  // Try bulk RPC first
  const { data, error } = await supabase.rpc("review_timesheet_correction_requests", {
    approve_request: approve,
    manager_notes: notes || null,
    target_correction_ids: correctionIds,
  });

  if (error) {
    // Fallback to sequential single RPC in case bulk RPC is unavailable
    let successCount = 0;
    for (const cid of correctionIds) {
      const { error: singleError } = await supabase.rpc("review_timesheet_correction_request", {
        approve_request: approve,
        manager_notes: notes || null,
        target_correction_id: cid,
      });
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

export async function saveDraftTimeEntry(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();

  if (!timeEntryId) {
    return { ok: false, message: "Choose a timesheet to save." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_own_draft_time_entry", {
    entry_notes: String(formData.get("notes") ?? "").trim() || null,
    proposed_clock_in: optionalTime(formData, "clock_in"),
    proposed_clock_out: optionalTime(formData, "clock_out"),
    proposed_lunch_end: optionalTime(formData, "lunch_end"),
    proposed_lunch_start: optionalTime(formData, "lunch_start"),
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_own_draft_time_entry_for_date", {
    target_work_date: workDate,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Draft timesheet added." };
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_managed_draft_time_entry", {
    target_time_entry_id: timeEntryId,
    target_employee_id: employeeId,
    proposed_clock_in: optionalTime(formData, "clock_in"),
    proposed_lunch_start: optionalTime(formData, "lunch_start"),
    proposed_lunch_end: optionalTime(formData, "lunch_end"),
    proposed_clock_out: optionalTime(formData, "clock_out"),
    entry_notes: String(formData.get("notes") ?? "").trim() || null,
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
  const { data, error } = await supabase.rpc("submit_own_timesheets", {
    target_time_entry_ids: timeEntryIds,
    acknowledged_ids: acknowledgedIds,
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
    message: `${Number(data ?? 0)} timesheet${Number(data ?? 0) === 1 ? "" : "s"} submitted.`,
  };
}

export async function approveSubmittedTimesheets(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const timeEntryIds = formData
    .getAll("time_entry_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const notes = String(formData.get("approval_notes") ?? "").trim();

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet to approve." };
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
    .map((value) => String(value).trim())
    .filter(Boolean);
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("approval_notes") ?? "").trim();

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose approve or reject." };
  }

  const supabase = await createSupabaseServerClient();
  const rpcName =
    decision === "approve" ? "approve_managed_timesheets" : "reject_managed_timesheets";
  const { data, error } = await supabase.rpc(rpcName, {
    [decision === "approve" ? "approval_notes" : "rejection_notes"]:
      notes || null,
    target_time_entry_ids: timeEntryIds,
  });

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
  const speed = formData.get("speed") ? Number(formData.get("speed")) : null;
  const heading = formData.get("heading") ? Number(formData.get("heading")) : null;
  const capturedAt = String(formData.get("captured_at") ?? new Date().toISOString()).trim();
  const distanceMoved = Number(formData.get("distance_moved") ?? 0);

  if (!timeEntryId || isNaN(latitude) || isNaN(longitude)) {
    return { ok: false, message: "Invalid location breadcrumb data." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: "Authentication required." };
  }

  try {
    await supabase.from("clock_events").insert({
      time_entry_id: timeEntryId,
      event_type: "movement_breadcrumb",
      event_at: capturedAt,
      local_work_date: capturedAt.slice(0, 10),
      local_event_time: capturedAt.slice(11, 19),
      latitude,
      longitude,
      accuracy_meters: accuracy,
      distance_meters: distanceMoved,
      device_metadata: {
        source: "capacitor_live_tracker",
        distance_moved: distanceMoved,
        speed,
        heading,
      },
    });
  } catch (e) {
    console.warn("Breadcrumb insert caught:", e);
  }

  return { ok: true };
}
