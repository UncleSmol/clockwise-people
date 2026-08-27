"use server";

import { revalidatePath } from "next/cache";
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

  revalidatePath("/dashboard");
  return { ok: true, message: "Payroll period configuration saved successfully." };
}
