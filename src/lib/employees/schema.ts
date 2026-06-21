import { z } from "zod";

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

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || Number(value) >= 0, "Enter a positive amount");

export const employeeFormSchema = z
  .object({
    full_name: z.string().trim().min(2, "Full name is required"),
    known_as: optionalText,
    email: z.email("Enter a valid email address").optional().or(z.literal("")),
    phone_number: optionalText,
    branch_id: z.uuid("Select a branch"),
    department_id: optionalUuid,
    job_title: optionalText,
    employment_type: z.enum(employmentTypes),
    employment_status: z.enum(employmentStatuses),
    start_date: z.iso.date("Start date is required"),
    manager_employee_id: optionalUuid,
    payroll_identifier: optionalText,
    monthly_salary: optionalMoney,
    hourly_rate: optionalMoney,
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
  branch_id: string;
  department_id: string | null;
  job_title: string | null;
  employment_type: (typeof employmentTypes)[number];
  employment_status: (typeof employmentStatuses)[number];
  start_date: string;
  manager_employee_id: string | null;
  user_id: string | null;
  payroll_identifier: string | null;
  monthly_salary: number | null;
  hourly_rate: number | null;
  compensation_type: "hourly" | "monthly";
  deleted_at: string | null;
  branch_name?: string | null;
  department_name?: string | null;
  manager?: { full_name: string } | null;
};
