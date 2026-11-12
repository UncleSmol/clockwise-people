import "server-only";

import { cache } from "react";
import {
  getActiveCompany,
  getCurrentUserAccess,
  getOtherBranchManagerEmployeeIds,
  requireUser,
} from "@/lib/foundation/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CompanyWorkRulesData,
  EmployeeLeaveState,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PublicHoliday,
  WorkSchedule,
} from "./schema";
import {
  defaultPayrollConfig,
  type CustomPayrollRule,
  type PayrollPeriodConfig,
} from "@/lib/reports/payroll-periods";
import { ensureCompanyToilLeaveType, ensureEmployeeToilBalance } from "./actions";
import {
  deriveGenderFromSouthAfricanId,
  isApprovedDayOffLeave,
  isBalanceEligibleLeaveType,
  isGenderAllowedForLeave,
  isToilLeave,
  normalizeLeaveTypeName,
} from "./realtime-accrual";

type LeaveRequestRow = LeaveRequest & {
  employees?: {
    avatar_url: string | null;
    employee_number: string;
    full_name: string;
    known_as: string | null;
    workstation_id?: string | null;
  }[] | {
    avatar_url: string | null;
    employee_number: string;
    full_name: string;
    known_as: string | null;
    workstation_id?: string | null;
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
    settingsResult,
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
        .select("id, full_name, employee_number, gender, id_number")
        .eq("company_id", company.id)
        .eq("employment_status", "active")
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
      supabase
        .from("company_settings")
        .select("standard_monthly_hours, standard_daily_hours, leave_rules, approval_rules, default_lunch_minutes, toil_rules")
        .eq("company_id", company.id)
        .maybeSingle(),
  ]);

  if (schedulesResult.error) throw new Error(schedulesResult.error.message);
  if (leaveTypesResult.error) throw new Error(leaveTypesResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);
  if (holidaysResult.error) throw new Error(holidaysResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const leaveRules = (settingsResult.data?.leave_rules ?? {}) as Record<string, unknown>;
  const approvalRules = (settingsResult.data?.approval_rules ?? {}) as Record<string, unknown>;
  const toilRules = (settingsResult.data?.toil_rules ?? {}) as Record<string, unknown>;
  const toilEnabled = Boolean(toilRules.enabled);
  const toilMultiplier = Number(toilRules.accrual_multiplier ?? 1.5);
  const autoEndLunchOnLapse = Boolean(
    approvalRules.auto_end_lunch_on_lapse ?? approvalRules.auto_clockout_after_lunch,
  );
  const defaultLunchMinutes = Number(settingsResult.data?.default_lunch_minutes ?? approvalRules.default_lunch_minutes ?? 60);
  const autoClockoutBasedOnSchedule = Boolean(
    approvalRules.auto_clockout_based_on_schedule ?? approvalRules.auto_clockout_after_shift_end,
  );
  const autoClockoutGraceMinutes = Number(
    approvalRules.auto_clockout_grace_minutes ?? 0,
  );

  const rawPayrollRules = approvalRules.payroll_rules as CustomPayrollRule[] | undefined;
  const payrollAssignments = (approvalRules.payroll_assignments as Record<string, string> | undefined) ?? {};
  const payrollConfig = (approvalRules.payroll_period_config as PayrollPeriodConfig | undefined) ?? defaultPayrollConfig;

  const defaultPayrollRule: CustomPayrollRule = {
    id: "company-default",
    name: payrollConfig.name || "Company Default Monthly (1st - End)",
    frequency: payrollConfig.frequency || "monthly",
    startDate: payrollConfig.startDate || payrollConfig.anchorDate || "2026-01-01",
    endDate: payrollConfig.endDate || "2026-01-31",
    anchorDate: payrollConfig.anchorDate || payrollConfig.startDate || "2026-01-01",
    customCycleDays: payrollConfig.customCycleDays,
    startDayOfMonth: payrollConfig.startDayOfMonth,
    endDayOfMonth: payrollConfig.endDayOfMonth,
    startDayOfWeek: payrollConfig.startDayOfWeek,
    payDayOffsetDays: payrollConfig.payDayOffsetDays ?? 3,
    description: payrollConfig.description || "Standard monthly payroll cycle.",
    assignedEmployeeIds: [],
  };

  const payrollRules: CustomPayrollRule[] =
    rawPayrollRules && rawPayrollRules.length > 0 ? rawPayrollRules : [defaultPayrollRule];

  const carryOverValue = leaveRules.carry_over_hours;
  const carryOverHours =
    typeof carryOverValue === "number"
      ? carryOverValue
      : typeof carryOverValue === "string" && carryOverValue.trim() !== ""
        ? Number(carryOverValue)
        : null;

  const useItOrLoseItEnabled = Boolean(leaveRules.use_it_or_lose_it_enabled ?? false);
  const carryOverCapHours =
    typeof leaveRules.carry_over_cap_hours === "number"
      ? leaveRules.carry_over_cap_hours
      : typeof leaveRules.carry_over_cap_hours === "string" && leaveRules.carry_over_cap_hours.trim() !== ""
        ? Number(leaveRules.carry_over_cap_hours)
        : carryOverHours;
  const annualLeaveCapHours =
    typeof leaveRules.annual_leave_cap_hours === "number"
      ? leaveRules.annual_leave_cap_hours
      : typeof leaveRules.annual_leave_cap_hours === "string" && leaveRules.annual_leave_cap_hours.trim() !== ""
        ? Number(leaveRules.annual_leave_cap_hours)
        : null;
  const lockImportedBaselines = Boolean(leaveRules.lock_imported_leave_baselines ?? true);
  const accrualBaselineDate = (leaveRules.accrual_baseline_date as string) || null;
  const preventAdditiveImportStacking = Boolean(leaveRules.prevent_additive_import_stacking ?? true);
  const standardDailyHours = Number(settingsResult.data?.standard_daily_hours ?? 8);
  const standardAnnualHours = Number(settingsResult.data?.standard_monthly_hours ?? 173.33) * 12;

  const rawLeaveTypes = (leaveTypesResult.data ?? []) as LeaveType[];
  const filteredLeaveTypes = rawLeaveTypes
    .filter((lt) => toilEnabled || !isToilLeave(lt.name, lt.category));

  // Deduplicate leave types by normalized name
  const dedupedCompanyTypesMap = new Map<string, LeaveType>();
  for (const lt of filteredLeaveTypes) {
    const key = normalizeLeaveTypeName(lt.name, lt.category);
    if (!dedupedCompanyTypesMap.has(key)) {
      dedupedCompanyTypesMap.set(key, lt);
    }
  }
  const leaveTypes = Array.from(dedupedCompanyTypesMap.values());

  const employeeGenderMap = new Map<string, string | null>();
  for (const emp of employeesResult.data ?? []) {
    const resolved = (emp.gender?.trim() || deriveGenderFromSouthAfricanId(emp.id_number) || null)?.toLowerCase() ?? null;
    employeeGenderMap.set(emp.id, resolved);
  }

  const rawLeaveBalances = ((balancesResult.data ?? []) as unknown as CompanyWorkRulesData["leaveBalances"])
    .filter((balance) => (employeesResult.data ?? []).some((emp) => emp.id === balance.employee_id))
    .filter((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      const name = rel?.name || "";
      const category = rel?.category;
      if (!isBalanceEligibleLeaveType(name, category, toilEnabled)) return false;
      const empGender = employeeGenderMap.get(b.employee_id);
      if (!isGenderAllowedForLeave(name, category, empGender)) return false;
      return true;
    });

  // Deduplicate leave balances per employee & canonical leave type
  const dedupedCompanyBalancesMap = new Map<string, CompanyWorkRulesData["leaveBalances"][0]>();
  for (const b of rawLeaveBalances) {
    const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
    const key = `${b.employee_id}_${normalizeLeaveTypeName(rel?.name || "", rel?.category)}`;
    const canonicalLt = dedupedCompanyTypesMap.get(normalizeLeaveTypeName(rel?.name || "", rel?.category)) || rel;
    if (!dedupedCompanyBalancesMap.has(key)) {
      dedupedCompanyBalancesMap.set(key, {
        ...b,
        leave_type_id: canonicalLt?.id || b.leave_type_id,
        leave_types: canonicalLt,
      });
    } else {
      // Prefer the row matching the active canonical leave type, rather than additive stacking
      if (canonicalLt && b.leave_type_id === canonicalLt.id) {
        dedupedCompanyBalancesMap.set(key, {
          ...b,
          leave_type_id: canonicalLt.id,
          leave_types: canonicalLt,
        });
      }
    }
  }
  const leaveBalances = Array.from(dedupedCompanyBalancesMap.values());

  return {
    autoEndLunchOnLapse,
    autoClockoutAfterLunch: autoEndLunchOnLapse,
    defaultLunchMinutes: defaultLunchMinutes > 0 ? defaultLunchMinutes : 60,
    autoClockoutBasedOnSchedule,
    autoClockoutGraceMinutes: autoClockoutGraceMinutes >= 0 ? autoClockoutGraceMinutes : 0,
    carryOverHours: carryOverHours !== null && Number.isFinite(carryOverHours) ? carryOverHours : null,
    useItOrLoseItEnabled,
    carryOverCapHours: carryOverCapHours !== null && Number.isFinite(carryOverCapHours) ? carryOverCapHours : null,
    annualLeaveCapHours: annualLeaveCapHours !== null && Number.isFinite(annualLeaveCapHours) ? annualLeaveCapHours : null,
    lockImportedBaselines,
    accrualBaselineDate,
    preventAdditiveImportStacking,
    standardDailyHours,
    employees: (employeesResult.data ?? []).map((employee) => ({
      id: employee.id,
      label: employee.employee_number
        ? `${employee.full_name} (${employee.employee_number})`
        : employee.full_name,
      gender: (employee.gender?.trim() || deriveGenderFromSouthAfricanId(employee.id_number) || null)?.toLowerCase(),
    })),
    leaveBalances,
    leaveTypes,
    publicHolidays: (holidaysResult.data ?? []) as PublicHoliday[],
    schedules: (schedulesResult.data ?? []) as unknown as WorkSchedule[],
    standardAnnualHours,
    payrollRules,
    payrollAssignments,
    payrollConfig,
    toilEnabled,
    toilMultiplier,
  };
});

