import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import type {
  ClockEventRecord,
  ClockEventType,
  CompanyCalendarEmployeeOption,
  CompanyCalendarLeaveRequest,
  CompanyPublicHoliday,
  CompanyLiveTimeEntry,
  CompanyLiveTimeOverview,
  CompanySubmittedTimesheet,
  CompanyTimesheetCalendarEntry,
  CompanyTimesheetCorrectionRequest,
  EmployeeTimeState,
  TimeClockLocationEvent,
  TimeEntryRecord,
  TimesheetCorrectionRequest,
} from "./schema";

type WorkScheduleDay = {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  lunch_minutes: number;
  paid_hours: number;
  is_working_day: boolean;
};

type EmployeeRow = {
  id: string;
  employee_number?: string;
  full_name: string;
  known_as: string | null;
  avatar_url: string | null;
  workstation_id: string;
  work_schedule_id: string | null;
  department_id?: string | null;
  job_title: string | null;
  company_workstations?: { name: string }[] | { name: string } | null;
  departments?: { name: string }[] | { name: string } | null;
};

type CorrectionRequestRow = TimesheetCorrectionRequest & {
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    company_workstations?: { name: string }[] | { name: string } | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    company_workstations?: { name: string }[] | { name: string } | null;
  } | null;
};

type SubmittedTimesheetRow = TimeEntryRecord & {
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    company_workstations?: { name: string }[] | { name: string } | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    company_workstations?: { name: string }[] | { name: string } | null;
  } | null;
};

type CalendarLeaveRequestRow = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  total_hours: number | string;
  status: CompanyCalendarLeaveRequest["status"];
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
  } | null;
  leave_types?: { name: string }[] | { name: string } | null;
};

type TimeClockGeofenceRow = {
  employee_id: string;
  event_type: ClockEventType;
  geofence_status: string | null;
  distance_meters: number | null;
  company_workstations?: { name: string }[] | { name: string } | null;
};

type TimeClockLocationEventRow = {
  id: string;
  time_entry_id: string;
  event_type: ClockEventType;
  event_at: string;
  local_work_date: string;
  local_event_time: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  distance_meters: number | null;
  geofence_status: string | null;
  company_workstations?: { name: string }[] | { name: string } | null;
};

function relationName(
  relation?: { name: string }[] | { name: string } | null,
) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? null;
  }

  return relation?.name ?? null;
}

function hasLunchDurationLapsed(
  lunchStart: string | null | undefined,
  lunchMinutes: number,
  timezone: string = "Africa/Johannesburg",
): boolean {
  if (!lunchStart) return false;
  const [h = "0", m = "0", s = "0"] = lunchStart.split(":");
  const now = new Date();
  const localTimeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const [currH = "0", currM = "0", currS = "0"] = localTimeStr.split(":");

  const startSec = Number(h) * 3600 + Number(m) * 60 + Number(s);
  const currSec = Number(currH) * 3600 + Number(currM) * 60 + Number(currS);
  const durationSec = (lunchMinutes > 0 ? lunchMinutes : 60) * 60;

  return currSec >= startSec + durationSec;
}

