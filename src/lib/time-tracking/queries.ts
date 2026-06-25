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

type EmployeeRow = {
  id: string;
  employee_number?: string;
  full_name: string;
  known_as: string | null;
  avatar_url: string | null;
  branch_id: string;
  department_id?: string | null;
  job_title: string | null;
  branches?: { name: string }[] | { name: string } | null;
  departments?: { name: string }[] | { name: string } | null;
};

type CorrectionRequestRow = TimesheetCorrectionRequest & {
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    branches?: { name: string }[] | { name: string } | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    branches?: { name: string }[] | { name: string } | null;
  } | null;
};

type SubmittedTimesheetRow = TimeEntryRecord & {
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    branches?: { name: string }[] | { name: string } | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    branches?: { name: string }[] | { name: string } | null;
  } | null;
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
  return entry.notes?.startsWith("Public holiday:") ? Number(entry.paid_hours ?? 0) : 0;
}

async function getLocationEventsByTimeEntry(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  companyId: string,
  timeEntryIds: string[],
) {
  if (timeEntryIds.length === 0) {
    return new Map<string, TimeClockLocationEvent[]>();
  }

  const { data, error } = await supabase
    .from("time_clock_events")
    .select(
      "id, time_entry_id, event_type, event_at, local_work_date, local_event_time, latitude, longitude, accuracy_meters, distance_meters, geofence_status, company_workstations(name)",
    )
    .eq("company_id", companyId)
    .in("time_entry_id", timeEntryIds)
    .order("event_at", { ascending: true });

  if (error) {
    if (isMissingGeofenceSchema(error)) {
      return new Map<string, TimeClockLocationEvent[]>();
    }

    throw new Error(error.message);
  }

  const eventsByEntry = new Map<string, TimeClockLocationEvent[]>();
  ((data ?? []) as unknown as TimeClockLocationEventRow[]).forEach((event) => {
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

  if (!access.employeeId) {
    return {
      currentWorkDate: currentDateInTimezone(company.timezone || "UTC"),
      employee: null,
      todayEntry: null,
      recentEntries: [],
      recentEvents: [],
      correctionRequests: [],
      publicHolidays: [],
    };
  }

  const { supabase } = await requireUser();
  const today = currentDateInTimezone(company.timezone || "UTC");
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
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, known_as, avatar_url, branch_id, job_title, branches(name)")
      .eq("id", access.employeeId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, branch_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
      )
      .eq("employee_id", access.employeeId)
      .eq("work_date", today)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, branch_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
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

  const employeeRow = employeeResult.data as unknown as EmployeeRow;
  const recentEntries = (entriesResult.data ?? []) as TimeEntryRecord[];

  return {
    currentWorkDate: today,
    employee: {
      id: employeeRow.id,
      full_name: employeeRow.full_name,
      known_as: employeeRow.known_as,
      avatar_url: employeeRow.avatar_url,
      branch_id: employeeRow.branch_id,
      branch_name: relationName(employeeRow.branches),
      job_title: employeeRow.job_title,
    },
    todayEntry: (todayEntryResult.data as TimeEntryRecord | null) ?? null,
    recentEntries,
    recentEvents: (eventsResult.data ?? []) as ClockEventRecord[],
    correctionRequests: (correctionRequestsResult.data ?? []) as TimesheetCorrectionRequest[],
    publicHolidays: (holidaysResult.data ?? []) as CompanyPublicHoliday[],
  };
});

function liveStatus(entry: TimeEntryRecord | null): CompanyLiveTimeEntry["status"] {
  if (!entry?.clock_in) return "not_started";
  if (entry.missing_clocking || entry.late_arrival || entry.early_departure) {
    return "needs_review";
  }
  if (entry.clock_out) return "worked";
  if (entry.lunch_start && !entry.lunch_end) return "on_lunch";
  return "working";
}

export const getCompanyLiveTimeOverview = cache(async function getCompanyLiveTimeOverview(): Promise<CompanyLiveTimeOverview> {
  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();
  const workDate = currentDateInTimezone(company.timezone || "UTC");

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: Number(workDate.slice(0, 4)),
  });

  const [employeesResult, entriesResult, geofenceEventsResult] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, employee_number, full_name, known_as, avatar_url, branch_id, department_id, job_title, branches(name), departments(name)",
      )
      .eq("company_id", company.id)
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("time_entries")
      .select(
        "id, company_id, employee_id, work_date, branch_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status",
      )
      .eq("company_id", company.id)
      .eq("work_date", workDate)
      .is("deleted_at", null),
    supabase
      .from("time_clock_events")
      .select("employee_id, event_type, geofence_status, distance_meters, company_workstations(name)")
      .eq("company_id", company.id)
      .eq("local_work_date", workDate)
      .order("event_at", { ascending: false })
      .limit(1000),
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

  const entriesByEmployee = new Map(
    ((entriesResult.data ?? []) as TimeEntryRecord[]).map((entry) => [
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
        branchName: relationName(employee.branches),
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
        workstationName: relationName(geofence?.company_workstations),
        workDate: entry?.work_date ?? null,
      };
    },
  );

  return {
    companyId: company.id,
    entries,
    totals: {
      activeEmployees: entries.filter((entry) => entry.status === "working").length,
      needsReview: entries.filter((entry) => entry.status === "needs_review").length,
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
      "id, company_id, employee_id, time_entry_id, payroll_period_id, work_date, original_clock_in, original_lunch_start, original_lunch_end, original_clock_out, proposed_clock_in, proposed_lunch_start, proposed_lunch_end, proposed_clock_out, reason, status, submitted_at, reviewed_at, review_notes, employees(employee_number, full_name, known_as, avatar_url, branches(name))",
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
      branchName: relationName(employee?.branches),
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
      "id, company_id, employee_id, work_date, branch_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status, employees(employee_number, full_name, known_as, avatar_url, branches(name))",
    )
    .eq("company_id", company.id)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("work_date", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SubmittedTimesheetRow[];
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

    return {
      ...timeEntry,
      branchName: relationName(employee?.branches),
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      avatarUrl: employee?.avatar_url ?? null,
      locationEvents: locationEventsByEntry.get(entry.id) ?? [],
      paidTimeOffHours: paidTimeOffHours(timeEntry),
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

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      "id, company_id, employee_id, work_date, branch_id, clock_in, lunch_start, lunch_end, clock_out, gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours, missing_clocking, late_arrival, early_departure, warning_notes, notes, status, employees(employee_number, full_name, known_as, branches(name))",
    )
    .eq("company_id", company.id)
    .is("deleted_at", null)
    .gte("work_date", `${currentYear}-01-01`)
    .lte("work_date", `${currentYear}-12-31`)
    .order("work_date", { ascending: false })
    .limit(1500);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SubmittedTimesheetRow[];
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

    return {
      ...timeEntry,
      branchName: relationName(employee?.branches),
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      locationEvents: locationEventsByEntry.get(entry.id) ?? [],
      paidTimeOffHours: paidTimeOffHours(timeEntry),
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
