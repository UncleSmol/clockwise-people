/**
 * Real-time Leave Accrual Engine (Down to the Minute)
 * Conforming strictly to South African BCEA (Basic Conditions of Employment Act)
 * and company-configured work rules.
 */

/**
 * Derives gender from a 13-digit South African National ID Number.
 * Digits 7 through 10 (characters at index 6..10, 4 digits):
 * - 0000 - 4999: Female
 * - 5000 - 9999: Male
 */
export function deriveGenderFromSouthAfricanId(
  idNumber?: string | null,
): "male" | "female" | null {
  if (!idNumber) return null;
  const cleaned = idNumber.replace(/\D/g, "");
  if (cleaned.length === 13) {
    const genderPart = parseInt(cleaned.substring(6, 10), 10);
    if (!isNaN(genderPart)) {
      return genderPart >= 5000 ? "male" : "female";
    }
  }
  return null;
}

/**
 * Checks if a leave name or category is Maternal / Maternity Leave.
 */
export function isMaternalLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return c === "maternity" || n.includes("matern");
}

/**
 * Checks if a leave name or category is Paternal / Parental Leave.
 */
export function isPaternalLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return (
    c === "parental" ||
    c === "paternal" ||
    n.includes("patern") ||
    n.includes("parental")
  );
}

// Retain alias for backward compatibility
export const isParentalLeave = isPaternalLeave;

/**
 * Checks if a leave name or category is Unpaid Leave.
 */
export function isUnpaidLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return c === "unpaid" || n.includes("unpaid");
}

/**
 * Checks if a leave name or category represents a Public Holiday / Holiday entry
 * (which does not carry a leave balance).
 */
export function isHolidayLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return c === "holiday" || c === "public_holiday" || n.includes("holiday");
}

/**
 * Checks if a leave name or category represents TOIL (Time Off In Lieu).
 */
export function isToilLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return (
    c === "toil_taken" ||
    n.includes("toil") ||
    n.includes("time off in lieu") ||
    n.includes("overtime comp")
  );
}

/**
 * Checks if a leave name or category is Approved Day Off.
 * This leave type is strictly reserved for managers and admins.
 */
export function isApprovedDayOffLeave(
  name?: string | null,
  category?: string | null,
): boolean {
  const n = (name || "").toLowerCase().trim();
  const c = (category || "").toLowerCase().trim();
  return (
    c === "day_off" ||
    c === "approved_day_off" ||
    n === "approved day off" ||
    n.includes("approved day off") ||
    n.includes("day off")
  );
}

/**
 * Returns true when a leave type should have a tracked/visible balance row:
 * - Unpaid leave never carries a balance.
 * - Holiday / Public Holiday never carries a balance.
 * - TOIL carries a balance only when enabled in the company's rules.
 */
export function isBalanceEligibleLeaveType(
  name?: string | null,
  category?: string | null,
  toilEnabled?: boolean,
): boolean {
  if (isUnpaidLeave(name, category)) return false;
  if (isHolidayLeave(name, category)) return false;
  if (isApprovedDayOffLeave(name, category)) return false;
  if (!toilEnabled && isToilLeave(name, category)) return false;
  return true;
}

/**
 * Determines whether a leave type is visible/allowed based on employee gender:
 * - Male: Sees Paternal Leave, does NOT see Maternal Leave
 * - Female: Sees Maternal Leave, does NOT see Paternal Leave
 * - No gender (null / undefined / other): sees neither Maternal nor Paternal Leave
 */
export function isGenderAllowedForLeave(
  name?: string | null,
  category?: string | null,
  gender?: string | null,
): boolean {
  const g = (gender || "").trim().toLowerCase();
  if (isMaternalLeave(name, category)) {
    return g === "female";
  }
  if (isPaternalLeave(name, category)) {
    return g === "male";
  }
  return true;
}

/**
 * Normalizes a leave type name for grouping and deduplication.
 */
