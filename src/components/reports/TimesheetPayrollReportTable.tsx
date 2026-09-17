"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  MapPin,
} from "lucide-react";
import ReportDataTable from "./ReportDataTable";
import type { TimesheetPayrollRow } from "@/lib/reports/types";

type TimesheetPayrollReportTableProps = {
  data: TimesheetPayrollRow[];
  periodLabel: string;
};

export default function TimesheetPayrollReportTable({
  data,
  periodLabel,
}: TimesheetPayrollReportTableProps) {
  // Columns definition using TanStack Table
  const columns = useMemo<ColumnDef<TimesheetPayrollRow>[]>(
    () => [
      {
        accessorKey: "employeeName",
        header: "Employee",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-semibold text-foreground">
              {row.original.employeeName}
            </div>
            <div className="text-[10px] text-muted font-mono">
              {row.original.employeeNumber}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "workDate",
        header: "Work Date",
        cell: ({ row }) => (
          <span className="font-mono text-foreground font-medium whitespace-nowrap">
            {row.original.workDate}
          </span>
        ),
      },
      {
        accessorKey: "workstation",
        header: "Station / Dept",
        cell: ({ row }) => (
          <div className="space-y-0.5 whitespace-nowrap">
            <div className="flex items-center gap-1 text-foreground">
              <MapPin className="size-3 text-slate-400 shrink-0" />
              <span>{row.original.workstation}</span>
            </div>
            <div className="text-[10px] text-muted pl-4">
              {row.original.department}
            </div>
          </div>
        ),
      },
      {
        id: "clockings",
        header: "Clock Times",
        cell: ({ row }) => {
          const r = row.original;
          if (!r.clockIn && !r.clockOut) {
            return <span className="text-muted italic">Leave day</span>;
          }
          return (
            <div className="space-y-0.5 whitespace-nowrap font-mono text-[11px]">
              <div className="flex items-center gap-1 text-foreground">
                <Clock className="size-3 text-emerald-500 shrink-0" />
                <span>
                  {r.clockIn ?? "--"} - {r.clockOut ?? "--"}
                </span>
              </div>
              {r.lunchStart && r.lunchEnd && (
                <div className="text-[10px] text-muted flex items-center gap-1 pl-4">
                  <Coffee className="size-3 shrink-0" />
                  <span>
                    {r.lunchStart} - {r.lunchEnd}
                  </span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "normalHours",
        header: "Normal",
        cell: ({ row }) => (
          <span className="font-mono text-foreground">
            {row.original.normalHours.toFixed(2)}h
          </span>
        ),
      },
      {
        accessorKey: "overtimeHours15",
        header: "OT 1.5x",
        cell: ({ row }) => {
          const val = row.original.overtimeHours15;
          return val > 0 ? (
            <span className="font-mono font-semibold text-amber-500">
              {val.toFixed(2)}h
            </span>
          ) : (
            <span className="text-muted font-mono">0.00h</span>
          );
        },
      },
      {
        accessorKey: "overtimeHours20",
        header: "OT 2.0x",
        cell: ({ row }) => {
          const val = row.original.overtimeHours20;
          return val > 0 ? (
            <span className="font-mono font-semibold text-amber-600">
              {val.toFixed(2)}h
            </span>
          ) : (
            <span className="text-muted font-mono">0.00h</span>
          );
        },
      },
      {
        accessorKey: "holidayHours",
        header: "Holiday",
        cell: ({ row }) => {
          const val = row.original.holidayHours;
          return val > 0 ? (
            <span className="font-mono font-semibold text-purple-400">
              {val.toFixed(2)}h
            </span>
          ) : (
            <span className="text-muted font-mono">0.00h</span>
          );
        },
      },
      {
        accessorKey: "totalPaidHours",
        header: "Total Paid",
        cell: ({ row }) => (
          <span className="font-mono font-bold text-emerald-400">
            {row.original.totalPaidHours.toFixed(2)}h
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          const isApproved = s === "approved";
          const isRejected = s === "rejected";
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isApproved
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isRejected
                  ? "bg-rose-500/15 text-rose-400"
                  : "bg-slate-500/15 text-slate-300"
              }`}
            >
              {isApproved && <CheckCircle2 className="size-3" />}
              {s}
            </span>
          );
        },
      },
      {
        id: "compliance",
        header: "Compliance / Notes",
        cell: ({ row }) => {
          const r = row.original;
          if (r.hasComplianceFlag) {
            return (
              <div className="flex items-center gap-1.5 text-amber-400 max-w-xs truncate" title={r.complianceNotes ?? "Compliance alert"}>
                <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
                <span className="text-[11px] truncate">{r.complianceNotes ?? "Flagged"}</span>
              </div>
            );
          }
          if (r.complianceNotes) {
            return (
              <span className="text-[11px] text-muted max-w-xs truncate" title={r.complianceNotes}>
                {r.complianceNotes}
              </span>
            );
          }
          return <span className="text-[11px] text-emerald-500 font-medium">Compliant</span>;
        },
      },
    ],
    [],
  );

  // Totals calculations for summary row
  const totals = useMemo(() => {
    let normal = 0;
    let ot15 = 0;
    let ot20 = 0;
    let holiday = 0;
    let totalPaid = 0;

    for (const r of data) {
      normal += r.normalHours;
      ot15 += r.overtimeHours15;
      ot20 += r.overtimeHours20;
      holiday += r.holidayHours;
      totalPaid += r.totalPaidHours;
    }

    return {
      normal: normal.toFixed(2),
      ot15: ot15.toFixed(2),
      ot20: ot20.toFixed(2),
      holiday: holiday.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
    };
  }, [data]);

  const summaryRow = (
    <tr className="bg-slate-900/90 font-bold border-t-2 border-border text-foreground">
      <td colSpan={4} className="py-3 px-3.5 text-right font-extrabold uppercase tracking-wider text-xs">
        Period Grand Totals:
      </td>
      <td className="py-3 px-3.5 font-mono text-emerald-400">{totals.normal}h</td>
      <td className="py-3 px-3.5 font-mono text-amber-400">{totals.ot15}h</td>
      <td className="py-3 px-3.5 font-mono text-amber-500">{totals.ot20}h</td>
      <td className="py-3 px-3.5 font-mono text-purple-400">{totals.holiday}h</td>
      <td className="py-3 px-3.5 font-mono text-emerald-400 text-sm">{totals.totalPaid}h</td>
      <td colSpan={2} className="py-3 px-3.5 text-muted font-normal text-[11px]">
        {data.length} total shift entries
      </td>
    </tr>
  );

  return (
    <ReportDataTable
      data={data}
      columns={columns}
      title="Timesheet & Shift Payroll Audit"
      subtitle={`Line-item audit of shift clockings, overtime splits, and public holidays for ${periodLabel}.`}
      searchPlaceholder="Search employee, station, date..."
      summaryRow={summaryRow}
    />
  );
}
