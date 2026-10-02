import "server-only";

import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";
import type { AppRole } from "@/lib/foundation/schema";
import type { EmployeeRecord, SelectOption } from "./schema";
import { autoAssignCompanyPayrollIdentifiers } from "./payroll-id";

export type EmployeePageData = {
  isConfigured: boolean;
  companyName: string | null;
  workstations: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  schedules: SelectOption[];
  standardMonthlyHours: number;
  employees: EmployeeRecord[];
};

type EmployeeRow = EmployeeRecord & {
  departments?: { name: string }[] | { name: string } | null;
  company_workstations?: { name: string }[] | { name: string } | null;
};

type WorkScheduleAssignmentRow = {
  employee_id: string;
  work_schedule_id: string;
};

function isMissingAssignmentSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message?.includes("employee_work_schedule_assignments") ||
    error.message?.includes("schema cache")
  );
}

function relationName(
  relation?: { name: string }[] | { name: string } | null,
) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? null;
  }

  return relation?.name ?? null;
}

function normalizeEmployee(row: EmployeeRow): EmployeeRecord {
  const { departments, company_workstations, ...employee } = row;

  return {
    ...employee,
    workstation_name: relationName(company_workstations),
    department_name: relationName(departments),
  };
}

function attachWorkScheduleIds(
  employees: EmployeeRecord[],
  assignments: WorkScheduleAssignmentRow[],
) {
  const schedulesByEmployee = new Map<string, string[]>();

  assignments.forEach((assignment) => {
    const current = schedulesByEmployee.get(assignment.employee_id) ?? [];
    current.push(assignment.work_schedule_id);
    schedulesByEmployee.set(assignment.employee_id, current);
  });

  return employees.map((employee) => ({
    ...employee,
    work_schedule_ids: schedulesByEmployee.get(employee.id) ?? (
      employee.work_schedule_id ? [employee.work_schedule_id] : []
    ),
  }));
}

export async function getEmployeePageData(): Promise<EmployeePageData> {
  if (!hasSupabaseConfig()) {
    return {
      isConfigured: false,
      companyName: null,
      workstations: [],
      departments: [],
      managers: [],
      schedules: [],
      standardMonthlyHours: 0,
      employees: [],
    };
  }

  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();

  const [workstationsResult, departmentsResult, schedulesResult, settingsResult, employeesResult, assignmentsResult] = await Promise.all([
    supabase
      .from("company_workstations")
      .select("id, name")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("work_schedules")
      .select("id, name")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("company_settings")
      .select("standard_monthly_hours")
      .eq("company_id", company.id)
      .single(),
    supabase
      .from("employees")
      .select(
        "id, company_id, employee_number, full_name, known_as, email, phone_number, avatar_url, workstation_id, department_id, job_title, employment_type, employment_status, start_date, work_schedule_id, manager_employee_id, user_id, payroll_identifier, monthly_salary, hourly_rate, compensation_type, deleted_at, company_workstations(name), departments(name)",
      )
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("employee_work_schedule_assignments")
      .select("employee_id, work_schedule_id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("priority", { ascending: true }),
  ]);

  if (workstationsResult.error) {
    throw new Error(workstationsResult.error.message);
  }

  if (departmentsResult.error) {
    throw new Error(departmentsResult.error.message);
  }

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message);
  }

  if (schedulesResult.error) {
    throw new Error(schedulesResult.error.message);
  }

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  if (settingsResult.data == null) {
    throw new Error("Company settings not found — standard_monthly_hours is required.");
  }

  if (assignmentsResult.error && !isMissingAssignmentSchema(assignmentsResult.error)) {
    throw new Error(assignmentsResult.error.message);
  }

  let rawEmployees = (employeesResult.data ?? []) as unknown as EmployeeRow[];
  const hasUnassignedPayroll = rawEmployees.some(
    (e) => !e.payroll_identifier || e.payroll_identifier.trim() === "",
  );

  if (hasUnassignedPayroll) {
    const autoResult = await autoAssignCompanyPayrollIdentifiers(company.id, supabase);
    if (autoResult.updatedCount > 0) {
      const assignmentMap = new Map(
        autoResult.assignments.map((a) => [a.employeeId, a.payrollIdentifier]),
      );
      rawEmployees = rawEmployees.map((e) => {
        const assignedId = assignmentMap.get(e.id);
        return assignedId ? { ...e, payroll_identifier: assignedId } : e;
      });
    }
  }

  const employees = attachWorkScheduleIds(
    rawEmployees.map(normalizeEmployee),
    assignmentsResult.error
      ? []
      : (assignmentsResult.data ?? []) as WorkScheduleAssignmentRow[],
  );

  const admin = createSupabaseAdminClient();
  const userIds = Array.from(
    new Set(employees.map((e) => e.user_id).filter((id): id is string => Boolean(id))),
  );

  const roleMap = new Map<string, { key: AppRole; name: string }>();

  if (userIds.length > 0) {
    const { data: userRoleRows } = await admin
      .from("user_roles")
      .select("user_id, role_id, roles(key, name)")
      .eq("company_id", company.id)
      .in("user_id", userIds)
      .is("revoked_at", null);

    (userRoleRows ?? []).forEach((row) => {
      const roleRelation = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (roleRelation?.key) {
        roleMap.set(row.user_id, {
          key: roleRelation.key as AppRole,
          name: roleRelation.name ?? roleRelation.key,
        });
      }
    });
  }

  const employeesWithoutUser = employees.filter((e) => !e.user_id);
  const pendingInviteRoleMap = new Map<string, AppRole>();
  if (employeesWithoutUser.length > 0) {
    const { data: inviteRows } = await admin
      .from("user_invitations")
      .select("employee_id, role_key")
      .eq("company_id", company.id)
      .in("employee_id", employeesWithoutUser.map((e) => e.id))
      .eq("status", "pending");

    (inviteRows ?? []).forEach((inv) => {
      if (inv.employee_id && inv.role_key) {
        pendingInviteRoleMap.set(inv.employee_id, inv.role_key as AppRole);
      }
    });
  }

  const enrichedEmployees = employees.map((emp) => {
    if (emp.user_id && roleMap.has(emp.user_id)) {
      const r = roleMap.get(emp.user_id)!;
      return { ...emp, role_key: r.key, role_name: r.name };
    }
    if (pendingInviteRoleMap.has(emp.id)) {
      const inviteKey = pendingInviteRoleMap.get(emp.id)!;
      return {
        ...emp,
        role_key: inviteKey,
        role_name: `Pending Invite (${inviteKey.replace("_", " ")})`,
      };
    }
    return emp;
  });

  return {
    isConfigured: true,
    companyName: company.name,
    workstations: (workstationsResult.data ?? []).map((workstation) => ({
      id: workstation.id,
      label: workstation.name,
    })),
    departments: (departmentsResult.data ?? []).map((department) => ({
      id: department.id,
      label: department.name,
    })),
    schedules: (schedulesResult.data ?? []).map((schedule) => ({
      id: schedule.id,
      label: schedule.name,
    })),
    standardMonthlyHours: Number(settingsResult.data.standard_monthly_hours),
    managers: enrichedEmployees
      .filter((employee) => employee.employment_status !== "terminated")
      .map((employee) => ({ id: employee.id, label: employee.full_name })),
    employees: enrichedEmployees,
  };
}