function calculateLapsedLunchEndTime(lunchStart: string, lunchMinutes: number): string {
  const [h = "0", m = "0", s = "0"] = lunchStart.split(":");
  const duration = lunchMinutes > 0 ? lunchMinutes : 60;
  const totalMinutes = Number(h) * 60 + Number(m) + duration;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hasShiftEnded(
  shiftEndTime: string | null | undefined,
  graceMinutes: number = 0,
  timezone: string = "Africa/Johannesburg",
  workDate?: string | null,
  currentDate?: string | null,
): boolean {
  if (!shiftEndTime) return false;
  if (workDate && currentDate && workDate < currentDate) {
    return true;
  }

  const [h = "0", m = "0", s = "0"] = shiftEndTime.split(":");
  const now = new Date();
  const localTimeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const [currH = "0", currM = "0", currS = "0"] = localTimeStr.split(":");

  const endSec = Number(h) * 3600 + Number(m) * 60 + Number(s);
  const currSec = Number(currH) * 3600 + Number(currM) * 60 + Number(currS);
  const graceSec = Math.max(0, graceMinutes) * 60;

  return currSec >= endSec + graceSec;
}

function calculateShiftHours(
  clockIn: string,
  clockOut: string,
  lunchHours: number = 0,
): { grossHours: number; paidHours: number; normalHours: number } {
  const [inH = 0, inM = 0] = clockIn.split(":").map(Number);
  const [outH = 0, outM = 0] = clockOut.split(":").map(Number);
  const totalInMin = inH * 60 + inM;
  const totalOutMin = outH * 60 + outM;
  const grossMinutes = Math.max(0, totalOutMin - totalInMin);
  const grossHours = Number((grossMinutes / 60).toFixed(2));
  const paidHours = Number(Math.max(0, grossHours - lunchHours).toFixed(2));
  const normalHours = Number(Math.min(paidHours, 8).toFixed(2));
  return { grossHours, paidHours, normalHours };
}

async function getEmployeeSchedules(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  companyId: string,
  employeeIds: string[],
): Promise<Map<string, WorkScheduleDay[]>> {
  if (employeeIds.length === 0) return new Map();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, work_schedule_id")
    .eq("company_id", companyId)
    .in("id", employeeIds)
    .is("deleted_at", null);

  if (!employees || employees.length === 0) return new Map();

  const scheduleIds = [...new Set(employees.map((e) => e.work_schedule_id).filter(Boolean))] as string[];
  if (scheduleIds.length === 0) return new Map();

  const { data: scheduleDays } = await supabase
    .from("schedule_days")
    .select("work_schedule_id, day_of_week, start_time, end_time, lunch_minutes, paid_hours, is_working_day")
    .in("work_schedule_id", scheduleIds);

  const scheduleByEmployee = new Map<string, WorkScheduleDay[]>();
  const scheduleMap = new Map<string, WorkScheduleDay[]>();
  
  (scheduleDays ?? []).forEach((day) => {
    const existing = scheduleMap.get(day.work_schedule_id) ?? [];
    existing.push({
      day_of_week: day.day_of_week,
      start_time: day.start_time,
      end_time: day.end_time,
      lunch_minutes: Number(day.lunch_minutes ?? 0),
      paid_hours: Number(day.paid_hours ?? 0),
      is_working_day: day.is_working_day,
    });
    scheduleMap.set(day.work_schedule_id, existing);
  });

  employees.forEach((emp) => {
    if (emp.work_schedule_id && scheduleMap.has(emp.work_schedule_id)) {
      scheduleByEmployee.set(emp.id, scheduleMap.get(emp.work_schedule_id)!);
    }
  });

  return scheduleByEmployee;
}

function validateTimesAgainstSchedule(
  entry: TimeEntryRecord,
  scheduleDays: WorkScheduleDay[] | undefined,
): { isCompliant: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!scheduleDays || scheduleDays.length === 0) {
    return { isCompliant: true, issues: [] };
  }

  const workDate = new Date(entry.work_date);
  const dayOfWeek = workDate.getDay();
  const scheduleDay = scheduleDays.find((d) => d.day_of_week === dayOfWeek);

  if (!scheduleDay) {
    return { isCompliant: true, issues: [] };
  }

  if (!scheduleDay.is_working_day) {
    if (entry.clock_in || entry.clock_out) {
      issues.push("Work recorded on non-working day");
    }
    return { isCompliant: issues.length === 0, issues };
  }

  if (entry.missing_clocking) {
    issues.push("Missing clock in/out");
  }

  if (entry.late_arrival && scheduleDay.start_time) {
    issues.push(`Late arrival (after ${scheduleDay.start_time})`);
  }

  if (entry.early_departure && scheduleDay.end_time) {
    issues.push(`Early departure (before ${scheduleDay.end_time})`);
  }

  if (entry.paid_hours > 0 && scheduleDay.paid_hours > 0) {
    const tolerance = 0.25;
    if (Math.abs(entry.paid_hours - scheduleDay.paid_hours) > tolerance) {
      issues.push(`Hours mismatch: worked ${entry.paid_hours.toFixed(2)}h, expected ${scheduleDay.paid_hours.toFixed(2)}h`);
    }
  }

  if (!entry.clock_in && !entry.clock_out && entry.gross_hours > 0) {
    issues.push("Has hours but no clock times recorded");
  }

  return { isCompliant: issues.length === 0, issues };
}

function isMissingGeofenceSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  return (
    error.code === "PGRST200" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    error.message?.includes("company_workstations") ||
    error.message?.includes("geofence_status") ||
    error.message?.includes("schema cache")
  );
}

function paidTimeOffHours(entry: TimeEntryRecord) {
  const isPublicHoliday = entry.notes?.startsWith("Public holiday:") ?? false;
  const isLeave = (entry.leave_type_id != null) || (entry.notes?.startsWith("Leave:") ?? false);
  return (isPublicHoliday || isLeave) ? Number(entry.paid_hours ?? 0) : 0;
}

async function getLocationEventsByTimeEntry(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  companyId: string,
  timeEntryIds: string[],
) {
  if (timeEntryIds.length === 0) {
    return new Map<string, TimeClockLocationEvent[]>();
  }

  const results: TimeClockLocationEventRow[] = [];
  const batchSize = 100;
  for (let i = 0; i < timeEntryIds.length; i += batchSize) {
    const batch = timeEntryIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("time_clock_events")
      .select(
        "id, time_entry_id, event_type, event_at, local_work_date, local_event_time, latitude, longitude, accuracy_meters, distance_meters, geofence_status, company_workstations(name)",
      )
      .eq("company_id", companyId)
      .in("time_entry_id", batch)
      .order("event_at", { ascending: true });

    if (error) {
      if (isMissingGeofenceSchema(error)) {
        return new Map<string, TimeClockLocationEvent[]>();
      }
      throw new Error(error.message);
    }

    results.push(...(data ?? []));
  }

  const eventsByEntry = new Map<string, TimeClockLocationEvent[]>();
  results.forEach((event) => {
    const current = eventsByEntry.get(event.time_entry_id) ?? [];
    current.push({
      accuracy_meters: event.accuracy_meters === null ? null : Number(event.accuracy_meters),
      distance_meters: event.distance_meters === null ? null : Number(event.distance_meters),
      event_at: event.event_at,
      event_type: event.event_type,
      geofence_status: event.geofence_status,
      id: event.id,
      latitude: event.latitude === null ? null : Number(event.latitude),
      local_event_time: event.local_event_time,
      local_work_date: event.local_work_date,
      longitude: event.longitude === null ? null : Number(event.longitude),
      workstationName: relationName(event.company_workstations),
    });
    eventsByEntry.set(event.time_entry_id, current);
  });

  return eventsByEntry;
}

function currentDateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export const getEmployeeTimeState = cache(async function getEmployeeTimeState(): Promise<EmployeeTimeState> {
  const [access, { company }] = await Promise.all([
    getCurrentUserAccess(),
    getActiveCompany(),
  ]);

  const effectiveTimezone = company.timezone || "Africa/Johannesburg";

  if (!access.employeeId) {
    return {
      currentWorkDate: currentDateInTimezone(effectiveTimezone),
      employee: null,
      todayEntry: null,
      recentEntries: [],
      recentEvents: [],
      correctionRequests: [],
      publicHolidays: [],
      workstations: [],
      assignedWorkstationId: null,
      todaySchedule: null,
    };
  }

  const { supabase } = await requireUser();
  const today = currentDateInTimezone(effectiveTimezone);
  const currentYear = Number(today.slice(0, 4));

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: currentYear,
  });

  const [
    employeeResult,
    todayEntryResult,
    entriesResult,
    eventsResult,
    correctionRequestsResult,
    holidaysResult,
    workstationsResult,
    assignmentsResult,
    settingsResult,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, known_as, avatar_url, job_title, work_schedule_id")
      .eq("id", access.employeeId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, workstation_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
      )
      .eq("employee_id", access.employeeId)
      .eq("work_date", today)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, workstation_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
      )
      .eq("employee_id", access.employeeId)
      .is("deleted_at", null)
      .gte("work_date", `${currentYear}-01-01`)
      .lte("work_date", `${currentYear}-12-31`)
      .order("work_date", { ascending: false })
      .limit(400),
    supabase
      .from("time_clock_events")
      .select("id, event_type, event_at, local_work_date, local_event_time")
      .eq("employee_id", access.employeeId)
      .order("event_at", { ascending: false })
      .limit(8),
    supabase
      .from("timesheet_correction_requests")
      .select(
        "id, company_id, employee_id, time_entry_id, payroll_period_id, work_date, original_clock_in, original_lunch_start, original_lunch_end, original_clock_out, proposed_clock_in, proposed_lunch_start, proposed_lunch_end, proposed_clock_out, reason, status, submitted_at, reviewed_at, review_notes",
      )
      .eq("employee_id", access.employeeId)
      .is("deleted_at", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
    supabase
      .from("company_public_holidays")
      .select("id, holiday_date, name, is_paid")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .gte("holiday_date", `${currentYear}-01-01`)
      .lte("holiday_date", `${currentYear}-12-31`)
      .order("holiday_date", { ascending: true }),
    supabase
      .from("company_workstations")
      .select("id, name")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("employee_workstation_assignments")
      .select("workstation_id")
      .eq("company_id", company.id)
      .eq("employee_id", access.employeeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("company_settings")
      .select("approval_rules, default_lunch_minutes")
      .eq("company_id", company.id)
      .maybeSingle(),
  ]);

  if (employeeResult.error) {
    throw new Error(employeeResult.error.message);
  }

  if (todayEntryResult.error) {
    throw new Error(todayEntryResult.error.message);
  }

  if (entriesResult.error) {
    throw new Error(entriesResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  if (correctionRequestsResult.error) {
    throw new Error(correctionRequestsResult.error.message);
  }

  if (holidaysResult.error) {
    throw new Error(holidaysResult.error.message);
  }

  if (workstationsResult.error && !workstationsResult.error.message.includes("schema cache")) {
    throw new Error(workstationsResult.error.message);
  }

  if (assignmentsResult.error && !assignmentsResult.error.message.includes("schema cache")) {
    throw new Error(assignmentsResult.error.message);
  }

  const employeeRow = employeeResult.data as unknown as EmployeeRow;
  const holidays = (holidaysResult.data ?? []) as CompanyPublicHoliday[];
  const holidayDateSet = new Set(holidays.map((h) => h.holiday_date));

  const todayEntryRow = (todayEntryResult.data as TimeEntryRecord | null) ?? null;
  const isTodayHoliday = todayEntryRow
    ? (todayEntryRow.notes?.startsWith("Public holiday:") || (holidayDateSet.has(today) && !todayEntryRow.clock_in && !todayEntryRow.clock_out))
    : false;
  const effectiveTodayEntryRow = isTodayHoliday ? null : todayEntryRow;

  const rawRecentEntries = ((entriesResult.data ?? []) as TimeEntryRecord[]).filter(
    (entry) => !entry.notes?.startsWith("Public holiday:") && !holidayDateSet.has(entry.work_date),
  );
  const locationEventsByEntry = await getLocationEventsByTimeEntry(
    supabase,
    company.id,
    [
      ...(effectiveTodayEntryRow ? [effectiveTodayEntryRow.id] : []),
      ...rawRecentEntries.map((entry) => entry.id),
    ],
  );
  const todayEntry = effectiveTodayEntryRow
    ? {
        ...effectiveTodayEntryRow,
        locationEvents: locationEventsByEntry.get(effectiveTodayEntryRow.id) ?? [],
      }
    : null;
  const scheduleByEmployee = await getEmployeeSchedules(supabase, company.id, [access.employeeId]);
  const employeeScheduleDays = scheduleByEmployee.get(access.employeeId);

  const recentEntries = rawRecentEntries.map((entry) => ({
    ...entry,
    locationEvents: locationEventsByEntry.get(entry.id) ?? [],
    scheduleValidation: validateTimesAgainstSchedule(entry, employeeScheduleDays),
  }));

  const workstations = ((workstationsResult.data ?? []) as { id: string; name: string }[]).map(
    (workstation) => ({ id: workstation.id, name: workstation.name }),
  );
  const assignedWorkstationId = (assignmentsResult.data?.[0]?.workstation_id as string) ?? null;
  const settingsApprovalRules = (settingsResult?.data?.approval_rules ?? {}) as Record<string, unknown>;
  const autoEndLunchOnLapse = Boolean(
    settingsApprovalRules.auto_end_lunch_on_lapse ?? settingsApprovalRules.auto_clockout_after_lunch,
  );
  const defaultLunchMinutes = Number(settingsResult?.data?.default_lunch_minutes ?? settingsApprovalRules.default_lunch_minutes ?? 60);
  const autoClockoutBasedOnSchedule = Boolean(
    settingsApprovalRules.auto_clockout_based_on_schedule ?? settingsApprovalRules.auto_clockout_after_shift_end,
  );
  const autoClockoutGraceMinutes = Number(
    settingsApprovalRules.auto_clockout_grace_minutes ?? 0,
  );

  let todaySchedule: EmployeeTimeState["todaySchedule"] = null;
  let scheduleId = employeeRow.work_schedule_id;

  // Fallback to active company schedule if employee doesn't have an explicit schedule assignment
  if (!scheduleId) {
    const { data: defaultSchedule } = await supabase
      .from("work_schedules")
      .select("id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultSchedule) {
      scheduleId = defaultSchedule.id;
    }
  }

  if (scheduleId) {
    const dayOfWeek = new Date(`${today}T00:00:00`).getDay();
    const { data: scheduleDay } = await supabase
      .from("schedule_days")
      .select("start_time, end_time, lunch_minutes, is_working_day")
      .eq("work_schedule_id", scheduleId)
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    if (scheduleDay && scheduleDay.start_time && scheduleDay.end_time) {
      todaySchedule = {
        start_time: scheduleDay.start_time,
        end_time: scheduleDay.end_time,
        lunch_minutes: Number(scheduleDay.lunch_minutes ?? 0),
        is_working_day: Boolean(scheduleDay.is_working_day),
      };
    } else {
      // Fallback: look for any schedule day with valid start/end times in this schedule
      const { data: anyDay } = await supabase
        .from("schedule_days")
        .select("start_time, end_time, lunch_minutes, is_working_day")
        .eq("work_schedule_id", scheduleId)
        .not("start_time", "is", null)
        .not("end_time", "is", null)
        .limit(1)
        .maybeSingle();

      if (anyDay && anyDay.start_time && anyDay.end_time) {
        todaySchedule = {
          start_time: anyDay.start_time,
          end_time: anyDay.end_time,
          lunch_minutes: Number(anyDay.lunch_minutes ?? defaultLunchMinutes ?? 60),
          is_working_day: true,
        };
      }
    }
  }

  // If still no schedule found, default standard 08:00 - 17:00 work day
  if (!todaySchedule) {
    todaySchedule = {
      start_time: "08:00:00",
      end_time: "17:00:00",
      lunch_minutes: defaultLunchMinutes > 0 ? defaultLunchMinutes : 60,
      is_working_day: true,
    };
  }

  const allottedLunchMinutes = todaySchedule?.lunch_minutes && todaySchedule.lunch_minutes > 0
    ? todaySchedule.lunch_minutes
    : defaultLunchMinutes > 0
      ? defaultLunchMinutes
      : 60;

  // Auto-end lunch if employee is on lunch and duration has lapsed (returns to clocked-in working status)
  if (
    autoEndLunchOnLapse &&
    effectiveTodayEntryRow?.lunch_start &&
    !effectiveTodayEntryRow.lunch_end &&
    !effectiveTodayEntryRow.clock_out &&
    hasLunchDurationLapsed(effectiveTodayEntryRow.lunch_start, allottedLunchMinutes, effectiveTimezone)
  ) {
    const lapsedTime = calculateLapsedLunchEndTime(effectiveTodayEntryRow.lunch_start, allottedLunchMinutes);
    const recordedLunchHours = Number((allottedLunchMinutes / 60).toFixed(2));
    effectiveTodayEntryRow.lunch_end = lapsedTime;
    effectiveTodayEntryRow.lunch_hours = recordedLunchHours;
    effectiveTodayEntryRow.warning_notes = effectiveTodayEntryRow.warning_notes
      ? `${effectiveTodayEntryRow.warning_notes}; Auto lunch break ended upon lapse`
      : "Auto lunch break ended upon lapse";

    // Update database and timesheet record
    void supabase
      .from("time_entries")
      .update({
        lunch_end: lapsedTime,
        lunch_hours: recordedLunchHours,
        warning_notes: effectiveTodayEntryRow.warning_notes,
      })
      .eq("id", effectiveTodayEntryRow.id);
  }

  // Auto-clockout shift if employee is still clocked in and work rule scheduled end time has passed
  if (
    autoClockoutBasedOnSchedule &&
    todaySchedule?.end_time &&
    effectiveTodayEntryRow?.clock_in &&
    !effectiveTodayEntryRow.clock_out &&
    hasShiftEnded(
      todaySchedule.end_time,
      autoClockoutGraceMinutes,
      effectiveTimezone,
      effectiveTodayEntryRow.work_date,
      today,
    )
  ) {
    // If lunch was unclosed when shift ended, close lunch
    if (effectiveTodayEntryRow.lunch_start && !effectiveTodayEntryRow.lunch_end) {
      const lapsedLunchTime = calculateLapsedLunchEndTime(effectiveTodayEntryRow.lunch_start, allottedLunchMinutes);
      effectiveTodayEntryRow.lunch_end = lapsedLunchTime;
      effectiveTodayEntryRow.lunch_hours = Number((allottedLunchMinutes / 60).toFixed(2));
    }

    const shiftHours = calculateShiftHours(
      effectiveTodayEntryRow.clock_in,
      todaySchedule.end_time,
      Number(effectiveTodayEntryRow.lunch_hours ?? 0),
    );
    effectiveTodayEntryRow.clock_out = todaySchedule.end_time;
    effectiveTodayEntryRow.gross_hours = shiftHours.grossHours;
    effectiveTodayEntryRow.paid_hours = shiftHours.paidHours;
    effectiveTodayEntryRow.normal_hours = shiftHours.normalHours;
    effectiveTodayEntryRow.warning_notes = effectiveTodayEntryRow.warning_notes
      ? `${effectiveTodayEntryRow.warning_notes}; Auto clocked out based on schedule end (${todaySchedule.end_time})`
      : `Auto clocked out based on schedule end (${todaySchedule.end_time})`;

    void supabase
      .from("time_entries")
      .update({
        lunch_end: effectiveTodayEntryRow.lunch_end,
        lunch_hours: effectiveTodayEntryRow.lunch_hours,
        clock_out: todaySchedule.end_time,
        gross_hours: shiftHours.grossHours,
        paid_hours: shiftHours.paidHours,
        normal_hours: shiftHours.normalHours,
        warning_notes: effectiveTodayEntryRow.warning_notes,
      })
      .eq("id", effectiveTodayEntryRow.id);

    void supabase.from("time_clock_events").insert({
      company_id: company.id,
      employee_id: employeeRow.id,
      event_type: "clock_out",
      event_at: new Date().toISOString(),
      local_work_date: effectiveTodayEntryRow.work_date,
      local_event_time: todaySchedule.end_time,
      device_metadata: { source: "auto_schedule_clockout" },
    });
  }

  return {
    currentWorkDate: today,
    employee: {
      id: employeeRow.id,
      full_name: employeeRow.full_name,
      known_as: employeeRow.known_as,
      avatar_url: employeeRow.avatar_url,
      job_title: employeeRow.job_title,
    },
    todayEntry,
    recentEntries,
    recentEvents: (eventsResult.data ?? []) as ClockEventRecord[],
    correctionRequests: (correctionRequestsResult.data ?? []) as TimesheetCorrectionRequest[],
    publicHolidays: (holidaysResult.data ?? []) as CompanyPublicHoliday[],
    workstations,
    assignedWorkstationId,
    todaySchedule,
    autoEndLunchOnLapse,
    autoClockoutAfterLunch: autoEndLunchOnLapse,
    defaultLunchMinutes,
    autoClockoutBasedOnSchedule,
    autoClockoutGraceMinutes: autoClockoutGraceMinutes >= 0 ? autoClockoutGraceMinutes : 0,
  };
});

