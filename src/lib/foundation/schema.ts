import { z } from "zod";
import { sanitizeString, sanitizeUrl } from "@/lib/security/sanitizer";

export const appRoles = [
  "owner",
  "hr_admin",
  "branch_manager",
  "payroll_viewer",
  "employee",
] as const;

export type AppRole = (typeof appRoles)[number];

export const companySchema = z.object({
  name: z
    .string()
    .transform((v) => sanitizeString(v, 120))
    .refine((v) => v.length >= 2, "Company name is required"),
  registration_number: z
    .string()
    .transform((v) => sanitizeString(v, 80))
    .optional()
    .or(z.literal("")),
  country: z
    .string()
    .transform((v) => sanitizeString(v, 80))
    .refine((v) => v.length >= 2, "Country is required"),
  timezone: z
    .string()
    .transform((v) => sanitizeString(v, 60))
    .refine((v) => v.length >= 2, "Timezone is required"),
  payroll_cycle: z
    .string()
    .transform((v) => sanitizeString(v, 40))
    .refine((v) => v.length >= 2, "Payroll cycle is required"),
});

export const companyLogoSchema = z.object({
  logo_url: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;
      return Boolean(sanitizeUrl(value));
    }, "Use a valid logo link that starts with http:// or https://"),
});

export const departmentSchema = z.object({
  workstation_id: z.string().trim().optional().or(z.literal("")),
  name: z
    .string()
    .transform((v) => sanitizeString(v, 80))
    .refine((v) => v.length >= 2, "Department name is required"),
  code: z
    .string()
    .transform((v) => sanitizeString(v, 20))
    .optional()
    .or(z.literal("")),
});


export type Company = {
  id: string;
  name: string;
  registration_number: string | null;
  logo_url: string | null;
  trading_name: string | null;
  tax_number: string | null;
  vat_number: string | null;
  industry: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  timezone: string;
  payroll_cycle: string;
  query_office_text?: string | null;
};

export type CompanySettings = {
  id: string;
  company_id: string;
  standard_monthly_hours: number;
  standard_daily_hours: number;
  default_lunch_minutes: number;
  overtime_rules: Record<string, unknown>;
  toil_rules: Record<string, unknown>;
  leave_rules: Record<string, unknown>;
  approval_rules: Record<string, unknown>;
};

export type Department = {
  id: string;
  company_id: string;
  workstation_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  company_workstations?: { name: string } | null;
};
