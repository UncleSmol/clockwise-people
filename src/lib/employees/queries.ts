import "server-only";

import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";
import type { EmployeeRecord, SelectOption } from "./schema";

export type EmployeePageData = {
  isConfigured: boolean;
  companyName: string | null;
  branches: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  schedules: SelectOption[];
  employees: EmployeeRecord[];
};

type EmployeeRow = EmployeeRecord & {
  branches?: { name: string }[] | { name: string } | null;
  departments?: { name: string }[] | { name: string } | null;
};

function relationName(
  relation?: { name: string }[] | { name: string } | null,
) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? null;
  }

  return relation?.name ?? null;
}

function normalizeEmployee(row: EmployeeRow): EmployeeRecord {
  const { branches, departments, ...employee } = row;

  return {
    ...employee,
    branch_name: relationName(branches),
    department_name: relationName(departments),
  };
}

export async function getEmployeePageData(): Promise<EmployeePageData> {
  if (!hasSupabaseConfig()) {
    return {
      isConfigured: false,
      companyName: null,
      branches: [],
      departments: [],
      managers: [],
      schedules: [],
      employees: [],
    };
  }

  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();

  const [branchesResult, departmentsResult, schedulesResult, employeesResult] = await Promise.all([
    supabase
      .from("branches")
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
      .from("employees")
      .select(
        "id, company_id, employee_number, full_name, known_as, email, phone_number, avatar_url, branch_id, department_id, job_title, employment_type, employment_status, start_date, work_schedule_id, manager_employee_id, user_id, payroll_identifier, monthly_salary, hourly_rate, compensation_type, deleted_at, branches(name), departments(name)",
      )
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  if (branchesResult.error) {
    throw new Error(branchesResult.error.message);
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

  const employees = ((employeesResult.data ?? []) as unknown as EmployeeRow[]).map(
    normalizeEmployee,
  );

  return {
    isConfigured: true,
    companyName: company.name,
    branches: (branchesResult.data ?? []).map((branch) => ({
      id: branch.id,
      label: branch.name,
    })),
    departments: (departmentsResult.data ?? []).map((department) => ({
      id: department.id,
      label: department.name,
    })),
    schedules: (schedulesResult.data ?? []).map((schedule) => ({
      id: schedule.id,
      label: schedule.name,
    })),
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

  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, company_id, employee_number, full_name, known_as, email, phone_number, avatar_url, branch_id, department_id, job_title, employment_type, employment_status, start_date, work_schedule_id, manager_employee_id, user_id, payroll_identifier, monthly_salary, hourly_rate, compensation_type, deleted_at, branches(name), departments(name)",
    )
    .eq("company_id", company.id)
    .eq("id", employeeId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeEmployee(data as unknown as EmployeeRow);
}
