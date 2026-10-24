import "server-only";

import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CompanyWorkstation } from "@/lib/geolocation/schema";
import type { AppRole, Company, Department } from "./schema";

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
    .select(
      "id, name, registration_number, logo_url, trading_name, tax_number, vat_number, industry, website_url, contact_email, contact_phone, address_line_1, address_line_2, city, province, postal_code, country, timezone, payroll_cycle",
    )
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Company[];
});

export const getActiveCompany = cache(async function getActiveCompany() {
  await requireUser();
  const companies = await getUserCompanies();

  if (companies.length === 0) {
    redirect("/login?message=Unable to access this workspace. Contact your administrator.");
  }

  const cookieStore = await cookies();
  const preferredId = cookieStore.get("active_company_id")?.value;
  if (preferredId) {
    const preferred = companies.find((c) => c.id === preferredId);
    if (preferred) return { companies, company: preferred };
  }

  return { companies, company: companies[0] };
});

export const getCurrentUserAccess = cache(async function getCurrentUserAccess() {
  const [{ supabase, user }, { company: activeCompany }] = await Promise.all([
    requireUser(),
    getActiveCompany(),
  ]);

  const { data: appUsers, error: userError } = await supabase
    .from("users")
    .select("id, company_id, employee_id, is_super_admin")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (userError) {
    throw new Error(userError.message);
  }

  const companyIds = (appUsers ?? []).map((appUser) => appUser.company_id);

  if (companyIds.length === 0) {
    redirect("/login?message=Unable to access this workspace. Contact your administrator.");
  }

  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const userMeta = user.user_metadata as Record<string, unknown> | undefined;

  // Super Admin Grantors are strictly enforced on the server-side.
  // Only Doctor Khoza (doctor@formalize.co.za) and Sizwe Hlatshwayo (admin@formalize.co.za)
  // are authorized to assign or revoke Super Admin privileges.
  const SUPER_ADMIN_GRANTORS = new Set([
    "doctor@formalize.co.za",
    "admin@formalize.co.za",
  ]);
  const userEmail = user.email?.toLowerCase().trim();
  const canAssignSuperAdmin = Boolean(userEmail && SUPER_ADMIN_GRANTORS.has(userEmail));

  // Restricted Super Admins are Super Admins who can switch between companies to monitor
  // and assist with time management across all branches, but are strictly prohibited
  // from viewing employee records, sensitive personal data, or the payslip generator.
  const RESTRICTED_SUPER_ADMIN_EMAILS = new Set([
    "whitneyn.nkosi@gmail.com",
  ]);
  const isRestrictedSuperAdmin = Boolean(
    userEmail && (
      RESTRICTED_SUPER_ADMIN_EMAILS.has(userEmail) ||
      userEmail.startsWith("whitney")
    )
  );

  const isSuperAdmin =
    (appUsers ?? []).some((u) => u.is_super_admin) ||
    Boolean(userEmail && SUPER_ADMIN_GRANTORS.has(userEmail)) ||
    Boolean(appMeta?.is_super_admin) ||
    Boolean(appMeta?.claims_admin) ||
    Boolean(userMeta?.is_super_admin);

  const isFullSuperAdmin = isSuperAdmin && !isRestrictedSuperAdmin;

  const targetAppUser =
    appUsers?.find((u) => u.company_id === activeCompany.id) ??
    (isSuperAdmin ? appUsers?.[0] : null) ??
    appUsers?.[0] ??
    null;

  let activeEmployeeId = targetAppUser?.employee_id ?? null;
  if (!activeEmployeeId) {
    const { data: empRecord } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", activeCompany.id)
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .or(`user_id.eq.${targetAppUser?.id ?? ""},email.eq.${user.email ?? ""}`)
      .limit(1)
      .maybeSingle();

    if (empRecord) {
      activeEmployeeId = empRecord.id;
    }
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("company_id, roles(key)")
    .eq("company_id", activeCompany.id)
    .in("user_id", (appUsers ?? []).map((u) => u.id))
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

  const isSuperUser =
    isSuperAdmin ||
    Boolean(appMeta?.is_super_user) ||
    Boolean(userMeta?.is_super_user) ||
    Boolean(appMeta?.role === "superuser" || appMeta?.role === "super_user") ||
    Boolean(userMeta?.role === "superuser" || userMeta?.role === "super_user") ||
    roleKeys.has("owner");

  const directReportsResult = activeEmployeeId
    ? await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", activeCompany.id)
        .eq("manager_employee_id", activeEmployeeId)
        .eq("employment_status", "active")
        .is("deleted_at", null)
    : null;

  if (directReportsResult?.error) {
    throw new Error(directReportsResult.error.message);
  }

  const canManageDirectReports = Number(directReportsResult?.count ?? 0) > 0;

  // Tenant-level roles
  const isOwner = isFullSuperAdmin || roleKeys.has("owner");
  const isHrAdmin = isFullSuperAdmin || roleKeys.has("hr_admin");
  const isBranchManager = isFullSuperAdmin || roleKeys.has("branch_manager");
  const isPayrollViewer = isFullSuperAdmin || roleKeys.has("payroll_viewer");

  // Employee Information & Records:
  // Strictly limited to: Payroll Viewer, HR Admin, Manager, Company Owner,
  // and Super Users EXCEPT Whitney.
  const canManageEmployees =
    !isRestrictedSuperAdmin &&
    (isFullSuperAdmin ||
      roleKeys.has("owner") ||
      roleKeys.has("hr_admin") ||
      roleKeys.has("branch_manager") ||
      roleKeys.has("payroll_viewer"));

  // Authorized Tenant Roles for Payslips & Sensitive Payroll Data:
  // Strictly accessible to: Company Owner, Branch Manager, Payroll Viewer, HR Admin.
  // Regular employees and super users without these company roles must NOT see them.
  const hasAuthorizedPayslipRole =
    roleKeys.has("owner") ||
    roleKeys.has("branch_manager") ||
    roleKeys.has("payroll_viewer") ||
    roleKeys.has("hr_admin");

  // Sensitive Personal Data (salaries, hourly rates, bank details, ID & tax numbers):
  // Strictly prohibited for Whitney / restricted super users, and users without authorized payroll role.
  const canAccessSensitiveData =
    !isRestrictedSuperAdmin && hasAuthorizedPayslipRole;

  // Payslip Generator:
  // Accessible to Company Owner, Branch Manager, Payroll Viewer, and HR Admin.
  // Prohibited for pure employees, employees assigned as super admin, and restricted super users.
  const canViewPayslips =
    !isRestrictedSuperAdmin && hasAuthorizedPayslipRole;

  const canManageCompany = isFullSuperAdmin || roleKeys.has("owner") || roleKeys.has("hr_admin");

  const canAssignRoles =
    !isRestrictedSuperAdmin &&
    (isFullSuperAdmin ||
      roleKeys.has("owner") ||
      roleKeys.has("hr_admin") ||
      roleKeys.has("branch_manager"));

  const canAssignOwnerRole = isFullSuperAdmin || roleKeys.has("owner");

  // Whitney can monitor and assist with time management across all branches
  const canReviewBranchTime =
    isSuperAdmin ||
    roleKeys.has("owner") ||
    roleKeys.has("hr_admin") ||
    roleKeys.has("branch_manager");

  const canViewPayroll = canViewPayslips;

  return {
    appUserId: targetAppUser?.id ?? null,
    employeeId: activeEmployeeId,
    companyIds,
    roles: Array.from(roleKeys),
    isSuperAdmin,
    isRestrictedSuperAdmin,
    isFullSuperAdmin,
    isSuperUser,
    canAssignSuperAdmin,
    isOwner,
    isHrAdmin,
    isBranchManager,
    isPayrollViewer,
    isEmployee: roleKeys.has("employee"),
    canManageCompany,
    canManageEmployees,
    canViewEmployeeRecords: canManageEmployees,
    canViewPayslips,
    canAccessSensitiveData,
    canAssignRoles,
    canAssignOwnerRole,
    canReviewBranchTime,
    canManageDirectReports: isSuperAdmin || canManageDirectReports,
    canViewPayroll,
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

export const getCachedCompanySetup = (companyId: string) =>
  unstable_cache(
    async () => {
      const admin = createSupabaseAdminClient();
      const [workstationsResult, departmentsResult] = await Promise.all([
        admin
          .from("company_workstations")
          .select("id, company_id, name, address, latitude, longitude, radius_meters, is_active")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("is_active", true)
          .order("name"),
        admin
          .from("departments")
          .select("id, company_id, workstation_id, name, code, is_active, company_workstations(name)")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("name"),
      ]);

      if (workstationsResult.error) {
        throw new Error(workstationsResult.error.message);
      }

      if (departmentsResult.error) {
        throw new Error(departmentsResult.error.message);
      }

      return {
        workstations: (workstationsResult.data ?? []) as unknown as CompanyWorkstation[],
        departments: (departmentsResult.data ?? []) as unknown as Department[],
      };
    },
    ["company-setup", companyId],
    {
      tags: [`company-setup-${companyId}`],
      revalidate: 3600,
    },
  )();

export const getCompanySetup = cache(async function getCompanySetup(companyId: string) {
  await requireUser();
  return getCachedCompanySetup(companyId);
});
