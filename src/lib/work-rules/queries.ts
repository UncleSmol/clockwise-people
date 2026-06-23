import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  requireUser,
} from "@/lib/foundation/queries";
import type {
  CompanyWorkRulesData,
  EmployeeLeaveState,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PublicHoliday,
  WorkSchedule,
} from "./schema";

type LeaveRequestRow = LeaveRequest & {
  employees?: {
    avatar_url: string | null;
    employee_number: string;
    full_name: string;
    known_as: string | null;
  }[] | {
    avatar_url: string | null;
    employee_number: string;
    full_name: string;
    known_as: string | null;
  } | null;
  leave_types?: { name: string }[] | { name: string } | null;
};

function firstRelation<T>(relation?: T[] | T | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

export const getCompanyWorkRulesData = cache(async function getCompanyWorkRulesData(): Promise<CompanyWorkRulesData> {
  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();

  const [
    schedulesResult,
    leaveTypesResult,
    employeesResult,
    balancesResult,
    holidaysResult,
  ] = await Promise.all([
      supabase
        .from("work_schedules")
        .select(
          "id, name, standard_daily_hours, schedule_days(day_of_week, start_time, end_time, lunch_minutes, paid_hours, is_working_day)",
        )
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("leave_types")
        .select("id, name, category, is_paid, requires_attachment, accrual_rules")
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("employees")
        .select("id, full_name, employee_number")
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .order("full_name"),
      supabase
        .from("leave_balances")
        .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, leave_types(id, name, category, is_paid, requires_attachment, accrual_rules)")
        .eq("company_id", company.id),
      supabase
        .from("company_public_holidays")
        .select("id, holiday_date, name, is_paid")
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .order("holiday_date", { ascending: false })
        .limit(20),
  ]);

  if (schedulesResult.error) throw new Error(schedulesResult.error.message);
  if (leaveTypesResult.error) throw new Error(leaveTypesResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);
  if (holidaysResult.error) throw new Error(holidaysResult.error.message);

  return {
    employees: (employeesResult.data ?? []).map((employee) => ({
      id: employee.id,
      label: `${employee.full_name} (${employee.employee_number})`,
    })),
    leaveBalances: (balancesResult.data ?? []) as unknown as CompanyWorkRulesData["leaveBalances"],
    leaveTypes: (leaveTypesResult.data ?? []) as LeaveType[],
    publicHolidays: (holidaysResult.data ?? []) as PublicHoliday[],
    schedules: (schedulesResult.data ?? []) as unknown as WorkSchedule[],
  };
});

export const getEmployeeLeaveState = cache(async function getEmployeeLeaveState(): Promise<EmployeeLeaveState> {
  const [access, { company }, { supabase }] = await Promise.all([
    getCurrentUserAccess(),
    getActiveCompany(),
    requireUser(),
  ]);

  if (!access.employeeId) {
    return { balances: [], leaveTypes: [], requests: [] };
  }

  const [leaveTypesResult, balancesResult, requestsResult] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, name, category, is_paid, requires_attachment, accrual_rules")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("id, balance_hours, accrued_hours, taken_hours, leave_types(id, name, category, is_paid, requires_attachment, accrual_rules)")
      .eq("company_id", company.id)
      .eq("employee_id", access.employeeId),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, total_hours, reason, attachment_url, status, submitted_at, rejection_reason, leave_types(name)")
      .eq("company_id", company.id)
      .eq("employee_id", access.employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  if (leaveTypesResult.error) throw new Error(leaveTypesResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);
  if (requestsResult.error) throw new Error(requestsResult.error.message);

  const requests = ((requestsResult.data ?? []) as unknown as LeaveRequestRow[]).map(
    (request) => ({
      ...request,
      leaveTypeName: firstRelation(request.leave_types)?.name,
    }),
  );

  return {
    balances: (balancesResult.data ?? []) as unknown as LeaveBalance[],
    leaveTypes: (leaveTypesResult.data ?? []) as LeaveType[],
    requests,
  };
});

export const getCompanyLeaveRequestQueue = cache(async function getCompanyLeaveRequestQueue(): Promise<LeaveRequest[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  if (!access.canReviewBranchTime && !access.canManageDirectReports) {
    return [];
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, total_hours, reason, attachment_url, status, submitted_at, rejection_reason, employees(employee_number, full_name, known_as, avatar_url), leave_types(name)")
    .eq("company_id", company.id)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as LeaveRequestRow[]).map((request) => {
    const employee = firstRelation(request.employees);
    const leaveType = firstRelation(request.leave_types);

    return {
      ...request,
      avatarUrl: employee?.avatar_url ?? null,
      employeeNumber: employee?.employee_number ?? "",
      fullName: employee?.full_name ?? "Unknown employee",
      knownAs: employee?.known_as ?? null,
      leaveTypeName: leaveType?.name,
    };
  });
});
