"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PayrollPeriodConfig } from "./payroll-periods";

export type PayrollSettingsActionState = {
  ok: boolean;
  message: string;
};

export async function saveCompanyPayrollSettings(
  _previousState: PayrollSettingsActionState,
  formData: FormData,
): Promise<PayrollSettingsActionState> {
  const frequency = String(formData.get("frequency") ?? "monthly").trim();
  const startDate = String(formData.get("start_date") ?? formData.get("anchor_date") ?? "2026-01-01").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const anchorDate = startDate;
  const customCycleDays = Number(formData.get("custom_cycle_days") ?? 14);
  const startDayOfMonth = Number(formData.get("start_day_of_month") ?? 1);
  const endDayOfMonth = Number(formData.get("end_day_of_month") ?? (startDayOfMonth === 1 ? 31 : startDayOfMonth - 1));
  const startDayOfWeek = Number(formData.get("start_day_of_week") ?? 1);
  const payDayOffsetDays = Number(formData.get("pay_day_offset_days") ?? 3);

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { ok: false, message: "Authentication required." };
  }

  // Retrieve user company_id
  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userData.user.id)
    .single();

  if (memberError || !member) {
    return { ok: false, message: "Company membership required." };
  }

  if (member.role !== "owner" && member.role !== "admin" && member.role !== "super_admin") {
    return { ok: false, message: "Only administrators can configure payroll period settings." };
  }

  const payrollConfig: PayrollPeriodConfig = {
    frequency: frequency as PayrollPeriodConfig["frequency"],
    startDate,
    endDate: endDate || undefined,
    anchorDate,
    customCycleDays,
    startDayOfMonth,
    endDayOfMonth,
    startDayOfWeek,
    payDayOffsetDays,
  };

  // Update company payroll_cycle and company_settings approval_rules.payroll_config
  const { error: compError } = await supabase
    .from("companies")
    .update({ payroll_cycle: frequency })
    .eq("id", member.company_id);

  if (compError) {
    // Non-fatal if schema differs
    console.warn("Company payroll_cycle update warning:", compError.message);
  }

  // Update company_settings
  const { data: existingSettings } = await supabase
    .from("company_settings")
    .select("approval_rules")
    .eq("company_id", member.company_id)
    .maybeSingle();

  const currentApprovalRules = (existingSettings?.approval_rules as Record<string, unknown>) ?? {};
  const updatedRules = {
    ...currentApprovalRules,
    payroll_period_config: payrollConfig,
  };

  const { error: settingsError } = await supabase
    .from("company_settings")
    .upsert({
      company_id: member.company_id,
      approval_rules: updatedRules,
    }, { onConflict: "company_id" });

  if (settingsError) {
    return { ok: false, message: settingsError.message };
  }

  revalidateTag(`company-settings-${member.company_id}`, "max");
  revalidatePath("/dashboard");
  return { ok: true, message: "Payroll period configuration saved successfully." };
}

export type ReportEmployeeItem = {
  id: string;
  company_id: string;
  employee_number: string;
  full_name: string;
  known_as: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  workstation_id: string | null;
  department_id: string | null;
  job_title: string | null;
  employment_type: string;
  employment_status: "active" | "inactive" | "on_leave" | "terminated";
  start_date: string;
  work_schedule_id: string | null;
  manager_employee_id: string | null;
  compensation_type: string | null;
  hourly_rate: number | null;
  monthly_salary: number | null;
  department_name: string | null;
  workstation_name: string | null;
  daily_hours: number;
};

interface ReportEmployeeRow {
  id: string;
  company_id: string;
  employee_number: string;
  full_name: string;
  known_as?: string | null;
  email?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  workstation_id?: string | null;
  department_id?: string | null;
  job_title?: string | null;
  employment_type?: string | null;
  employment_status?: string | null;
  start_date?: string | null;
  work_schedule_id?: string | null;
  manager_employee_id?: string | null;
  compensation_type?: string | null;
  hourly_rate?: number | null;
  monthly_salary?: number | null;
  department_name?: string | null;
  workstation_name?: string | null;
  daily_hours?: number | null;
  departments?: { name: string } | null;
  company_workstations?: { name: string } | null;
  work_schedules?: { standard_daily_hours?: number | null } | null;
}

