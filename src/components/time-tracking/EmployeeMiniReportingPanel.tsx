"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  Coins,
  Download,
  FileText,
  Filter,
  Palmtree,
  Printer,
  Search,
  Zap,
} from "lucide-react";
import type { TimeEntryRecord, CompanyPublicHoliday } from "@/lib/time-tracking/schema";
import type { LeaveRequest } from "@/lib/work-rules/schema";
import {
  generatePayrollPeriods,
  formatPeriodDate,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";
import { exportReportToPdf } from "@/lib/reports/exporters";

type EmployeeMiniReportingPanelProps = {
  employeeName: string;
  employeeNumber?: string;
  departmentName?: string;
  workstationName?: string;
  entries: TimeEntryRecord[];
  leaveRequests: LeaveRequest[];
  publicHolidays?: CompanyPublicHoliday[];
  payrollConfig?: PayrollPeriodConfig;
  companyName?: string;
};

type RecordFilterType = "all" | "timesheets" | "leave";

function formatTime(val: string | null): string {
  if (!val) return "--";
  return val.slice(0, 5);
}

function formatDate(iso: string): string {
  if (!iso) return "--";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export default function EmployeeMiniReportingPanel({
  employeeName,
  employeeNumber,
  departmentName,
  workstationName,
  entries,
  leaveRequests,
  publicHolidays = [],
  payrollConfig = defaultPayrollConfig,
  companyName = "ClockWise People",
}: EmployeeMiniReportingPanelProps) {
  const todayIso = new Date().toISOString().slice(0, 10);

  // Generate payroll periods
  const generatedPeriods = useMemo(
    () => generatePayrollPeriods(payrollConfig, todayIso, 12),
    [payrollConfig, todayIso],
  );

  const initialPeriodId =
    generatedPeriods.find((p) => p.isCurrent)?.id ??
    generatedPeriods[0]?.id ??
    "custom";

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(initialPeriodId);

  const currentPeriod = useMemo(
    () =>
      generatedPeriods.find((p) => p.id === selectedPeriodId) ??
      generatedPeriods[0],
    [generatedPeriods, selectedPeriodId],
  );

  const [customStart, setCustomStart] = useState<string>(
    currentPeriod?.startDate ?? todayIso.slice(0, 8) + "01",
  );
  const [customEnd, setCustomEnd] = useState<string>(
    currentPeriod?.endDate ?? todayIso,
  );

  const effectiveStartDate =
    selectedPeriodId === "custom"
      ? customStart
      : (currentPeriod?.startDate ?? todayIso.slice(0, 8) + "01");
  const effectiveEndDate =
    selectedPeriodId === "custom"
      ? customEnd
      : (currentPeriod?.endDate ?? todayIso);

  const periodLabel =
    selectedPeriodId === "custom"
      ? `${formatPeriodDate(effectiveStartDate)} - ${formatPeriodDate(effectiveEndDate)}`
      : (currentPeriod?.label ?? "Selected Period");

  // Filtration state
  const [recordType, setRecordType] = useState<RecordFilterType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const holidayDateSet = useMemo(
    () => new Set(publicHolidays.map((h) => h.holiday_date)),
    [publicHolidays],
  );

  // Filtered Timesheet entries in period
  const periodTimesheets = useMemo(() => {
    return entries.filter(
      (e) => e.work_date >= effectiveStartDate && e.work_date <= effectiveEndDate,
    );
  }, [entries, effectiveStartDate, effectiveEndDate]);

  // Filtered Leave requests in period
  const periodLeaves = useMemo(() => {
    return leaveRequests.filter((l) => {
      if (l.status === "cancelled" || l.status === "rejected") return false;
      return l.end_date >= effectiveStartDate && l.start_date <= effectiveEndDate;
    });
  }, [leaveRequests, effectiveStartDate, effectiveEndDate]);

  // Aggregated hours metrics
  const metrics = useMemo(() => {
    let workedHours = 0;
    let ot15 = 0;
    let ot20 = 0;
    let daysWorked = 0;
    let missingClockings = 0;

    for (const e of periodTimesheets) {
      const paid = Number(e.paid_hours ?? 0);
      const ot = Number(e.overtime_hours ?? 0);
      const normal = Math.max(0, paid - ot);
      const dayOfWeek = new Date(e.work_date).getDay();
      const isSunday = dayOfWeek === 0;
      const isHoliday = holidayDateSet.has(e.work_date);

      workedHours += normal;
      if (isSunday || isHoliday) {
        ot20 += ot;
      } else {
        ot15 += ot;
      }

      if (paid > 0 || e.clock_in || e.clock_out) {
        daysWorked += 1;
      }
      if (e.missing_clocking) {
        missingClockings += 1;
      }
    }

    let leaveHours = 0;
    let leaveDays = 0;
    for (const l of periodLeaves) {
      const overlapStart = l.start_date < effectiveStartDate ? effectiveStartDate : l.start_date;
      const overlapEnd = l.end_date > effectiveEndDate ? effectiveEndDate : l.end_date;
      if (overlapStart <= overlapEnd) {
        const s = new Date(`${overlapStart}T00:00:00`);
        const endD = new Date(`${overlapEnd}T00:00:00`);
        const days = Math.max(1, Math.round((endD.getTime() - s.getTime()) / 86400000) + 1);
        leaveDays += days;
        leaveHours += days * 8; // standard daily hours
      }
    }

    const totalOvertime = Number((ot15 + ot20).toFixed(2));
    const totalPaid = Number((workedHours + totalOvertime + leaveHours).toFixed(2));

    return {
      workedHours: Number(workedHours.toFixed(2)),
      ot15: Number(ot15.toFixed(2)),
      ot20: Number(ot20.toFixed(2)),
      totalOvertime,
      leaveHours: Number(leaveHours.toFixed(2)),
      leaveDays,
      totalPaid,
      daysWorked,
      missingClockings,
    };
  }, [periodTimesheets, periodLeaves, effectiveStartDate, effectiveEndDate, holidayDateSet]);

  // Combined and filtered records list
  const filteredRecords = useMemo(() => {
    type ActivityItem =
      | { type: "timesheet"; data: TimeEntryRecord; date: string }
      | { type: "leave"; data: LeaveRequest; date: string };

    const items: ActivityItem[] = [];

    if (recordType === "all" || recordType === "timesheets") {
      for (const e of periodTimesheets) {
        if (statusFilter !== "all" && e.status !== statusFilter) continue;
        if (searchTerm) {
          const matchDate = e.work_date.includes(searchTerm);
          const matchNotes = (e.notes ?? "").toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchDate && !matchNotes) continue;
        }
        items.push({ type: "timesheet", data: e, date: e.work_date });
      }
    }

    if (recordType === "all" || recordType === "leave") {
      for (const l of periodLeaves) {
        if (statusFilter !== "all" && l.status !== statusFilter) continue;
        if (searchTerm) {
          const matchDate = l.start_date.includes(searchTerm) || l.end_date.includes(searchTerm);
          const matchType = (l.leaveTypeName ?? "").toLowerCase().includes(searchTerm.toLowerCase());
          const matchReason = (l.reason ?? "").toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchDate && !matchType && !matchReason) continue;
        }
        items.push({ type: "leave", data: l, date: l.start_date });
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [periodTimesheets, periodLeaves, recordType, statusFilter, searchTerm]);

  // PDF Export
  const handleExportPdf = () => {
    const ts = new Date().toISOString().slice(0, 10);
    const headers = [
      "Type",
      "Date / Range",
      "Clock In",
      "Lunch",
      "Clock Out",
      "Normal (h)",
      "OT (h)",
      "Paid (h)",
      "Status",
    ];

    const rows = filteredRecords.map((item) => {
      if (item.type === "timesheet") {
        const e = item.data;
        const lunch = e.lunch_start && e.lunch_end ? `${formatTime(e.lunch_start)} - ${formatTime(e.lunch_end)}` : "--";
        return [
          "Timesheet",
          e.work_date,
          formatTime(e.clock_in),
          lunch,
          formatTime(e.clock_out),
          `${Number(e.normal_hours ?? 0).toFixed(2)}h`,
          `${Number(e.overtime_hours ?? 0).toFixed(2)}h`,
          `${Number(e.paid_hours ?? 0).toFixed(2)}h`,
          e.status.toUpperCase(),
        ];
      } else {
        const l = item.data;
        return [
          `Leave (${l.leaveTypeName ?? "Leave"})`,
          `${l.start_date} - ${l.end_date}`,
          "--",
          "--",
          "--",
          "0.00h",
          "0.00h",
          `${Number(l.total_hours ?? 0).toFixed(2)}h`,
          l.status.toUpperCase(),
        ];
      }
    });

    const kpiSummary = [
      { label: "Normal Worked", value: `${metrics.workedHours}h` },
      { label: "Overtime (OT)", value: `${metrics.totalOvertime}h` },
      { label: "Leave Hours", value: `${metrics.leaveHours}h` },
      { label: "Total Paid", value: `${metrics.totalPaid}h` },
      { label: "Days Worked", value: `${metrics.daysWorked}d` },
      { label: "Issues / Alerts", value: metrics.missingClockings },
    ];

    exportReportToPdf(
      `Employee Timesheet & Hours Statement — ${employeeName}`,
      `My_Hours_Report_${ts}`,
      companyName,
      periodLabel,
      headers,
      rows,
      kpiSummary,
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Payroll Cycle Selector */}
      <div className="rounded-xl border border-border bg-slate-950 p-4 sm:p-5 text-white shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                Personal Audit
              </span>
              <span className="text-xs text-slate-300 font-mono">
                {employeeNumber ? `#${employeeNumber}` : ""}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-black sm:text-xl">
              {employeeName}&apos;s Time &amp; Leave Statement
            </h3>
            <p className="text-xs text-slate-300">
              Audit your worked hours, overtime, and leave by payroll cycle or custom date range.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all shrink-0 cursor-pointer"
            title="Download personal PDF statement"
          >
            <Download className="size-3.5" />
            <span>Export Statement (PDF)</span>
          </button>
        </div>

        {/* Period Selector Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-400">
              Payroll Cycle:
            </span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {generatedPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {selectedPeriodId === "custom" && (
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-xl border border-slate-700">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              />
            </div>
          )}

          <div className="ml-auto text-xs text-slate-400 font-medium">
            Active: <span className="text-emerald-400 font-bold">{periodLabel}</span>
          </div>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <Clock className="size-3 text-slate-400" />
            Normal Worked
          </div>
          <div className="mt-1 text-base font-black text-foreground font-mono">
            {metrics.workedHours.toFixed(2)}h
          </div>
          <div className="text-[10px] text-muted">{metrics.daysWorked} days worked</div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            <Zap className="size-3 text-amber-600" />
            Overtime (OT)
          </div>
          <div className="mt-1 text-base font-black text-amber-950 font-mono">
            {metrics.totalOvertime.toFixed(2)}h
          </div>
          <div className="text-[9.5px] text-amber-700">
            1.5x: {metrics.ot15.toFixed(1)}h · 2.0x: {metrics.ot20.toFixed(1)}h
          </div>
        </div>

        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-800">
            <Palmtree className="size-3 text-teal-600" />
            Leave Taken
          </div>
          <div className="mt-1 text-base font-black text-teal-950 font-mono">
            {metrics.leaveHours.toFixed(2)}h
          </div>
          <div className="text-[10px] text-teal-700">{metrics.leaveDays} {metrics.leaveDays === 1 ? "day" : "days"}</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            <Coins className="size-3 text-emerald-600" />
            Grand Total Paid
          </div>
          <div className="mt-1 text-lg font-black text-emerald-950 font-mono">
            {metrics.totalPaid.toFixed(2)}h
          </div>
          <div className="text-[10px] text-emerald-700">Worked + OT + Leave</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <AlertTriangle className="size-3 text-slate-400" />
            Issues / Alerts
          </div>
          <div className="mt-1 text-base font-black text-foreground">
            {metrics.missingClockings > 0 ? (
              <span className="text-rose-600 font-bold">{metrics.missingClockings} missing</span>
            ) : (
              <span className="text-emerald-600 font-bold">0 issues</span>
            )}
          </div>
          <div className="text-[10px] text-muted">Clocking completeness</div>
        </div>
      </div>

      {/* Filtration Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border bg-surface p-2.5 shadow-2xs">
        {/* Record Type Selector */}
        <div className="flex items-center gap-1 bg-surface-muted/50 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setRecordType("all")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              recordType === "all"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            All Activity ({periodTimesheets.length + periodLeaves.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordType("timesheets")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              recordType === "timesheets"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Timesheets ({periodTimesheets.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordType("leave")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              recordType === "leave"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Leave ({periodLeaves.length})
          </button>
        </div>

        {/* Status Filter & Search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Filter className="size-3 text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="submitted">Submitted / Pending</option>
              <option value="draft">Draft</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search date or note..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-2.5 text-xs font-medium text-foreground outline-none w-36 sm:w-48"
            />
          </div>
        </div>
      </div>

      {/* Activity Timeline / Records List */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
          No records match the selected filters for this payroll cycle.
        </div>
      ) : (
        <div className="grid gap-2">
          {filteredRecords.map((item) => {
            if (item.type === "timesheet") {
              const entry = item.data;
              const isApproved = entry.status === "approved";
              const isSubmitted = entry.status === "submitted";
              const isDraft = entry.status === "draft";
              const isRejected = entry.status === "rejected";
              const hasWarning = entry.missing_clocking || entry.late_arrival || entry.early_departure;

              return (
                <div
                  key={`ts-${entry.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-border bg-surface p-3 sm:p-3.5 shadow-2xs hover:bg-surface-muted/30 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <span
                      className={`mt-0.5 sm:mt-0 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        isApproved
                          ? "bg-emerald-500/15 text-emerald-700"
                          : isRejected
                            ? "bg-rose-500/15 text-rose-700"
                            : isSubmitted
                              ? "bg-slate-900/10 text-slate-800"
                              : "bg-amber-500/15 text-amber-700"
                      }`}
                    >
                      <Clock3 className="size-4" />
                    </span>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-foreground">
                          {formatDate(entry.work_date)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            isApproved
                              ? "bg-emerald-600 text-white"
                              : isRejected
                                ? "bg-rose-600 text-white"
                                : isSubmitted
                                  ? "bg-slate-900 text-white"
                                  : "bg-amber-500 text-white"
                          }`}
                        >
                          {entry.status}
                        </span>
                        {hasWarning && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-300">
                            <AlertTriangle className="size-2.5" />
                            Review Needed
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted font-mono flex-wrap">
                        <span>In: <strong className="text-foreground">{formatTime(entry.clock_in)}</strong></span>
                        {entry.lunch_start && entry.lunch_end && (
                          <span>Lunch: <strong className="text-foreground">{formatTime(entry.lunch_start)}-{formatTime(entry.lunch_end)}</strong></span>
                        )}
                        <span>Out: <strong className="text-foreground">{formatTime(entry.clock_out)}</strong></span>
                        {entry.notes && (
                          <span className="text-[10px] text-slate-500 font-sans truncate max-w-xs">
                            · {entry.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    {Number(entry.overtime_hours ?? 0) > 0 && (
                      <span className="rounded bg-amber-50 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-900 font-mono">
                        +{Number(entry.overtime_hours).toFixed(2)}h OT
                      </span>
                    )}
                    <span className="rounded-md bg-emerald-50 border border-emerald-300 px-2.5 py-1 text-xs font-black text-emerald-950 font-mono">
                      {Number(entry.paid_hours ?? 0).toFixed(2)}h Paid
                    </span>
                  </div>
                </div>
              );
            } else {
              const leave = item.data;
              const isApproved = leave.status === "approved";
              const isRejected = leave.status === "rejected";

              return (
                <div
                  key={`leave-${leave.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-teal-200 bg-teal-50/40 p-3 sm:p-3.5 shadow-2xs hover:bg-teal-50/70 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <span className="mt-0.5 sm:mt-0 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                      <Palmtree className="size-4" />
                    </span>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-foreground">
                          {leave.leaveTypeName ?? "Leave"}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            isApproved
                              ? "bg-teal-600 text-white"
                              : isRejected
                                ? "bg-rose-600 text-white"
                                : "bg-slate-900 text-white"
                          }`}
                        >
                          {leave.status}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted flex-wrap">
                        <span>
                          {formatDate(leave.start_date)} &rarr; {formatDate(leave.end_date)}
                        </span>
                        {leave.reason && (
                          <span className="text-[10px] text-teal-900/80 truncate max-w-xs">
                            · Reason: {leave.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-black text-white font-mono shadow-2xs">
                      {Number(leave.total_hours ?? 0).toFixed(2)}h Leave
                    </span>
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
