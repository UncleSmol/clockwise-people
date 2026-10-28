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
    // Method D: Hours-based accrual (qualifying hours worked / divisor; South Africa BCEA Sec 20 default is 17)
    const divisor = rule.hours_divisor || 17;
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

export type SimpleLeaveAccrualInput = {
  shiftsWorked: number;
  hoursWorked: number;
  overtimeHours: number;
  leaveType: {
    id?: string;
    name: string;
    category: string;
    accrual_rules?: Record<string, unknown> | null;
  };
  monthsEmployed: number;
  standardDailyHours?: number;
  workingDaysPerWeek?: number;
  standardAnnualHours?: number;
  toilMultiplier?: number;
  toilEnabled?: boolean;
};

export type SimpleLeaveAccrualResult = {
  accruedHours: number;
  accruedDays: number;
  explanation: string;
};

/**
 * Clean, statutory & company-configured deterministic leave accrual engine.
 * 
 * Rules:
 * 1. Annual Leave (BCEA Section 20):
 *    - Standard setup: 1.75 days per 17 days worked (or 1h per 17h worked).
 *    - Working 17 shifts (or 136h) yields 1.75 days (14h at 8h/day).
 *    - Pro-rated against configured yearly entitlement hours (e.g. 17 days = 136h, 21 days = 168h, 15 days = 120h).
 *    - Strictly 0 if 0 shifts or 0 hours worked.
 * 
 * 2. Overtime TOIL (BCEA Section 10(3)(b)):
 *    - Accrues at configured multiplier (default 1.5x) of approved overtime hours worked.
 * 
 * 3. Sick Leave (BCEA Section 22):
 *    - 1 day per 26 days worked, pro-rated up to annual entitlement (e.g. 80h / 10 days).
 * 
 * 4. Family Responsibility Leave (BCEA Section 27):
 *    - 3 days (24h) statutory entitlement for employees with >= 4 months of service who have worked >= 16 shifts.
 */
/**
 * Evaluates dynamic leave accrual conforming to South African BCEA statutory requirements
 * and company/employee work rules:
 * 
 * 1. Annual Leave (BCEA Section 20):
 *    - Entitlement is based on work rule assigned (typically 15, 17, or 21 days/year).
 *    - 15 working days = statutory BCEA minimum for 5-day week (equivalent to 21 consecutive days).
 *    - 17 working days = industry standard benchmark (~1.42 days/mo).
 *    - 21 working days = standard professional 4-week benchmark (1.75 days/mo).
 *    - Days needed to accrue 1 day of leave = annualWorkingDays / entitlementDays (e.g. 260/15 = 17.33 shifts, 260/17 = 15.29 shifts, 260/21 = 12.38 shifts).
 *    - Statutory floor: 1 hour per 17 hours worked (BCEA Section 20(2)(c)) OR 1 day per 17 days worked (BCEA Section 20(2)(b)).
 *    - No employee is robbed of their hours: max(shiftAccrual, hoursAccrual, bceaFloor).
 * 
 * 2. Overtime TOIL (BCEA Section 10(3)(b)):
 *    - Accrues at configured multiplier (default 1.5x) of approved overtime hours worked.
 * 
 * 3. Sick Leave (BCEA Section 22):
 *    - 1 day per 26 days worked, pro-rated up to annual entitlement (e.g. 80h / 10 days for 5-day week).
 * 
 * 4. Family Responsibility Leave (BCEA Section 27):
 *    - 3 days (24h) statutory entitlement for employees with >= 4 months of service who have worked >= 16 shifts.
 */
