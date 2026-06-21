import { z } from "zod";

export const companySchema = z.object({
  name: z.string().trim().min(2, "Company name is required"),
  registration_number: z.string().trim().optional().or(z.literal("")),
  country: z.string().trim().min(2, "Country is required"),
  timezone: z.string().trim().min(2, "Timezone is required"),
  payroll_cycle: z.string().trim().min(2, "Payroll cycle is required"),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2, "Branch name is required"),
  code: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  timezone: z.string().trim().optional().or(z.literal("")),
});

export const departmentSchema = z.object({
  branch_id: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Department name is required"),
  code: z.string().trim().optional().or(z.literal("")),
});

export type Company = {
  id: string;
  name: string;
  registration_number: string | null;
  country: string;
  timezone: string;
  payroll_cycle: string;
};

export type Branch = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address: string | null;
  timezone: string | null;
  is_active: boolean;
};

export type Department = {
  id: string;
  company_id: string;
  branch_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  branches?: { name: string } | null;
};