function liveStatus(entry: TimeEntryRecord | null): CompanyLiveTimeEntry["status"] {
  if (!entry?.clock_in) return "not_started";
  if (entry.clock_out) return "worked";
  if (entry.lunch_start && !entry.lunch_end) return "on_lunch";
  return "working";
}

export const getCompanyLiveTimeOverview = cache(async function getCompanyLiveTimeOverview(): Promise<CompanyLiveTimeOverview> {
  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();
  const effectiveTimezone = company.timezone || "Africa/Johannesburg";
  const workDate = currentDateInTimezone(effectiveTimezone);

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: Number(workDate.slice(0, 4)),
  });

  const [employeesResult, entriesResult, geofenceEventsResult, settingsResult] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, employee_number, full_name, known_as, avatar_url, workstation_id, department_id, work_schedule_id, job_title, company_workstations(name), departments(name)",
      )
      .eq("company_id", company.id)
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, workstation_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
      )
      .eq("company_id", company.id)
      .eq("work_date", workDate)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("time_clock_events")
      .select("employee_id, event_type, geofence_status, distance_meters, company_workstations(name)")
      .eq("company_id", company.id)
      .eq("local_work_date", workDate)
      .order("event_at", { ascending: false })
      .limit(1000),
    supabase
      .from("company_settings")
      .select("approval_rules, default_lunch_minutes")
      .eq("company_id", company.id)
      .maybeSingle(),
  ]);

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message);
  }

  if (entriesResult.error) {
    throw new Error(entriesResult.error.message);
  }

  if (geofenceEventsResult.error && !isMissingGeofenceSchema(geofenceEventsResult.error)) {
    throw new Error(geofenceEventsResult.error.message);
  }

  const settingsApprovalRules = (settingsResult?.data?.approval_rules ?? {}) as Record<string, unknown>;
  const autoEndLunchOnLapse = Boolean(
    settingsApprovalRules.auto_end_lunch_on_lapse ?? settingsApprovalRules.auto_clockout_after_lunch,
  );
  const autoClockoutBasedOnSchedule = Boolean(
    settingsApprovalRules.auto_clockout_based_on_schedule ?? settingsApprovalRules.auto_clockout_after_shift_end,
  );
  const autoClockoutGraceMinutes = Number(
    settingsApprovalRules.auto_clockout_grace_minutes ?? 0,
  );
  const defaultLunchMinutes = Number(
    settingsResult?.data?.default_lunch_minutes ?? settingsApprovalRules.default_lunch_minutes ?? 60,
  );

  const rawEmployees = (employeesResult.data ?? []) as unknown as (EmployeeRow & { work_schedule_id?: string | null })[];
  const rawEntries = (entriesResult.data ?? []) as TimeEntryRecord[];

  // Fetch active company schedules to map schedules to each employee
  const { data: defaultSchedule } = await supabase
    .from("work_schedules")
    .select("id")
    .eq("company_id", company.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const allScheduleIds = [
    ...new Set([
      ...rawEmployees.map((e) => e.work_schedule_id).filter(Boolean),
      defaultSchedule?.id,
    ].filter(Boolean)),
  ] as string[];

  const scheduleDaysMap = new Map<string, { start_time: string | null; end_time: string | null; lunch_minutes: number | null }>();
  if (allScheduleIds.length > 0) {
    const dayOfWeek = new Date(`${workDate}T00:00:00`).getDay();
    const { data: days } = await supabase
      .from("schedule_days")
      .select("work_schedule_id, start_time, end_time, lunch_minutes, is_working_day")
      .in("work_schedule_id", allScheduleIds)
      .eq("day_of_week", dayOfWeek);

    if (days) {
      for (const d of days) {
        if (d.start_time && d.end_time) {
          scheduleDaysMap.set(d.work_schedule_id, {
            start_time: d.start_time,
            end_time: d.end_time,
            lunch_minutes: Number(d.lunch_minutes ?? defaultLunchMinutes ?? 60),
          });
        }
      }
    }
  }

  const employeeScheduleMap = new Map<string, { start_time: string; end_time: string; lunch_minutes: number }>();
  for (const emp of rawEmployees) {
    const sId = emp.work_schedule_id || defaultSchedule?.id;
    const sDay = sId ? scheduleDaysMap.get(sId) : null;
    if (sDay && sDay.start_time && sDay.end_time) {
      employeeScheduleMap.set(emp.id, {
        start_time: sDay.start_time,
        end_time: sDay.end_time,
        lunch_minutes: sDay.lunch_minutes ?? defaultLunchMinutes ?? 60,
      });
    } else {
      employeeScheduleMap.set(emp.id, {
        start_time: "08:00:00",
        end_time: "17:00:00",
        lunch_minutes: defaultLunchMinutes > 0 ? defaultLunchMinutes : 60,
      });
    }
  }

  if (autoEndLunchOnLapse) {
    rawEntries.forEach((entry) => {
      const empSched = employeeScheduleMap.get(entry.employee_id);
      const lunchMin = empSched?.lunch_minutes && empSched.lunch_minutes > 0 ? empSched.lunch_minutes : defaultLunchMinutes;
      if (
        entry.lunch_start &&
        !entry.lunch_end &&
        !entry.clock_out &&
        hasLunchDurationLapsed(entry.lunch_start, lunchMin, effectiveTimezone)
      ) {
        const lapsedTime = calculateLapsedLunchEndTime(entry.lunch_start, lunchMin);
        const recordedLunchHours = Number((lunchMin / 60).toFixed(2));
        entry.lunch_end = lapsedTime;
        entry.lunch_hours = recordedLunchHours;
        entry.warning_notes = entry.warning_notes
          ? `${entry.warning_notes}; Auto lunch break ended upon lapse`
          : "Auto lunch break ended upon lapse";

        void supabase
          .from("time_entries")
          .update({
            lunch_end: lapsedTime,
            lunch_hours: recordedLunchHours,
            warning_notes: entry.warning_notes,
          })
          .eq("id", entry.id);
      }
    });
  }

  if (autoClockoutBasedOnSchedule) {
    rawEntries.forEach((entry) => {
      const empSched = employeeScheduleMap.get(entry.employee_id);
      const endTime = empSched?.end_time ?? "17:00:00";
      const lunchMin = empSched?.lunch_minutes && empSched.lunch_minutes > 0 ? empSched.lunch_minutes : defaultLunchMinutes;

      if (
        entry.clock_in &&
        !entry.clock_out &&
        hasShiftEnded(endTime, autoClockoutGraceMinutes, effectiveTimezone, entry.work_date, workDate)
      ) {
        if (entry.lunch_start && !entry.lunch_end) {
          const lapsedLunchTime = calculateLapsedLunchEndTime(entry.lunch_start, lunchMin);
          entry.lunch_end = lapsedLunchTime;
          entry.lunch_hours = Number((lunchMin / 60).toFixed(2));
        }

        const shiftHours = calculateShiftHours(
          entry.clock_in,
          endTime,
          Number(entry.lunch_hours ?? 0),
        );
        entry.clock_out = endTime;
        entry.gross_hours = shiftHours.grossHours;
        entry.paid_hours = shiftHours.paidHours;
        entry.normal_hours = shiftHours.normalHours;
        entry.warning_notes = entry.warning_notes
          ? `${entry.warning_notes}; Auto clocked out based on schedule end (${endTime})`
          : `Auto clocked out based on schedule end (${endTime})`;

        void supabase
          .from("time_entries")
          .update({
            lunch_end: entry.lunch_end,
            lunch_hours: entry.lunch_hours,
            clock_out: endTime,
            gross_hours: shiftHours.grossHours,
            paid_hours: shiftHours.paidHours,
            normal_hours: shiftHours.normalHours,
            warning_notes: entry.warning_notes,
          })
          .eq("id", entry.id);

        void supabase.from("time_clock_events").insert({
          company_id: company.id,
          employee_id: entry.employee_id,
          event_type: "clock_out",
          event_at: new Date().toISOString(),
          local_work_date: entry.work_date,
          local_event_time: endTime,
          device_metadata: { source: "auto_schedule_clockout" },
        });
      }
    });
  }

  const entriesByEmployee = new Map(
    rawEntries.map((entry) => [
      entry.employee_id,
      entry,
    ]),
  );
  const geofenceByEmployee = new Map<string, TimeClockGeofenceRow>();
  if (!geofenceEventsResult.error) {
    ((geofenceEventsResult.data ?? []) as unknown as TimeClockGeofenceRow[]).forEach(
      (event) => {
        if (!geofenceByEmployee.has(event.employee_id)) {
          geofenceByEmployee.set(event.employee_id, event);
        }
      },
    );
  }

  const entries = ((employeesResult.data ?? []) as unknown as EmployeeRow[]).map(
    (employee) => {
      const entry = entriesByEmployee.get(employee.id) ?? null;
      const geofence = geofenceByEmployee.get(employee.id) ?? null;
      const status = liveStatus(entry);

      return {
        workstationName: relationName(employee.company_workstations),
        clockIn: entry?.clock_in ?? null,
        clockOut: entry?.clock_out ?? null,
        departmentName: relationName(employee.departments),
        earlyDeparture: Boolean(entry?.early_departure),
        employeeId: employee.id,
        employeeNumber: employee.employee_number ?? "",
        fullName: employee.full_name,
        avatarUrl: employee.avatar_url,
        jobTitle: employee.job_title,
        knownAs: employee.known_as,
        lateArrival: Boolean(entry?.late_arrival),
        latestGeofenceDistanceMeters: geofence?.distance_meters
          ? Number(geofence.distance_meters)
          : null,
        latestGeofenceEventType: geofence?.event_type ?? null,
        latestGeofenceStatus: geofence?.geofence_status ?? null,
        lunchEnd: entry?.lunch_end ?? null,
        lunchStart: entry?.lunch_start ?? null,
        missingClocking: Boolean(entry?.missing_clocking),
        overtimeHours: Number(entry?.overtime_hours ?? 0),
        paidHours: Number(entry?.paid_hours ?? 0),
        status,
        workDate: entry?.work_date ?? null,
      };
    },
  );

  return {
    companyId: company.id,
    entries,
    totals: {
      activeEmployees: entries.filter((entry) => entry.status === "working").length,
      needsReview: entries.filter((entry) => entry.missingClocking || entry.lateArrival || entry.earlyDeparture).length,
      notStarted: entries.filter((entry) => entry.status === "not_started").length,
      onLunch: entries.filter((entry) => entry.status === "on_lunch").length,
      totalEmployees: entries.length,
      workedToday: entries.filter((entry) => entry.status === "worked").length,
    },
    workDate,
  };
});