export function normalizeLeaveTypeName(
  name: string,
  category?: string,
): string {
  const lower = (name || "").trim().toLowerCase();
  const cat = (category || "").trim().toLowerCase();

  if (
    cat === "toil_taken" ||
    lower.includes("toil") ||
    lower.includes("time off in lieu") ||
    lower.includes("overtime comp")
  ) {
    return "toil";
  }
  if (cat === "annual" || lower.includes("annual")) {
    return "annual";
  }
  if (cat === "sick" || lower.includes("sick")) {
    return "sick";
  }
  if (
    lower.includes("patern") ||
    lower.includes("parental") ||
    cat === "parental" ||
    cat === "paternal"
  ) {
    return "paternal";
  }
  if (lower.includes("matern") || cat === "maternity") {
    return "maternity";
  }
  if (
    lower.includes("family responsibility") ||
    lower.includes("compassionate") ||
    lower === "frl" ||
    cat === "family_responsibility"
  ) {
    return "family_responsibility";
  }
  if (cat === "study" || lower.includes("study") || lower.includes("exam")) {
    return "study";
  }
  if (cat === "unpaid" || lower.includes("unpaid")) {
    return "unpaid";
  }
  if (
    cat === "holiday" ||
    cat === "public_holiday" ||
    lower.includes("holiday")
  ) {
    return "holiday";
  }
  return lower;
}

export type AccrualRateInfo = {
  category: string;
  leaveTypeName: string;
  minutesWorkedPerLeaveMinute: number;
  hoursWorkedPerLeaveHour: number;
  entitlementDays: number;
  entitlementHours: number;
  isDynamic: boolean;
};

export type LiveLeaveBalanceResult = {
  leaveTypeName: string;
  leaveCategory: string;
  baseBalanceHours: number;
  baseMinutes: number;
  liveWorkedMinutesToday: number;
  activeShiftAccruedMinutes: number;
  totalLiveMinutes: number;
  totalLiveHours: number;
  formattedTime: string; // e.g. "15h 24m"
  decimalHours: string; // e.g. "15.40h"
  minutesToNextAccrual: number; // e.g. 7 minutes until next minute of leave
  rateInfo: AccrualRateInfo;
};

export type ShiftTimeEntryInput = {
  work_date?: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  normal_hours?: number | null;
  paid_hours?: number | null;
  overtime_hours?: number | null;
};

export function parseTimeToDate(
  timeStr: string,
  baseDateStr?: string | null,
): Date {
  const [h = "0", m = "0", s = "0"] = timeStr.split(":");
  const d = new Date();
  if (baseDateStr) {
    const parts = baseDateStr.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      d.setFullYear(parts[0], parts[1] - 1, parts[2]);
    }
  }
  const sec = Math.floor(parseFloat(s) || 0);
  const ms = Math.floor(((parseFloat(s) || 0) % 1) * 1000);
  d.setHours(Number(h) || 0, Number(m) || 0, sec, ms);
  return d;
}

/**
 * Calculates net worked minutes from a live or historical shift entry.
 */
export function calculateNetWorkedMinutes(
  entry: ShiftTimeEntryInput | null | undefined,
  now: Date = new Date(),
): number {
  if (!entry?.clock_in) {
    const paid = Number(entry?.paid_hours ?? entry?.normal_hours ?? 0);
    return Math.max(0, Math.round(paid * 60));
  }

  const baseDate = entry.work_date || now.toISOString().slice(0, 10);
  const inDate = parseTimeToDate(entry.clock_in, baseDate);

  if (entry.clock_out) {
    const outDate = parseTimeToDate(entry.clock_out, baseDate);
    const grossMs = Math.max(0, outDate.getTime() - inDate.getTime());
    let lunchMs = 0;
    if (entry.lunch_start && entry.lunch_end) {
      const lunchStartDate = parseTimeToDate(entry.lunch_start, baseDate);
      const lunchEndDate = parseTimeToDate(entry.lunch_end, baseDate);
      lunchMs = Math.max(0, lunchEndDate.getTime() - lunchStartDate.getTime());
    }
    return Math.max(0, Math.floor((grossMs - lunchMs) / 60000));
  }

  // Active shift in progress
  let workedMs = 0;
  if (!entry.lunch_start) {
    workedMs = Math.max(0, now.getTime() - inDate.getTime());
  } else if (entry.lunch_start && !entry.lunch_end) {
    const lunchStartDate = parseTimeToDate(entry.lunch_start, baseDate);
    workedMs = Math.max(0, lunchStartDate.getTime() - inDate.getTime());
  } else if (entry.lunch_start && entry.lunch_end) {
    const lunchStartDate = parseTimeToDate(entry.lunch_start, baseDate);
    const lunchEndDate = parseTimeToDate(entry.lunch_end, baseDate);
    const beforeLunch = Math.max(
      0,
      lunchStartDate.getTime() - inDate.getTime(),
    );
    const afterLunch = Math.max(0, now.getTime() - lunchEndDate.getTime());
    workedMs = beforeLunch + afterLunch;
  }

  return Math.max(0, Math.floor(workedMs / 60000));
}

