import "server-only";

import { cache } from "react";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";
import type {
  CompanyGeolocationData,
  CompanyWorkstation,
  EmployeeWorkstationAssignment,
  WorkstationEmployeeOption,
} from "./schema";

type WorkstationRow = CompanyWorkstation & {
  branches?: { name: string }[] | { name: string } | null;
};

function relationName(relation?: { name: string }[] | { name: string } | null) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? null;
  }

  return relation?.name ?? null;
}

function isMissingGeolocationSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message?.includes("company_workstations") ||
    error.message?.includes("employee_workstation_assignments") ||
    error.message?.includes("schema cache")
  );
}

export const getCompanyGeolocationData = cache(async function getCompanyGeolocationData(): Promise<CompanyGeolocationData> {
  const [{ company }, { supabase }] = await Promise.all([
    getActiveCompany(),
    requireUser(),
  ]);

  const [workstationsResult, assignmentsResult, employeesResult] = await Promise.all([
    supabase
      .from("company_workstations")
      .select(
        "id, company_id, branch_id, name, address, latitude, longitude, radius_meters, is_active, branches(name)",
      )
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("employee_workstation_assignments")
      .select("employee_id, workstation_id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("employees")
      .select("id, full_name, employee_number")
      .eq("company_id", company.id)
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  if (
    isMissingGeolocationSchema(workstationsResult.error) ||
    isMissingGeolocationSchema(assignmentsResult.error)
  ) {
    return {
      assignments: [],
      employees: (employeesResult.data ?? []).map((employee) => ({
        id: employee.id,
        label: `${employee.full_name} (${employee.employee_number})`,
        workstation_id: null,
      })) as WorkstationEmployeeOption[],
      workstations: [],
    };
  }

  if (workstationsResult.error) throw new Error(workstationsResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);

  const assignments = (assignmentsResult.data ?? []) as EmployeeWorkstationAssignment[];
  const workstationAssignments = assignments.reduce<Record<string, number>>(
    (counts, assignment) => {
      counts[assignment.workstation_id] = (counts[assignment.workstation_id] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const assignmentsByEmployee = new Map(
    assignments.map((assignment) => [assignment.employee_id, assignment.workstation_id]),
  );

  return {
    assignments,
    employees: (employeesResult.data ?? []).map((employee) => ({
      id: employee.id,
      label: `${employee.full_name} (${employee.employee_number})`,
      workstation_id: assignmentsByEmployee.get(employee.id) ?? null,
    })) as WorkstationEmployeeOption[],
    workstations: ((workstationsResult.data ?? []) as unknown as WorkstationRow[]).map(
      (workstation) => {
        const { branches, ...record } = workstation;

        return {
          ...record,
          assigned_employee_count: workstationAssignments[workstation.id] ?? 0,
          branch_name: relationName(branches),
          latitude: Number(workstation.latitude),
          longitude: Number(workstation.longitude),
          radius_meters: Number(workstation.radius_meters),
        };
      },
    ),
  };
});