export function calculateSimpleLeaveAccrual(input: SimpleLeaveAccrualInput): SimpleLeaveAccrualResult {
  const {
    shiftsWorked,
    hoursWorked,
    overtimeHours,
    leaveType,
    monthsEmployed,
    standardDailyHours = 8,
    workingDaysPerWeek = 5,
    standardAnnualHours,
    toilMultiplier = 1.5,
    toilEnabled = true,
  } = input;

  const category = (leaveType.category || "").toLowerCase();
  const yearlyHours = Number(leaveType.accrual_rules?.yearly_hours ?? 0);
  
  // Resolve entitlement days from work rule / leave type configuration
  const rawEntitlementDays = Number(
    leaveType.accrual_rules?.entitlement_days ??
    leaveType.accrual_rules?.entitlement_amount ??
    leaveType.accrual_rules?.yearly_days ??
    (yearlyHours > 0 && yearlyHours <= 40 ? yearlyHours : 0)
  );

  const entitlementDays = rawEntitlementDays > 0
    ? rawEntitlementDays
    : yearlyHours > 0
      ? Number((yearlyHours / standardDailyHours).toFixed(2))
      : (category === "annual" ? 15.0 : category === "sick" ? 10.0 : category === "family_responsibility" ? 3.0 : 0);

  const daysPerWeek = Math.max(1, Math.min(7, Number(workingDaysPerWeek || 5)));
  const annualWorkingDays = Math.max(1, Math.round(daysPerWeek * 52)); // e.g. 5 * 52 = 260 days, 6 * 52 = 312 days
  const annualWorkingHours = standardAnnualHours && standardAnnualHours > 0
    ? standardAnnualHours
    : annualWorkingDays * standardDailyHours; // e.g. 260 * 8 = 2080h

  let accruedHours = 0;
  let explanation = "";

  if (shiftsWorked === 0 || hoursWorked <= 0) {
    return {
      accruedHours: 0,
      accruedDays: 0,
      explanation: "No recorded shifts or hours worked; statutory accrual is 0.00h.",
    };
  }

  if (category === "annual") {
    const annualCapHours = Number(
      leaveType.accrual_rules?.annual_cap_hours ??
      leaveType.accrual_rules?.cap_hours ??
      0
    );

    // 1. Shift-based accrual according to employee's assigned work rule & entitlement (15, 17, 21 days)
    // Days needed to accumulate 1 day of leave:
    const daysNeededPerDay = Number((annualWorkingDays / Math.max(1, entitlementDays)).toFixed(2));
    const shiftAccrual = Number(((shiftsWorked * (entitlementDays * standardDailyHours)) / annualWorkingDays).toFixed(2));

    // 2. Hours-based accrual according to work rule
    const hoursAccrual = Number(((hoursWorked * (entitlementDays * standardDailyHours)) / annualWorkingHours).toFixed(2));

    // 3. Statutory BCEA Section 20 floor: 1 hour per 17 hours worked (or 1 day per 17 days worked)
    const bceaHoursFloor = Number((hoursWorked / 17.0).toFixed(2));
    const bceaShiftsFloor = Number(((shiftsWorked / 17.0) * standardDailyHours).toFixed(2));
    const bceaFloor = Math.max(bceaHoursFloor, bceaShiftsFloor);

    // Accrued hours is the highest of work rule pro-rata or statutory BCEA floor
    accruedHours = Math.max(shiftAccrual, hoursAccrual, bceaFloor);
    const days = Number((accruedHours / standardDailyHours).toFixed(2));
    const capNote = annualCapHours > 0 ? ` [Capped at ${annualCapHours}h, accrues on hours worked once depleted]` : "";
    explanation = `${shiftsWorked} shifts (${hoursWorked.toFixed(1)}h worked, ${standardDailyHours}h/day schedule) → ${accruedHours.toFixed(2)}h (${days.toFixed(1)} days) accrued based on ${entitlementDays}d entitlement (${daysNeededPerDay} shifts to accrue 1 day, BCEA 1:17 floor protected)${capNote}.`;
  } else if (category === "toil_taken" || leaveType.name.toLowerCase().includes("toil")) {
    if (toilEnabled && overtimeHours > 0) {
      accruedHours = Number((overtimeHours * toilMultiplier).toFixed(2));
      const days = Number((accruedHours / standardDailyHours).toFixed(2));
      explanation = `${overtimeHours.toFixed(2)}h overtime worked × ${toilMultiplier.toFixed(2)}× rate = ${accruedHours.toFixed(2)}h (${days.toFixed(1)} days) TOIL accrued.`;
    } else {
      accruedHours = 0;
      explanation = toilEnabled ? "0 overtime hours worked." : "TOIL engine is disabled.";
    }
  } else if (category === "sick") {
    const sickDays = entitlementDays > 0 ? entitlementDays : 10;
    const cap = yearlyHours > 0 ? yearlyHours : Number((sickDays * standardDailyHours).toFixed(2));
    const shiftSick = Number(((shiftsWorked / 26.0) * standardDailyHours).toFixed(2));
    const hoursSick = Number((hoursWorked / 26.0).toFixed(2));
    const proRataSick = Number(((cap * hoursWorked) / annualWorkingHours).toFixed(2));
    accruedHours = Math.min(cap, Math.max(shiftSick, hoursSick, proRataSick));
    const days = Number((accruedHours / standardDailyHours).toFixed(2));
    explanation = `${shiftsWorked} shifts worked → ${accruedHours.toFixed(2)}h (${days.toFixed(1)} days) sick leave accrued (BCEA Section 22 1:26 rate, capped at ${cap}h/yr).`;
  } else if (category === "family_responsibility" || category === "frl") {
    if (monthsEmployed >= 4 && shiftsWorked >= 16) {
      const frlDays = entitlementDays > 0 ? entitlementDays : 3;
      accruedHours = yearlyHours > 0 ? yearlyHours : Number((frlDays * standardDailyHours).toFixed(2));
      const days = Number((accruedHours / standardDailyHours).toFixed(2));
      explanation = `Qualified (employed ${monthsEmployed.toFixed(1)} months >= 4m & ${shiftsWorked} shifts >= 16): ${accruedHours.toFixed(2)}h (${days.toFixed(1)} days) Family Responsibility Leave.`;
    } else {
      accruedHours = 0;
      explanation = `Requires at least 4 months of service and 16 shifts (currently ${monthsEmployed.toFixed(1)}m, ${shiftsWorked} shifts).`;
    }
  } else {
    accruedHours = 0;
    explanation = `Leave category "${category}" does not accrue automatically.`;
  }

  const accruedDays = Number((accruedHours / standardDailyHours).toFixed(2));

  return {
    accruedHours,
    accruedDays,
    explanation,
  };
}

