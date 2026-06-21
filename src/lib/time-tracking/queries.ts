import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import type {
  ClockEventRecord,
  EmployeeTimeState,
  TimeEntryRecord,
} from "./schema";

type EmployeeRow = {
  id: string;
  full_name: string;
  known_as: string | null;
  branch_id: string;
  job_title: string | null;
  branches?: { name: string }[] | { name: string } | null;
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
      employee: null,
      todayEntry: null,
      recentEntries: [],
      recentEvents: [],
    };
  }

  const { supabase } = await requireUser();
  const today = currentDateInTimezone(company.timezone || "UTC");

  const [employeeResult, todayEntryResult, entriesResult, eventsResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, known_as, branch_id, job_title, branches(name)")
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

  const employeeRow = employeeResult.data as unknown as EmployeeRow;
  const recentEntries = (entriesResult.data ?? []) as TimeEntryRecord[];

  return {
    employee: {
      id: employeeRow.id,
      full_name: employeeRow.full_name,
      known_as: employeeRow.known_as,
      branch_id: employeeRow.branch_id,
      branch_name: relationName(employeeRow.branches),
      job_title: employeeRow.job_title,
    },
    todayEntry: (todayEntryResult.data as TimeEntryRecord | null) ?? null,
    recentEntries,
    recentEvents: (eventsResult.data ?? []) as ClockEventRecord[],
  };
});
