export type ScheduleDayLike = {
  day_of_week: number;
  start_time?: string | null;
  end_time?: string | null;
  lunch_minutes?: number | null;
  paid_hours?: number | string | null;
  is_working_day: boolean;
};

export type ComplianceEntryLike = {
  work_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  paid_hours?: number | null;
  normal_hours?: number | null;
  overtime_hours?: number | null;
  missing_clocking?: boolean | null;
  late_arrival?: boolean | null;
  early_departure?: boolean | null;
  warning_notes?: string | null;
  notes?: string | null;
  status?: string | null;
  leave_type_id?: string | null;
};

export type EntryComplianceResult = {
  isCompliant: boolean;
  isLate: boolean;
  isEarly: boolean;
  isMissing: boolean;
  isLeave: boolean;
  isScheduledWorkingDay: boolean;
  expectedHours: number;
  issues: string[];
  dynamicNote: string;
  scheduleWindow: string | null;
};

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const timePart = trimmed.includes("T") ? (trimmed.split("T")[1] ?? trimmed) : trimmed;
  const match = timePart.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatHHMM(value: string | null | undefined): string {
  if (!value) return "--:--";
  const mins = parseTimeToMinutes(value);
  if (mins == null) return String(value).slice(0, 5);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Resolves the exact scheduled paid hours for a single ScheduleDayLike rule
 * without clamping short shifts (e.g. 2h/day or 4h Saturday) up to 8h.
 */
export function calculateScheduleDayHours(day: ScheduleDayLike | null | undefined): number {
  if (!day || !day.is_working_day) return 0;

  const startMins = parseTimeToMinutes(day.start_time);
  const endMins = parseTimeToMinutes(day.end_time);
  let derived = 0;

  if (startMins != null && endMins != null) {
    let diff = endMins - startMins;
    if (diff < 0) diff += 24 * 60;
    const lunch = Math.max(0, Number(day.lunch_minutes ?? 0));
    derived = Math.max(0, Number(((diff - lunch) / 60).toFixed(2)));
  }

  const storedPaid = day.paid_hours != null ? Number(day.paid_hours) : 0;
  if (derived > 0) {
    // Prefer explicit paid_hours if present and sensible, otherwise derived net hours
    if (storedPaid > 0 && storedPaid <= derived + 1) {
      return Number(storedPaid.toFixed(2));
    }
    return derived;
  }

  return storedPaid > 0 ? Number(storedPaid.toFixed(2)) : 0;
}

export function getScheduleAverageDailyHours(
  scheduleDays: ScheduleDayLike[] | null | undefined,
  fallback = 8,
): number {
  if (!scheduleDays || scheduleDays.length === 0) return fallback;
  const workingHours = scheduleDays
    .map((d) => calculateScheduleDayHours(d))
    .filter((h) => h > 0);
  if (workingHours.length === 0) return fallback;
  const avg = workingHours.reduce((sum, h) => sum + h, 0) / workingHours.length;
  return Number(avg.toFixed(2));
}

export function getScheduleWeeklyHours(
  scheduleDays: ScheduleDayLike[] | null | undefined,
  fallbackWeekly = 40,
): number {
  if (!scheduleDays || scheduleDays.length === 0) return fallbackWeekly;
  const total = scheduleDays.reduce((sum, d) => sum + calculateScheduleDayHours(d), 0);
  return total > 0 ? Number(total.toFixed(2)) : fallbackWeekly;
}

/**
 * Merges an employee's ordered work schedule IDs into a single 7-day map where
 * working days from secondary rules (e.g. Saturday 09:00-13:00) augment the primary rule.
 */
export function mergeEmployeeScheduleDays<T extends ScheduleDayLike>(
  orderedScheduleIds: string[],
  scheduleDaysById: Map<string, T[]>,
): T[] {
  const mergedByDow = new Map<number, T>();
  for (const schedId of orderedScheduleIds) {
    for (const day of scheduleDaysById.get(schedId) ?? []) {
      const existing = mergedByDow.get(day.day_of_week);
      if (!existing || (!existing.is_working_day && day.is_working_day)) {
        mergedByDow.set(day.day_of_week, day);
      }
    }
  }
  return [...mergedByDow.values()];
}

export function resolveScheduleDayForDate(
  scheduleDays: ScheduleDayLike[] | null | undefined,
  workDate: string,
): ScheduleDayLike | undefined {
  if (!scheduleDays || scheduleDays.length === 0 || !workDate) return undefined;
  const parts = workDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return scheduleDays.find((d) => Number(d.day_of_week) === dow);
}

function isStalePunctualityFragment(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return true;
  return (
    lower === "late" ||
    lower === "late arrival" ||
    lower.startsWith("late arrival (") ||
    lower === "early" ||
    lower === "early departure" ||
    lower.startsWith("early departure (") ||
    lower === "late in & early out" ||
    lower === "missing clocking" ||
    lower === "missing clock event" ||
    lower === "missing clock-in or clock-out"
  );
}

function stripStalePunctualityWarnings(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[·|;]+/)
    .map((part) => part.trim())
    .filter((part) => Boolean(part) && !isStalePunctualityFragment(part));
}

