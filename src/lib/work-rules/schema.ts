import { z } from "zod";

export const leaveCategories = [
  "annual",
  "sick",
  "family_responsibility",
  "maternity",
  "unpaid",
  "toil_taken",
  "other",
] as const;

export const workScheduleFormSchema = z.object({
  daily_hours: z.string().trim().optional().or(z.literal("")),
  end_time: z.string().trim().min(1, "End time is required"),
  lunch_minutes: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Schedule name is required"),
  start_time: z.string().trim().min(1, "Start time is required"),
  working_days: z.array(z.string()).min(1, "Choose at least one working day"),
});

export const leaveTypeFormSchema = z.object({
  category: z.enum(leaveCategories),
  is_paid: z.string().optional(),
  name: z.string().trim().min(2, "Leave name is required"),
  requires_attachment: z.string().optional(),
  yearly_hours: z.string().trim().optional().or(z.literal("")),
});

export const updateLeaveTypeFormSchema = leaveTypeFormSchema.extend({
  is_active: z.string().optional(),
  leave_type_id: z.uuid("Choose a time off rule"),
});

export const leaveAssignmentFormSchema = z.object({
  balance_hours: z.string().trim().min(1, "Enter available hours"),
  employee_id: z.uuid("Choose an employee"),
  leave_type_id: z.uuid("Choose a leave type"),
});

export const leaveRequestFormSchema = z.object({
  attachment_url: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;

      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Use a valid attachment link that starts with http:// or https://"),
  end_date: z.iso.date("End date is required"),
  leave_type_id: z.uuid("Choose a leave type"),
  reason: z.string().trim().optional().or(z.literal("")),
  start_date: z.iso.date("Start date is required"),
});

export const publicHolidayFormSchema = z.object({
  holiday_date: z.iso.date("Holiday date is required"),
  is_paid: z.string().optional(),
  name: z.string().trim().min(2, "Holiday name is required"),
});

export type ScheduleDay = {
  day_of_week: number;
  end_time: string | null;
  is_working_day: boolean;
  lunch_minutes: number;
  paid_hours: number | string;
  start_time: string | null;
};

export type WorkSchedule = {
  id: string;
  name: string;
  standard_daily_hours: number | string | null;
  schedule_days?: ScheduleDay[] | null;
};

export type LeaveType = {
  id: string;
  name: string;
  category: (typeof leaveCategories)[number];
  is_paid: boolean;
  requires_attachment: boolean;
  accrual_rules: Record<string, unknown>;
};

export type LeaveBalance = {
  id: string;
  balance_hours: number | string;
  accrued_hours: number | string;
  taken_hours: number | string;
  leave_types?: LeaveType[] | LeaveType | null;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number | string;
  reason: string | null;
  attachment_url: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled" | "locked";
  submitted_at: string | null;
  rejection_reason: string | null;
  leaveTypeName?: string;
  employeeNumber?: string;
  fullName?: string;
  knownAs?: string | null;
  avatarUrl?: string | null;
};

export type PublicHoliday = {
  id: string;
  holiday_date: string;
  is_paid: boolean;
  name: string;
};

export type LeaveCalculationDay = {
  date: string;
  hours: number;
  label?: string;
  reason: "working_day" | "public_holiday" | "non_working_day";
};

export type LeaveCalculation = {
  available_hours: number;
  exceeds_balance: boolean;
  leave_type_name: string;
  non_working_days: number;
  public_holidays: number;
  remaining_hours: number;
  total_hours: number;
  working_days: number;
  days: LeaveCalculationDay[];
};

export type CompanyWorkRulesData = {
  employees: { id: string; label: string }[];
  leaveBalances: Array<LeaveBalance & { employee_id: string; leave_type_id: string }>;
  leaveTypes: LeaveType[];
  publicHolidays: PublicHoliday[];
  schedules: WorkSchedule[];
};

export type EmployeeLeaveState = {
  balances: LeaveBalance[];
  leaveTypes: LeaveType[];
  requests: LeaveRequest[];
};
