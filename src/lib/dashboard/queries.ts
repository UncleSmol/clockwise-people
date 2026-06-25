import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import { getEmployeeTimeState } from "@/lib/time-tracking/queries";
import type {
  DashboardExperienceData,
  DashboardHoliday,
  DashboardReminderSchedule,
  DashboardTeamMovement,
} from "./schema";

type ScheduleDayRow = {
  start_time: string | null;
  end_time: string | null;
  lunch_minutes: number;
  is_working_day: boolean;
};

type MovementRow = {
  id: string;
  event_type: DashboardTeamMovement["eventType"];
  event_at: string;
  local_event_time: string;
  geofence_status: string | null;
  employees?: {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    branches?: { name: string }[] | { name: string } | null;
  }[] | {
    employee_number: string;
    full_name: string;
    known_as: string | null;
    branches?: { name: string }[] | { name: string } | null;
  } | null;
};

type NotificationRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  target_href: string | null;
  read_at: string | null;
  created_at: string;
};

function relationOne<T>(relation?: T[] | T | null) {
  return Array.isArray(relation) ? relation[0] : relation ?? null;
}

function datePartsInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    dayOfWeek: new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00`).getDay(),
  };
}

function addMinutes(time: string | null, minutes: number) {
  if (!time) return null;

  const [hours = "0", mins = "0"] = time.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(mins), 0, 0);
  date.setMinutes(date.getMinutes() + minutes);

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

async function getTodaySchedule(
  employeeId: string | null,
  currentWorkDate: string,
  dayOfWeek: number,
): Promise<ScheduleDayRow | null> {
  if (!employeeId) return null;

  const { supabase } = await requireUser();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, company_id, work_schedule_id")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  if (!employee) return null;

  const assignmentsResult = await supabase
    .from("employee_work_schedule_assignments")
    .select("work_schedule_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .lte("effective_from", currentWorkDate)
    .or(`effective_to.is.null,effective_to.gte.${currentWorkDate}`)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .limit(1);

  if (assignmentsResult.error && !assignmentsResult.error.message.includes("schema cache")) {
    throw new Error(assignmentsResult.error.message);
  }

  const assignmentScheduleId = assignmentsResult.data?.[0]?.work_schedule_id ?? null;
  const scheduleId = assignmentScheduleId ?? employee.work_schedule_id;

  if (!scheduleId) return null;

  const { data, error } = await supabase
    .from("schedule_days")
    .select("start_time, end_time, lunch_minutes, is_working_day")
    .eq("work_schedule_id", scheduleId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ScheduleDayRow | null;
}

export const getDashboardExperienceData = cache(async function getDashboardExperienceData(): Promise<DashboardExperienceData> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);
  const timezone = company.timezone || "Africa/Johannesburg";
  const { date: currentWorkDate, dayOfWeek } = datePartsInTimezone(timezone);

  await supabase.rpc("ensure_current_year_za_public_holidays", {
    target_company_id: company.id,
    target_year: Number(currentWorkDate.slice(0, 4)),
  });

  const [
    holidaysResult,
    movementsResult,
    notificationsResult,
    employeeTimeState,
    scheduleDay,
  ] = await Promise.all([
    supabase
      .from("company_public_holidays")
      .select("id, holiday_date, name, is_paid")
      .eq("company_id", company.id)
      .gte("holiday_date", currentWorkDate)
      .is("deleted_at", null)
      .order("holiday_date", { ascending: true })
      .limit(5),
    supabase
      .from("time_clock_events")
      .select("id, event_type, event_at, local_event_time, geofence_status, employees(employee_number, full_name, known_as, branches(name))")
      .eq("company_id", company.id)
      .eq("local_work_date", currentWorkDate)
      .order("event_at", { ascending: false })
      .limit(10),
    supabase
      .from("app_notifications")
      .select("id, category, title, body, target_href, read_at, created_at")
      .eq("company_id", company.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    access.employeeId ? getEmployeeTimeState() : Promise.resolve(null),
    getTodaySchedule(access.employeeId, currentWorkDate, dayOfWeek),
  ]);

  if (holidaysResult.error) throw new Error(holidaysResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);
  if (notificationsResult.error && !notificationsResult.error.message.includes("app_notifications")) {
    throw new Error(notificationsResult.error.message);
  }

  const holidays = (holidaysResult.data ?? []) as DashboardHoliday[];
  const teamMovements = ((movementsResult.data ?? []) as unknown as MovementRow[]).map((movement) => {
    const employee = relationOne(movement.employees);
    const branch = relationOne(employee?.branches);

    return {
      branchName: branch?.name ?? null,
      employeeName: employee?.known_as ?? employee?.full_name ?? "Employee",
      employeeNumber: employee?.employee_number ?? "",
      eventAt: movement.event_at,
      eventType: movement.event_type,
      geofenceStatus: movement.geofence_status,
      id: movement.id,
      localEventTime: movement.local_event_time,
    };
  });
  const notifications = ((notificationsResult.data ?? []) as NotificationRow[]).map((notification) => ({
    body: notification.body,
    category: notification.category,
    createdAt: notification.created_at,
    id: notification.id,
    readAt: notification.read_at,
    targetHref: notification.target_href,
    title: notification.title,
  }));
  const reminderSchedule: DashboardReminderSchedule | null = access.employeeId
    ? {
        currentWorkDate,
        endTime: scheduleDay?.end_time ?? null,
        isWorkingDay: Boolean(scheduleDay?.is_working_day),
        lunchEndTime: addMinutes(scheduleDay?.start_time ?? null, 30 + Number(scheduleDay?.lunch_minutes ?? 0)),
        lunchStartTime: addMinutes(scheduleDay?.start_time ?? null, 30),
        startTime: scheduleDay?.start_time ?? null,
        timezone,
        todayEntry: employeeTimeState?.todayEntry ?? null,
      }
    : null;

  return {
    holidays,
    notifications,
    reminderSchedule,
    teamMovements,
  };
});
