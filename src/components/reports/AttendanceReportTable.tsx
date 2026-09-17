"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import ReportDataTable from "./ReportDataTable";
import type { AttendanceReportRow } from "@/lib/reports/types";

type AttendanceReportTableProps = {
  data: AttendanceReportRow[];
  periodLabel: string;
};

export default function AttendanceReportTable({
  data,
  periodLabel,
}: AttendanceReportTableProps) {
  const columns = useMemo<ColumnDef<AttendanceReportRow>[]>(
    () => [
      {
        accessorKey: "employeeName",
        header: "Employee",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-semibold text-foreground">
              {row.original.employeeName}
            </div>
            <div className="text-[10px] text-muted flex items-center gap-1">
              <span className="font-mono">{row.original.employeeNumber}</span>
              <span>· {row.original.jobTitle}</span>
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
        accessorKey: "daysWorked",
        header: "Days Worked",
        cell: ({ row }) => (
          <div className="font-mono text-foreground whitespace-nowrap">
            <span className="font-bold text-emerald-400">
              {row.original.daysWorked}
            </span>
            <span className="text-muted text-[10px]">
              {" "}
              / {row.original.scheduledDays}d
            </span>
          </div>
        ),
      },
      {
        accessorKey: "totalHoursWorked",
        header: "Hours Worked",
        cell: ({ row }) => (
          <div className="font-mono whitespace-nowrap">
            <span className="font-bold text-foreground">
              {row.original.totalHoursWorked.toFixed(2)}h
            </span>
            {row.original.overtimeHours > 0 && (
              <span className="text-amber-500 text-[10px] block">
                +{row.original.overtimeHours.toFixed(2)}h OT
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "punctualityRate",
        header: "Punctuality",
        cell: ({ row }) => {
          const rate = row.original.punctualityRate;
          const isHigh = rate >= 90;
          const isMid = rate >= 75 && rate < 90;
          return (
            <div className="space-y-1 w-24">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span
                  className={
                    isHigh
                      ? "text-emerald-400"
                      : isMid
                      ? "text-amber-400"
                      : "text-rose-400"
                  }
                >
                  {rate}%
                </span>
                <span className="text-[10px] text-muted font-normal">
                  {row.original.onTimeArrivals} on-time
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    isHigh
                      ? "bg-emerald-500"
                      : isMid
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${rate}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "lateArrivals",
        header: "Late Arrivals",
        cell: ({ row }) => {
          const val = row.original.lateArrivals;
          return val > 0 ? (
            <span className="font-mono font-semibold text-amber-400 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              {val}
            </span>
          ) : (
            <span className="text-muted font-mono">0</span>
          );
        },
      },
      {
        accessorKey: "earlyDepartures",
        header: "Early Departures",
        cell: ({ row }) => {
          const val = row.original.earlyDepartures;
          return val > 0 ? (
            <span className="font-mono font-semibold text-indigo-400">
              {val}
            </span>
          ) : (
            <span className="text-muted font-mono">0</span>
          );
        },
      },
      {
        accessorKey: "missingClockings",
        header: "Missing Events",
        cell: ({ row }) => {
          const val = row.original.missingClockings;
          return val > 0 ? (
            <span className="font-mono font-bold text-rose-500 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              {val}
            </span>
          ) : (
            <span className="text-muted font-mono">0</span>
          );
        },
      },
      {
        accessorKey: "complianceScore",
        header: "Compliance Score",
        cell: ({ row }) => {
          const score = row.original.complianceScore;
          const isHigh = score >= 85;
          const isMid = score >= 70 && score < 85;
          return (
            <div className="flex items-center gap-1.5">
              <ShieldCheck
                className={`size-4 ${
                  isHigh
                    ? "text-emerald-400"
                    : isMid
                    ? "text-amber-400"
                    : "text-rose-500"
                }`}
              />
              <span
                className={`font-mono font-bold text-xs ${
                  isHigh
                    ? "text-emerald-400"
                    : isMid
                    ? "text-amber-400"
                    : "text-rose-500"
                }`}
              >
                {score}/100
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <ReportDataTable
      data={data}
      columns={columns}
      title="Attendance & Punctuality Report"
      subtitle={`Employee attendance rates, punctuality metrics, late arrivals, and clocking compliance for ${periodLabel}.`}
      searchPlaceholder="Search employee, title, department..."
    />
  );
}
