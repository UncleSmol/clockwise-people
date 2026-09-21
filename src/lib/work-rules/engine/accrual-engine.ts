import type {
  AuditDerivation,
  CompanyLeaveYearConfig,
  ConfigurableLeaveRule,
  EntitlementUnitType,
  ProrationModeType,
  RoundingPrecisionType,
  WorkingScheduleConfig,
} from "./schema-ledger";
import { calculateScheduledHoursForPeriod } from "./schedule-calculator";

export type AccrualEvaluationInput = {
  employee: {
    id: string;
    full_name: string;
    start_date: string; // YYYY-MM-DD
    end_date?: string | null; // YYYY-MM-DD if terminated
  };
  schedule: WorkingScheduleConfig;
  rule: ConfigurableLeaveRule;
  leaveYearConfig: CompanyLeaveYearConfig;
  targetDate: string; // YYYY-MM-DD (Date for which accrual is being evaluated)
  qualifyingHoursWorked?: number; // Used for Method D (Hours-based divisor)
};

export type AccrualEvaluationResult = {
  accruedAmount: number;
  unit: EntitlementUnitType;
  hoursEquivalent: number;
  auditDerivation: AuditDerivation;
};

/**
 * Helper to apply configured rounding precision to a numerical value.
 */
export function roundAccrualValue(val: number, precision: RoundingPrecisionType): number {
  if (isNaN(val)) return 0;
  const step = parseFloat(precision);
  if (isNaN(step) || step <= 0) return Number(val.toFixed(2));
  return Number((Math.round(val / step) * step).toFixed(2));
}

/**
 * Resolves the start and end dates of the leave year for a target date.
 */
export function resolveLeaveYearPeriod(
  targetDateStr: string,
  leaveYearConfig: CompanyLeaveYearConfig
): { yearStart: string; yearEnd: string } {
  const targetDate = new Date(targetDateStr);
  const targetYear = targetDate.getFullYear();

  const startMonth = leaveYearConfig.start_month - 1; // 0-indexed
  const startDay = leaveYearConfig.start_day;

  let yearStart = new Date(targetYear, startMonth, startDay);
  if (targetDate < yearStart) {
    yearStart = new Date(targetYear - 1, startMonth, startDay);
  }

  const yearEnd = new Date(yearStart.getFullYear() + 1, startMonth, startDay - 1);

  const formatStr = (d: Date) => d.toISOString().split("T")[0];
  return {
    yearStart: formatStr(yearStart),
    yearEnd: formatStr(yearEnd),
  };
}

/**
 * Evaluates leave accrual deterministically using configured rules, schedules, and service dates.
 */
