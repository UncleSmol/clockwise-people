"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Heart,
  HelpCircle,
  Layers,
  Palmtree,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import type { CompanyWorkRulesData } from "@/lib/work-rules/schema";

export type LeaveHistoryItem = {
  id: string;
  employee_id?: string;
  employeeId?: string;
  employeeName?: string;
  employeeNumber?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  total_hours?: number | string;
  totalHours?: number | string;
  status: string;
  leaveTypeName: string;
};

type CompanyAllAccrualsTableProps = {
  data: CompanyWorkRulesData;
  initialEmployeeId?: string | null;
  leaveHistory?: LeaveHistoryItem[];
};

function formatHours(hours: number | string | null | undefined): string {
  const num = Number(hours ?? 0);
  return `${num.toFixed(2)}h`;
}

function hoursToDays(hours: number | string | null | undefined, dailyHours = 8): string {
  const num = Number(hours ?? 0);
  const days = num / dailyHours;
  return `${days.toFixed(1)}d`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

type EnrichedBalance = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveCategory: string;
  isPaid: boolean;
  requiresAttachment: boolean;
  accruedHours: number;
  takenHours: number;
  balanceHours: number;
};

function getCategoryMeta(category: string) {
  const cat = category.toLowerCase();
  if (cat.includes("annual")) {
    return {
      label: "Annual Leave",
      icon: Palmtree,
      badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
      dotClass: "bg-emerald-500",
      cardBg: "from-emerald-500/5 to-transparent border-emerald-500/30",
      statutoryNote: "BCEA Sec 20: Accrues 1h per 17h worked (21 consecutive days / year)",
    };
  }
  if (cat.includes("sick")) {
    return {
      label: "Sick Leave",
      icon: ShieldAlert,
      badgeClass: "bg-rose-500/10 text-rose-700 border-rose-500/30",
      dotClass: "bg-rose-500",
      cardBg: "from-rose-500/5 to-transparent border-rose-500/30",
      statutoryNote: "BCEA Sec 22: 30 days per 36-month cycle on full pay",
    };
  }
  if (cat.includes("family") || cat.includes("maternity") || cat.includes("parental")) {
    return {
      label: "Family Responsibility",
      icon: Heart,
      badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
      dotClass: "bg-amber-500",
      cardBg: "from-amber-500/5 to-transparent border-amber-500/30",
      statutoryNote: "BCEA Sec 27: 3 days paid per annual cycle for family emergencies",
    };
  }
  if (cat.includes("toil")) {
    return {
      label: "TOIL (Overtime)",
      icon: Zap,
      badgeClass: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
      dotClass: "bg-indigo-500",
      cardBg: "from-indigo-500/5 to-transparent border-indigo-500/30",
      statutoryNote: "BCEA Sec 10: 1.5× time off in lieu for approved overtime worked",
    };
  }
  if (cat.includes("study")) {
    return {
      label: "Study Leave",
      icon: Briefcase,
      badgeClass: "bg-sky-500/10 text-sky-700 border-sky-500/30",
      dotClass: "bg-sky-500",
      cardBg: "from-sky-500/5 to-transparent border-sky-500/30",
      statutoryNote: "Company policy: Dedicated examination and course preparation allocation",
    };
  }
  return {
    label: category || "Standard Leave",
    icon: CalendarDays,
    badgeClass: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    dotClass: "bg-slate-500",
    cardBg: "from-slate-500/5 to-transparent border-slate-500/30",
    statutoryNote: "Standard company leave allocation policy",
  };
}