export async function getEmployeeDetail(employeeId: string) {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();

  const [{ data, error }, assignmentsResult] = await Promise.all([
    supabase
    .from("employees")
    .select(
      "id, company_id, employee_number, full_name, known_as, email, phone_number, avatar_url, workstation_id, department_id, job_title, employment_type, employment_status, start_date, work_schedule_id, manager_employee_id, user_id, payroll_identifier, monthly_salary, hourly_rate, compensation_type, deleted_at, company_workstations(name), departments(name)",
    )
    .eq("company_id", company.id)
    .eq("id", employeeId)
    .single(),
    supabase
      .from("employee_work_schedule_assignments")
      .select("employee_id, work_schedule_id")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("priority", { ascending: true }),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  if (assignmentsResult.error && !isMissingAssignmentSchema(assignmentsResult.error)) {
    throw new Error(assignmentsResult.error.message);
  }

  const employeeRecord = attachWorkScheduleIds(
    [normalizeEmployee(data as unknown as EmployeeRow)],
    assignmentsResult.error
      ? []
      : (assignmentsResult.data ?? []) as WorkScheduleAssignmentRow[],
  )[0];

  if (!employeeRecord) return null;

  const admin = createSupabaseAdminClient();
  let currentRoleKey: AppRole | null = null;
  let currentRoleName: string | null = null;

  if (employeeRecord.user_id) {
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("user_id, role_id, roles(key, name)")
      .eq("company_id", company.id)
      .eq("user_id", employeeRecord.user_id)
      .is("revoked_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleRow?.roles) {
      const r = Array.isArray(roleRow.roles) ? roleRow.roles[0] : roleRow.roles;
      if (r?.key) {
        currentRoleKey = r.key as AppRole;
        currentRoleName = r.name ?? r.key;
      }
    }
  }

  if (!currentRoleKey) {
    const { data: inviteRow } = await admin
      .from("user_invitations")
      .select("role_key")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteRow?.role_key) {
      currentRoleKey = inviteRow.role_key as AppRole;
      currentRoleName = `Pending Invite (${inviteRow.role_key.replace("_", " ")})`;
    }
  }

  return {
    ...employeeRecord,
    role_key: currentRoleKey,
    role_name: currentRoleName,
  };
}
