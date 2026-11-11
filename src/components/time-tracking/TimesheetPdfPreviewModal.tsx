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
  type LeaveAuditStatus,
  type TimesheetLeaveAuditSummary,
  type TimesheetPdfDailyRow,
  type TimesheetPdfOptions,
} from "@/lib/reports/exporters";

type TimesheetPdfPreviewModalProps = {
  options: TimesheetPdfOptions;
  open: boolean;
  onClose: () => void;
  onExportExcel?: () => void;
};

function LeaveStatusBadge({ status }: { status: LeaveAuditStatus }) {
  const tone =
    status === "approved"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : status === "submitted"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : status === "rejected"
          ? "bg-rose-100 text-rose-800 border-rose-200"
          : "bg-slate-200 text-slate-700 border-slate-300";
  const label =
    status === "approved"
      ? "Approved"
      : status === "submitted"
        ? "Pending Approval"
        : status === "rejected"
          ? "Rejected"
          : "Not Sent (Draft)";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight ${tone}`}>
      {label}
    </span>
  );
}

const isMaternityPdfRow = (r: TimesheetPdfDailyRow) =>
  r.leaveCategory === "maternity" ||
  (r.leaveTypeName || "").toLowerCase().includes("maternity") ||
  (r.notes || "").toLowerCase().includes("maternity");

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

  const leaveAudit: TimesheetLeaveAuditSummary = useMemo(
    () =>
      options.metrics.leaveAudit ?? {
        annualHours: 0,
        annualDays: 0,
        sickHours: 0,
        sickDays: 0,
        familyResponsibilityHours: 0,
        familyResponsibilityDays: 0,
        toilHours: 0,
        toilDays: 0,
        otherLeaveHours: 0,
        otherLeaveDays: 0,
        pendingApprovalDays: 0,
        pendingApprovalDates: [],
        notSentDays: 0,
        notSentDates: [],
        rejectedDays: 0,
        rejectedDates: [],
        breakdown: [],
        maternity: {
          isOnMaternity: false,
          isEntirePeriodMaternity: false,
          startDate: null,
          endDate: null,
          status: null,
          totalDays: 0,
          totalHours: 0,
          label: "Maternity Leave",
        },
      },
    [options.metrics.leaveAudit],
  );

  const maternityRows = useMemo(
    () => options.dailyRows.filter(isMaternityPdfRow),
    [options.dailyRows],
  );
  const nonMaternityRows = useMemo(
    () => options.dailyRows.filter((r) => !isMaternityPdfRow(r)),
    [options.dailyRows],
  );
  const isOnMaternity = leaveAudit.maternity.isOnMaternity || maternityRows.length > 0;
  const isEntirePeriodMaternity =
    leaveAudit.maternity.isEntirePeriodMaternity ||
    (isOnMaternity && nonMaternityRows.length === 0);
  const tableRowsToDisplay = isOnMaternity ? nonMaternityRows : options.dailyRows;
  const nonMaternityBreakdown = useMemo(
    () => leaveAudit.breakdown.filter((b) => b.category !== "maternity"),
    [leaveAudit.breakdown],
  );
  const unloggedPastWeekdays = options.metrics.unloggedPastWeekdays ?? 0;

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

              {/* Compact KPI Summary Tiles + Leave Categories */}
              <div className="space-y-1.5 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 min-w-0">
                  <div className="rounded-lg border border-border border-l-4 border-l-emerald-600 bg-surface px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-muted block truncate">
                      Total Paid
                    </span>
                    <p className="mt-0.5 text-sm sm:text-base font-black text-primary font-mono leading-tight">
                      {totalPaid.toFixed(2)}h
                    </p>
                    <span className="text-[8.5px] text-muted block truncate">
                      {options.metrics.daysWorked}d worked
                    </span>
                  </div>
                  <div className="rounded-lg border border-border border-l-4 border-l-emerald-600 bg-surface px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-muted block truncate">
                      Normal Hours
                    </span>
                    <p className="mt-0.5 text-sm sm:text-base font-black text-foreground font-mono leading-tight">
                      {totalNormal.toFixed(2)}h
                    </p>
                    <span className="text-[8.5px] text-muted block truncate">
                      Standard rate
                    </span>
                  </div>
                  <div className="rounded-lg border border-border border-l-4 border-l-amber-500 bg-surface px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-muted block truncate">
                      Overtime Hours
                    </span>
                    <p className="mt-0.5 text-sm sm:text-base font-black text-amber-600 font-mono leading-tight">
                      {totalOt.toFixed(2)}h
                    </p>
                    <span className="text-[8.5px] text-muted block truncate">
                      Approved OT
                    </span>
                  </div>
                  <div className="rounded-lg border border-purple-200 border-l-4 border-l-purple-600 bg-purple-50/50 px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-purple-800 block truncate">
                      Leave Taken
                    </span>
                    <p className="mt-0.5 text-sm sm:text-base font-black text-purple-800 font-mono leading-tight">
                      {Number(options.metrics.leaveHours || 0).toFixed(1)}h
                    </p>
                    <span className="text-[8.5px] text-purple-700 block truncate">
                      {(Number(options.metrics.leaveHours || 0) / 8).toFixed(1)}d authorized
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-lg border border-border border-l-4 border-l-emerald-600 bg-surface px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-muted block truncate">
                      Attendance
                    </span>
                    <p className="mt-0.5 text-sm sm:text-base font-black text-foreground font-mono leading-tight">
                      {options.metrics.daysWorked} / {options.metrics.totalDaysInPeriod}
                    </p>
                    <span className="text-[8.5px] text-muted block truncate">
                      Days logged
                    </span>
                  </div>
                </div>

                {/* 4 Category Leave Taken Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 min-w-0">
                  <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] font-bold uppercase tracking-wider text-purple-800 block truncate">
                      Annual Leave Taken
                    </span>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-xs sm:text-sm font-black font-mono text-purple-950">
                        {leaveAudit.annualHours.toFixed(1)}h
                      </span>
                      <span className="text-[9px] font-semibold text-purple-700">
                        {leaveAudit.annualDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] font-bold uppercase tracking-wider text-purple-800 block truncate">
                      Sick Leave Taken
                    </span>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-xs sm:text-sm font-black font-mono text-purple-950">
                        {leaveAudit.sickHours.toFixed(1)}h
                      </span>
                      <span className="text-[9px] font-semibold text-purple-700">
                        {leaveAudit.sickDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] font-bold uppercase tracking-wider text-purple-800 block truncate">
                      Family Resp. Taken
                    </span>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-xs sm:text-sm font-black font-mono text-purple-950">
                        {leaveAudit.familyResponsibilityHours.toFixed(1)}h
                      </span>
                      <span className="text-[9px] font-semibold text-purple-700">
                        {leaveAudit.familyResponsibilityDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-2 py-1.5 shadow-2xs min-w-0">
                    <span className="text-[8.5px] font-bold uppercase tracking-wider text-purple-800 block truncate">
                      Time Off In Lieu
                    </span>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-xs sm:text-sm font-black font-mono text-purple-950">
                        {leaveAudit.toilHours.toFixed(1)}h
                      </span>
                      <span className="text-[9px] font-semibold text-purple-700">
                        {leaveAudit.toilDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                </div>

                {/* Unapproved / Unsubmitted Leave Audit Banner */}
                {(leaveAudit.notSentDays > 0 ||
                  leaveAudit.pendingApprovalDays > 0 ||
                  leaveAudit.rejectedDays > 0 ||
                  (unloggedPastWeekdays > 0 && !isEntirePeriodMaternity)) ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10.5px] text-amber-900 space-y-1">
                    {leaveAudit.notSentDays > 0 && (
                      <p className="font-semibold">
                        <AlertTriangle className="inline size-3.5 mr-1 text-amber-700" />
                        {leaveAudit.notSentDays} leave day(s) not sent to manager for approval:{" "}
                        <span className="font-mono">{leaveAudit.notSentDates.join(", ")}</span>
                      </p>
                    )}
                    {leaveAudit.pendingApprovalDays > 0 && (
                      <p className="font-semibold">
                        <Clock className="inline size-3.5 mr-1 text-amber-700" />
                        {leaveAudit.pendingApprovalDays} leave day(s) pending manager approval:{" "}
                        <span className="font-mono">{leaveAudit.pendingApprovalDates.join(", ")}</span>
                      </p>
                    )}
                    {leaveAudit.rejectedDays > 0 && (
                      <p className="font-semibold text-rose-800">
                        <AlertTriangle className="inline size-3.5 mr-1 text-rose-600" />
                        {leaveAudit.rejectedDays} leave day(s) rejected:{" "}
                        <span className="font-mono">{leaveAudit.rejectedDates.join(", ")}</span>
                      </p>
                    )}
                    {unloggedPastWeekdays > 0 && !isEntirePeriodMaternity && (
                      <p className="text-amber-800">
                        <AlertTriangle className="inline size-3.5 mr-1 text-amber-600" />
                        {unloggedPastWeekdays} past weekday(s) have no shift or leave added yet (Draft).
                      </p>
                    )}
                  </div>
                ) : (leaveAudit.breakdown.length > 0 || isOnMaternity) ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10.5px] text-emerald-900 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-700 shrink-0" />
                    <span>All leave days in this payroll cycle have been submitted and approved by a manager.</span>
                  </div>
                ) : null}

                {/* Maternity Leave Collapsed Block */}
                {isOnMaternity && (
                  <div className="rounded-xl border border-pink-300 bg-pink-50 px-3.5 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs sm:text-sm font-black uppercase tracking-tight text-pink-950">
                        You are on Maternity Leave
                      </p>
                      <p className="text-[10.5px] text-pink-800 mt-0.5">
                        {leaveAudit.maternity.startDate || options.startDate} to{" "}
                        {leaveAudit.maternity.endDate || options.endDate} ·{" "}
                        {leaveAudit.maternity.totalDays || maternityRows.length} working day(s)
                      </p>
                    </div>
                    <LeaveStatusBadge status={leaveAudit.maternity.status || "approved"} />
                  </div>
                )}

                {/* Leave Days Breakdown */}
                {nonMaternityBreakdown.length > 0 && (
                  <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-2xs">
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted mb-1.5">
                      Leave Days Breakdown ({nonMaternityBreakdown.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {nonMaternityBreakdown.map((b) => (
                        <div
                          key={b.key}
                          className="rounded-lg border border-border bg-surface-muted/40 px-2 py-1 text-[10.5px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground truncate">{b.label}</span>
                            <LeaveStatusBadge status={b.status} />
                          </div>
                          <p className="text-[9.5px] text-muted mt-0.5 truncate">
                            <span className="font-mono font-bold text-foreground">{b.hours.toFixed(1)}h</span> ({b.days.toFixed(1)}d) · {b.dates.join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Timesheet Section */}
              {!isEntirePeriodMaternity && (
              <div className="rounded-xl sm:rounded-2xl border border-border bg-surface shadow-soft overflow-hidden min-w-0 max-w-full">
                <div className="border-b border-border px-3 py-2 bg-surface-muted/50 flex items-center justify-between min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">
                    Daily Shift Timesheet ({tableRowsToDisplay.length} Recorded Days)
                  </span>
                  <span className="text-[10px] text-muted font-medium shrink-0">
                    Cycle Breakdown
                  </span>
                </div>

                {/* 1. Mobile Compact List: ZERO horizontal scrolling on mobile */}
                <div className="sm:hidden divide-y divide-border min-w-0 max-w-full">
                  {tableRowsToDisplay.length === 0 && !isOnMaternity ? (
                    <div className="p-6 text-center text-muted text-xs font-semibold">
                      No worked shifts or authorized leave records found for this period.
                    </div>
                  ) : (
                    tableRowsToDisplay.map((row) => {
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

                  {isOnMaternity && !isEntirePeriodMaternity && (
                    <div className="p-2.5 bg-pink-50/70 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-pink-950 truncate">You are on Maternity Leave</p>
                        <p className="text-[10px] text-pink-800 truncate">
                          {leaveAudit.maternity.startDate || options.startDate} – {leaveAudit.maternity.endDate || options.endDate} · {leaveAudit.maternity.totalDays || maternityRows.length}d
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <LeaveStatusBadge status={leaveAudit.maternity.status || "approved"} />
                        <div className="text-[10px] font-mono font-bold text-pink-900 mt-0.5">
                          {Number(leaveAudit.maternity.totalHours || 0).toFixed(1)}h
                        </div>
                      </div>
                    </div>
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
                      {tableRowsToDisplay.length === 0 && !isOnMaternity ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-8 text-center text-muted font-medium text-xs">
                            No worked shifts or authorized leave records found for this period.
                          </td>
                        </tr>
                      ) : (
                        tableRowsToDisplay.map((row) => {
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
                      {isOnMaternity && !isEntirePeriodMaternity && (
                        <tr className="bg-pink-50/70 text-pink-950 font-semibold">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {leaveAudit.maternity.startDate || options.startDate} – {leaveAudit.maternity.endDate || options.endDate}
                          </td>
                          <td className="px-2 py-2">{leaveAudit.maternity.totalDays || maternityRows.length}d</td>
                          <td colSpan={3} className="px-2 py-2 font-bold">You are on Maternity Leave</td>
                          <td className="px-2 py-2 text-right font-mono">0.0h</td>
                          <td className="px-2 py-2 text-right font-mono">0.0h</td>
                          <td className="px-2 py-2 text-right font-mono font-bold">
                            {Number(leaveAudit.maternity.totalHours || 0).toFixed(1)}h
                          </td>
                          <td className="px-3 py-2 text-center">
                            <LeaveStatusBadge status={leaveAudit.maternity.status || "approved"} />
                          </td>
                          <td className="px-3 py-2 text-[11px] text-pink-800">Collapsed Maternity Leave period</td>
                        </tr>
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
              )}

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

                {/* Compact A4 KPI Summary (5 Core + 4 Leave Categories) */}
                <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                  <div className="border border-slate-200 border-l-2 border-l-emerald-600 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-slate-500 block">Total Paid</span>
                    <strong className="text-xs text-emerald-800 font-mono block">{totalPaid.toFixed(2)}h</strong>
                    <span className="text-[7px] text-slate-500">{options.metrics.daysWorked}d worked</span>
                  </div>
                  <div className="border border-slate-200 border-l-2 border-l-emerald-600 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-slate-500 block">Normal Hours</span>
                    <strong className="text-xs text-slate-900 font-mono block">{totalNormal.toFixed(2)}h</strong>
                    <span className="text-[7px] text-slate-500">Standard shift</span>
                  </div>
                  <div className="border border-slate-200 border-l-2 border-l-amber-500 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-slate-500 block">Overtime</span>
                    <strong className="text-xs text-amber-700 font-mono block">{totalOt.toFixed(2)}h</strong>
                    <span className="text-[7px] text-slate-500">Approved OT</span>
                  </div>
                  <div className="border border-purple-200 border-l-2 border-l-purple-600 bg-purple-50/40 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-purple-700 block">Leave Taken</span>
                    <strong className="text-xs text-purple-800 font-mono block">{Number(options.metrics.leaveHours || 0).toFixed(1)}h</strong>
                    <span className="text-[7px] text-purple-600">{(Number(options.metrics.leaveHours || 0) / 8).toFixed(1)}d authorized</span>
                  </div>
                  <div className="border border-slate-200 border-l-2 border-l-emerald-600 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-slate-500 block">Attendance</span>
                    <strong className="text-xs text-slate-900 font-mono block">{options.metrics.daysWorked} / {options.metrics.totalDaysInPeriod}</strong>
                    <span className="text-[7px] text-slate-500">Days logged</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  <div className="border border-purple-200 border-l-2 border-l-purple-600 bg-purple-50/50 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-purple-800 block">Annual Leave Taken</span>
                    <strong className="text-[11px] text-purple-950 font-mono">{leaveAudit.annualHours.toFixed(1)}h</strong>
                    <span className="text-[7px] text-purple-700 ml-1">({leaveAudit.annualDays.toFixed(1)}d)</span>
                  </div>
                  <div className="border border-purple-200 border-l-2 border-l-purple-600 bg-purple-50/50 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-purple-800 block">Sick Leave Taken</span>
                    <strong className="text-[11px] text-purple-950 font-mono">{leaveAudit.sickHours.toFixed(1)}h</strong>
                    <span className="text-[7px] text-purple-700 ml-1">({leaveAudit.sickDays.toFixed(1)}d)</span>
                  </div>
                  <div className="border border-purple-200 border-l-2 border-l-purple-600 bg-purple-50/50 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-purple-800 block">Family Resp. Taken</span>
                    <strong className="text-[11px] text-purple-950 font-mono">{leaveAudit.familyResponsibilityHours.toFixed(1)}h</strong>
                    <span className="text-[7px] text-purple-700 ml-1">({leaveAudit.familyResponsibilityDays.toFixed(1)}d)</span>
                  </div>
                  <div className="border border-purple-200 border-l-2 border-l-purple-600 bg-purple-50/50 rounded p-1.5">
                    <span className="text-[7.5px] font-bold uppercase text-purple-800 block">Time Off In Lieu</span>
                    <strong className="text-[11px] text-purple-950 font-mono">{leaveAudit.toilHours.toFixed(1)}h</strong>
                    <span className="text-[7px] text-purple-700 ml-1">({leaveAudit.toilDays.toFixed(1)}d)</span>
                  </div>
                </div>

                {(leaveAudit.notSentDays > 0 ||
                  leaveAudit.pendingApprovalDays > 0 ||
                  leaveAudit.rejectedDays > 0 ||
                  (unloggedPastWeekdays > 0 && !isEntirePeriodMaternity)) ? (
                  <div className="border border-amber-300 border-l-2 border-l-amber-600 bg-amber-50 rounded p-1.5 text-[9px] text-amber-900 mb-2 space-y-0.5">
                    {leaveAudit.notSentDays > 0 && (
                      <div><strong>{leaveAudit.notSentDays} leave day(s) not sent to manager for approval:</strong> {leaveAudit.notSentDates.join(", ")}</div>
                    )}
                    {leaveAudit.pendingApprovalDays > 0 && (
                      <div><strong>{leaveAudit.pendingApprovalDays} leave day(s) pending manager approval:</strong> {leaveAudit.pendingApprovalDates.join(", ")}</div>
                    )}
                    {leaveAudit.rejectedDays > 0 && (
                      <div className="text-rose-800"><strong>{leaveAudit.rejectedDays} leave day(s) rejected:</strong> {leaveAudit.rejectedDates.join(", ")}</div>
                    )}
                    {unloggedPastWeekdays > 0 && !isEntirePeriodMaternity && (
                      <div><strong>{unloggedPastWeekdays} past weekday(s)</strong> have no shift or leave added yet (Draft).</div>
                    )}
                  </div>
                ) : (leaveAudit.breakdown.length > 0 || isOnMaternity) ? (
                  <div className="border border-emerald-200 border-l-2 border-l-emerald-600 bg-emerald-50 rounded p-1.5 text-[9px] text-emerald-900 font-semibold mb-2">
                    &#10003; All leave days in this payroll cycle have been submitted and approved by a manager.
                  </div>
                ) : null}

                {isOnMaternity && (
                  <div className="border border-pink-300 border-l-4 border-l-pink-600 bg-pink-50 rounded p-2.5 mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black uppercase text-pink-950">You are on Maternity Leave</div>
                      <div className="text-[9px] text-pink-800">
                        {leaveAudit.maternity.startDate || options.startDate} to {leaveAudit.maternity.endDate || options.endDate} · {leaveAudit.maternity.totalDays || maternityRows.length} working day(s)
                      </div>
                    </div>
                    <LeaveStatusBadge status={leaveAudit.maternity.status || "approved"} />
                  </div>
                )}

                {nonMaternityBreakdown.length > 0 && (
                  <div className="border border-slate-200 bg-slate-50 rounded p-1.5 mb-2">
                    <div className="text-[8px] font-bold uppercase text-slate-600 mb-1">
                      Leave Days Breakdown ({nonMaternityBreakdown.length})
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {nonMaternityBreakdown.map((b) => (
                        <div key={b.key} className="bg-white border border-slate-200 rounded p-1 text-[8.5px]">
                          <div className="flex items-center justify-between gap-1">
                            <strong className="text-slate-900">{b.label}</strong>
                            <LeaveStatusBadge status={b.status} />
                          </div>
                          <div className="text-slate-600 mt-0.5">
                            <strong>{b.hours.toFixed(1)}h</strong> ({b.days.toFixed(1)}d) · {b.dates.join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isEntirePeriodMaternity && (
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
                      {tableRowsToDisplay.length === 0 && !isOnMaternity ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-slate-500 text-xs">
                            No worked shifts or authorized leave records found for this period.
                          </td>
                        </tr>
                      ) : (
                        tableRowsToDisplay.map((r) => (
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
                      {isOnMaternity && !isEntirePeriodMaternity && (
                        <tr className="bg-pink-50 text-pink-950 text-[9.5px] sm:text-[11px] font-semibold">
                          <td className="p-1 sm:p-1.5">{leaveAudit.maternity.startDate || options.startDate} – {leaveAudit.maternity.endDate || options.endDate}</td>
                          <td className="p-1 sm:p-1.5">{leaveAudit.maternity.totalDays || maternityRows.length}d</td>
                          <td colSpan={3} className="p-1 sm:p-1.5 font-bold">You are on Maternity Leave</td>
                          <td className="p-1 sm:p-1.5 text-right font-mono">0.0h</td>
                          <td className="p-1 sm:p-1.5 text-right font-mono">0.0h</td>
                          <td className="p-1 sm:p-1.5 text-right font-mono font-bold">{Number(leaveAudit.maternity.totalHours || 0).toFixed(1)}h</td>
                          <td className="p-1 sm:p-1.5 text-center text-[9px] font-bold uppercase">{leaveAudit.maternity.status || "approved"}</td>
                        </tr>
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
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
