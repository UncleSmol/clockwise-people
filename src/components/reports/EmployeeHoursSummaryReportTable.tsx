"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  MapPin,
  Palmtree,
  Zap,
} from "lucide-react";
import ReportDataTable from "./ReportDataTable";
import type { EmployeeHoursSummaryRow } from "@/lib/reports/types";

type EmployeeHoursSummaryReportTableProps = {
  data: EmployeeHoursSummaryRow[];
  periodLabel: string;
};

export default function EmployeeHoursSummaryReportTable({
  data,
  periodLabel,
}: EmployeeHoursSummaryReportTableProps) {
  const columns = useMemo<ColumnDef<EmployeeHoursSummaryRow>[]>(
    () => [
      {
        accessorKey: "employeeName",
        header: "Employee",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-semibold text-foreground">
              {row.original.employeeName}
            </div>
            <div className="text-[10px] text-muted flex items-center gap-1 font-mono">
              <span>{row.original.employeeNumber}</span>
              {row.original.jobTitle ? <span>· {row.original.jobTitle}</span> : null}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "department",
        header: "Dept / Station",
        cell: ({ row }) => (
          <div className="space-y-0.5 whitespace-nowrap">
            <div className="text-foreground font-medium">
              {row.original.department}
            </div>
            <div className="text-[10px] text-muted flex items-center gap-1">
              <MapPin className="size-3 text-slate-400 shrink-0" />
              <span>{row.original.workstation}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "workedHours",
        header: "Worked (Normal)",
        cell: ({ row }) => (
          <div className="font-mono text-foreground">
            <span className="font-bold">{row.original.workedHours.toFixed(2)}h</span>
            <div className="text-[10px] text-muted">{row.original.daysWorked} days worked</div>
          </div>
        ),
      },
      {
        id: "overtime",
        header: "Overtime (OT)",
        cell: ({ row }) => {
          const r = row.original;
          const hasOt = r.totalOvertimeHours > 0;
          return (
            <div className="space-y-0.5 font-mono text-xs">
              <div className="flex items-center gap-1">
                {hasOt ? (
                  <span className="rounded bg-amber-500/15 text-amber-900 border border-amber-500/30 px-1.5 py-0.5 font-bold text-[11px]">
                    <Zap className="inline size-3 mr-0.5 text-amber-600" />
                    {r.totalOvertimeHours.toFixed(2)}h
                  </span>
                ) : (
                  <span className="text-muted text-[11px]">0.00h</span>
                )}
              </div>
              {hasOt && (r.overtimeHours15 > 0 || r.overtimeHours20 > 0) && (
                <div className="text-[9.5px] text-muted flex items-center gap-1.5">
                  {r.overtimeHours15 > 0 && <span>1.5x: {r.overtimeHours15.toFixed(1)}h</span>}
                  {r.overtimeHours20 > 0 && <span>2.0x: {r.overtimeHours20.toFixed(1)}h</span>}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "leave",
        header: "Leave Taken",
        cell: ({ row }) => {
          const r = row.original;
          const hasLeave = r.leaveHours > 0;
          return (
            <div className="space-y-0.5 font-mono text-xs">
              <div className="flex items-center gap-1">
                {hasLeave ? (
                  <span className="rounded bg-teal-500/15 text-teal-900 border border-teal-500/30 px-1.5 py-0.5 font-bold text-[11px]">
                    <Palmtree className="inline size-3 mr-0.5 text-teal-600" />
                    {r.leaveHours.toFixed(2)}h
                  </span>
                ) : (
                  <span className="text-muted text-[11px]">0.00h</span>
                )}
              </div>
              {hasLeave && (
                <div className="text-[9.5px] text-muted">
                  {r.leaveDays} {r.leaveDays === 1 ? "day" : "days"}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "totalPaidHours",
        header: "Total Paid",
        cell: ({ row }) => (
          <div className="font-mono">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-black text-emerald-950 text-xs">
              <Coins className="size-3 text-emerald-700 shrink-0" />
              {row.original.totalPaidHours.toFixed(2)}h
            </span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Audit Status",
        cell: ({ row }) => {
          const r = row.original;
          if (r.missingClockings > 0) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                <AlertTriangle className="size-3 shrink-0" />
                {r.missingClockings} issue{r.missingClockings === 1 ? "" : "s"}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="size-3 shrink-0" />
              Compliant
            </span>
          );
        },
      },
    ],
    [],
  );

  // Calculate totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, r) => {
        acc.worked += r.workedHours;
        acc.ot15 += r.overtimeHours15;
        acc.ot20 += r.overtimeHours20;
        acc.totalOt += r.totalOvertimeHours;
        acc.leave += r.leaveHours;
        acc.totalPaid += r.totalPaidHours;
        acc.daysWorked += r.daysWorked;
        acc.missing += r.missingClockings;
        return acc;
      },
      {
        worked: 0,
        ot15: 0,
        ot20: 0,
        totalOt: 0,
        leave: 0,
        totalPaid: 0,
        daysWorked: 0,
        missing: 0,
      },
    );
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Summary Stat Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Total Staff
          </div>
          <div className="mt-1 text-base font-black text-foreground">
            {data.length} employees
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Total Normal Worked
          </div>
          <div className="mt-1 text-base font-black text-foreground font-mono">
            {totals.worked.toFixed(2)}h
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Total Overtime (OT)
          </div>
          <div className="mt-1 text-base font-black text-amber-950 font-mono">
            {totals.totalOt.toFixed(2)}h
          </div>
          <div className="text-[9.5px] text-amber-700">
            1.5x: {totals.ot15.toFixed(1)}h · 2.0x: {totals.ot20.toFixed(1)}h
          </div>
        </div>

        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
            Total Leave Taken
          </div>
          <div className="mt-1 text-base font-black text-teal-950 font-mono">
            {totals.leave.toFixed(2)}h
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Grand Total Paid
          </div>
          <div className="mt-1 text-lg font-black text-emerald-950 font-mono">
            {totals.totalPaid.toFixed(2)}h
          </div>
        </div>
      </div>

      <ReportDataTable
        columns={columns}
        data={data}
        searchPlaceholder="Filter by employee name or number..."
      />
    </div>
  );
}
