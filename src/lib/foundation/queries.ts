import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, Branch, Company, Department } from "./schema";

type UserRoleRow = {
  roles?: { key: AppRole }[] | { key: AppRole } | null;
};

function roleKey(relation?: { key: AppRole }[] | { key: AppRole } | null) {
  if (Array.isArray(relation)) {
    return relation[0]?.key ?? null;
  }

  return relation?.key ?? null;
}

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
    .select("id, name, registration_number, logo_url, country, timezone, payroll_cycle")
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

export const getCurrentUserAccess = cache(async function getCurrentUserAccess() {
  const { supabase, user } = await requireUser();

  const { data: appUsers, error: userError } = await supabase
    .from("users")
    .select("id, company_id, employee_id")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (userError) {
    throw new Error(userError.message);
  }

  const companyIds = (appUsers ?? []).map((appUser) => appUser.company_id);
  const appUserIds = (appUsers ?? []).map((appUser) => appUser.id);

  if (companyIds.length === 0) {
    redirect("/login?message=Unable to access this workspace. Contact your administrator.");
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("company_id, roles(key)")
    .in("company_id", companyIds)
    .in("user_id", appUserIds)
    .is("revoked_at", null);

  if (rolesError) {
    throw new Error(rolesError.message);
  }

  const roleKeys = new Set<AppRole>();
  ((roles ?? []) as unknown as UserRoleRow[]).forEach((row) => {
    const key = roleKey(row.roles);
    if (key) {
      roleKeys.add(key);
    }
  });

  const currentAppUser = appUsers?.[0] ?? null;
  const directReportsResult = currentAppUser?.employee_id
    ? await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", currentAppUser.company_id)
        .eq("manager_employee_id", currentAppUser.employee_id)
        .is("deleted_at", null)
    : null;

  if (directReportsResult?.error) {
    throw new Error(directReportsResult.error.message);
  }

  const canManageDirectReports = Number(directReportsResult?.count ?? 0) > 0;

  return {
    appUserId: currentAppUser?.id ?? null,
    employeeId: currentAppUser?.employee_id ?? null,
    roles: Array.from(roleKeys),
    isOwner: roleKeys.has("owner"),
    isHrAdmin: roleKeys.has("hr_admin"),
    isBranchManager: roleKeys.has("branch_manager"),
    isPayrollViewer: roleKeys.has("payroll_viewer"),
    isEmployee: roleKeys.has("employee"),
    canManageCompany: roleKeys.has("owner") || roleKeys.has("hr_admin"),
    canManageEmployees: roleKeys.has("owner") || roleKeys.has("hr_admin"),
    canReviewBranchTime:
      roleKeys.has("owner") ||
      roleKeys.has("hr_admin") ||
      roleKeys.has("branch_manager"),
    canManageDirectReports,
    canViewPayroll:
      roleKeys.has("owner") ||
      roleKeys.has("hr_admin") ||
      roleKeys.has("payroll_viewer"),
  };
});

export async function requireCompanyAdmin() {
  const access = await getCurrentUserAccess();

  if (!access.canManageCompany) {
    redirect("/dashboard");
  }

  return access;
}

export async function requireEmployeeAdmin() {
  const access = await getCurrentUserAccess();

  if (!access.canManageEmployees) {
    redirect("/dashboard");
  }

  return access;
}

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