/**
 * Resolves the statutory & company accrual rate for a leave category.
 */
export function resolveLeaveAccrualRate(
  category: string = "annual",
  leaveTypeName: string = "Annual Leave",
  accrualRules?: Record<string, unknown> | null,
  standardAnnualHours: number = 2080,
  toilMultiplier: number = 1.5,
  employeeDailyHours: number = 8,
): AccrualRateInfo {
  const cat = (category || "").toLowerCase();
  const name = (leaveTypeName || "").toLowerCase();
  const rules = accrualRules ?? {};
  const safeDailyHours = employeeDailyHours > 0 ? employeeDailyHours : 8;
  const effectiveAnnualHours =
    standardAnnualHours === 2080 && safeDailyHours !== 8
      ? Number((safeDailyHours * 260).toFixed(2))
      : standardAnnualHours > 0
        ? standardAnnualHours
        : Number((safeDailyHours * 260).toFixed(2));

  if (cat === "annual" || name.includes("annual")) {
    const yearlyHours = Number(rules.yearly_hours ?? 0);
    const rawEntitlementDays = Number(
      rules.entitlement_days ??
        rules.yearly_days ??
        (yearlyHours > 0 && yearlyHours <= 40 ? yearlyHours : 0),
    );
    const entitlementDays =
      rawEntitlementDays > 0
        ? rawEntitlementDays
        : yearlyHours > 0
          ? Number((yearlyHours / 8).toFixed(2))
          : 15.0; // Statutory BCEA minimum for 5-day week
    const entitlementHours = Number(
      (entitlementDays * safeDailyHours).toFixed(2),
    );

    // Hours worked required to accumulate 1 hour of annual leave:
    // Statutory BCEA Section 20 floor is 1h per 17h worked.
    const ruleHoursPerLeaveHour =
      entitlementHours > 0
        ? Number((effectiveAnnualHours / entitlementHours).toFixed(2))
        : 17.0;
    const hoursWorkedPerLeaveHour = Math.min(17.0, ruleHoursPerLeaveHour);

    // 1 leave hour = 60 leave minutes, 1 work hour = 60 work minutes:
    // So 17 hours worked = 1 hour leave  ==>  17 minutes worked = 1 minute leave!
    const minutesWorkedPerLeaveMinute = hoursWorkedPerLeaveHour;

    return {
      category: "annual",
      leaveTypeName,
      minutesWorkedPerLeaveMinute,
      hoursWorkedPerLeaveHour,
      entitlementDays,
      entitlementHours,
      isDynamic: true,
    };
  }

  if (cat === "toil_taken" || name.includes("toil")) {
    const mult = Math.max(1.0, toilMultiplier || 1.5);
    // 1 overtime hour = mult hours TOIL  ==>  (60 / mult) minutes overtime = 1 minute TOIL
    const minutesWorkedPerLeaveMinute = Number((60 / (mult * 60)).toFixed(4));
    return {
      category: "toil_taken",
      leaveTypeName,
      minutesWorkedPerLeaveMinute,
      hoursWorkedPerLeaveHour: 1 / mult,
      entitlementDays: 0,
      entitlementHours: 0,
      isDynamic: true,
    };
  }

  if (cat === "sick" || name.includes("sick")) {
    // BCEA Section 22: 1 day per 26 days worked = 1h per 26h worked
    return {
      category: "sick",
      leaveTypeName,
      minutesWorkedPerLeaveMinute: 26.0,
      hoursWorkedPerLeaveHour: 26.0,
      entitlementDays: 10,
      entitlementHours: Number((10 * safeDailyHours).toFixed(2)),
      isDynamic: true,
    };
  }

  return {
    category: cat || "general",
    leaveTypeName,
    minutesWorkedPerLeaveMinute: 0,
    hoursWorkedPerLeaveHour: 0,
    entitlementDays: 0,
    entitlementHours: 0,
    isDynamic: false,
  };
}

