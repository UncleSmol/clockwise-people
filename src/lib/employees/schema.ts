import { z } from "zod";
import type { AppRole } from "@/lib/foundation/schema";

export const employmentTypes = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "casual",
] as const;

export const employmentStatuses = [
  "active",
  "inactive",
  "on_leave",
  "terminated",
] as const;

export const paymentFrequencies = [
  "monthly",
  "weekly",
  "fortnightly",
] as const;

export const bankAccountTypes = [
  "Cheque / Current",
  "Savings",
  "Transmission",
] as const;

import { sanitizeString } from "@/lib/security/sanitizer";

export const paymentModes = [
  "EFT",
  "Cash",
  "Cheque",
] as const;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const sanitizedOptionalText = (maxLength = 255) =>
  z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val ? sanitizeString(val, maxLength) : ""));

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || Number(value) >= 0, "Enter a positive amount");

export const employeeFormSchema = z
  .object({
    full_name: z
      .string()
      .transform((v) => sanitizeString(v, 120))
      .refine((v) => v.length >= 2, "Full name is required"),
    known_as: sanitizedOptionalText(80),
    email: z.email("Enter a valid email address").optional().or(z.literal("")),
    phone_number: sanitizedOptionalText(40),
    workstation_id: optionalUuid,
    department_id: optionalUuid,
    job_title: sanitizedOptionalText(100),
    employment_type: z.enum(employmentTypes),
    employment_status: z.enum(employmentStatuses),
    start_date: z.iso.date("Start date is required"),
    end_date: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .nullable()
      .refine(
        (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val),
        "Invalid termination date format (expected YYYY-MM-DD)",
      ),
    work_schedule_id: optionalUuid,
    work_schedule_ids: z.array(z.string()).optional(),
    manager_employee_id: optionalUuid,
    payroll_identifier: sanitizedOptionalText(64),
    monthly_salary: optionalMoney,
    hourly_rate: optionalMoney,
    id_number: sanitizedOptionalText(30),
    tax_number: sanitizedOptionalText(30),
    address: sanitizedOptionalText(250),
    payment_frequency: z.enum(paymentFrequencies).optional(),
    bank_name: sanitizedOptionalText(80),
    bank_account_number: sanitizedOptionalText(40),
    bank_account_type: z.enum(bankAccountTypes).optional(),
    payment_mode: z.enum(paymentModes).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.employment_status === "terminated" && (!data.end_date || data.end_date.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Termination date is required when employee is terminated",
        path: ["end_date"],
      });
    }
    if (data.end_date && data.start_date && data.end_date.trim() !== "") {
      if (data.end_date < data.start_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Termination date cannot be before start date",
          path: ["end_date"],
        });
      }
    }
  });

export type EmployeeFormInput = z.input<typeof employeeFormSchema>;
export type EmployeeFormValues = z.output<typeof employeeFormSchema>;


export type SelectOption = {
  id: string;
  label: string;
};

export type EmployeeRecord = {
  id: string;
  company_id: string;
  employee_number: string;
  full_name: string;
  known_as: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  workstation_id: string;
  department_id: string | null;
  job_title: string | null;
  employment_type: string;
  employment_status: string;
  start_date: string;
  end_date: string | null;
  work_schedule_id: string | null;
  manager_employee_id: string | null;
  user_id: string | null;
  payroll_identifier: string | null;
  monthly_salary: number | null;
  hourly_rate: number | null;
  compensation_type: string | null;
  deleted_at: string | null;
  workstation_name: string | null;
  department_name: string | null;
  work_schedule_ids: string[];
  role_key?: AppRole | null;
  role_name?: string | null;
  is_super_admin?: boolean;
  id_number?: string | null;
  tax_number?: string | null;
  address?: string | null;
  payment_frequency?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  payment_mode?: string | null;
};
