export type PayrollFrequency = "weekly" | "bi_weekly" | "semi_monthly" | "monthly";

export type PayrollPeriodConfig = {
  frequency: PayrollFrequency;
  anchorDate: string; // YYYY-MM-DD
  startDayOfMonth?: number; // e.g. 1 or 26 for monthly
  startDayOfWeek?: number; // 0 for Sun, 1 for Mon
  payDayOffsetDays?: number; // Days after period end when payroll is disbursed
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
};

export const defaultPayrollConfig: PayrollPeriodConfig = {
  frequency: "monthly",
  anchorDate: "2026-01-01",
  startDayOfMonth: 1,
  startDayOfWeek: 1,
  payDayOffsetDays: 3,
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

export function generatePayrollPeriods(
  config: PayrollPeriodConfig = defaultPayrollConfig,
  currentDateStr: string = formatIso(new Date()),
  count: number = 12,
): PayrollPeriod[] {
  const periods: PayrollPeriod[] = [];
  const currentDate = parseIso(currentDateStr);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  if (config.frequency === "monthly") {
    const startDay = Math.min(28, Math.max(1, config.startDayOfMonth ?? 1));

    // Generate monthly periods covering past 6 months to next 6 months
    for (let offset = -6; offset <= 5; offset++) {
      let periodStart: Date;
      let periodEnd: Date;

      if (startDay === 1) {
        periodStart = new Date(currentYear, currentMonth + offset, 1);
        periodEnd = new Date(currentYear, currentMonth + offset + 1, 0); // Last day of month
      } else {
        periodStart = new Date(currentYear, currentMonth + offset - 1, startDay);
        periodEnd = new Date(currentYear, currentMonth + offset, startDay - 1);
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
      });
    }
  } else if (config.frequency === "bi_weekly") {
    // 14-day cycle anchored to anchorDate
    const anchor = parseIso(config.anchorDate || "2026-01-01");
    const diffDays = Math.floor((currentDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const cycleLength = 14;
    const currentCycleIndex = Math.floor(diffDays / cycleLength);

    for (let i = currentCycleIndex - 6; i <= currentCycleIndex + 5; i++) {
      const pStart = addDays(anchor, i * cycleLength);
      const pEnd = addDays(pStart, cycleLength - 1);
      const startIso = formatIso(pStart);
      const endIso = formatIso(pEnd);
      const payDate = formatIso(addDays(pEnd, config.payDayOffsetDays ?? 3));

      periods.push({
        id: `bw-${startIso}-${endIso}`,
        label: `Bi-Weekly (${formatPeriodDate(startIso)} - ${formatPeriodDate(endIso)})`,
        startDate: startIso,
        endDate: endIso,
        payDate,
        isCurrent: currentDateStr >= startIso && currentDateStr <= endIso,
        isClosed: currentDateStr > endIso,
        frequency: "bi_weekly",
      });
    }
  } else {
    // Weekly cycle (7 days)
    const anchor = parseIso(config.anchorDate || "2026-01-05");
    const diffDays = Math.floor((currentDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const cycleLength = 7;
    const currentCycleIndex = Math.floor(diffDays / cycleLength);

    for (let i = currentCycleIndex - 8; i <= currentCycleIndex + 4; i++) {
      const pStart = addDays(anchor, i * cycleLength);
      const pEnd = addDays(pStart, cycleLength - 1);
      const startIso = formatIso(pStart);
      const endIso = formatIso(pEnd);
      const payDate = formatIso(addDays(pEnd, config.payDayOffsetDays ?? 3));

      periods.push({
        id: `w-${startIso}-${endIso}`,
        label: `Week (${formatPeriodDate(startIso)} - ${formatPeriodDate(endIso)})`,
        startDate: startIso,
        endDate: endIso,
        payDate,
        isCurrent: currentDateStr >= startIso && currentDateStr <= endIso,
        isClosed: currentDateStr > endIso,
        frequency: "weekly",
      });
    }
  }

  // Sort descending by startDate so recent periods appear first
  periods.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return periods.slice(0, count);
}
