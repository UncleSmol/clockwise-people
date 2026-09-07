import { z } from "zod";
import { appRoles } from "@/lib/foundation/schema";

export const sysAdminCreateCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters").max(100),
  country: z.string().trim().min(2, "Country is required").default("South Africa"),
  timezone: z.string().trim().min(2, "Timezone is required").default("Africa/Johannesburg"),
  payroll_cycle: z.enum(["monthly", "weekly", "bi-weekly"]).default("monthly"),
  registration_number: z.string().trim().optional().or(z.literal("")),
  trading_name: z.string().trim().optional().or(z.literal("")),
  industry: z.string().trim().optional().or(z.literal("")),
  contact_email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  contact_phone: z.string().trim().optional().or(z.literal("")),
  workstation_name: z.string().trim().min(2, "Workstation name is required").default("Headquarters"),
  workstation_address: z.string().trim().optional().or(z.literal("")),
  workstation_lat: z.number().min(-90).max(90).default(-26.2041),
  workstation_lng: z.number().min(-180).max(180).default(28.0473),
  workstation_radius: z.number().min(25).max(5000).default(150),
});

export type SysAdminCreateCompanyInput = z.input<typeof sysAdminCreateCompanySchema>;
export type SysAdminCreateCompanyValues = z.output<typeof sysAdminCreateCompanySchema>;

export const sysAdminCreateEmployeeSchema = z.object({
  company_id: z.string().uuid("Please select a target company"),
  full_name: z.string().trim().min(2, "Full name must be at least 2 characters"),
  email: z.string().trim().email("Valid email address is required"),
  phone_number: z.string().trim().optional().or(z.literal("")),
  job_title: z.string().trim().optional().or(z.literal("")),
  workstation_id: z.string().uuid("Workstation assignment is required"),
  work_schedule_id: z.string().uuid().optional().or(z.literal("")),
  employment_type: z.enum(["full_time", "part_time", "contract", "intern"]).default("full_time"),
  employment_status: z.enum(["active", "probation", "terminated"]).default("active"),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  role_key: z.enum(appRoles).default("employee"),
  create_login: z.boolean().default(true),
  temporary_password: z.string().trim().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
});

export type SysAdminCreateEmployeeInput = z.input<typeof sysAdminCreateEmployeeSchema>;
export type SysAdminCreateEmployeeValues = z.output<typeof sysAdminCreateEmployeeSchema>;

export type SysAdminCompanyOverview = {
  id: string;
  name: string;
  country: string;
  timezone: string;
  payroll_cycle: string;
  registration_number: string | null;
  trading_name: string | null;
  industry: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  employee_count: number;
  workstation_count: number;
  created_at: string;
  is_active: boolean;
};

export type SysAdminCompanyEmployee = {
  id: string;
  company_id: string;
  employee_number: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  job_title: string | null;
  employment_type: string;
  employment_status: string;
  start_date: string;
  workstation_name: string | null;
  user_id: string | null;
  role_key: string | null;
};