export const getEmployeeLeaveState = cache(async function getEmployeeLeaveState(): Promise<EmployeeLeaveState> {
  const [access, { company }, { supabase }] = await Promise.all([
    getCurrentUserAccess(),
    getActiveCompany(),
    requireUser(),
  ]);

  if (!access.employeeId) {
    return {
      balances: [],
      carryOverHours: null,
      leaveTypes: [],
      requests: [],
      standardAnnualHours: 0,
      standardDailyHours: 0,
    };
  }

  const [leaveTypesResult, balancesResult, requestsResult, settingsResult, employeeResult] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, name, category, is_paid, requires_attachment, accrual_rules")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, leave_types(id, name, category, is_paid, requires_attachment, accrual_rules)")
      .eq("company_id", company.id)
      .eq("employee_id", access.employeeId),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, total_hours, reason, attachment_url, status, submitted_at, rejection_reason, use_toil_first, toil_hours_used, leave_types(name)")
      .eq("company_id", company.id)
      .eq("employee_id", access.employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("company_settings")
      .select("standard_daily_hours, standard_monthly_hours, leave_rules, toil_rules")
      .eq("company_id", company.id)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, gender, id_number")
      .eq("id", access.employeeId)
      .maybeSingle(),
  ]);

  if (leaveTypesResult.error) throw new Error(leaveTypesResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);
  if (requestsResult.error) throw new Error(requestsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const rawGender = employeeResult?.data?.gender;
  const rawIdNumber = employeeResult?.data?.id_number;
  const employeeGender = (rawGender?.trim() || deriveGenderFromSouthAfricanId(rawIdNumber) || null)?.toLowerCase() as "male" | "female" | "other" | null;

  const leaveRules = (settingsResult.data?.leave_rules ?? {}) as Record<string, unknown>;
  const toilRules = (settingsResult.data?.toil_rules ?? {}) as Record<string, unknown>;
  const toilEnabled = Boolean(toilRules?.enabled);
  const toilMultiplier = Number(toilRules?.accrual_multiplier ?? 1.5);

  let leaveTypes = (leaveTypesResult.data ?? []) as LeaveType[];
  let balances = (balancesResult.data ?? []) as unknown as LeaveBalance[];

  if (toilEnabled) {
    // Ensure TOIL leave type exists for employee selection only when TOIL is active
    let toilType = leaveTypes.find((lt) => lt.category === "toil_taken");
    if (!toilType) {
      try {
        const ensured = await ensureCompanyToilLeaveType(company.id);
        if (ensured) {
          toilType = ensured as LeaveType;
          leaveTypes = [...leaveTypes, toilType];
        }
      } catch {
        // Non-fatal fallback
      }
    }

    // Ensure employee has a TOIL balance row (even if 0.00h)
    const hasToilBalance = balances.some((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      return rel?.category === "toil_taken" || rel?.id === toilType?.id;
    });

    if (toilType && !hasToilBalance && access.employeeId) {
      try {
        const ensuredBal = (await ensureEmployeeToilBalance(company.id, access.employeeId, toilType.id)) as Record<string, unknown> | null;
        if (ensuredBal) {
          balances = [
            ...balances,
            {
              ...ensuredBal,
              company_id: company.id,
              employee_id: access.employeeId,
              leave_type_id: toilType.id,
              leave_types: toilType,
            } as unknown as LeaveBalance,
          ];
        }
      } catch {
        balances = [
          ...balances,
          {
            id: `toil-bal-${toilType.id}`,
            company_id: company.id,
            employee_id: access.employeeId,
            leave_type_id: toilType.id,
            balance_hours: 0,
            accrued_hours: 0,
            taken_hours: 0,
            leave_types: toilType,
          } as unknown as LeaveBalance,
        ];
      }
    }
  } else {
    // When TOIL is disabled (off by default), strip all TOIL leave types and balances completely
    leaveTypes = leaveTypes.filter((lt) => !isToilLeave(lt.name, lt.category));
    balances = balances.filter((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      return !isToilLeave(rel?.name, rel?.category);
    });
  }

  // If no leave types exist for company, supply standard statutory BCEA leave types
  if (leaveTypes.length === 0) {
    const defaultStatutory: LeaveType[] = [
      {
        id: "stat-annual",
        name: "Annual Leave",
        category: "annual",
        is_paid: true,
        requires_attachment: false,
        accrual_rules: {},
      },
      {
        id: "stat-sick",
        name: "Sick Leave",
        category: "sick",
        is_paid: true,
        requires_attachment: true,
        accrual_rules: {},
      },
      {
        id: "stat-family",
        name: "Family Responsibility Leave",
        category: "family_responsibility",
        is_paid: true,
        requires_attachment: false,
        accrual_rules: {},
      },
    ];
    leaveTypes = defaultStatutory;
  }

  // 1. Filter leave types and balances based on employee gender:
  // Male: sees Paternal Leave, cannot see Maternal Leave
  // Female: sees Maternal Leave, cannot see Paternal Leave
  // No gender: sees neither!
  leaveTypes = leaveTypes.filter((lt) => isGenderAllowedForLeave(lt.name, lt.category, employeeGender));
  balances = balances.filter((b) => {
    const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
    const name = rel?.name || "";
    const category = rel?.category;
    if (!isBalanceEligibleLeaveType(name, category, toilEnabled)) return false;
    return isGenderAllowedForLeave(name, category, employeeGender);
  });

  // Approved Day Off is strictly reserved for managers and admins as per the app's roles
  const canManageOrReview =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.isBranchManager ||
    access.canManageCompany ||
    access.canReviewBranchTime;

  if (!canManageOrReview) {
    leaveTypes = leaveTypes.filter((lt) => !isApprovedDayOffLeave(lt.name, lt.category));
    balances = balances.filter((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      return !isApprovedDayOffLeave(rel?.name, rel?.category);
    });
  }

  // 2. Deduplicate leave types by canonical name so employee never gets duplicate options
  const dedupedEmployeeTypesMap = new Map<string, LeaveType>();
  for (const lt of leaveTypes) {
    const key = normalizeLeaveTypeName(lt.name, lt.category);
    if (!dedupedEmployeeTypesMap.has(key)) {
      dedupedEmployeeTypesMap.set(key, lt);
    } else {
      const existing = dedupedEmployeeTypesMap.get(key)!;
      // Prefer the one with accrual rules or cleaner name
      if (!existing.accrual_rules && lt.accrual_rules) {
        dedupedEmployeeTypesMap.set(key, lt);
      }
    }
  }
  leaveTypes = Array.from(dedupedEmployeeTypesMap.values());

  // 3. Deduplicate balances by canonical normalized key
  const dedupedEmployeeBalancesMap = new Map<string, LeaveBalance>();
  for (const b of balances) {
    const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
    const key = normalizeLeaveTypeName(rel?.name || "", rel?.category);
    const canonicalLt = dedupedEmployeeTypesMap.get(key) || rel;
    if (!dedupedEmployeeBalancesMap.has(key)) {
      dedupedEmployeeBalancesMap.set(key, {
        ...b,
        leave_type_id: canonicalLt?.id || b.leave_type_id,
        leave_types: canonicalLt,
      } as LeaveBalance);
    } else {
      // Prefer the row matching the active canonical leave type, rather than additive stacking
      if (canonicalLt && b.leave_type_id === canonicalLt.id) {
        dedupedEmployeeBalancesMap.set(key, {
          ...b,
          leave_type_id: canonicalLt.id,
          leave_types: canonicalLt,
        } as LeaveBalance);
      }
    }
  }
  balances = Array.from(dedupedEmployeeBalancesMap.values());

  // 4. Ensure every active canonical leave type has a corresponding balance row for the employee
  const existingCanonicalKeys = new Set(
    balances.map((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      return normalizeLeaveTypeName(rel?.name || "", rel?.category);
    }),
  );

  const missingTypes = leaveTypes.filter(
    (lt) =>
      isBalanceEligibleLeaveType(lt.name, lt.category, toilEnabled) &&
      !existingCanonicalKeys.has(normalizeLeaveTypeName(lt.name, lt.category)),
  );

  if (missingTypes.length > 0 && access.employeeId) {
    const today = new Date().toISOString().split("T")[0];
    const newBalances = missingTypes.map((lt) => ({
      id: `auto-${lt.id}`,
      company_id: company.id,
      employee_id: access.employeeId,
      leave_type_id: lt.id,
      balance_hours: 0,
      accrued_hours: 0,
      taken_hours: 0,
      adjusted_hours: 0,
      as_of_date: today,
      leave_types: lt,
    } as unknown as LeaveBalance));

    balances = [...balances, ...newBalances];

    // Attempt to persist missing rows to leave_balances in database asynchronously
    if (access.employeeId) {
      try {
        await supabase.from("leave_balances").upsert(
          missingTypes.map((lt) => ({
            company_id: company.id,
            employee_id: access.employeeId,
            leave_type_id: lt.id,
            balance_hours: 0,
            accrued_hours: 0,
            taken_hours: 0,
            adjusted_hours: 0,
            as_of_date: today,
          })),
          { onConflict: "company_id,employee_id,leave_type_id", ignoreDuplicates: true }
        );
      } catch {
        // Non-fatal fallback
      }
    }
  }

  // Sort statutory balances to the top: Annual -> Sick -> Family -> TOIL -> Others
  balances = [...balances].sort((a, b) => {
    const relA = Array.isArray(a.leave_types) ? a.leave_types[0] : a.leave_types;
    const relB = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
    const catA = (relA?.category ?? "").toLowerCase();
    const catB = (relB?.category ?? "").toLowerCase();
    const nameA = (relA?.name ?? "").toLowerCase();
    const nameB = (relB?.name ?? "").toLowerCase();
    const score = (cat: string, name: string) => {
      if (cat === "annual" || name.includes("annual")) return 1;
      if (cat === "sick" || name.includes("sick")) return 2;
      if (cat === "family_responsibility" || name.includes("family")) return 3;
      if (cat === "toil_taken" || name.includes("toil")) return 4;
      return 10;
    };
    return score(catA, nameA) - score(catB, nameB);
  });

  const requests = ((requestsResult.data ?? []) as unknown as LeaveRequestRow[]).map(
    (request) => ({
      ...request,
      leaveTypeName: firstRelation(request.leave_types)?.name,
    }),
  );

  const carryOverValue = leaveRules.carry_over_hours;
  const carryOverHours =
    typeof carryOverValue === "number"
      ? carryOverValue
      : typeof carryOverValue === "string" && carryOverValue.trim() !== ""
        ? Number(carryOverValue)
        : null;

  return {
    balances,
    carryOverHours: carryOverHours !== null && Number.isFinite(carryOverHours) ? carryOverHours : null,
    leaveTypes,
    requests,
    standardAnnualHours: Number(settingsResult.data?.standard_monthly_hours ?? 173.33) * 12,
    standardDailyHours: Number(settingsResult.data?.standard_daily_hours ?? 8),
    toilMultiplier,
    toilEnabled,
    employeeGender,
  };
});

