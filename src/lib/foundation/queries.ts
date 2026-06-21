import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Branch, Company, Department } from "./schema";

export const requireUser = cache(async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
});

export const getUserCompanies = cache(async function getUserCompanies() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, registration_number, country, timezone, payroll_cycle")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Company[];
});

export const getActiveCompany = cache(async function getActiveCompany() {
  const companies = await getUserCompanies();

  if (companies.length === 0) {
    redirect("/login?message=Unable to access this workspace. Contact your administrator.");
  }

  return {
    companies,
    company: companies[0],
  };
});

export const getCompanySetup = cache(async function getCompanySetup(companyId: string) {
  const { supabase } = await requireUser();
  const [branchesResult, departmentsResult] = await Promise.all([
    supabase
      .from("branches")
      .select("id, company_id, name, code, address, timezone, is_active")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("departments")
      .select("id, company_id, branch_id, name, code, is_active, branches(name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (branchesResult.error) {
    throw new Error(branchesResult.error.message);
  }

  if (departmentsResult.error) {
    throw new Error(departmentsResult.error.message);
  }

  return {
    branches: (branchesResult.data ?? []) as Branch[],
    departments: (departmentsResult.data ?? []) as unknown as Department[],
  };
});
