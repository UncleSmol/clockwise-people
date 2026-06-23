import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import type {
  ClockEventRecord,
  CompanyLiveTimeEntry,
  CompanyLiveTimeOverview,
  CompanySubmittedTimesheet,
  CompanyTimesheetCorrectionRequest,
  EmployeeTimeState,
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

function relationName(
  relation?: { name: string }[] | { name: string } | null,
) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? null;
  }

  return relation?.name ?? null;
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
    };
  }

  const { supabase } = await requireUser();
  const today = currentDateInTimezone(company.timezone || "UTC");

  const [
    employeeResult,
    todayEntryResult,
    entriesResult,
    eventsResult,
    correctionRequestsResult,
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
      .order("work_date", { ascending: false })
      .limit(14),
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

  const [employeesResult, entriesResult] = await Promise.all([
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
  ]);

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message);
  }

  if (entriesResult.error) {
    throw new Error(entriesResult.error.message);
  }

  const entriesByEmployee = new Map(
    ((entriesResult.data ?? []) as TimeEntryRecord[]).map((entry) => [
      entry.employee_id,
      entry,
    ]),
  );

  const entries = ((employeesResult.data ?? []) as unknown as EmployeeRow[]).map(
    (employee) => {
      const entry = entriesByEmployee.get(employee.id) ?? null;
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

  return ((data ?? []) as unknown as SubmittedTimesheetRow[]).map((entry) => {
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
    };
  });
});
