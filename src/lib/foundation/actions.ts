"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany } from "./queries";
import { branchSchema, departmentSchema } from "./schema";

function optional(value: FormDataEntryValue | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function createBranch(formData: FormData) {
  const { company } = await getActiveCompany();
  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    redirect(`/dashboard/company?message=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid branch data.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("branches").insert({
    company_id: company.id,
    name: parsed.data.name,
    code: optional(parsed.data.code),
    address: optional(parsed.data.address),
    timezone: optional(parsed.data.timezone),
  });

  if (error) {
    redirect(`/dashboard/company?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/company");
  redirect("/dashboard/company");
}

export async function createDepartment(formData: FormData) {
  const { company } = await getActiveCompany();
  const parsed = departmentSchema.safeParse({
    branch_id: formData.get("branch_id"),
    name: formData.get("name"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    redirect(`/dashboard/company?message=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid department data.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("departments").insert({
    company_id: company.id,
    branch_id: optional(parsed.data.branch_id),
    name: parsed.data.name,
    code: optional(parsed.data.code),
  });

  if (error) {
    redirect(`/dashboard/company?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/company");
  redirect("/dashboard/company");
}

export async function deactivateBranch(formData: FormData) {
  const { company } = await getActiveCompany();
  const branchId = String(formData.get("branch_id"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("branches")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", branchId);

  if (error) {
    redirect(`/dashboard/company?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/company");
  redirect("/dashboard/company");
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
    redirect(`/dashboard/company?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/company");
  redirect("/dashboard/company");
}