export function evaluateLeaveAccrual(input: AccrualEvaluationInput): AccrualEvaluationResult {
  const { employee, schedule, rule, leaveYearConfig, targetDate, qualifyingHoursWorked = 0 } = input;

  const { yearStart, yearEnd } = resolveLeaveYearPeriod(targetDate, leaveYearConfig);

  // Determine active service window within the leave year
  const empStart = employee.start_date > yearStart ? employee.start_date : yearStart;
  const empEnd = employee.end_date && employee.end_date < yearEnd ? employee.end_date : yearEnd;

  const leaveYearDays = Math.max(
    1,
    Math.round((new Date(yearEnd).getTime() - new Date(yearStart).getTime()) / (1000 * 3600 * 24)) + 1
  );

  const serviceDays = Math.max(
    0,
    Math.round((new Date(empEnd).getTime() - new Date(empStart).getTime()) / (1000 * 3600 * 24)) + 1
  );

  // Compute scheduled working metrics from employee's actual schedule
  const fullYearScheduled = calculateScheduledHoursForPeriod(schedule, yearStart, yearEnd);
  const serviceScheduled = calculateScheduledHoursForPeriod(schedule, empStart, empEnd);

  let rawAmount = 0;
  let prorationFactor = 1.0;
  let formulaExplanation = "";

  // Evaluate based on configured Accrual Method
  if (rule.accrual_method === "annual_upfront") {
    // Method A: Entire annual entitlement upfront
    if (rule.proration_enabled && serviceDays < leaveYearDays) {
      prorationFactor = Number((serviceDays / leaveYearDays).toFixed(4));
      rawAmount = rule.entitlement_amount * prorationFactor;
      formulaExplanation = `Method A (Annual Upfront Prorated): Configured Entitlement (${rule.entitlement_amount} ${rule.entitlement_unit}) × Service Days Ratio (${serviceDays} / ${leaveYearDays} days) = ${rawAmount.toFixed(4)}`;
    } else {
      rawAmount = rule.entitlement_amount;
      formulaExplanation = `Method A (Annual Upfront): Configured Full Entitlement (${rule.entitlement_amount} ${rule.entitlement_unit})`;
    }
  } else if (rule.accrual_method === "monthly") {
    // Method B: Monthly Accrual
    const monthlyBase = rule.entitlement_amount / 12;
    if (rule.proration_enabled && serviceDays < leaveYearDays) {
      prorationFactor = Number((serviceDays / leaveYearDays).toFixed(4));
      rawAmount = monthlyBase * prorationFactor;
      formulaExplanation = `Method B (Monthly Accrual Prorated): (Annual Entitlement ${rule.entitlement_amount} ÷ 12 = ${monthlyBase.toFixed(4)} ${rule.entitlement_unit}/mo) × Service Proration (${serviceDays}/${leaveYearDays} days) = ${rawAmount.toFixed(4)}`;
    } else {
      rawAmount = monthlyBase;
      formulaExplanation = `Method B (Monthly Accrual): Annual Entitlement (${rule.entitlement_amount} ${rule.entitlement_unit}) ÷ 12 months = ${monthlyBase.toFixed(4)} ${rule.entitlement_unit}/month`;
    }
  } else if (rule.accrual_method === "service_prorated") {
    // Method C: Pro-rata based on service period within leave year
    if (rule.proration_mode === "calendar_days") {
      prorationFactor = Number((serviceDays / leaveYearDays).toFixed(4));
      formulaExplanation = `Method C (Pro-Rata Calendar Days): ${rule.entitlement_amount} ${rule.entitlement_unit} × (${serviceDays} service days / ${leaveYearDays} year days)`;
    } else if (rule.proration_mode === "scheduled_working_days") {
      const fullDays = Math.max(1, fullYearScheduled.totalWorkingDays);
      const servDays = serviceScheduled.totalWorkingDays;
      prorationFactor = Number((servDays / fullDays).toFixed(4));
      formulaExplanation = `Method C (Pro-Rata Scheduled Working Days): ${rule.entitlement_amount} ${rule.entitlement_unit} × (${servDays} scheduled work days / ${fullDays} year work days)`;
    } else if (rule.proration_mode === "scheduled_working_hours") {
      const fullHours = Math.max(1, fullYearScheduled.totalScheduledHours);
      const servHours = serviceScheduled.totalScheduledHours;
      prorationFactor = Number((servHours / fullHours).toFixed(4));
      formulaExplanation = `Method C (Pro-Rata Scheduled Working Hours): ${rule.entitlement_amount} ${rule.entitlement_unit} × (${servHours} scheduled hours / ${fullHours} year scheduled hours)`;
    } else {
      // Completed months default
      const compMonths = Math.floor(serviceDays / 30);
      prorationFactor = Number((compMonths / 12).toFixed(4));
      formulaExplanation = `Method C (Pro-Rata Completed Months): ${rule.entitlement_amount} ${rule.entitlement_unit} × (${compMonths} completed months / 12 months)`;
    }

    rawAmount = rule.entitlement_amount * prorationFactor;
  } else if (rule.accrual_method === "hours_worked_divisor") {
    // Method D: Hours-based accrual (qualifying hours worked / divisor)
    const divisor = rule.hours_divisor || 20;
    rawAmount = qualifyingHoursWorked / divisor;
    prorationFactor = 1.0;
    formulaExplanation = `Method D (Hours-Worked Divisor): Qualifying Hours Worked (${qualifyingHoursWorked}h) ÷ Divisor (${divisor}) = ${rawAmount.toFixed(4)} ${rule.entitlement_unit}`;
  }

  // Apply configured rounding precision
  const roundedAmount = roundAccrualValue(rawAmount, rule.rounding_precision);

  // Compute exact hours equivalent based on employee's working schedule
  // Average daily scheduled hours = fullYearScheduled.totalScheduledHours / fullYearScheduled.totalWorkingDays
  const avgDailyHours = fullYearScheduled.totalWorkingDays > 0
    ? fullYearScheduled.totalScheduledHours / fullYearScheduled.totalWorkingDays
    : (schedule.standard_daily_hours || 8);

  const hoursEquivalent = rule.entitlement_unit === "days"
    ? Number((roundedAmount * avgDailyHours).toFixed(2))
    : roundedAmount;

  const auditDerivation: AuditDerivation = {
    rule_name: rule.name,
    accrual_method: rule.accrual_method,
    entitlement_unit: rule.entitlement_unit,
    configured_entitlement: rule.entitlement_amount,
    leave_year_period: `${yearStart} to ${yearEnd}`,
    service_period: `${empStart} to ${empEnd}`,
    scheduled_hours_in_period: serviceScheduled.totalScheduledHours,
    qualifying_hours_worked: qualifyingHoursWorked,
    proration_factor: prorationFactor,
    raw_calculated_amount: Number(rawAmount.toFixed(4)),
    rounded_amount: roundedAmount,
    derivation_formula: `${formulaExplanation} ➜ Rounded (${rule.rounding_precision}): ${roundedAmount} ${rule.entitlement_unit} (${hoursEquivalent}h eq at ${avgDailyHours.toFixed(2)}h/day avg).`,
  };

  return {
    accruedAmount: roundedAmount,
    unit: rule.entitlement_unit,
    hoursEquivalent,
    auditDerivation,
  };
}
