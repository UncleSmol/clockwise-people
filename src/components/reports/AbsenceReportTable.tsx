"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import ReportDataTable from "./ReportDataTable";
import type { AbsenceReportRow } from "@/lib/reports/types";

type AbsenceReportTableProps = {
  data: AbsenceReportRow[];
  periodLabel: string;
};

export default function AbsenceReportTable({
  data,
  periodLabel,
}: AbsenceReportTableProps) {
  const columns = useMemo<ColumnDef<AbsenceReportRow>[]>(
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
              {row.original.employeeNumber} · {row.original.department}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "leaveType",
        header: "Leave Type",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-foreground">
              {row.original.leaveType}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted font-mono">
              {row.original.leaveCategory}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "startDate",
        header: "Date Range",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground whitespace-nowrap">
            {row.original.startDate} to {row.original.endDate}
          </span>
        ),
      },
      {
        accessorKey: "totalDays",
        header: "Duration",
        cell: ({ row }) => (
          <div className="font-mono whitespace-nowrap">
            <span className="font-bold text-foreground">
              {row.original.totalDays} {row.original.totalDays === 1 ? "day" : "days"}
            </span>
            <span className="text-muted text-[10px] block">
              ({row.original.totalHours} hrs)
            </span>
          </div>
        ),
      },
      {
        accessorKey: "isPaid",
        header: "Pay Type",
        cell: ({ row }) => (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              row.original.isPaid
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-slate-500/15 text-slate-300"
            }`}
          >
            {row.original.isPaid ? "Paid Leave" : "Unpaid"}
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
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {isApproved ? (
                <CheckCircle2 className="size-3" />
              ) : isRejected ? (
                <XCircle className="size-3" />
              ) : (
                <Clock className="size-3" />
              )}
              {s}
            </span>
          );
        },
      },
      {
        accessorKey: "approvedBy",
        header: "Approval Sign-Off",
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {row.original.approvedBy ?? "Pending Review"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ReportDataTable
      data={data}
      columns={columns}
      title="Absence & Approved Leave Log"
      subtitle={`Chronological record of approved and pending employee absences for ${periodLabel}.`}
      searchPlaceholder="Search employee, leave type..."
    />
  );
}
