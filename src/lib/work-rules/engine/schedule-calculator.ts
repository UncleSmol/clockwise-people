import type { ScheduleDayDetail, WorkingScheduleConfig } from "./schema-ledger";

/**
 * Calculates net ordinary working hours for a schedule day.
 * Formula: (End_Time - Start_Time in Hours) - (Unpaid_Break_Minutes / 60)
 */
export function calculateDayNetHours(day: ScheduleDayDetail): number {
  if (!day.is_working_day || !day.start_time || !day.end_time) {
    return 0;
  }

  const [startH, startM] = day.start_time.split(":").map(Number);
  const [endH, endM] = day.end_time.split(":").map(Number);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
    return day.paid_hours ?? 0;
  }

  let totalMinutes = endH * 60 + endM - (startH * 60 + startM);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60; // Overnight shift wrapping
  }

  const netMinutes = Math.max(0, totalMinutes - (day.lunch_minutes || 0));
  return Number((netMinutes / 60).toFixed(2));
}

/**
 * Gets the scheduled ordinary working hours for a specific date according to the schedule.
 */
export function getDayScheduledHours(schedule: WorkingScheduleConfig, date: string | Date): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  const dayDetail = schedule.schedule_days.find((item) => item.day_of_week === dayOfWeek);
  if (!dayDetail || !dayDetail.is_working_day) {
    return 0;
  }

  return calculateDayNetHours(dayDetail);
}

/**
 * Calculates scheduled ordinary working hours for an employee schedule across an exact date range.
 */
export function calculateScheduledHoursForPeriod(
  schedule: WorkingScheduleConfig,
  startDateStr: string,
  endDateStr: string
): { totalScheduledHours: number; totalWorkingDays: number } {
  const cur = new Date(startDateStr);
  const end = new Date(endDateStr);

  let totalScheduledHours = 0;
  let totalWorkingDays = 0;

  while (cur <= end) {
    const hours = getDayScheduledHours(schedule, cur);
    if (hours > 0) {
      totalScheduledHours += hours;
      totalWorkingDays += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return {
    totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
    totalWorkingDays,
  };
}

/**
 * Calculates partial day leave hours based on scheduled hours for the specific date.
 * E.g., 0.5 day leave on an 8-hour Monday = 4.0h.
 * E.g., 0.5 day leave on a 5-hour Saturday = 2.5h.
 */
export function calculatePartialDayHours(
  schedule: WorkingScheduleConfig,
  dateStr: string,
  fraction: number
): { hoursDeducted: number; dayScheduledHours: number } {
  const dayScheduledHours = getDayScheduledHours(schedule, dateStr);
  const hoursDeducted = Number((dayScheduledHours * fraction).toFixed(2));
  return {
    hoursDeducted,
    dayScheduledHours,
  };
}
