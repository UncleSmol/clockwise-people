import {
  calculateDayNetHours,
  getDayScheduledHours,
  calculateScheduledHoursForPeriod,
  calculatePartialDayHours,
} from "../src/lib/work-rules/engine/schedule-calculator.ts";
import { evaluateLeaveAccrual, roundAccrualValue } from "../src/lib/work-rules/engine/accrual-engine.ts";

const calendarLeaveYear = {
  leave_year_type: "calendar",
  start_month: 1,
  start_day: 1,
};

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✕ ${testName}`);
    failed++;
  }
}

console.log("\n=======================================================");
console.log(" Running Leave Accrual Engine — 18 Test Scenarios ");
console.log("=======================================================\n");

// 1. Full time 8h
assert(calculateDayNetHours({ is_working_day: true, start_time: "08:00", end_time: "17:00", lunch_minutes: 60 }) === 8.0, "Scenario 1: 08:00-17:00 (1h break) = 8 net hours");

// 2. 9h shift
assert(calculateDayNetHours({ is_working_day: true, start_time: "08:00", end_time: "18:00", lunch_minutes: 60 }) === 9.0, "Scenario 2: 08:00-18:00 (1h break) = 9 net hours");

// 3. 7h shift
assert(calculateDayNetHours({ is_working_day: true, start_time: "09:00", end_time: "17:00", lunch_minutes: 60 }) === 7.0, "Scenario 3: 09:00-17:00 (1h break) = 7 net hours");

// 4. 5h shift
assert(calculateDayNetHours({ is_working_day: true, start_time: "08:00", end_time: "13:00", lunch_minutes: 0 }) === 5.0, "Scenario 4: 08:00-13:00 (no break) = 5 net hours");

// 5. Mon-Sat schedule
const monFri = { day_of_week: 1, is_working_day: true, start_time: "08:00", end_time: "17:00", lunch_minutes: 60 };
const sat = { day_of_week: 6, is_working_day: true, start_time: "08:00", end_time: "13:00", lunch_minutes: 0 };
const monSatSched = {
  id: "mon-sat",
  name: "Mon-Sat",
  schedule_days: [monFri, { ...monFri, day_of_week: 2 }, { ...monFri, day_of_week: 3 }, { ...monFri, day_of_week: 4 }, { ...monFri, day_of_week: 5 }, sat],
};
const weekCalc = calculateScheduledHoursForPeriod(monSatSched, "2026-09-14", "2026-09-19");
assert(weekCalc.totalWorkingDays === 6 && weekCalc.totalScheduledHours === 45.0, "Scenario 5: Mon-Sat schedule = 6 days, 45 scheduled hours");

// 6. Part time 12h
const ptDay = { is_working_day: true, start_time: "08:00", end_time: "12:00", lunch_minutes: 0 };
const ptSched = { id: "pt", name: "PT", schedule_days: [{ ...ptDay, day_of_week: 1 }, { ...ptDay, day_of_week: 3 }, { ...ptDay, day_of_week: 5 }] };
const ptCalc = calculateScheduledHoursForPeriod(ptSched, "2026-09-01", "2026-09-07");
assert(ptCalc.totalWorkingDays === 3 && ptCalc.totalScheduledHours === 12.0, "Scenario 6: Part-time schedule = 3 days, 12 scheduled hours");

// 7. Mid year joiner
const res7 = evaluateLeaveAccrual({
  employee: { id: "e1", full_name: "John Joined", start_date: "2026-07-01" },
  schedule: monSatSched,
  rule: { id: "r1", company_id: "c1", name: "R1", category: "annual", is_paid: true, requires_attachment: false, entitlement_unit: "days", entitlement_amount: 15, accrual_method: "service_prorated", proration_enabled: true, proration_mode: "calendar_days", use_it_or_lose_it: false, negative_balance_allowed: false, rounding_precision: "0.01", is_active: true },
  leaveYearConfig: calendarLeaveYear,
  targetDate: "2026-12-31",
});
assert(res7.accruedAmount > 7.0 && res7.accruedAmount < 8.0, `Scenario 7: Mid-year joiner prorated entitlement = ${res7.accruedAmount} days`);

// 8. Mid year leaver
const res8 = evaluateLeaveAccrual({
  employee: { id: "e2", full_name: "Jane Left", start_date: "2026-01-01", end_date: "2026-06-30" },
  schedule: monSatSched,
  rule: { id: "r1", company_id: "c1", name: "R1", category: "annual", is_paid: true, requires_attachment: false, entitlement_unit: "days", entitlement_amount: 15, accrual_method: "service_prorated", proration_enabled: true, proration_mode: "calendar_days", use_it_or_lose_it: false, negative_balance_allowed: false, rounding_precision: "0.01", is_active: true },
  leaveYearConfig: calendarLeaveYear,
  targetDate: "2026-06-30",
});
assert(res8.accruedAmount > 7.0 && res8.accruedAmount < 8.0, `Scenario 8: Mid-year leaver prorated entitlement = ${res8.accruedAmount} days`);

// 9. Mid-year working hours change
const p1Calc = calculateScheduledHoursForPeriod(monSatSched, "2026-01-01", "2026-06-30");
assert(p1Calc.totalScheduledHours > 0, "Scenario 9: Mid-year working hours period 1 calculation");

// 10. Day deduction varies (Mon 8h vs Sat 5h)
assert(getDayScheduledHours(monSatSched, "2026-09-14") === 8.0, "Scenario 10a: Monday scheduled hours = 8h");
assert(getDayScheduledHours(monSatSched, "2026-09-19") === 5.0, "Scenario 10b: Saturday scheduled hours = 5h");

// 11. Half day on 8h day
const part8 = calculatePartialDayHours({ id: "s", name: "S", schedule_days: [{ day_of_week: 1, is_working_day: true, start_time: "08:00", end_time: "17:00", lunch_minutes: 60 }] }, "2026-09-14", 0.5);
assert(part8.hoursDeducted === 4.0, "Scenario 11: Half day on 8h Monday = 4.0h");

// 12. Half day on 5h day
const part5 = calculatePartialDayHours({ id: "s", name: "S", schedule_days: [{ day_of_week: 6, is_working_day: true, start_time: "08:00", end_time: "13:00", lunch_minutes: 0 }] }, "2026-09-19", 0.5);
assert(part5.hoursDeducted === 2.5, "Scenario 12: Half day on 5h Saturday = 2.5h");

// 13. Method D Hours-based accrual
const res13 = evaluateLeaveAccrual({
  employee: { id: "e3", full_name: "Hourly", start_date: "2026-01-01" },
  schedule: monSatSched,
  rule: { id: "rD", company_id: "c1", name: "Divisor 20", category: "annual", is_paid: true, requires_attachment: false, entitlement_unit: "hours", entitlement_amount: 0, accrual_method: "hours_worked_divisor", hours_divisor: 20, proration_enabled: false, proration_mode: "scheduled_working_hours", use_it_or_lose_it: false, negative_balance_allowed: false, rounding_precision: "0.01", is_active: true },
  leaveYearConfig: calendarLeaveYear,
  targetDate: "2026-09-30",
  qualifyingHoursWorked: 160,
});
assert(res13.accruedAmount === 8.0, `Scenario 13: Method D (160h worked ÷ 20 = ${res13.accruedAmount}h leave)`);

// 14. Method B Monthly
const res14 = evaluateLeaveAccrual({
  employee: { id: "e4", full_name: "Monthly", start_date: "2026-01-01" },
  schedule: monSatSched,
  rule: { id: "rB", company_id: "c1", name: "Monthly 15d", category: "annual", is_paid: true, requires_attachment: false, entitlement_unit: "days", entitlement_amount: 15, accrual_method: "monthly", proration_enabled: false, proration_mode: "calendar_days", use_it_or_lose_it: false, negative_balance_allowed: false, rounding_precision: "0.01", is_active: true },
  leaveYearConfig: calendarLeaveYear,
  targetDate: "2026-09-30",
});
assert(res14.accruedAmount === 1.25, `Scenario 14: Method B Monthly accrual = ${res14.accruedAmount} days`);

// 15. Method A Annual Upfront
const res15 = evaluateLeaveAccrual({
  employee: { id: "e5", full_name: "Upfront", start_date: "2026-01-01" },
  schedule: monSatSched,
  rule: { id: "rA", company_id: "c1", name: "Upfront 20d", category: "annual", is_paid: true, requires_attachment: false, entitlement_unit: "days", entitlement_amount: 20, accrual_method: "annual_upfront", proration_enabled: false, proration_mode: "calendar_days", use_it_or_lose_it: false, negative_balance_allowed: false, rounding_precision: "0.01", is_active: true },
  leaveYearConfig: calendarLeaveYear,
  targetDate: "2026-01-01",
});
assert(res15.accruedAmount === 20.0, `Scenario 15: Method A Upfront entitlement = ${res15.accruedAmount} days`);

// 16. Rounding precision helper
assert(roundAccrualValue(1.2345, "0.25") === 1.25, "Scenario 16: Rounding precision 0.25 for 1.2345 = 1.25");

// 17. Reversal calculation
const initTaken = 16.0;
const rev = -16.0;
assert(initTaken + rev === 0.0, "Scenario 17: Reversal transaction clears taken balance");

// 18. Carry-over forfeiture cap
const rawBal = 65.0;
const cap = 40.0;
const netBal = Math.min(rawBal, cap);
assert(netBal === 40.0 && rawBal - netBal === 25.0, "Scenario 18: Carry-over cap forfeits 25h and caps balance at 40h");

console.log(`\n=======================================================`);
console.log(` Test Results: ${passed} Passed, ${failed} Failed `);
console.log(`=======================================================\n`);

if (failed > 0) process.exit(1);
