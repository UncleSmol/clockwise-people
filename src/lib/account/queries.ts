import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import type { AppRole } from "@/lib/foundation/schema";

type EmployeeAccountRow = {
  id: string;
  employee_number: string;
  full_name: string;
  known_as: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  job_title: string | null;
  employment_type: string;
  employment_status: string;
  start_date: string;
  manager_employee_id: string | null;
  payroll_identifier: string | null;
  compensation_type: string;
  monthly_salary: number | string | null;
  hourly_rate: number | string | null;
  branches?: { name: string; code: string | null; address: string | null }[] | {
    name: string;
    code: string | null;
    address: string | null;
  } | null;
  departments?: { name: string; code: string | null }[] | {
    name: string;
    code: string | null;
  } | null;
};

type TimeSummaryRow = {
  paid_hours: number | string | null;
  overtime_hours: number | string | null;
  missing_clocking: boolean | null;
  late_arrival: boolean | null;
  early_departure: boolean | null;
};

function firstRelation<T>(relation?: T[] | T | null) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function numberValue(value: number | string | null) {
  return Number(value ?? 0);
}

export const getAccountProfile = cache(async function getAccountProfile() {
  const [{ company }, access, { supabase, user }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  const [employeeResult, timeResult] = access.employeeId
    ? await Promise.all([
        supabase
          .from("employees")
          .select(
            "id, employee_number, full_name, known_as, email, phone_number, avatar_url, job_title, employment_type, employment_status, start_date, manager_employee_id, payroll_identifier, compensation_type, monthly_salary, hourly_rate, branches(name, code, address), departments(name, code)",
          )
          .eq("id", access.employeeId)
          .is("deleted_at", null)
          .single(),
        supabase
          .from("time_entries")
          .select("paid_hours, overtime_hours, missing_clocking, late_arrival, early_departure")
          .eq("employee_id", access.employeeId)
          .is("deleted_at", null)
          .order("work_date", { ascending: false })
          .limit(30),
      ])
    : [null, null];

  if (employeeResult?.error) {
    throw new Error(employeeResult.error.message);
  }

  if (timeResult?.error) {
    throw new Error(timeResult.error.message);
  }

  const employee = employeeResult?.data as unknown as EmployeeAccountRow | null;
  const branch = firstRelation(employee?.branches);
  const department = firstRelation(employee?.departments);
  const timeRows = (timeResult?.data ?? []) as TimeSummaryRow[];

  return {
    account: {
      email: user.email ?? null,
      roles: access.roles as AppRole[],
      canManageCompany: access.canManageCompany,
      company,
      companyName: company.name,
      companyTimezone: company.timezone,
    },
    employee: employee
      ? {
          id: employee.id,
          employeeNumber: employee.employee_number,
          fullName: employee.full_name,
          knownAs: employee.known_as,
          email: employee.email,
          phoneNumber: employee.phone_number,
          avatarUrl: employee.avatar_url,
          jobTitle: employee.job_title,
          employmentType: employee.employment_type,
          employmentStatus: employee.employment_status,
          startDate: employee.start_date,
          managerEmployeeId: employee.manager_employee_id,
          payrollIdentifier: employee.payroll_identifier,
          compensationType: employee.compensation_type,
          monthlySalary: employee.monthly_salary,
          hourlyRate: employee.hourly_rate,
          branch,
          department,
        }
      : null,
    timeSummary: {
      entriesCount: timeRows.length,
      paidHours: timeRows.reduce(
        (total, row) => total + numberValue(row.paid_hours),
        0,
      ),
      overtimeHours: timeRows.reduce(
        (total, row) => total + numberValue(row.overtime_hours),
        0,
      ),
      warningCount: timeRows.filter(
        (row) => row.missing_clocking || row.late_arrival || row.early_departure,
      ).length,
    },
  };
});
