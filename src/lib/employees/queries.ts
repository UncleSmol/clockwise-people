import "server-only";

import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";
import type { EmployeeRecord, SelectOption } from "./schema";

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
      standardMonthlyHours: 173.33,
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

  if (assignmentsResult.error && !isMissingAssignmentSchema(assignmentsResult.error)) {
    throw new Error(assignmentsResult.error.message);
  }

  const employees = attachWorkScheduleIds(
    ((employeesResult.data ?? []) as unknown as EmployeeRow[]).map(normalizeEmployee),
    assignmentsResult.error
      ? []
      : (assignmentsResult.data ?? []) as WorkScheduleAssignmentRow[],
  );

  const rawHours = settingsResult.data?.standard_monthly_hours;

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
    standardMonthlyHours: rawHours != null ? Number(rawHours) : 173.33,
    managers: employees
      .filter((employee) => employee.employment_status !== "terminated")
      .map((employee) => ({ id: employee.id, label: employee.full_name })),
    employees,
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

  return attachWorkScheduleIds(
    [normalizeEmployee(data as unknown as EmployeeRow)],
    assignmentsResult.error
      ? []
      : (assignmentsResult.data ?? []) as WorkScheduleAssignmentRow[],
  )[0];
}