export const getCompanyTimesheetCorrectionQueue = cache(async function getCompanyTimesheetCorrectionQueue(): Promise<CompanyTimesheetCorrectionRequest[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.employeeId) {
    return [];
  }

  const { data, error } = await supabase
    .from("timesheet_correction_requests")
    .select(
      "id, company_id, employee_id, time_entry_id, payroll_period_id, work_date, original_clock_in, original_lunch_start, original_lunch_end, original_clock_out, proposed_clock_in, proposed_lunch_start, proposed_lunch_end, proposed_clock_out, reason, status, submitted_at, reviewed_at, review_notes, employees(employee_number, full_name, known_as, avatar_url, company_workstations(name))",
    )
    .eq("company_id", company.id)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CorrectionRequestRow[]).map((request) => {
    const employee = Array.isArray(request.employees)
      ? request.employees[0]
      : request.employees;

    return {
      ...request,
      workstationName: relationName(employee?.company_workstations),
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      avatarUrl: employee?.avatar_url ?? null,
    };
  });
});

export const getCompanySubmittedTimesheetQueue = cache(async function getCompanySubmittedTimesheetQueue(): Promise<CompanySubmittedTimesheet[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      "id, company_id, employee_id, work_date, workstation_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status, employees(employee_number, full_name, known_as, avatar_url, company_workstations(name))",
    )
    .eq("company_id", company.id)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("work_date", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as unknown as SubmittedTimesheetRow[]).filter(
    (entry) => !entry.notes?.startsWith("Public holiday:"),
  );
  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  const scheduleByEmployee = await getEmployeeSchedules(supabase, company.id, employeeIds);
  const locationEventsByEntry = await getLocationEventsByTimeEntry(
    supabase,
    company.id,
    rows.map((entry) => entry.id),
  );

  return rows.map((entry) => {
    const employee = Array.isArray(entry.employees)
      ? entry.employees[0]
      : entry.employees;
    const { employees, ...timeEntry } = entry;
    void employees;

    const scheduleDays = scheduleByEmployee.get(entry.employee_id);
    const validation = validateTimesAgainstSchedule(timeEntry, scheduleDays);

    return {
      ...timeEntry,
      workstationName: relationName(employee?.company_workstations),
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      avatarUrl: employee?.avatar_url ?? null,
      locationEvents: locationEventsByEntry.get(entry.id) ?? [],
      paidTimeOffHours: paidTimeOffHours(timeEntry),
      scheduleValidation: validation,
    };
  });
});