/**
 * Calculates real-time leave balance down to the minute.
 */
export function calculateLiveLeaveBalance(options: {
  baseBalanceHours: number | string | null | undefined;
  leaveCategory?: string;
  leaveTypeName?: string;
  accrualRules?: Record<string, unknown> | null;
  activeShiftEntry?: ShiftTimeEntryInput | null;
  now?: Date;
  standardAnnualHours?: number;
  toilMultiplier?: number;
  employeeDailyHours?: number;
}): LiveLeaveBalanceResult {
  const {
    baseBalanceHours,
    leaveCategory = "annual",
    leaveTypeName = "Leave",
    accrualRules,
    activeShiftEntry,
    now = new Date(),
    standardAnnualHours = 2080,
    toilMultiplier = 1.5,
    employeeDailyHours = 8,
  } = options;

  const baseHours = Math.max(0, Number(baseBalanceHours ?? 0));
  const baseMinutes = Math.round(baseHours * 60);

  const rateInfo = resolveLeaveAccrualRate(
    leaveCategory,
    leaveTypeName,
    accrualRules,
    standardAnnualHours,
    toilMultiplier,
    employeeDailyHours,
  );

  let liveWorkedMinutesToday = 0;
  let activeShiftAccruedMinutes = 0;
  let minutesToNextAccrual = 0;

  if (
    rateInfo.isDynamic &&
    rateInfo.minutesWorkedPerLeaveMinute > 0 &&
    activeShiftEntry
  ) {
    liveWorkedMinutesToday = calculateNetWorkedMinutes(activeShiftEntry, now);

    // Accruals for dynamic categories based on worked minutes in active shift
    if (rateInfo.category === "annual") {
      activeShiftAccruedMinutes = Math.floor(
        liveWorkedMinutesToday / rateInfo.minutesWorkedPerLeaveMinute,
      );
      const remainderMinutes =
        liveWorkedMinutesToday % rateInfo.minutesWorkedPerLeaveMinute;
      minutesToNextAccrual = Math.ceil(
        rateInfo.minutesWorkedPerLeaveMinute - remainderMinutes,
      );
    } else if (rateInfo.category === "toil_taken") {
      const otHours = Number(activeShiftEntry.overtime_hours ?? 0);
      if (otHours > 0) {
        activeShiftAccruedMinutes = Math.floor(
          otHours * 60 * (toilMultiplier || 1.5),
        );
      }
    } else if (rateInfo.category === "sick") {
      activeShiftAccruedMinutes = Math.floor(
        liveWorkedMinutesToday / rateInfo.minutesWorkedPerLeaveMinute,
      );
      const remainderMinutes =
        liveWorkedMinutesToday % rateInfo.minutesWorkedPerLeaveMinute;
      minutesToNextAccrual = Math.ceil(
        rateInfo.minutesWorkedPerLeaveMinute - remainderMinutes,
      );
    }
  }

  const totalLiveMinutes = baseMinutes + activeShiftAccruedMinutes;
  const totalLiveHours = Number((totalLiveMinutes / 60).toFixed(2));

  const hours = Math.floor(totalLiveMinutes / 60);
  const minutes = totalLiveMinutes % 60;
  const formattedTime = `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  const decimalHours = `${totalLiveHours.toFixed(2)}h`;

  return {
    leaveTypeName,
    leaveCategory: rateInfo.category,
    baseBalanceHours: baseHours,
    baseMinutes,
    liveWorkedMinutesToday,
    activeShiftAccruedMinutes,
    totalLiveMinutes,
    totalLiveHours,
    formattedTime,
    decimalHours,
    minutesToNextAccrual,
    rateInfo,
  };
}
