import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAccess, requireUser } from "@/lib/foundation/queries";
import type {
  SysAdminCompanyEmployee,
  SysAdminCompanyOverview,
} from "./schema";

export const getSysAdminCompaniesOverview = cache(async function getSysAdminCompaniesOverview(): Promise<SysAdminCompanyOverview[]> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return [];
  }

  const { supabase } = await requireUser();

  const [{ data: companies, error: compError }, { data: employees, error: empError }, { data: workstations, error: wsError }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, country, timezone, payroll_cycle, registration_number, trading_name, industry, contact_email, contact_phone, created_at, is_active")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("employees")
        .select("id, company_id")
        .is("deleted_at", null),
      supabase
        .from("company_workstations")
        .select("id, company_id")
        .eq("is_active", true)
        .is("deleted_at", null),
    ]);

  if (compError) throw new Error(compError.message);
  if (empError) throw new Error(empError.message);
  if (wsError) throw new Error(wsError.message);

  const empCountMap = new Map<string, number>();
  for (const emp of employees ?? []) {
    empCountMap.set(emp.company_id, (empCountMap.get(emp.company_id) ?? 0) + 1);
  }

  const wsCountMap = new Map<string, number>();
  for (const ws of workstations ?? []) {
    wsCountMap.set(ws.company_id, (wsCountMap.get(ws.company_id) ?? 0) + 1);
  }

  return (companies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    country: c.country,
    timezone: c.timezone,
    payroll_cycle: c.payroll_cycle,
    registration_number: c.registration_number,
    trading_name: c.trading_name,
    industry: c.industry,
    contact_email: c.contact_email,
    contact_phone: c.contact_phone,
    employee_count: empCountMap.get(c.id) ?? 0,
    workstation_count: wsCountMap.get(c.id) ?? 0,
    created_at: c.created_at,
    is_active: c.is_active,
  }));
});

export const getSysAdminCompanyMetadata = cache(async function getSysAdminCompanyMetadata() {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { workstations: [], schedules: [] };
  }

  const { supabase } = await requireUser();

  const [{ data: workstations, error: wsError }, { data: schedules, error: schedError }] =
    await Promise.all([
      supabase
        .from("company_workstations")
        .select("id, company_id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("work_schedules")
        .select("id, company_id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
    ]);

  if (wsError) throw new Error(wsError.message);
  if (schedError) throw new Error(schedError.message);

  return {
    workstations: workstations ?? [],
    schedules: schedules ?? [],
  };
});

export const getSysAdminCompanyEmployees = cache(async function getSysAdminCompanyEmployees(
  companyId: string,
): Promise<SysAdminCompanyEmployee[]> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return [];
  }

  const { supabase } = await requireUser();

  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select(`
      id,
      company_id,
      employee_number,
      full_name,
      email,
      phone_number,
      job_title,
      employment_type,
      employment_status,
      start_date,
      user_id,
      company_workstations ( name )
    `)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("full_name");

  if (empError) throw new Error(empError.message);

  const userIds = (employees ?? []).map((e) => e.user_id).filter(Boolean) as string[];

  const roleMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("user_id, roles ( key )")
      .eq("company_id", companyId)
      .in("user_id", userIds)
      .is("revoked_at", null);

    for (const ur of userRoles ?? []) {
      const roleRelation = ur.roles as { key?: string } | { key?: string }[] | null;
      const roleKey = Array.isArray(roleRelation) ? roleRelation[0]?.key : roleRelation?.key;
      if (roleKey && ur.user_id) {
        roleMap.set(ur.user_id, roleKey);
      }
    }
  }

  return (employees ?? []).map((e) => {
    const wsRelation = e.company_workstations as { name?: string } | { name?: string }[] | null;
    const workstationName = Array.isArray(wsRelation) ? wsRelation[0]?.name : wsRelation?.name;

    return {
      id: e.id,
      company_id: e.company_id,
      employee_number: e.employee_number,
      full_name: e.full_name,
      email: e.email,
      phone_number: e.phone_number,
      job_title: e.job_title,
      employment_type: e.employment_type,
      employment_status: e.employment_status,
      start_date: e.start_date,
      workstation_name: workstationName ?? null,
      user_id: e.user_id,
      role_key: e.user_id ? roleMap.get(e.user_id) ?? null : null,
    };
  });
});