export const getCompanyTimesheetCalendarEntries = cache(async function getCompanyTimesheetCalendarEntries(): Promise<CompanyTimesheetCalendarEntry[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const workDate = currentDateInTimezone(company.timezone || "UTC");
  const currentYear = Number(workDate.slice(0, 4));

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: currentYear,
  });

  const [{ data, error }, { data: holidaysData }] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, workstation_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status, leave_type_id, employees(employee_number, full_name, known_as, avatar_url, company_workstations(name))",
      )
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .gte("work_date", `${currentYear}-01-01`)
      .lte("work_date", `${currentYear}-12-31`)
      .order("work_date", { ascending: false })
      .limit(1500),
    supabase
      .from("company_public_holidays")
      .select("holiday_date")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .gte("holiday_date", `${currentYear}-01-01`)
      .lte("holiday_date", `${currentYear}-12-31`),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const holidayDateSet = new Set((holidaysData ?? []).map((h) => h.holiday_date));
  const rows = ((data ?? []) as unknown as SubmittedTimesheetRow[]).filter(
    (entry) => !entry.notes?.startsWith("Public holiday:") && !holidayDateSet.has(entry.work_date),
  );
  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  const scheduleByEmployee = await getEmployeeSchedules(supabase, company.id, employeeIds);
  const locationEventsByEntry = await getLocationEventsByTimeEntry(
    supabase,
    company.id,
    rows.map((entry) => entry.id),
  );

  return rows.map((entry) => {
    const employee = Array.isArray(entry.employees)
      ? entry.employees[0]
      : entry.employees;
    const { employees, ...timeEntry } = entry;
    void employees;

    const scheduleDays = scheduleByEmployee.get(entry.employee_id);
    const validation = validateTimesAgainstSchedule(timeEntry, scheduleDays);

    return {
      ...timeEntry,
      workstationName: relationName(employee?.company_workstations),
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      avatarUrl: employee?.avatar_url ?? null,
      locationEvents: locationEventsByEntry.get(entry.id) ?? [],
      paidTimeOffHours: paidTimeOffHours(timeEntry),
      scheduleValidation: validation,
    };
  });
});