/**
 * Dynamically evaluates a time entry against the employee's assigned work rule
 * for that day of the week so reports and timesheet statements reflect live
 * schedule conditions (e.g. Saturday 09:00-13:00 clocking in at 09:00 = On time & compliant)
 * instead of stale stored flags.
 */
export function evaluateEntryScheduleCompliance(
  entry: ComplianceEntryLike,
  scheduleDays?: ScheduleDayLike[] | null,
  options?: {
    graceMinutes?: number;
    fallbackDailyHours?: number;
    isHoliday?: boolean;
    holidayName?: string | null;
  },
): EntryComplianceResult {
  const graceMinutes = options?.graceMinutes ?? 5;
  const fallbackDaily = options?.fallbackDailyHours ?? 8;
  const scheduleDay = resolveScheduleDayForDate(scheduleDays, entry.work_date);
  const isScheduledWorkingDay = scheduleDay ? Boolean(scheduleDay.is_working_day) : false;

  const hasClockIn = Boolean(entry.clock_in);
  const hasClockOut = Boolean(entry.clock_out);
  const hasClockings = hasClockIn || hasClockOut;

  const notesLower = (entry.notes || "").toLowerCase();
  const isLeave =
    !hasClockings &&
    !options?.isHoliday &&
    (Boolean(entry.leave_type_id) ||
      notesLower.includes("leave") ||
      notesLower.includes("sick") ||
      notesLower.includes("annual") ||
      notesLower.includes("maternity") ||
      notesLower.includes("family responsibility") ||
      notesLower.includes("toil") ||
      notesLower.includes("time off in lieu"));

  const expectedFromSchedule = scheduleDay ? calculateScheduleDayHours(scheduleDay) : 0;

  if (isLeave) {
    const expectedHours =
      expectedFromSchedule > 0
        ? expectedFromSchedule
        : Number(entry.paid_hours ?? 0) > 0
          ? Number(entry.paid_hours)
          : getScheduleAverageDailyHours(scheduleDays, fallbackDaily);
    const customNotes = (entry.notes || "").trim();
    return {
      isCompliant: true,
      isLate: false,
      isEarly: false,
      isMissing: false,
      isLeave: true,
      isScheduledWorkingDay,
      expectedHours,
      issues: [],
      dynamicNote: customNotes
        ? `${customNotes} (${expectedHours.toFixed(2)}h rule)`
        : `Authorized leave (${expectedHours.toFixed(2)}h rule)`,
      scheduleWindow:
        scheduleDay?.is_working_day && scheduleDay.start_time && scheduleDay.end_time
          ? `${formatHHMM(scheduleDay.start_time)}-${formatHHMM(scheduleDay.end_time)}`
          : null,
    };
  }

  if (options?.isHoliday && !hasClockings) {
    const expectedHours =
      expectedFromSchedule > 0
        ? expectedFromSchedule
        : getScheduleAverageDailyHours(scheduleDays, fallbackDaily);
    return {
      isCompliant: true,
      isLate: false,
      isEarly: false,
      isMissing: false,
      isLeave: false,
      isScheduledWorkingDay,
      expectedHours,
      issues: [],
      dynamicNote: options.holidayName
        ? `Public Holiday: ${options.holidayName}`
        : (entry.notes || "Public Holiday"),
      scheduleWindow: null,
    };
  }

  const extraWarnings = stripStalePunctualityWarnings(entry.warning_notes);
  const cleanUserNotes = stripStalePunctualityWarnings(entry.notes);

  const isMissing =
    hasClockIn !== hasClockOut ||
    (!hasClockings && Boolean(entry.missing_clocking));

  let isLate = false;
  let isEarly = false;
  let scheduleWindow: string | null = null;
  let expectedHours = expectedFromSchedule;
  const issues: string[] = [];

  if (isMissing) {
    issues.push(
      hasClockIn && !hasClockOut
        ? "Missing clock-out"
        : !hasClockIn && hasClockOut
          ? "Missing clock-in"
          : "Missing clock event",
    );
  }

  if (scheduleDay && scheduleDay.is_working_day && scheduleDay.start_time && scheduleDay.end_time) {
    scheduleWindow = `${formatHHMM(scheduleDay.start_time)}-${formatHHMM(scheduleDay.end_time)}`;
    const schedStart = parseTimeToMinutes(scheduleDay.start_time);
    const schedEndRaw = parseTimeToMinutes(scheduleDay.end_time);
    const inMinsRaw = parseTimeToMinutes(entry.clock_in);
    const outMinsRaw = parseTimeToMinutes(entry.clock_out);

    if (schedStart != null && schedEndRaw != null) {
      const isOvernightRule = schedEndRaw <= schedStart;
      const schedEnd = isOvernightRule ? schedEndRaw + 1440 : schedEndRaw;

      if (inMinsRaw != null) {
        const inMins =
          isOvernightRule && inMinsRaw < schedStart - 360 ? inMinsRaw + 1440 : inMinsRaw;
        if (inMins > schedStart + graceMinutes) {
          isLate = true;
          issues.push(
            `Late arrival (in ${formatHHMM(entry.clock_in)} vs ${formatHHMM(scheduleDay.start_time)})`,
          );
        }
      }

      if (outMinsRaw != null) {
        const outMins =
          outMinsRaw < (inMinsRaw ?? schedStart) ? outMinsRaw + 1440 : outMinsRaw;
        if (outMins < schedEnd) {
          isEarly = true;
          issues.push(
            `Early departure (out ${formatHHMM(entry.clock_out)} vs ${formatHHMM(scheduleDay.end_time)})`,
          );
        }
      }
    }
  } else if (scheduleDay && !scheduleDay.is_working_day) {
    // Clocking on an off-schedule day (e.g. voluntary/OT weekend) is never flagged late/early
    isLate = false;
    isEarly = false;
    expectedHours = 0;
  } else {
    // No schedule rule available — fall back to stored flags
    expectedHours = fallbackDaily;
    if (entry.late_arrival) {
      isLate = true;
      issues.push("Late arrival");
    }
    if (entry.early_departure) {
      isEarly = true;
      issues.push("Early departure");
    }
  }

  if (extraWarnings.length > 0) {
    issues.push(...extraWarnings);
  }

  const isCompliant = issues.length === 0;
  const noteSegments: string[] = [];

  if (issues.length > 0) {
    noteSegments.push(...issues);
  } else if (scheduleWindow) {
    noteSegments.push(`On time & compliant (${scheduleWindow})`);
  } else if (scheduleDay && !scheduleDay.is_working_day && hasClockings) {
    noteSegments.push("Unscheduled / Overtime shift");
  } else if (hasClockings) {
    noteSegments.push("Clocked & compliant");
  }

  for (const notePart of cleanUserNotes) {
    if (!noteSegments.some((seg) => seg.toLowerCase().includes(notePart.toLowerCase()))) {
      noteSegments.push(notePart);
    }
  }

  return {
    isCompliant,
    isLate,
    isEarly,
    isMissing,
    isLeave: false,
    isScheduledWorkingDay,
    expectedHours,
    issues,
    dynamicNote: noteSegments.join(" · ") || "--",
    scheduleWindow,
  };
}
