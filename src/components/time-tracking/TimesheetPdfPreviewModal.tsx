"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Printer,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building,
} from "lucide-react";
import {
  exportTimesheetPdf,
  type TimesheetPdfOptions,
} from "@/lib/reports/exporters";

type TimesheetPdfPreviewModalProps = {
  options: TimesheetPdfOptions;
  open: boolean;
  onClose: () => void;
  onExportExcel?: () => void;
};

export default function TimesheetPdfPreviewModal({
  options,
  open,
  onClose,
  onExportExcel,
}: TimesheetPdfPreviewModalProps) {
  const [viewTab, setViewTab] = useState<"responsive" | "print">("responsive");

  const totalNormal = useMemo(
    () => options.dailyRows.reduce((acc, r) => acc + (Number(r.normalHours) || 0), 0),
    [options.dailyRows],
  );
  const totalOt = useMemo(
    () => options.dailyRows.reduce((acc, r) => acc + (Number(r.overtimeHours) || 0), 0),
    [options.dailyRows],
  );
  const totalPaid = useMemo(
    () => options.dailyRows.reduce((acc, r) => acc + (Number(r.paidHours) || 0), 0),
    [options.dailyRows],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative flex h-[94dvh] sm:h-[90vh] w-full sm:max-w-4xl flex-col rounded-t-2xl sm:rounded-2xl border border-border/80 bg-surface shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-250 min-w-0 max-w-full">
        {/* Top Header & Actions Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-surface/95 px-3 py-2.5 sm:px-6 sm:py-3 min-w-0">
          <div className="min-w-0 flex-1 mr-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="flex size-6 sm:size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-primary shrink-0">
                <FileSpreadsheet className="size-3.5 sm:size-4" />
              </span>
              <h2 className="truncate text-xs sm:text-base font-extrabold text-foreground">
                Timesheet Statement
              </h2>
            </div>
            <p className="mt-0.5 truncate text-[10px] sm:text-xs text-muted">
              {options.employeeInfo.name} · {options.periodLabel}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Tab Switcher for Desktop */}
            <div className="hidden sm:inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewTab("responsive")}
                className={`rounded-full px-2.5 py-1 transition-all ${
                  viewTab === "responsive"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                In-App
              </button>
              <button
                type="button"
                onClick={() => setViewTab("print")}
                className={`rounded-full px-2.5 py-1 transition-all ${
                  viewTab === "print"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                A4 Paper
              </button>
            </div>

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={() => exportTimesheetPdf(options)}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold text-white shadow-soft hover:bg-primary-hover active:scale-95 transition-all cursor-pointer shrink-0"
              title="Print or Save PDF"
            >
              <Printer className="size-3 sm:size-3.5 shrink-0" />
              <span>Print / PDF</span>
            </button>

            {/* Excel export if available */}
            {onExportExcel ? (
              <button
                type="button"
                onClick={onExportExcel}
                title="Export to Excel"
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-slate-200 transition-colors"
              >
                <Download className="size-3.5" />
                <span>Excel</span>
              </button>
            ) : null}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="grid size-7 sm:size-8 place-items-center rounded-full border border-border bg-surface text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
              aria-label="Close timesheet preview"
            >
              <X className="size-3.5 sm:size-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: zero horizontal scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-muted/30 p-2.5 sm:p-6 pb-24 sm:pb-6 w-full max-w-full">
          {viewTab === "responsive" ? (
            /* Compact In-App Presentation (Zero Horizontal Scrolling on Mobile) */
            <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4 w-full min-w-0">
              {/* Document Banner */}
              <div className="rounded-xl sm:rounded-2xl border border-border bg-surface p-2.5 sm:p-4 shadow-soft min-w-0">
                <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-2 sm:pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-primary">
                      {options.companyName}
                    </p>
                    <h3 className="text-xs sm:text-base font-black text-foreground">
                      Official Employee Timesheet Statement
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] sm:text-xs text-muted font-mono font-medium">
                      {options.startDate} → {options.endDate}
                    </p>
                  </div>
                </div>

                {/* Employee Info Grid: 2 columns on mobile, 4 columns on desktop */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 text-xs min-w-0">
                  <div className="min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase text-muted block">
                      Employee
                    </span>
                    <span className="font-extrabold text-foreground truncate block text-[11px] sm:text-xs">
                      {options.employeeInfo.name}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase text-muted block">
                      Employee #
                    </span>
                    <span className="font-bold text-foreground block font-mono text-[11px] sm:text-xs">
                      {options.employeeInfo.employeeNumber || "N/A"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase text-muted block">
                      Department
                    </span>
                    <span className="font-bold text-foreground truncate block text-[11px] sm:text-xs">
                      {options.employeeInfo.department || "General"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase text-muted block">
                      Workstation
                    </span>
                    <span className="font-bold text-foreground truncate block text-[11px] sm:text-xs">
                      {options.employeeInfo.workstation || "Standard"}
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI Summary Tiles: Compact 2-col on mobile, 4-col on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 min-w-0">
                <div className="rounded-xl border border-border bg-surface p-2 sm:p-3 shadow-2xs min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted block truncate">
                    Total Paid Hours
                  </span>
                  <p className="mt-0.5 text-base sm:text-lg font-black text-primary font-mono">
                    {totalPaid.toFixed(2)}h
                  </p>
                  <span className="text-[9px] sm:text-[10px] text-muted block truncate">
                    {options.metrics.daysWorked} days worked
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-2 sm:p-3 shadow-2xs min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted block truncate">
                    Normal Hours
                  </span>
                  <p className="mt-0.5 text-base sm:text-lg font-black text-foreground font-mono">
                    {totalNormal.toFixed(2)}h
                  </p>
                  <span className="text-[9px] sm:text-[10px] text-muted block truncate">
                    Standard rate
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-2 sm:p-3 shadow-2xs min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted block truncate">
                    Overtime Hours
                  </span>
                  <p className="mt-0.5 text-base sm:text-lg font-black text-amber-600 font-mono">
                    {totalOt.toFixed(2)}h
                  </p>
                  <span className="text-[9px] sm:text-[10px] text-muted block truncate">
                    OT 1.5x / 2.0x
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-2 sm:p-3 shadow-2xs min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted block truncate">
                    Leave Taken
                  </span>
                  <p className="mt-0.5 text-base sm:text-lg font-black text-emerald-800 font-mono">
                    {Number(options.metrics.leaveHours || 0).toFixed(1)}h
                  </p>
                  <span className="text-[9px] sm:text-[10px] text-muted block truncate">
                    Authorized leave
                  </span>
                </div>
              </div>

              {/* Daily Timesheet Section */}
              <div className="rounded-xl sm:rounded-2xl border border-border bg-surface shadow-soft overflow-hidden min-w-0 max-w-full">
                <div className="border-b border-border px-3 py-2 bg-surface-muted/50 flex items-center justify-between min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">
                    Daily Shift Timesheet ({options.dailyRows.length} Recorded Days)
                  </span>
                  <span className="text-[10px] text-muted font-medium shrink-0">
                    Cycle Breakdown
                  </span>
                </div>

                {/* 1. Mobile Compact List: ZERO horizontal scrolling on mobile */}
                <div className="sm:hidden divide-y divide-border min-w-0 max-w-full">
                  {options.dailyRows.length === 0 ? (
                    <div className="p-6 text-center text-muted text-xs font-semibold">
                      No worked shifts or authorized leave records found for this period.
                    </div>
                  ) : (
                    options.dailyRows.map((row) => {
                    const statusLower = row.status.toLowerCase();
                    let badgeTone = "bg-slate-100 text-slate-700 border border-slate-200";
                    if (statusLower === "approved") {
                      badgeTone = "bg-emerald-600 text-white";
                    } else if (statusLower === "submitted") {
                      badgeTone = "bg-amber-600 text-white";
                    } else if (statusLower.includes("leave")) {
                      badgeTone = "bg-purple-700 text-white";
                    } else if (statusLower.includes("holiday")) {
                      badgeTone = "bg-indigo-700 text-white";
                    } else if (statusLower === "rejected") {
                      badgeTone = "bg-rose-600 text-white";
                    } else if (statusLower === "draft") {
                      badgeTone = "bg-slate-200 text-slate-700";
                    }

                    const isWorked = Boolean(row.clockIn || row.clockOut || row.paidHours > 0);

                    return (
                      <div
                        key={row.date}
                        className="p-2.5 flex items-center justify-between gap-2 min-w-0 hover:bg-surface-muted/30 transition-colors"
                      >
                        {/* Left: Date, Day, Status, Shift info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs text-foreground">
                              {row.date}
                            </span>
                            <span className="text-[10px] text-muted font-medium">
                              {row.dayOfWeek}
                            </span>
                            <span
                              className={`inline-block rounded px-1.5 py-0.2 text-[8.5px] font-black uppercase tracking-wider ${badgeTone}`}
                            >
                              {row.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10.5px] text-muted font-mono mt-0.5 truncate">
                            {isWorked ? (
                              <>
                                <span className="font-semibold text-foreground">
                                  {row.clockIn || "--:--"} - {row.clockOut || "--:--"}
                                </span>
                                {row.lunch && <span>· Lunch: {row.lunch}</span>}
                              </>
                            ) : (
                              <span className="italic">
                                {statusLower.includes("leave")
                                  ? "Leave absence"
                                  : statusLower.includes("holiday")
                                    ? "Public holiday"
                                    : statusLower.includes("rest")
                                      ? "Rest day"
                                      : "Unclocked shift"}
                              </span>
                            )}
                          </div>

                          {row.notes && (
                            <p className="text-[9.5px] text-muted italic truncate mt-0.5 max-w-[240px]">
                              {row.notes}
                            </p>
                          )}
                        </div>

                        {/* Right: Paid Hours & Normal/OT breakdown */}
                        <div className="text-right shrink-0 font-mono">
                          <div className="text-xs font-black text-primary">
                            {Number(row.paidHours).toFixed(1)}h
                          </div>
                          <div className="text-[9px] text-muted">
                            {row.overtimeHours > 0 ? (
                              <span className="font-bold text-amber-700">
                                +{Number(row.overtimeHours).toFixed(1)}h OT
                              </span>
                            ) : (
                              <span>{Number(row.normalHours).toFixed(1)}h N</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                  )}

                  {/* Mobile Totals Footer Banner */}
                  <div className="bg-slate-900 text-white p-2.5 flex items-center justify-between font-mono text-xs">
                    <div>
                      <div className="text-[9.5px] uppercase font-bold text-slate-400">
                        Cycle Totals
                      </div>
                      <div className="text-[10.5px] text-slate-300">
                        {totalNormal.toFixed(1)}h N · {totalOt.toFixed(1)}h OT
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-black text-emerald-400">
                        {totalPaid.toFixed(2)}h Paid
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {options.dailyRows.length} Days Complete
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Desktop Structured Table (only on sm: and up) */}
                <div className="hidden sm:block overflow-x-auto min-w-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-surface-muted/30 text-[10px] uppercase font-bold text-muted">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-2 py-2">Day</th>
                        <th className="px-2 py-2">In</th>
                        <th className="px-2 py-2">Lunch</th>
                        <th className="px-2 py-2">Out</th>
                        <th className="px-2 py-2 text-right">Normal</th>
                        <th className="px-2 py-2 text-right">OT</th>
                        <th className="px-2 py-2 text-right font-bold">Total</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {options.dailyRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-8 text-center text-muted font-medium text-xs">
                            No worked shifts or authorized leave records found for this period.
                          </td>
                        </tr>
                      ) : (
                        options.dailyRows.map((row) => {
                        const statusLower = row.status.toLowerCase();
                        let badgeTone = "bg-surface-muted text-muted";
                        if (statusLower === "approved") {
                          badgeTone = "bg-emerald-500/15 text-primary border border-emerald-500/25";
                        } else if (statusLower === "submitted") {
                          badgeTone = "bg-amber-500/15 text-amber-700 border border-amber-500/25";
                        } else if (statusLower.includes("leave")) {
                          badgeTone = "bg-purple-500/15 text-purple-700 border border-purple-500/25";
                        } else if (statusLower.includes("holiday")) {
                          badgeTone = "bg-indigo-500/15 text-indigo-700 border border-indigo-500/25";
                        } else if (statusLower.includes("holiday")) {
                          badgeTone = "bg-indigo-500/15 text-indigo-700 border border-indigo-500/25";
                        } else if (statusLower === "rejected") {
                          badgeTone = "bg-rose-500/15 text-rose-700 border border-rose-500/25";
                        } else if (statusLower === "draft") {
                          badgeTone = "bg-slate-200/70 text-slate-700";
                        }

                        return (
                          <tr key={row.date} className="hover:bg-surface-muted/40 transition-colors">
                            <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                              {row.date}
                            </td>
                            <td className="px-2 py-2 text-muted">{row.dayOfWeek}</td>
                            <td className="px-2 py-2 font-mono text-foreground">
                              {row.clockIn || "--:--"}
                            </td>
                            <td className="px-2 py-2 font-mono text-muted text-[11px]">
                              {row.lunch || "--:--"}
                            </td>
                            <td className="px-2 py-2 font-mono text-foreground">
                              {row.clockOut || "--:--"}
                            </td>
                            <td className="px-2 py-2 text-right font-mono">
                              {Number(row.normalHours).toFixed(1)}h
                            </td>
                            <td
                              className={`px-2 py-2 text-right font-mono ${
                                row.overtimeHours > 0 ? "font-bold text-amber-700" : "text-muted"
                              }`}
                            >
                              {Number(row.overtimeHours).toFixed(1)}h
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-bold text-primary">
                              {Number(row.paidHours).toFixed(1)}h
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${badgeTone}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted text-[11px] truncate max-w-[140px]">
                              {row.notes || "--"}
                            </td>
                          </tr>
                        );
                      })
                      )}
                      {/* Period Totals Row */}
                      <tr className="bg-slate-900 text-white font-bold text-xs">
                        <td colSpan={5} className="px-3 py-2.5 text-right uppercase tracking-wider text-[11px]">
                          Payroll Cycle Totals:
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono">
                          {totalNormal.toFixed(2)}h
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-amber-400">
                          {totalOt.toFixed(2)}h
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-emerald-400 font-extrabold">
                          {totalPaid.toFixed(2)}h
                        </td>
                        <td colSpan={2} className="px-3 py-2.5 text-slate-300 text-[10px]">
                          {options.dailyRows.length} Shifts &amp; Leave Days
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Official Sign-off preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1 text-xs min-w-0">
                <div className="rounded-xl border border-border bg-surface p-2.5 sm:p-3.5 shadow-2xs min-w-0">
                  <p className="font-bold uppercase tracking-wider text-[9.5px] sm:text-[10px] text-muted">
                    Employee Acknowledgment
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-muted leading-relaxed">
                    I certify that this statement represents a true record of hours worked and authorized leave taken.
                  </p>
                  <div className="mt-3 border-b border-dashed border-border pb-1 text-[10px] text-muted">
                    Signature: __________________________
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-2.5 sm:p-3.5 shadow-2xs min-w-0">
                  <p className="font-bold uppercase tracking-wider text-[9.5px] sm:text-[10px] text-muted">
                    Manager / Payroll Approval
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-muted leading-relaxed">
                    Audited and approved for company payroll processing and statutory BCEA compliance.
                  </p>
                  <div className="mt-3 border-b border-dashed border-border pb-1 text-[10px] text-muted">
                    Supervisor Signature: __________________________
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* A4 Paper Layout View (for Desktop or Zoomable Review) */
            <div className="flex justify-center overflow-x-auto min-w-0 max-w-full">
              <div className="w-full max-w-[794px] bg-white p-4 sm:p-10 shadow-lg border border-slate-300 text-slate-900 rounded-sm min-w-0">
                <div className="flex justify-between items-center border-b-2 border-emerald-700 pb-2 sm:pb-3 mb-3 sm:mb-4">
                  <div>
                    <h1 className="text-base sm:text-xl font-black uppercase text-slate-900">
                      {options.companyName}
                    </h1>
                    <p className="text-[10px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wider">
                      Official Employee Timesheet Statement
                    </p>
                  </div>
                  <div className="text-right text-[10px] sm:text-xs text-slate-600">
                    <p>
                      Period: <strong className="text-slate-900">{options.periodLabel}</strong>
                    </p>
                    <p>
                      {options.startDate} to {options.endDate}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded p-2 text-[10px] sm:text-xs mb-3">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Employee</span>
                    <strong>{options.employeeInfo.name}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Emp #</span>
                    <strong>{options.employeeInfo.employeeNumber || "N/A"}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Dept</span>
                    <strong>{options.employeeInfo.department || "General"}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Workstation</span>
                    <strong>{options.employeeInfo.workstation || "Standard"}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[10px] sm:text-xs mb-3">
                    <thead>
                      <tr className="bg-slate-900 text-white text-[9px] sm:text-[10px] uppercase">
                        <th className="p-1 sm:p-1.5 text-left">Date</th>
                        <th className="p-1 sm:p-1.5 text-left">Day</th>
                        <th className="p-1 sm:p-1.5 text-left">In</th>
                        <th className="p-1 sm:p-1.5 text-left">Lunch</th>
                        <th className="p-1 sm:p-1.5 text-left">Out</th>
                        <th className="p-1 sm:p-1.5 text-right">Normal</th>
                        <th className="p-1 sm:p-1.5 text-right">OT</th>
                        <th className="p-1 sm:p-1.5 text-right">Total</th>
                        <th className="p-1 sm:p-1.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {options.dailyRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-slate-500 text-xs">
                            No worked shifts or authorized leave records found for this period.
                          </td>
                        </tr>
                      ) : (
                        options.dailyRows.map((r) => (
                          <tr key={r.date} className="text-[9.5px] sm:text-[11px]">
                            <td className="p-1 sm:p-1.5 font-semibold">{r.date}</td>
                            <td className="p-1 sm:p-1.5 text-slate-600">{r.dayOfWeek}</td>
                            <td className="p-1 sm:p-1.5 font-mono">{r.clockIn || "--:--"}</td>
                            <td className="p-1 sm:p-1.5 font-mono">{r.lunch || "--:--"}</td>
                            <td className="p-1 sm:p-1.5 font-mono">{r.clockOut || "--:--"}</td>
                            <td className="p-1 sm:p-1.5 text-right font-mono">
                              {Number(r.normalHours).toFixed(1)}h
                            </td>
                            <td className="p-1 sm:p-1.5 text-right font-mono">
                              {Number(r.overtimeHours).toFixed(1)}h
                            </td>
                            <td className="p-1 sm:p-1.5 text-right font-mono font-bold text-emerald-800">
                              {Number(r.paidHours).toFixed(1)}h
                            </td>
                            <td className="p-1 sm:p-1.5 text-center text-[9px] sm:text-[10px] font-bold uppercase">
                              {r.status}
                            </td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-slate-900 text-white font-bold text-[9.5px] sm:text-xs">
                        <td colSpan={5} className="p-1.5 sm:p-2 text-right uppercase text-[9px] sm:text-[10px]">
                          Cycle Totals:
                        </td>
                        <td className="p-1.5 sm:p-2 text-right">{totalNormal.toFixed(2)}h</td>
                        <td className="p-1.5 sm:p-2 text-right text-amber-300">
                          {totalOt.toFixed(2)}h
                        </td>
                        <td className="p-1.5 sm:p-2 text-right text-emerald-300">
                          {totalPaid.toFixed(2)}h
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