export const getCompanyTimesheetCalendarHolidays = cache(async function getCompanyTimesheetCalendarHolidays(): Promise<CompanyPublicHoliday[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const workDate = currentDateInTimezone(company.timezone || "UTC");
  const currentYear = Number(workDate.slice(0, 4));

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: currentYear,
  });

  const { data, error } = await supabase
    .from("company_public_holidays")
    .select("id, holiday_date, name, is_paid")
    .eq("company_id", company.id)
    .is("deleted_at", null)
    .gte("holiday_date", `${currentYear}-01-01`)
    .lte("holiday_date", `${currentYear}-12-31`)
    .order("holiday_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CompanyPublicHoliday[];
});

export const getCompanyCalendarEmployeeOptions = cache(async function getCompanyCalendarEmployeeOptions(): Promise<CompanyCalendarEmployeeOption[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, known_as")
    .eq("company_id", company.id)
    .eq("employment_status", "active")
    .is("deleted_at", null)
    .order("full_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((employee) => ({
    id: employee.id,
    label: `${employee.known_as ?? employee.full_name} (${employee.employee_number})`,
  }));
});

export const getCompanyCalendarLeaveRequests = cache(async function getCompanyCalendarLeaveRequests(): Promise<CompanyCalendarLeaveRequest[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, employee_id, start_date, end_date, total_hours, status, employees(employee_number, full_name, known_as), leave_types(name)")
    .eq("company_id", company.id)
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("start_date", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CalendarLeaveRequestRow[]).map((request) => {
    const employee = Array.isArray(request.employees)
      ? request.employees[0]
      : request.employees;
    const leaveType = Array.isArray(request.leave_types)
      ? request.leave_types[0]
      : request.leave_types;

    return {
      employee_id: request.employee_id,
      employeeName: employee?.known_as ?? employee?.full_name ?? "Unknown employee",
      employeeNumber: employee?.employee_number ?? "",
      end_date: request.end_date,
      id: request.id,
      leaveTypeName: leaveType?.name ?? "Leave",
      start_date: request.start_date,
      status: request.status,
      total_hours: request.total_hours,
    };
  });
});
