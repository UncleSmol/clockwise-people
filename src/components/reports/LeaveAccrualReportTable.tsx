"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import ReportDataTable from "./ReportDataTable";
import type { AccrualReportRow } from "@/lib/reports/types";

type LeaveAccrualReportTableProps = {
  data: AccrualReportRow[];
  periodLabel: string;
};

export default function LeaveAccrualReportTable({
  data,
  periodLabel,
}: LeaveAccrualReportTableProps) {
  const columns = useMemo<ColumnDef<AccrualReportRow>[]>(
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
        cell: ({ row }) => {
          const cat = row.original.leaveCategory;
          const isAnnual = cat === "annual";
          const isSick = cat === "sick";
          const isFRL = cat === "family_responsibility";
          return (
            <div className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  isAnnual
                    ? "bg-sky-400"
                    : isSick
                    ? "bg-rose-400"
                    : isFRL
                    ? "bg-purple-400"
                    : "bg-emerald-400"
                }`}
              />
              <span className="font-medium text-foreground">
                {row.original.leaveType}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "openingBalanceHours",
        header: "Opening Balance",
        cell: ({ row }) => (
          <span className="font-mono text-muted">
            {row.original.openingBalanceHours.toFixed(2)}h
          </span>
        ),
      },
      {
        accessorKey: "accruedPeriodHours",
        header: "Accrued",
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-emerald-400">
            +{row.original.accruedPeriodHours.toFixed(2)}h
          </span>
        ),
      },
      {
        accessorKey: "takenPeriodHours",
        header: "Taken",
        cell: ({ row }) => {
          const val = row.original.takenPeriodHours;
          return val > 0 ? (
            <span className="font-mono font-semibold text-rose-400">
              -{val.toFixed(2)}h
            </span>
          ) : (
            <span className="text-muted font-mono">0.00h</span>
          );
        },
      },
      {
        accessorKey: "closingBalanceHours",
        header: "Closing Balance",
        cell: ({ row }) => {
          const hours = row.original.closingBalanceHours;
          const days = row.original.closingBalanceDays;
          return (
            <div className="font-mono whitespace-nowrap">
              <span className="font-bold text-foreground">{hours.toFixed(2)}h</span>
              <span className="text-muted text-[10px] block font-normal">
                ({days} days)
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "projectedYearEndHours",
        header: "Projected Year-End",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 font-mono text-xs font-semibold text-sky-400">
            <TrendingUp className="size-3 text-sky-400" />
            <span>{row.original.projectedYearEndHours.toFixed(2)}h</span>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <ReportDataTable
      data={data}
      columns={columns}
      title="Leave Accrual & Balance Ledger"
      subtitle={`Statutory leave entitlements, accrued credits, taken hours, and closing balances for ${periodLabel}.`}
      searchPlaceholder="Search employee, leave type..."
    />
  );
}