export default function CompanyAllAccrualsTable({
  data,
  initialEmployeeId = null,
  leaveHistory = [],
}: CompanyAllAccrualsTableProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployeeId || "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  // Map employee info
  const employeeMap = useMemo(() => {
    const map = new Map<string, { full_name: string; employee_number: string }>();
    for (const emp of data.employees) {
      const match = emp.label.match(/^(.*?)(?:\s*\((.*?)\))?$/);
      map.set(emp.id, {
        full_name: match?.[1]?.trim() || emp.label,
        employee_number: match?.[2]?.trim() || "EMP",
      });
    }
    return map;
  }, [data.employees]);

  // Sorted list of employees for picker
  const employeePickerList = useMemo(() => {
    return [...data.employees].sort((a, b) => a.label.localeCompare(b.label));
  }, [data.employees]);

  // Combine balances with employee & leave type details
  const enrichedBalances = useMemo<EnrichedBalance[]>(() => {
    const balances = data.leaveBalances ?? [];
    return balances.map((b) => {
      const emp = employeeMap.get(b.employee_id);
      const leaveType = Array.isArray(b.leave_types)
        ? b.leave_types[0]
        : b.leave_types;

      return {
        id: b.id,
        employeeId: b.employee_id,
        employeeName: emp?.full_name ?? "Unknown Employee",
        employeeNumber: emp?.employee_number ?? "",
        leaveTypeId: b.leave_type_id,
        leaveTypeName: leaveType?.name ?? "Standard Leave",
        leaveCategory: leaveType?.category ?? "annual",
        isPaid: leaveType?.is_paid ?? true,
        requiresAttachment: leaveType?.requires_attachment ?? false,
        accruedHours: Number(b.accrued_hours ?? 0),
        takenHours: Number(b.taken_hours ?? 0),
        balanceHours: Number(b.balance_hours ?? 0),
      };
    });
  }, [data.leaveBalances, employeeMap]);

  // Unique categories/types for filter
  const leaveTypesList = useMemo(() => {
    const set = new Set<string>();
    enrichedBalances.forEach((b: EnrichedBalance) => set.add(b.leaveTypeName));
    return Array.from(set).sort();
  }, [enrichedBalances]);

  // Active selected employee info (if not "all")
  const selectedEmployeeInfo = useMemo(() => {
    if (selectedEmployeeId === "all") return null;
    const fromMap = employeeMap.get(selectedEmployeeId);
    if (fromMap) {
      return {
        id: selectedEmployeeId,
        full_name: fromMap.full_name,
        employee_number: fromMap.employee_number,
      };
    }
    const found = data.employees.find((e) => e.id === selectedEmployeeId);
    if (found) {
      const match = found.label.match(/^(.*?)(?:\s*\((.*?)\))?$/);
      return {
        id: found.id,
        full_name: match?.[1]?.trim() || found.label,
        employee_number: match?.[2]?.trim() || "EMP",
      };
    }
    return {
      id: selectedEmployeeId,
      full_name: "Selected Employee",
      employee_number: "EMP",
    };
  }, [selectedEmployeeId, employeeMap, data.employees]);

  // Balances filtered by employee
  const employeeBalances = useMemo(() => {
    if (selectedEmployeeId === "all") return enrichedBalances;
    return enrichedBalances.filter((b) => b.employeeId === selectedEmployeeId);
  }, [enrichedBalances, selectedEmployeeId]);

  // Balances filtered by employee + search + leave type
  const filteredBalances = useMemo<EnrichedBalance[]>(() => {
    return employeeBalances.filter((b: EnrichedBalance) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        b.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.leaveTypeName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        selectedType === "all" || b.leaveTypeName === selectedType;

      return matchesSearch && matchesType;
    });
  }, [employeeBalances, searchQuery, selectedType]);

  // Summary Totals
  const totals = useMemo(() => {
    let totalAccrued = 0;
    let totalTaken = 0;
    let totalNet = 0;
    const uniqueEmployees = new Set<string>();

    for (const b of filteredBalances) {
      totalAccrued += b.accruedHours;
      totalTaken += b.takenHours;
      totalNet += b.balanceHours;
      uniqueEmployees.add(b.employeeId);
    }

    return {
      employeesCount: uniqueEmployees.size,
      totalAccrued: Number(totalAccrued.toFixed(2)),
      totalTaken: Number(totalTaken.toFixed(2)),
      totalNet: Number(totalNet.toFixed(2)),
      totalAccruedDays: (totalAccrued / 8).toFixed(1),
      totalTakenDays: (totalTaken / 8).toFixed(1),
      totalNetDays: (totalNet / 8).toFixed(1),
    };
  }, [filteredBalances]);

  // Selected Employee Leave History
  const selectedEmployeeHistory = useMemo(() => {
    if (selectedEmployeeId === "all" || !leaveHistory || leaveHistory.length === 0) {
      return [];
    }
    return leaveHistory.filter(
      (item) => (item.employeeId ?? item.employee_id) === selectedEmployeeId,
    );
  }, [selectedEmployeeId, leaveHistory]);

  const isIndividualMode = selectedEmployeeId !== "all" && selectedEmployeeInfo !== null;

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-2xs">
      {/* Title Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <Layers className="size-4.5" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                Leave Accruals &amp; Balances Register
              </h3>
              <p className="text-xs text-muted">
                Inspect and verify employee statutory leave accruals, taken hours, and remaining available balances.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isIndividualMode ? (
            <button
              type="button"
              onClick={() => {
                setSelectedEmployeeId("all");
                setSelectedType("all");
                setSearchQuery("");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>All Employees</span>
            </button>
          ) : null}

          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-600 self-start sm:self-auto">
            <CheckCircle2 className="size-3.5" />
            <span>Admin Oversight Active</span>
          </div>
        </div>
      </div>

      {/* Controls & Employee Picker Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-center bg-surface-muted/50 p-3 rounded-xl border border-border/80">
        {/* Employee Picker */}
        <div className="sm:col-span-6 lg:col-span-5 flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground shrink-0">
            <User className="size-4 text-primary" />
            <span>Employee:</span>
          </div>
          <div className="relative flex-1 min-w-0">
            <select
              value={selectedEmployeeId}
              onChange={(e) => {
                setSelectedEmployeeId(e.target.value);
                setSelectedType("all");
              }}
              className="w-full rounded-xl border border-border bg-surface py-2 pl-3 pr-8 text-xs font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer truncate shadow-2xs"
            >
              <option value="all">👥 All Employees ({data.employees.length})</option>
              {employeePickerList.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Query */}
        <div className="sm:col-span-6 lg:col-span-4 relative">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isIndividualMode
                ? "Filter employee leave types..."
                : "Search employee, number, or leave type..."
            }
            className="w-full rounded-xl border border-border bg-surface py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none transition-all shadow-2xs"
          />
        </div>

        {/* Leave Type Filter */}
        <div className="sm:col-span-12 lg:col-span-3 flex items-center gap-2">
          <Filter className="size-3.5 text-muted shrink-0" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2 px-2.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none cursor-pointer shadow-2xs"
          >
            <option value="all">All Leave Types ({leaveTypesList.length})</option>
            {leaveTypesList.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* INDIVIDUAL EMPLOYEE SPOTLIGHT DOSSIER */}
      {isIndividualMode && selectedEmployeeInfo ? (
        <div className="space-y-4 rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 via-surface to-surface p-4 sm:p-5 shadow-xs">
          {/* Employee Dossier Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/80 pb-4">
            <div className="flex items-center gap-3.5">
              <EmployeeAvatar
                name={selectedEmployeeInfo.full_name}
                className="size-12 text-sm font-black ring-2 ring-primary/20 shadow-2xs"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-lg font-black text-foreground">
                    {selectedEmployeeInfo.full_name}
                  </h4>
                  <span className="rounded-full bg-surface border border-border/80 px-2.5 py-0.5 text-[11px] font-mono font-extrabold text-muted">
                    {selectedEmployeeInfo.employee_number}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    Employee Balances Profile
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Showing statutory accruals, taken hours, and remaining balances for this individual employee.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedEmployeeId("all")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:text-foreground hover:bg-surface-muted transition-colors shadow-2xs cursor-pointer"
              >
                <span>View Full Company Register</span>
              </button>
            </div>
          </div>

          {/* KPI Stat Cards for this Employee */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                Total Accrued
              </span>
              <p className="mt-1 text-2xl font-black text-emerald-950">
                +{totals.totalAccrued}h
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-800/80">
                ≈ {totals.totalAccruedDays} working days
              </p>
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-50/60 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1">
                <Clock className="size-3" />
                Total Taken
              </span>
              <p className="mt-1 text-2xl font-black text-rose-950">
                -{totals.totalTaken}h
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-rose-800/80">
                ≈ {totals.totalTakenDays} working days
              </p>
            </div>

            <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1">
                <CalendarDays className="size-3" />
                Net Available Balance
              </span>
              <p className="mt-1 text-2xl font-black text-primary">
                {totals.totalNet}h
              </p>
              <p className="mt-0.5 text-[11px] font-bold text-foreground">
                ≈ {totals.totalNetDays} working days
              </p>
            </div>

            <div className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted flex items-center gap-1">
                <Layers className="size-3" />
                Leave Policies
              </span>
              <p className="mt-1 text-2xl font-black text-foreground">
                {filteredBalances.length}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                Assigned leave categories
              </p>
            </div>
          </div>

          {/* Leave Type Cards Grid for Selected Employee */}
          <div className="space-y-3">
            <h5 className="text-xs font-black uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Calendar className="size-3.5 text-primary" />
              <span>Leave Balances by Category</span>
            </h5>

            {filteredBalances.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
                <UserCheck className="mx-auto size-8 text-muted/60" />
                <p className="mt-2 text-sm font-bold text-foreground">
                  No leave balances found for {selectedEmployeeInfo.full_name}
                </p>
                <p className="mt-1 text-xs text-muted max-w-md mx-auto">
                  {searchQuery || selectedType !== "all"
                    ? "Try resetting your search filters above to view all balances."
                    : "No statutory leave balances have been assigned to this employee yet. You can assign them under Company Setup → Work Rules & Leave."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredBalances.map((item) => {
                  const meta = getCategoryMeta(item.leaveCategory);
                  const Icon = meta.icon;
                  const isPositive = item.balanceHours > 0;
                  const utilizationPercent =
                    item.accruedHours > 0
                      ? Math.min(
                          100,
                          Math.max(0, (item.takenHours / item.accruedHours) * 100),
                        )
                      : 0;

                  return (
                    <div
                      key={item.id}
                      className={`relative flex flex-col justify-between rounded-xl border bg-gradient-to-b ${meta.cardBg} bg-surface p-4 shadow-2xs transition-all hover:shadow-xs`}
                    >
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid size-7 place-items-center rounded-lg ${meta.badgeClass} shadow-2xs`}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div>
                            <h6 className="text-sm font-extrabold text-foreground leading-snug">
                              {item.leaveTypeName}
                            </h6>
                            <span className="text-[10px] font-bold text-muted uppercase">
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                            item.isPaid
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                              : "bg-slate-500/10 text-slate-700 border-slate-500/30"
                          }`}
                        >
                          {item.isPaid ? "Paid" : "Unpaid"}
                        </span>
                      </div>

                      {/* Main Balance Display */}
                      <div className="my-3 flex items-baseline justify-between border-y border-border/60 py-2.5">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                            Remaining Balance
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-2xl font-black font-mono tracking-tight ${
                                isPositive
                                  ? "text-foreground"
                                  : "text-rose-600"
                              }`}
                            >
                              {formatHours(item.balanceHours)}
                            </span>
                            <span className="text-xs font-bold text-muted">
                              ({hoursToDays(item.balanceHours)})
                            </span>
                          </div>
                        </div>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isPositive
                              ? "bg-emerald-500/15 text-emerald-700"
                              : "bg-rose-500/15 text-rose-700"
                          }`}
                        >
                          {isPositive ? "Active" : "Depleted"}
                        </span>
                      </div>

                      {/* Progress Bar (Taken vs Accrued) */}
                      <div className="space-y-1 mb-2">
                        <div className="flex justify-between text-[10px] font-bold text-muted">
                          <span>Utilization</span>
                          <span>{utilizationPercent.toFixed(1)}% taken</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden border border-border/50">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              utilizationPercent > 80
                                ? "bg-rose-500"
                                : utilizationPercent > 50
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${utilizationPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Breakdown Numbers */}
                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2 font-mono">
                        <div>
                          <span className="text-[10px] font-bold text-muted block">Accrued</span>
                          <span className="font-extrabold text-emerald-600">
                            +{formatHours(item.accruedHours)}
                          </span>
                          <span className="text-[10px] text-muted ml-1">
                            ({hoursToDays(item.accruedHours)})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-muted block">Taken</span>
                          <span className="font-extrabold text-rose-600">
                            {item.takenHours > 0 ? `-${formatHours(item.takenHours)}` : "0.00h"}
                          </span>
                          <span className="text-[10px] text-muted ml-1">
                            ({hoursToDays(item.takenHours)})
                          </span>
                        </div>
                      </div>

                      {/* Statutory Note & Audit Button Footer */}
                      <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] text-muted flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground/80 truncate">{meta.statutoryNote}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const explanation = `[AUDIT TRAIL] Rule: ${item.leaveTypeName} (${item.leaveCategory.toUpperCase()})\n• Entitlement: ${item.accruedHours}h (${hoursToDays(item.accruedHours)})\n• Taken: ${item.takenHours}h (${hoursToDays(item.takenHours)})\n• Remaining Balance: ${item.balanceHours}h (${hoursToDays(item.balanceHours)})\n• Derivation: Calculated from employee working schedule (Schedule Net Hours). No hardcoded 2080h denominator applied.`;
                            alert(explanation);
                          }}
                          className="shrink-0 font-bold text-emerald-600 hover:text-emerald-500 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Sparkles className="size-3" /> Explain
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Employee Leave History (if available) */}
          {selectedEmployeeHistory.length > 0 ? (
            <div className="space-y-2.5 pt-2 border-t border-border/70">
              <h5 className="text-xs font-black uppercase tracking-wider text-muted flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" />
                <span>Recent Approved Leave History ({selectedEmployeeHistory.length})</span>
              </h5>
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface-muted text-muted uppercase tracking-wider font-extrabold text-[10px]">
                    <tr>
                      <th scope="col" className="px-3.5 py-2">Leave Type</th>
                      <th scope="col" className="px-3 py-2">Dates</th>
                      <th scope="col" className="px-3 py-2 text-right">Hours</th>
                      <th scope="col" className="px-3 py-2 text-right">Days</th>
                      <th scope="col" className="px-3.5 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {selectedEmployeeHistory.map((h) => {
                      const startDate = h.startDate ?? h.start_date ?? "";
                      const endDate = h.endDate ?? h.end_date ?? "";
                      const totalHours = h.totalHours ?? h.total_hours ?? 0;

                      return (
                        <tr key={h.id} className="hover:bg-surface-muted/40 transition-colors">
                          <td className="px-3.5 py-2 font-sans font-bold text-foreground">
                            {h.leaveTypeName}
                          </td>
                          <td className="px-3 py-2 font-sans text-muted">
                            {formatDate(startDate)} → {formatDate(endDate)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-rose-600">
                            -{formatHours(totalHours)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted">
                            {hoursToDays(totalHours)}
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-sans font-extrabold text-emerald-700">
                              {h.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* COMPANY-WIDE ACCRUALS KPI CARDS */
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
              <Users className="size-3" />
              Employees Tracked
            </span>
            <p className="mt-1 text-xl font-black text-foreground">
              {totals.employeesCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              Active company workforce
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Total Accrued
            </span>
            <p className="mt-1 text-xl font-black text-emerald-950">
              +{totals.totalAccrued}h
            </p>
            <p className="mt-0.5 text-[10px] text-emerald-800/80">
              ≈ {totals.totalAccruedDays} working days
            </p>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-50/50 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
              <Clock className="size-3" />
              Total Taken
            </span>
            <p className="mt-1 text-xl font-black text-rose-950">
              -{totals.totalTaken}h
            </p>
            <p className="mt-0.5 text-[10px] text-rose-800/80">
              ≈ {totals.totalTakenDays} working days
            </p>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
              <CalendarDays className="size-3" />
              Net Remaining Balance
            </span>
            <p className="mt-1 text-xl font-black text-foreground">
              {totals.totalNet}h
            </p>
            <p className="mt-0.5 text-[10px] text-muted font-bold">
              ≈ {totals.totalNetDays} working days
            </p>
          </div>
        </div>
      )}

      {/* FULL ACCRUALS REGISTER TABLE (COMPANY OR FILTERED) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            <span>
              {isIndividualMode
                ? `Detailed Records for ${selectedEmployeeInfo?.full_name}`
                : "All Employee Balances Register"}
              {" "}({filteredBalances.length} records)
            </span>
          </h4>
          {!isIndividualMode && (
            <p className="text-[11px] text-muted hidden sm:block">
              Click &quot;Inspect&quot; on any row to drill down into an employee&apos;s full balance profile.
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-muted text-muted uppercase tracking-wider font-extrabold text-[10px]">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5">
                    Employee
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Leave Type
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Accrued
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Taken
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Remaining Balance
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted">
                      No leave accrual records found. Try adjusting your search query or leave type filter.
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((item) => {
                    const isPositive = item.balanceHours > 0;
                    const meta = getCategoryMeta(item.leaveCategory);
                    const isSelected = item.employeeId === selectedEmployeeId;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-surface-muted/50"
                        }`}
                      >
                        {/* Employee Name & Number */}
                        <td className="px-3.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeId(item.employeeId)}
                            className="flex items-center gap-2 text-left group cursor-pointer"
                          >
                            <EmployeeAvatar
                              name={item.employeeName}
                              className="size-7 text-[10px] group-hover:ring-2 group-hover:ring-primary/40 transition-all"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-bold text-foreground group-hover:text-primary transition-colors">
                                {item.employeeName}
                              </p>
                              <p className="truncate text-[10px] text-muted">
                                {item.employeeNumber}
                              </p>
                            </div>
                          </button>
                        </td>

                        {/* Leave Type Badge */}
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                            <span
                              className={`size-1.5 rounded-full ${meta.dotClass}`}
                            />
                            <span>{item.leaveTypeName}</span>
                          </span>
                        </td>

                        {/* Accrued */}
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-600">
                          +{formatHours(item.accruedHours)}
                        </td>

                        {/* Taken */}
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-600">
                          {item.takenHours > 0 ? `-${formatHours(item.takenHours)}` : "0.00h"}
                        </td>

                        {/* Remaining Balance */}
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex flex-col items-end">
                            <span
                              className={`font-mono font-black text-xs ${
                                isPositive
                                  ? "text-foreground"
                                  : "text-rose-600"
                              }`}
                            >
                              {formatHours(item.balanceHours)}
                            </span>
                            <span className="text-[10px] text-muted">
                              ({hoursToDays(item.balanceHours)})
                            </span>
                          </div>
                        </td>

                        {/* Action: Inspect Employee */}
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(item.employeeId);
                              setSelectedType("all");
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-surface text-foreground hover:border-primary hover:text-primary"
                            }`}
                          >
                            <UserCheck className="size-3" />
                            <span>{isSelected ? "Selected" : "Inspect"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
