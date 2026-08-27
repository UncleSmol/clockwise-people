export type PayrollFrequency = "weekly" | "bi_weekly" | "semi_monthly" | "monthly" | "custom";

export type PayrollPeriodConfig = {
  id?: string;
  name?: string;
  frequency: PayrollFrequency;
  startDate?: string; // YYYY-MM-DD: Start date of the initial / baseline payroll period
  endDate?: string; // YYYY-MM-DD: End date of the initial / baseline payroll period
  anchorDate?: string; // YYYY-MM-DD (legacy / alias for startDate)
  customCycleDays?: number; // For custom cycle lengths e.g. 10, 14, 21, 30 days
  startDayOfMonth?: number; // e.g. 1 or 26 for monthly
  endDayOfMonth?: number; // e.g. 31 or 25 for monthly
  startDayOfWeek?: number; // 0 for Sun, 1 for Mon
  payDayOffsetDays?: number; // Days after period end when payroll is disbursed
  description?: string;
  assignedEmployeeIds?: string[];
};

export type CustomPayrollRule = {
  id: string;
  name: string;
  frequency: PayrollFrequency;
  startDate: string; // YYYY-MM-DD: Start date of the payroll period
  endDate: string; // YYYY-MM-DD: End date of the payroll period before restarting
  anchorDate?: string; // YYYY-MM-DD
  customCycleDays?: number;
  startDayOfMonth?: number;
  endDayOfMonth?: number;
  startDayOfWeek?: number;
  payDayOffsetDays: number;
  description?: string;
  assignedEmployeeIds: string[];
};

export type PayrollPeriod = {
  id: string;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  payDate: string; // YYYY-MM-DD
  isCurrent: boolean;
  isClosed: boolean;
  frequency: PayrollFrequency;
  ruleName?: string;
};

export type EmployeePayrollAssignment = {
  employeeId: string;
  employeeName: string;
  employeeNumber?: string;
  department?: string;
  ruleId: string;
  ruleName: string;
};

export const defaultPayrollConfig: PayrollPeriodConfig = {
  id: "company-default",
  name: "Company Default Monthly (1st - End)",
  frequency: "monthly",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  anchorDate: "2026-01-01",
  startDayOfMonth: 1,
  endDayOfMonth: 31,
  startDayOfWeek: 1,
  payDayOffsetDays: 3,
  description: "Standard monthly calendar payroll cycle running from 1st to month-end, restarting on the 1st of every month.",
  assignedEmployeeIds: [],
};

function formatIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIso(isoStr: string): Date {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatPeriodDate(isoStr: string): string {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function calculatePeriodEndDate(
  startDateStr: string,
  frequency: PayrollFrequency,
  options?: {
    customCycleDays?: number;
    startDayOfMonth?: number;
    endDayOfMonth?: number;
  },
): string {
  const start = parseIso(startDateStr);
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();

  if (frequency === "monthly") {
    const startDay = options?.startDayOfMonth ?? d;
    const endDay = options?.endDayOfMonth ?? (startDay === 1 ? 31 : startDay - 1);
    if (startDay === 1 || endDay >= 28) {
      // Month-end of same month
      return formatIso(new Date(y, m + 1, 0));
    }
    // Crosses to next month
    const candidateEnd = new Date(y, m + 1, endDay);
    return formatIso(candidateEnd);
  }

  if (frequency === "semi_monthly") {
    if (d <= 15) {
      return formatIso(new Date(y, m, 15));
    }
    return formatIso(new Date(y, m + 1, 0));
  }

  if (frequency === "bi_weekly") {
    return formatIso(addDays(start, 13));
  }

  if (frequency === "weekly") {
    return formatIso(addDays(start, 6));
  }

  // Custom cycle
  const days = Math.max(1, options?.customCycleDays ?? 14);
  return formatIso(addDays(start, days - 1));
}

export function generatePayrollPeriods(
  config: PayrollPeriodConfig = defaultPayrollConfig,
  currentDateStr: string = formatIso(new Date()),
  count: number = 12,
): PayrollPeriod[] {
  const periods: PayrollPeriod[] = [];
  const currentDate = parseIso(currentDateStr);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const ruleName = config.name ?? "Standard Payroll";

  const baseStartDateStr = config.startDate || config.anchorDate || "2026-01-01";
  const baseStartDate = parseIso(baseStartDateStr);

  if (config.frequency === "monthly") {
    const startDay = Math.min(28, Math.max(1, config.startDayOfMonth ?? baseStartDate.getDate() ?? 1));
    const endDay = config.endDayOfMonth ?? (startDay === 1 ? 31 : startDay - 1);

    // Generate monthly periods covering past 6 months to next 5 months
    for (let offset = -6; offset <= 5; offset++) {
      let periodStart: Date;
      let periodEnd: Date;

      if (startDay === 1 || endDay >= 28) {
        periodStart = new Date(currentYear, currentMonth + offset, 1);
        periodEnd = new Date(currentYear, currentMonth + offset + 1, 0); // Last day of month
      } else {
        periodStart = new Date(currentYear, currentMonth + offset - 1, startDay);
        // Next period cutoff: day before startDay in the next month
        periodEnd = new Date(currentYear, currentMonth + offset, endDay);
      }

      const startIso = formatIso(periodStart);
      const endIso = formatIso(periodEnd);
      const payDate = formatIso(addDays(periodEnd, config.payDayOffsetDays ?? 3));
      const isCurrent = currentDateStr >= startIso && currentDateStr <= endIso;
      const isClosed = currentDateStr > endIso;

      periods.push({
        id: `m-${startIso}-${endIso}`,
        label: `${formatPeriodDate(startIso)} - ${formatPeriodDate(endIso)} (${new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" }).format(periodStart)})`,
        startDate: startIso,
        endDate: endIso,
        payDate,
        isCurrent,
        isClosed,
        frequency: "monthly",
        ruleName,
      });
    }
  } else if (config.frequency === "semi_monthly") {
    // 1st to 15th, and 16th to End of Month
    for (let offset = -4; offset <= 3; offset++) {
      const p1Start = new Date(currentYear, currentMonth + offset, 1);
      const p1End = new Date(currentYear, currentMonth + offset, 15);
      const p1StartIso = formatIso(p1Start);
      const p1EndIso = formatIso(p1End);
      const p1Pay = formatIso(addDays(p1End, config.payDayOffsetDays ?? 3));

      periods.push({
        id: `sm1-${p1StartIso}-${p1EndIso}`,
        label: `1st Half (${formatPeriodDate(p1StartIso)} - ${formatPeriodDate(p1EndIso)})`,
        startDate: p1StartIso,
        endDate: p1EndIso,
        payDate: p1Pay,
        isCurrent: currentDateStr >= p1StartIso && currentDateStr <= p1EndIso,
        isClosed: currentDateStr > p1EndIso,
        frequency: "semi_monthly",
        ruleName,
      });

      const p2Start = new Date(currentYear, currentMonth + offset, 16);
      const p2End = new Date(currentYear, currentMonth + offset + 1, 0);
      const p2StartIso = formatIso(p2Start);
      const p2EndIso = formatIso(p2End);
      const p2Pay = formatIso(addDays(p2End, config.payDayOffsetDays ?? 3));

      periods.push({
        id: `sm2-${p2StartIso}-${p2EndIso}`,
        label: `2nd Half (${formatPeriodDate(p2StartIso)} - ${formatPeriodDate(p2EndIso)})`,
        startDate: p2StartIso,
        endDate: p2EndIso,
        payDate: p2Pay,
        isCurrent: currentDateStr >= p2StartIso && currentDateStr <= p2EndIso,
        isClosed: currentDateStr > p2EndIso,
        frequency: "semi_monthly",
        ruleName,
      });
    }
  } else {
    // Bi-weekly (14d), Weekly (7d), or Custom cycle duration defined by start date and end date
    let cycleLength = 14;
    if (config.frequency === "weekly") {
      cycleLength = 7;
    } else if (config.frequency === "bi_weekly") {
      cycleLength = 14;
    } else if (config.startDate && config.endDate) {
      const s = parseIso(config.startDate);
      const e = parseIso(config.endDate);
      const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      cycleLength = diff > 0 ? diff : (config.customCycleDays ?? 14);
    } else {
      cycleLength = Math.max(1, config.customCycleDays ?? 14);
    }

    const anchor = baseStartDate;
    const diffDays = Math.floor((currentDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const currentCycleIndex = Math.floor(diffDays / cycleLength);

    for (let i = currentCycleIndex - 6; i <= currentCycleIndex + 5; i++) {
      const pStart = addDays(anchor, i * cycleLength);
      const pEnd = addDays(pStart, cycleLength - 1);
      const startIso = formatIso(pStart);
      const endIso = formatIso(pEnd);
      const payDate = formatIso(addDays(pEnd, config.payDayOffsetDays ?? 3));

      const freqPrefix = config.frequency === "weekly" ? "Week" : config.frequency === "bi_weekly" ? "Bi-Weekly" : config.name ?? "Custom";

      periods.push({
        id: `${config.frequency}-${startIso}-${endIso}`,
        label: `${freqPrefix} (${formatPeriodDate(startIso)} - ${formatPeriodDate(endIso)})`,
        startDate: startIso,
        endDate: endIso,
        payDate,
        isCurrent: currentDateStr >= startIso && currentDateStr <= endIso,
        isClosed: currentDateStr > endIso,
        frequency: config.frequency,
        ruleName,
      });
    }
  }

  // Sort descending by startDate so recent periods appear first
  periods.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return periods.slice(0, count);
}
