"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany } from "./queries";
import { companyLogoSchema, departmentSchema } from "./schema";

type CompanyLogoState = {
  ok: boolean;
  message: string;
};

function optional(value: FormDataEntryValue | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function updateCompanyLogo(
  _previousState: CompanyLogoState,
  formData: FormData,
): Promise<CompanyLogoState> {
  const { company } = await getActiveCompany();
  const parsed = companyLogoSchema.safeParse({
    logo_url: formData.get("logo_url"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter a valid logo link.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_company_logo", {
    company_logo_url: parsed.data.logo_url || null,
    target_company_id: company.id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");

  return { ok: true, message: "Company logo updated." };
}

export async function createDepartment(formData: FormData) {
  const { company } = await getActiveCompany();
  const parsed = departmentSchema.safeParse({
    workstation_id: formData.get("workstation_id"),
    name: formData.get("name"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    redirect(`/dashboard?panel=company&message=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid department data.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("departments").insert({
    company_id: company.id,
    workstation_id: optional(parsed.data.workstation_id),
    name: parsed.data.name,
    code: optional(parsed.data.code),
  });

  if (error) {
    redirect(`/dashboard?panel=company&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?panel=company");
}

export async function deactivateDepartment(formData: FormData) {
  const { company } = await getActiveCompany();
  const departmentId = String(formData.get("department_id"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("departments")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", departmentId);

  if (error) {
    redirect(`/dashboard?panel=company&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  redirect("/dashboard?panel=company");
}

export async function assignEmployeeDepartment(
  employeeId: string,
  departmentId: string | null,
): Promise<{ ok: boolean; message: string }> {
  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("employees")
    .update({ department_id: departmentId })
    .eq("company_id", company.id)
    .eq("id", employeeId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
  return { ok: true, message: "Employee department updated." };
}