export const getCompanyLeaveRequestQueue = cache(async function getCompanyLeaveRequestQueue(): Promise<LeaveRequest[]> {
  const [{ company }, access, { supabase }] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
    requireUser(),
  ]);

  const canReview =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.isBranchManager ||
    access.canManageCompany ||
    access.canReviewBranchTime ||
    access.canManageDirectReports;

  if (!canReview) {
    return [];
  }

  if (access.isScopedBranchManager && !access.scopedWorkstationId) {
    return [];
  }

  // Use admin client when user has Root Admin, Admin, or Manager role to guarantee complete queue visibility across tenants
  const client =
    access.isSuperAdmin ||
    access.isSuperUser ||
    access.isOwner ||
    access.isHrAdmin ||
    access.isBranchManager ||
    access.canManageCompany
      ? createSupabaseAdminClient()
      : supabase;

  const { data, error } = await client
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, total_hours, reason, attachment_url, status, submitted_at, rejection_reason, use_toil_first, toil_hours_used, employees(employee_number, full_name, known_as, avatar_url, workstation_id), leave_types(name)")
    .eq("company_id", company.id)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const otherBranchManagerIds = access.isScopedBranchManager
    ? await getOtherBranchManagerEmployeeIds(company.id, access.employeeId)
    : new Set<string>();

  return ((data ?? []) as unknown as LeaveRequestRow[])
    .filter((request) => {
      if (!access.isScopedBranchManager) return true;
      if (otherBranchManagerIds.has(request.employee_id)) return false;
      if (access.employeeId && request.employee_id === access.employeeId) return false;
      const employee = firstRelation(request.employees);
      return employee?.workstation_id === access.scopedWorkstationId;
    })
    .map((request) => {
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
