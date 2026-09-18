"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Layers,
  Search,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import type { CompanyWorkRulesData } from "@/lib/work-rules/schema";

type CompanyAllAccrualsTableProps = {
  data: CompanyWorkRulesData;
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

type EnrichedBalance = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveCategory: string;
  accruedHours: number;
  takenHours: number;
  balanceHours: number;
};

export default function CompanyAllAccrualsTable({
  data,
}: CompanyAllAccrualsTableProps) {
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
    return Array.from(set);
  }, [enrichedBalances]);

  // Filtered balances
  const filteredBalances = useMemo<EnrichedBalance[]>(() => {
    return enrichedBalances.filter((b: EnrichedBalance) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        b.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.leaveTypeName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        selectedType === "all" || b.leaveTypeName === selectedType;

      return matchesSearch && matchesType;
    });
  }, [enrichedBalances, searchQuery, selectedType]);

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
    };
  }, [filteredBalances]);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-2xs">
      {/* Title Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </span>
            <h3 className="text-base font-extrabold text-foreground">
              Company Leave Accruals &amp; Balances Register
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted">
            Live overview of all employees&apos; accumulated statutory leave accruals, taken hours, and remaining balances.
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 self-start sm:self-auto">
          <CheckCircle2 className="size-3.5" />
          <span>Admin Oversight Active</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Employees Tracked
          </span>
          <p className="mt-1 text-xl font-black text-foreground">
            {totals.employeesCount}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Total Accrued
          </span>
          <p className="mt-1 text-xl font-black text-emerald-950">
            +{totals.totalAccrued}h
          </p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-50/50 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
            Total Taken
          </span>
          <p className="mt-1 text-xl font-black text-rose-950">
            -{totals.totalTaken}h
          </p>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Net Remaining Balance
          </span>
          <p className="mt-1 text-xl font-black text-foreground">
            {totals.totalNet}h
          </p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee or leave type..."
            className="w-full rounded-xl border border-border bg-surface-muted py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-muted shrink-0" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="rounded-xl border border-border bg-surface py-1.5 px-2.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">All Leave Types</option>
            {leaveTypesList.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Accruals Table */}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredBalances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted">
                    No leave accrual records found.
                  </td>
                </tr>
              ) : (
                filteredBalances.map((item) => {
                  const isPositive = item.balanceHours > 0;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-surface-muted/50 transition-colors"
                    >
                      {/* Employee Name & Number */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar
                            name={item.employeeName}
                            className="size-6 text-[10px]"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-foreground">
                              {item.employeeName}
                            </p>
                            <p className="truncate text-[10px] text-muted">
                              {item.employeeNumber}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Leave Type Badge */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                          <span
                            className={`size-1.5 rounded-full ${
                              item.leaveCategory === "annual"
                                ? "bg-emerald-500"
                                : item.leaveCategory === "sick"
                                  ? "bg-rose-500"
                                  : "bg-sky-500"
                            }`}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