/**
 * Server action to fetch company employees for reporting.
 * Strictly excludes terminated and inactive employees by default.
 */
export async function getCompanyReportEmployeesAction(
  includeInactive = false,
  targetCompanyId?: string,
): Promise<{ ok: boolean; message: string; employees: ReportEmployeeItem[] }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return { ok: false, message: "Authentication required.", employees: [] };
    }

    let companyId = targetCompanyId;
    if (!companyId) {
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      companyId = member?.company_id;
    }

    if (!companyId) {
      return { ok: false, message: "Company not found.", employees: [] };
    }

    // Call database-level RPC function get_company_report_employees
    const { data, error } = await supabase.rpc("get_company_report_employees", {
      target_company_id: companyId,
      p_include_inactive: includeInactive,
    });

    if (error) {
      // Fallback to querying employees table directly with strict filter
      let query = supabase
        .from("employees")
        .select(
          "id, company_id, employee_number, full_name, known_as, email, phone_number, avatar_url, workstation_id, department_id, job_title, employment_type, employment_status, start_date, work_schedule_id, manager_employee_id, compensation_type, hourly_rate, monthly_salary, company_workstations(name), departments(name), work_schedules(standard_daily_hours)",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (!includeInactive) {
        query = query.eq("employment_status", "active");
      }

      const { data: fallbackData, error: fallbackError } = await query.order("full_name");
      if (fallbackError) {
        return { ok: false, message: fallbackError.message, employees: [] };
      }

      const formatted: ReportEmployeeItem[] = ((fallbackData ?? []) as unknown as ReportEmployeeRow[]).map((e) => ({
        id: e.id,
        company_id: e.company_id,
        employee_number: e.employee_number,
        full_name: e.full_name,
        known_as: e.known_as ?? null,
        email: e.email ?? null,
        phone_number: e.phone_number ?? null,
        avatar_url: e.avatar_url ?? null,
        workstation_id: e.workstation_id ?? null,
        department_id: e.department_id ?? null,
        job_title: e.job_title ?? null,
        employment_type: e.employment_type || "full_time",
        employment_status: (e.employment_status as ReportEmployeeItem["employment_status"]) || "active",
        start_date: e.start_date || "2026-01-01",
        work_schedule_id: e.work_schedule_id ?? null,
        manager_employee_id: e.manager_employee_id ?? null,
        compensation_type: e.compensation_type ?? null,
        hourly_rate: e.hourly_rate ?? null,
        monthly_salary: e.monthly_salary ?? null,
        department_name: e.departments?.name ?? null,
        workstation_name: e.company_workstations?.name ?? null,
        daily_hours: Number(e.work_schedules?.standard_daily_hours || 8),
      }));

      return {
        ok: true,
        message: `Loaded ${formatted.length} active reporting employees.`,
        employees: formatted,
      };
    }

    const employees: ReportEmployeeItem[] = ((data ?? []) as unknown as ReportEmployeeRow[]).map((e) => ({
      id: e.id,
      company_id: e.company_id,
      employee_number: e.employee_number,
      full_name: e.full_name,
      known_as: e.known_as ?? null,
      email: e.email ?? null,
      phone_number: e.phone_number ?? null,
      avatar_url: e.avatar_url ?? null,
      workstation_id: e.workstation_id ?? null,
      department_id: e.department_id ?? null,
      job_title: e.job_title ?? null,
      employment_type: e.employment_type || "full_time",
      employment_status: (e.employment_status as ReportEmployeeItem["employment_status"]) || "active",
      start_date: e.start_date || "2026-01-01",
      work_schedule_id: e.work_schedule_id ?? null,
      manager_employee_id: e.manager_employee_id ?? null,
      compensation_type: e.compensation_type ?? null,
      hourly_rate: e.hourly_rate ? Number(e.hourly_rate) : null,
      monthly_salary: e.monthly_salary ? Number(e.monthly_salary) : null,
      department_name: e.department_name ?? null,
      workstation_name: e.workstation_name ?? null,
      daily_hours: Number(e.daily_hours || 8),
    }));

    return {
      ok: true,
      message: `Loaded ${employees.length} active reporting employees.`,
      employees,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to load report employees.",
      employees: [],
    };
  }
}

