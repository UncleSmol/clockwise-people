"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClockEventType, TimeEntryRecord } from "./schema";

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

export async function recordClockEvent(
  eventType: ClockEventType,
  formData?: FormData,
): Promise<ClockActionState> {
  const supabase = await createSupabaseServerClient();
  const latitude = String(formData?.get("latitude") ?? "").trim();
  const longitude = String(formData?.get("longitude") ?? "").trim();
  const accuracy = String(formData?.get("accuracy") ?? "").trim();
  const capturedAt = String(formData?.get("captured_at") ?? "").trim();

  if (!latitude || !longitude) {
    return {
      ok: false,
      message: "Location is required for clocking. Enable location permission and try again.",
    };
  }

  const { data, error } = await supabase.rpc("record_employee_time_event", {
    requested_event: eventType,
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

  revalidatePath("/dashboard");
  return {
    entry: data as TimeEntryRecord,
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

function optionalTime(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function submitTimesheetCorrection(
  _previousState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!timeEntryId) {
    return { ok: false, message: "Choose a time entry to correct." };
  }

  if (!reason) {
    return { ok: false, message: "Add a reason for the correction." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_timesheet_correction_request", {
    correction_reason: reason,
    proposed_clock_in: optionalTime(formData, "proposed_clock_in"),
    proposed_clock_out: optionalTime(formData, "proposed_clock_out"),
    proposed_lunch_end: optionalTime(formData, "proposed_lunch_end"),
    proposed_lunch_start: optionalTime(formData, "proposed_lunch_start"),
    target_time_entry_id: timeEntryId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: "Correction request submitted. It is locked until a manager reviews it.",
  };
}

export async function reviewTimesheetCorrection(
  _previousState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const correctionId = String(formData.get("correction_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim();

  if (!correctionId) {
    return { ok: false, message: "Choose a correction request to review." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: "Choose whether to approve or reject the request." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_timesheet_correction_request", {
    approve_request: decision === "approve",
    manager_notes: notes || null,
    target_correction_id: correctionId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Correction request ${decision === "approve" ? "approved" : "rejected"}.`,
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

  if (timeEntryIds.length === 0) {
    return { ok: false, message: "Pick at least one timesheet to submit." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_own_timesheets", {
    target_time_entry_ids: timeEntryIds,
  });

  if (error) {
    return { ok: false, message: error.message };
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

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${Number(data ?? 0)} timesheet${Number(data ?? 0) === 1 ? "" : "s"} ${
      decision === "approve" ? "approved" : "rejected"
    }.`,
  };
}
