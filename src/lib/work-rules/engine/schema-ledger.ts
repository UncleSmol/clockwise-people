import { z } from "zod";

export type AccrualMethodType =
  | "annual_upfront" // Method A: Entire annual entitlement available upfront
  | "monthly" // Method B: Monthly accrual (1/12th per month or pro-rated)
  | "service_prorated" // Method C: Pro-rata based on service period within leave year
  | "hours_worked_divisor"; // Method D: Accrue 1 unit per X qualifying hours worked

export type AccrualTimingMode = "start_of_period" | "end_of_period" | "completed_service";

export type ProrationModeType =
  | "calendar_days"
  | "completed_months"
  | "scheduled_working_days"
  | "scheduled_working_hours";

export type EntitlementUnitType = "days" | "hours";

export type RoundingPrecisionType = "0.01" | "0.1" | "0.25" | "0.5" | "1.0";

export type ScheduleDayDetail = {
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
  is_working_day: boolean;
  start_time: string | null; // e.g. "08:00"
  end_time: string | null; // e.g. "17:00"
  lunch_minutes: number; // Unpaid break minutes e.g. 60
  paid_hours: number; // Calculated net ordinary hours (e.g. 8.0)
};

export type WorkingScheduleConfig = {
  id: string;
  name: string;
  standard_daily_hours?: number | null;
  schedule_days: ScheduleDayDetail[];
};

export type ConfigurableLeaveRule = {
  id: string;
  company_id: string;
  name: string;
  category: "annual" | "sick" | "family_responsibility" | "maternity" | "unpaid" | "toil_taken" | "other";
  is_paid: boolean;
  requires_attachment: boolean;
  entitlement_unit: EntitlementUnitType; // "days" or "hours"
  entitlement_amount: number; // e.g. 15 days or 120 hours
  accrual_method: AccrualMethodType; // "annual_upfront" | "monthly" | "service_prorated" | "hours_worked_divisor"
  accrual_timing?: AccrualTimingMode;
  hours_divisor?: number | null; // For Method D: e.g. 20 (accrue 1h per 20h worked)
  proration_enabled: boolean;
  proration_mode: ProrationModeType;
  use_it_or_lose_it: boolean;
  max_carry_over_cap?: number | null;
  negative_balance_allowed: boolean;
  max_negative_balance?: number | null;
  rounding_precision: RoundingPrecisionType;
  is_active: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
};

export type CompanyLeaveYearConfig = {
  leave_year_type: "calendar" | "fiscal" | "anniversary";
  start_month: number; // 1-12 (e.g. 1 for Jan, 4 for Apr)
  start_day: number; // 1-31
};

export type AuditDerivation = {
  rule_name: string;
  accrual_method: AccrualMethodType;
  entitlement_unit: EntitlementUnitType;
  configured_entitlement: number;
  leave_year_period: string; // e.g. "2026-01-01 to 2026-12-31"
  service_period: string; // e.g. "2026-01-01 to 2026-12-31"
  scheduled_hours_in_period: number;
  qualifying_hours_worked?: number;
  proration_factor: number; // e.g. 1.0 or 0.5
  raw_calculated_amount: number;
  rounded_amount: number;
  derivation_formula: string; // Step-by-step mathematical explanation
};

export type LeaveLedgerTransactionType =
  | "accrual"
  | "deduction"
  | "adjustment"
  | "forfeiture"
  | "carry_over"
  | "reversal";

export type LeaveLedgerTransaction = {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  leave_rule_id?: string | null;
  transaction_date: string; // YYYY-MM-DD
  transaction_type: LeaveLedgerTransactionType;
  amount_units: number; // Entitlement units (days or hours)
  unit: EntitlementUnitType;
  hours_equivalent: number; // Calculated exact hours
  accrual_period_start?: string | null;
  accrual_period_end?: string | null;
  notes?: string | null;
  audit_derivation?: AuditDerivation | null;
  created_at: string;
};

export type EmployeeLeaveBalanceSummary = {
  employee_id: string;
  leave_type_id: string;
  leave_type_name: string;
  unit: EntitlementUnitType;
  opening_balance_units: number;
  accrued_units: number;
  adjusted_units: number;
  taken_units: number;
  forfeited_units: number;
  closing_balance_units: number;
  opening_balance_hours: number;
  accrued_hours: number;
  adjusted_hours: number;
  taken_hours: number;
  forfeited_hours: number;
  closing_balance_hours: number;
  ledger_transactions: LeaveLedgerTransaction[];
};

export const configurableLeaveRuleSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  category: z.enum([
    "annual",
    "sick",
    "family_responsibility",
    "maternity",
    "unpaid",
    "toil_taken",
    "other",
  ]),
  is_paid: z.boolean().default(true),
  requires_attachment: z.boolean().default(false),
  entitlement_unit: z.enum(["days", "hours"]).default("days"),
  entitlement_amount: z.coerce.number().min(0, "Entitlement must be positive"),
  accrual_method: z.enum([
    "annual_upfront",
    "monthly",
    "service_prorated",
    "hours_worked_divisor",
  ]).default("monthly"),
  accrual_timing: z.enum(["start_of_period", "end_of_period", "completed_service"]).default("end_of_period"),
  hours_divisor: z.coerce.number().min(1).optional().nullable(),
  proration_enabled: z.boolean().default(true),
  proration_mode: z.enum([
    "calendar_days",
    "completed_months",
    "scheduled_working_days",
    "scheduled_working_hours",
  ]).default("scheduled_working_hours"),
  use_it_or_lose_it: z.boolean().default(false),
  max_carry_over_cap: z.coerce.number().min(0).optional().nullable(),
  negative_balance_allowed: z.boolean().default(false),
  max_negative_balance: z.coerce.number().min(0).optional().nullable(),
  rounding_precision: z.enum(["0.01", "0.1", "0.25", "0.5", "1.0"]).default("0.01"),
});
