"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Clock3,
  Coins,
  Download,
  Filter,
  LayoutGrid,
  LayoutList,
  MapPin,
  Palmtree,
  Search,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import type { TimeEntryRecord, CompanyPublicHoliday } from "@/lib/time-tracking/schema";
import type { LeaveRequest, LeaveBalance, LeaveType } from "@/lib/work-rules/schema";
import {
  generatePayrollPeriods,
  formatPeriodDate,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";
import { exportEmployeeConjoinedPdf } from "@/lib/reports/exporters";

type EmployeeMiniReportingPanelProps = {
  employeeName: string;
  employeeNumber?: string;
  departmentName?: string;
  workstationName?: string;
  entries: TimeEntryRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalances?: LeaveBalance[];
  leaveTypes?: LeaveType[];
  publicHolidays?: CompanyPublicHoliday[];
  payrollConfig?: PayrollPeriodConfig;
  companyName?: string;
};

type RecordFilterType = "all" | "timesheets" | "leave" | "balances";
type DisplayViewMode = "cards" | "table";

function formatTime(val: string | null): string {
  if (!val) return "--:--";
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

function formatDayOfWeek(iso: string): string {
  if (!iso) return "--";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", { weekday: "short" }).format(
    new Date(y, m - 1, d),
  );
}

export default function EmployeeMiniReportingPanel({
  employeeName,
  employeeNumber,
  departmentName,
  workstationName,
  entries,
  leaveRequests,
  leaveBalances = [],
  leaveTypes = [],
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

  // Filtration & view options
  const [recordType, setRecordType] = useState<RecordFilterType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<DisplayViewMode>("cards");
  const [showBalancesCard, setShowBalancesCard] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showMobilePdfTip, setShowMobilePdfTip] = useState<boolean>(false);

  const holidayDateSet = useMemo(
    () => new Set(publicHolidays.map((h) => h.holiday_date)),
    [publicHolidays],
  );

  // Formatted live leave balances
  const formattedBalances = useMemo(() => {
    return leaveBalances.map((b) => {
      const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      const name = rel?.name ?? "Leave";
      const category = rel?.category ?? "general";
      const isPaid = rel?.is_paid ?? true;
      const balanceHours = Number(b.balance_hours ?? 0);
      const accruedHours = Number(b.accrued_hours ?? 0);
      const takenHours = Number(b.taken_hours ?? 0);
      const balanceDays = Number((balanceHours / 8).toFixed(1));
      const accruedDays = Number((accruedHours / 8).toFixed(1));
      const takenDays = Number((takenHours / 8).toFixed(1));
      return {
        id: b.id,
        name,
        category,
        isPaid,
        balanceHours,
        accruedHours,
        takenHours,
        balanceDays,
        accruedDays,
        takenDays,
      };
    });
  }, [leaveBalances]);

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
    let lateArrivals = 0;
    let earlyDepartures = 0;

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
      if (e.late_arrival) {
        lateArrivals += 1;
      }
      if (e.early_departure) {
        earlyDepartures += 1;
      }
    }

    let leaveHours = 0;
    let leaveDays = 0;
    for (const l of periodLeaves) {
      const overlapStart =
        l.start_date < effectiveStartDate ? effectiveStartDate : l.start_date;
      const overlapEnd =
        l.end_date > effectiveEndDate ? effectiveEndDate : l.end_date;
      if (overlapStart <= overlapEnd) {
        const s = new Date(`${overlapStart}T00:00:00`);
        const endD = new Date(`${overlapEnd}T00:00:00`);
        const days = Math.max(
          1,
          Math.round((endD.getTime() - s.getTime()) / 86400000) + 1,
        );
        leaveDays += days;
        leaveHours += Number(l.total_hours ?? days * 8);
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
      lateArrivals,
      earlyDepartures,
    };
  }, [
    periodTimesheets,
    periodLeaves,
    effectiveStartDate,
    effectiveEndDate,
    holidayDateSet,
  ]);

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
          const matchNotes = (e.notes ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
          if (!matchDate && !matchNotes) continue;
        }
        items.push({ type: "timesheet", data: e, date: e.work_date });
      }
    }

    if (recordType === "all" || recordType === "leave") {
      for (const l of periodLeaves) {
        if (statusFilter !== "all" && l.status !== statusFilter) continue;
        if (searchTerm) {
          const matchDate =
            l.start_date.includes(searchTerm) || l.end_date.includes(searchTerm);
          const matchType = (l.leaveTypeName ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
          const matchReason = (l.reason ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
          if (!matchDate && !matchType && !matchReason) continue;
        }
        items.push({ type: "leave", data: l, date: l.start_date });
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [periodTimesheets, periodLeaves, recordType, statusFilter, searchTerm]);

  // PDF Export
  const handleExportPdf = () => {
    setIsExporting(true);
    setShowMobilePdfTip(true);

    try {
      const ts = new Date().toISOString().slice(0, 10);

      const timesheetHeaders = [
        "Date",
        "Day",
        "Clock In",
        "Lunch Break",
        "Clock Out",
        "Normal (h)",
        "OT (h)",
        "Paid (h)",
        "Status",
        "Notes",
      ];

      const timesheetRows = periodTimesheets
        .slice()
        .sort((a, b) => a.work_date.localeCompare(b.work_date))
        .map((e) => {
          const lunch =
            e.lunch_start && e.lunch_end
              ? `${formatTime(e.lunch_start)} - ${formatTime(e.lunch_end)}`
              : "--";
          const paid = Number(e.paid_hours ?? 0);
          const ot = Number(e.overtime_hours ?? 0);
          const normal = Math.max(0, paid - ot);

          return [
            e.work_date,
            formatDayOfWeek(e.work_date),
            formatTime(e.clock_in),
            lunch,
            formatTime(e.clock_out),
            `${normal.toFixed(2)}h`,
            `${ot.toFixed(2)}h`,
            `${paid.toFixed(2)}h`,
            e.status.toUpperCase(),
            e.notes || "--",
          ];
        });

      const leaveHeaders = [
        "Leave Type",
        "Date Range",
        "Days",
        "Total Hours",
        "Status",
        "Reason / Notes",
      ];

      const leaveRows = periodLeaves
        .slice()
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .map((l) => {
          const s = new Date(`${l.start_date}T00:00:00`);
          const endD = new Date(`${l.end_date}T00:00:00`);
          const days = Math.max(
            1,
            Math.round((endD.getTime() - s.getTime()) / 86400000) + 1,
          );
          return [
            l.leaveTypeName ?? "Leave",
            `${l.start_date} → ${l.end_date}`,
            `${days} d`,
            `${Number(l.total_hours ?? days * 8).toFixed(2)}h`,
            l.status.toUpperCase(),
            l.reason || "--",
          ];
        });

      const kpis = [
        {
          label: "Normal Worked",
          value: `${metrics.workedHours.toFixed(2)}h`,
          sub: `${metrics.daysWorked} days worked`,
        },
        {
          label: "Overtime (OT)",
          value: `${metrics.totalOvertime.toFixed(2)}h`,
          sub: `1.5x: ${metrics.ot15.toFixed(1)}h · 2.0x: ${metrics.ot20.toFixed(1)}h`,
        },
        {
          label: "Leave Taken",
          value: `${metrics.leaveHours.toFixed(2)}h`,
          sub: `${metrics.leaveDays} leave days`,
        },
        {
          label: "Grand Total Paid",
          value: `${metrics.totalPaid.toFixed(2)}h`,
          sub: "Worked + OT + Leave",
        },
        {
          label: "Attendance Issues",
          value:
            metrics.missingClockings > 0
              ? `${metrics.missingClockings} flags`
              : "0 issues",
          sub: "Clocking completeness",
        },
      ];

      const leaveBalancesData = formattedBalances.map((b) => ({
        name: b.name,
        category: b.category,
        accrued: `${b.accruedHours.toFixed(2)}h (${b.accruedDays}d)`,
        taken: `${b.takenHours.toFixed(2)}h (${b.takenDays}d)`,
        balance: `${b.balanceHours.toFixed(2)}h (${b.balanceDays}d)`,
        isPaid: b.isPaid,
      }));

      exportEmployeeConjoinedPdf({
        companyName,
        reportTitle: `${employeeName} — Time, Hours & Leave Audit Statement`,
        filename: `${employeeName.replace(/\s+/g, "_")}_Time_Leave_Statement_${ts}`,
        periodLabel,
        employeeInfo: {
          name: employeeName,
          employeeNumber,
          department: departmentName,
          workstation: workstationName,
        },
        kpis,
        leaveBalances: leaveBalancesData,
        timesheetHeaders,
        timesheetRows,
        leaveHeaders,
        leaveRows,
      });
    } finally {
      setTimeout(() => {
        setIsExporting(false);
      }, 1200);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Payroll Cycle Selector */}
      <div className="rounded-xl border border-border bg-slate-900 p-4 sm:p-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                Personal Audit
              </span>
              <span className="text-xs text-slate-300 font-mono">
                {employeeNumber ? `#${employeeNumber}` : ""}
              </span>
              {departmentName && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  {departmentName}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-lg font-black sm:text-xl tracking-tight">
              {employeeName}&apos;s Time &amp; Leave Statement
            </h3>
            <p className="text-xs text-slate-300">
              Audit your worked hours, overtime, and leave by payroll cycle or custom date range.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Download or print personal PDF statement directly on mobile or desktop"
            >
              {isExporting ? (
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Download className="size-3.5" />
              )}
              <span>{isExporting ? "Preparing PDF..." : "Export Statement (PDF)"}</span>
            </button>
          </div>
        </div>

        {/* Mobile PDF Tip Helper Banner */}
        {showMobilePdfTip && (
          <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 p-2.5 text-[11px] text-emerald-200">
            <div className="flex items-start gap-1.5">
              <Smartphone className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Mobile PDF Generation Active:</strong> On iPhone/iPad, tap the <strong>Share</strong> icon on the print preview to save as PDF. On Android, select <strong>&quot;Save as PDF&quot;</strong> in the printer dropdown.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowMobilePdfTip(false)}
              className="text-xs text-emerald-400 hover:text-white px-1 font-bold"
            >
              &times;
            </button>
          </div>
        )}

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
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
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
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
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

      {/* Bold Segmented Stat Filter Cards (Exact styling matching Today's Attendance) */}
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-5 gap-2 min-w-0">
        {/* Normal Worked */}
        <div className="rounded-lg p-3 text-left border border-slate-300 bg-slate-100/80 text-slate-900 shadow-2xs min-w-0 flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 break-words leading-tight">
            Normal Worked
          </p>
          <p className="mt-1 text-2xl font-extrabold font-mono break-words">
            {metrics.workedHours.toFixed(2)}h
          </p>
          <p className="text-[10px] text-slate-500 font-medium break-words leading-tight mt-0.5">
            {metrics.daysWorked} days worked
          </p>
        </div>

        {/* Overtime (OT) */}
        <div className="rounded-lg p-3 text-left border border-amber-300/80 bg-amber-50/80 text-amber-950 shadow-2xs min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800 break-words leading-tight">
              Overtime (OT)
            </p>
            {metrics.totalOvertime > 0 && (
              <span className="flex size-2 rounded-full bg-amber-500 shrink-0" />
            )}
          </div>
          <p className="mt-1 text-2xl font-extrabold font-mono text-amber-950 break-words">
            {metrics.totalOvertime.toFixed(2)}h
          </p>
          <p className="text-[10px] text-amber-700 font-medium break-words leading-tight mt-0.5">
            1.5x: {metrics.ot15.toFixed(1)}h · 2.0x: {metrics.ot20.toFixed(1)}h
          </p>
        </div>

        {/* Leave Taken */}
        <div className="rounded-lg p-3 text-left border border-teal-300/80 bg-teal-50/80 text-teal-950 shadow-2xs min-w-0 flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800 break-words leading-tight">
            Leave Taken
          </p>
          <p className="mt-1 text-2xl font-extrabold font-mono text-teal-950 break-words">
            {metrics.leaveHours.toFixed(2)}h
          </p>
          <p className="text-[10px] text-teal-700 font-medium break-words leading-tight mt-0.5">
            {metrics.leaveDays} {metrics.leaveDays === 1 ? "day" : "days"} taken
          </p>
        </div>

        {/* Grand Total Paid */}
        <div className="rounded-lg p-3 text-left bg-slate-900 text-white shadow-md ring-2 ring-slate-900 ring-offset-1 min-w-0 flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-400 break-words leading-tight">
            Grand Total Paid
          </p>
          <p className="mt-1 text-2xl font-extrabold font-mono text-white break-words">
            {metrics.totalPaid.toFixed(2)}h
          </p>
          <p className="text-[10px] text-slate-300 font-medium break-words leading-tight mt-0.5">
            Worked + OT + Leave
          </p>
        </div>

        {/* Issues / Alerts */}
        <div className="rounded-lg p-3 text-left border border-border bg-surface text-slate-900 shadow-2xs col-span-2 min-[480px]:col-span-1 min-w-0 flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted break-words leading-tight">
            Issues / Alerts
          </p>
          <p className={`mt-1 text-2xl font-extrabold font-mono break-words ${metrics.missingClockings > 0 ? "text-rose-600" : "text-emerald-600"
            }`}>
            {metrics.missingClockings > 0 ? `${metrics.missingClockings}` : "0"}
          </p>
          <p className="text-[10px] text-muted font-medium break-words leading-tight mt-0.5">
            {metrics.missingClockings > 0 ? "Missing clockings" : "Complete records"}
          </p>
        </div>
      </div>

      {/* Conjoined Leave Entitlements & Balances Drawer */}
      <div className="rounded-xl border border-border bg-surface p-3.5 sm:p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-teal-700 text-white">
              <Palmtree className="size-3.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wide">

                  = Leave Balances &amp; Entitlements
                </h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-extrabold text-slate-800 border border-slate-200">
                  {formattedBalances.length} active
                </span>
              </div>
              <p className="text-[11px] text-muted">
                Live available balance ledger, accrued days, and taken hours.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBalancesCard(!showBalancesCard)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors"
          >
            {showBalancesCard ? (
              <>
                <ChevronUp className="size-3.5" />
                <span className="hidden sm:inline">Collapse</span>
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                <span className="hidden sm:inline">View Balances</span>
              </>
            )}
          </button>
        </div>

        {showBalancesCard && (
          <div className="mt-3.5 pt-3.5 border-t border-border">
            {formattedBalances.length === 0 ? (
              <p className="text-xs text-muted italic">
                No leave balances assigned yet to your employee profile.
              </p>
            ) : (
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {formattedBalances.map((b) => (
                  <article
                    key={b.id}
                    className="group flex flex-col justify-between gap-2.5 rounded-lg bg-slate-800 p-3 text-white shadow-sm ring-1 ring-slate-900/60 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-700/60 pb-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white tracking-tight break-words leading-tight">
                          {b.name}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-300 capitalize mt-0.5">
                          {b.category} Leave
                        </p>
                      </div>

                      <span className="inline-flex shrink-0 items-center rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300 border border-slate-700 whitespace-nowrap">
                        {b.isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>

                    {/* Signature High-Contrast White Metrics Box */}
                    <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                          Accrued
                        </p>
                        <p className="font-extrabold text-slate-900 text-xs break-words font-mono">
                          {b.accruedHours.toFixed(1)}h
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-600 break-words leading-tight">
                          Taken
                        </p>
                        <p className="font-extrabold text-rose-600 text-xs break-words font-mono">
                          {b.takenHours.toFixed(1)}h
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">
                          Balance
                        </p>
                        <p className="font-extrabold text-emerald-700 text-xs break-words font-mono">
                          {b.balanceHours.toFixed(1)}h
                        </p>
                      </div>
                    </div>

                    {/* Footer pills */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                      <span className="inline-flex items-center rounded bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold text-slate-200 break-words">
                        {b.balanceDays} {b.balanceDays === 1 ? "day" : "days"} available
                      </span>
                      <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700 whitespace-nowrap">
                        {b.isPaid ? "Paid Benefit" : "Unpaid Leave"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs Bar & View Switcher */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Segmented Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setRecordType("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${recordType === "all"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
          >
            All Activity ({periodTimesheets.length + periodLeaves.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordType("timesheets")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${recordType === "timesheets"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
          >
            Timesheets ({periodTimesheets.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordType("leave")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${recordType === "leave"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
          >
            Leave ({periodLeaves.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordType("balances")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${recordType === "balances"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
          >
            Balances ({formattedBalances.length})
          </button>
        </div>

        {/* Display View Mode Switcher (Cards vs Table) */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setDisplayMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${displayMode === "cards"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
              }`}
            title="Card View (Distinct visual separation)"
          >
            <LayoutGrid className="size-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("table")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${displayMode === "table"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
              }`}
            title="Dense Table View"
          >
            <LayoutList className="size-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Global App-Standard Search & Filter Toolbar (Full width, responsive on all devices) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 sm:p-3 shadow-2xs">
        {/* Search Bar matching EmployeeTable.tsx */}
        <label className="flex h-10 min-h-[40px] flex-1 items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 text-xs font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by date (YYYY-MM-DD), shift note, or leave reason..."
            className="min-w-0 flex-1 bg-transparent py-2 text-xs font-semibold text-foreground placeholder:text-muted outline-none border-0"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="shrink-0 text-xs font-bold text-muted hover:text-foreground px-1"
              title="Clear search"
            >
              ×
            </button>
          ) : null}
        </label>

        {/* Status Dropdown Filter matching EmployeeTable.tsx */}
        <label className="flex h-10 min-h-[40px] items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors shrink-0">
          <Filter className="size-3.5 shrink-0 text-muted" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
            Status:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-xs font-semibold text-foreground outline-none cursor-pointer pr-2"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="submitted">Submitted / Pending</option>
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        {/* Result Counter Pill */}
        <span className="hidden md:inline-flex shrink-0 items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-extrabold text-white shadow-2xs">
          {filteredRecords.length} records
        </span>
      </div>

      {/* Main Content Area based on RecordType & Display Mode */}
      {recordType === "balances" ? (
        /* Leave Balances Ledger View */
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
          <div className="p-3.5 border-b border-border bg-surface-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palmtree className="size-4 text-teal-700" />
              <h4 className="text-xs sm:text-sm font-bold text-foreground">
                Employee Leave Entitlement Ledger
              </h4>
            </div>
            <span className="text-xs text-muted font-medium">
              Standard daily basis: 8 hours
            </span>
          </div>

          <div className="w-full overflow-x-hidden sm:overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse table-fixed sm:table-auto">
              <thead>
                <tr className="border-b border-border bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-white">
                  <th className="p-2 sm:p-3 w-[42%] sm:w-auto">Leave Type</th>
                  <th className="p-2 sm:hidden text-right w-[28%]">Accrued / Taken</th>
                  <th className="hidden sm:table-cell p-3">Category</th>
                  <th className="hidden sm:table-cell p-3 text-right">Accrued Hours</th>
                  <th className="hidden sm:table-cell p-3 text-right">Taken Hours</th>
                  <th className="p-2 sm:p-3 text-right font-black text-white w-[30%] sm:w-auto">
                    Available Balance
                  </th>
                  <th className="hidden sm:table-cell p-3 text-center">Benefit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {formattedBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 sm:p-3 font-bold text-foreground">
                      <div className="break-words leading-tight">{b.name}</div>
                      <div className="sm:hidden text-[10px] text-muted font-normal capitalize mt-0.5 break-words">
                        {b.category} · {b.isPaid ? "Paid" : "Unpaid"}
                      </div>
                    </td>
                    <td className="p-2 sm:hidden text-right font-mono text-[11px] leading-tight">
                      <div className="text-slate-600 font-semibold break-words">+{b.accruedHours.toFixed(1)}h</div>
                      <div className="text-rose-600 font-bold break-words">-{b.takenHours.toFixed(1)}h</div>
                    </td>
                    <td className="hidden sm:table-cell p-3 text-muted capitalize">
                      {b.category}
                    </td>
                    <td className="hidden sm:table-cell p-3 text-right font-mono text-muted">
                      {b.accruedHours.toFixed(2)}h ({b.accruedDays}d)
                    </td>
                    <td className="hidden sm:table-cell p-3 text-right font-mono text-rose-600 font-bold">
                      {b.takenHours.toFixed(2)}h ({b.takenDays}d)
                    </td>
                    <td className="p-2 sm:p-3 text-right font-mono font-black text-emerald-700 text-xs sm:text-sm">
                      <div>{b.balanceHours.toFixed(2)}h</div>
                      <div className="text-[10px] text-slate-500 font-medium">({b.balanceDays}d)</div>
                    </td>
                    <td className="hidden sm:table-cell p-3 text-center">
                      <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-800">
                        {b.isPaid ? "Paid Benefit" : "Unpaid"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
          No records match the selected filters for this payroll cycle.
        </div>
      ) : displayMode === "cards" ? (
        /* Distinct Cards Grid (100% Identical Visual Style to Today's Attendance) */
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5 min-w-0">
          {filteredRecords.map((item) => {
            if (item.type === "timesheet") {
              const entry = item.data;
              const isApproved = entry.status === "approved";
              const isRejected = entry.status === "rejected";
              const isSubmitted = entry.status === "submitted";
              const hasWarning =
                entry.missing_clocking ||
                entry.late_arrival ||
                entry.early_departure;
              const paid = Number(entry.paid_hours ?? 0);
              const ot = Number(entry.overtime_hours ?? 0);
              const normal = Math.max(0, paid - ot);

              return (
                <article
                  key={`ts-card-${entry.id}`}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-slate-800 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-default ring-1 ring-slate-900/60 min-w-0"
                >
                  {/* Top: Full-Width Date Header (NO ICONS! Zero truncation!) */}
                  <div className="border-b border-slate-700/60 pb-2">
                    <h5 className="text-sm font-black text-white tracking-tight">
                      {formatDate(entry.work_date)}
                    </h5>
                    <div className="text-[11px] font-medium text-slate-300 mt-0.5">
                      {formatDayOfWeek(entry.work_date)} · Work Shift
                    </div>
                  </div>

                  {/* Distinct High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        In
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {formatTime(entry.clock_in)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        {entry.lunch_start ? "Lunch" : "Out"}
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {entry.lunch_start && entry.lunch_end
                          ? `${formatTime(entry.lunch_start)}-${formatTime(entry.lunch_end)}`
                          : formatTime(entry.clock_out)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">
                        Total
                      </p>
                      <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">
                        {paid.toFixed(2)}h
                      </p>
                    </div>
                  </div>

                  {/* Hours Breakdown Strip */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 px-0.5">
                    <span>
                      Normal: <strong className="text-white">{normal.toFixed(2)}h</strong>
                    </span>
                    {ot > 0 ? (
                      <span className="text-amber-300 font-bold">
                        OT: +{ot.toFixed(2)}h
                      </span>
                    ) : (
                      <span className="text-slate-400">OT: 0.00h</span>
                    )}
                  </div>

                  {entry.notes && (
                    <div className="text-[10px] text-slate-300 italic px-0.5 break-words" title={entry.notes}>
                      Note: {entry.notes}
                    </div>
                  )}

                  {/* Footer: Repositioned Status of the Card on Left, Paid badge on Right */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-700/60 text-[11px] min-w-0">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border whitespace-nowrap ${isApproved
                          ? "text-emerald-400 border-slate-700"
                          : isRejected
                            ? "text-rose-400 border-slate-700"
                            : isSubmitted
                              ? "text-sky-300 border-slate-700"
                              : "text-amber-400 border-slate-700"
                        }`}
                    >
                      {isApproved ? (
                        <>
                          <CheckCircle2 className="size-2.5 text-emerald-400" />
                          <span>Shift Done</span>
                        </>
                      ) : isSubmitted ? (
                        <>
                          <Clock className="size-2.5 text-sky-300" />
                          <span>Submitted</span>
                        </>
                      ) : (
                        <span>{entry.status}</span>
                      )}
                    </span>

                    <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-slate-700 whitespace-nowrap font-mono">
                      {paid.toFixed(2)}h Paid
                    </span>
                  </div>
                </article>
              );
            } else {
              const leave = item.data;
              const isApproved = leave.status === "approved";

              return (
                <article
                  key={`leave-card-${leave.id}`}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-slate-800 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-default ring-1 ring-slate-900/60 min-w-0 border-l-4 border-l-teal-500"
                >
                  {/* Top: Full-Width Leave Date Header (NO ICONS! Zero truncation!) */}
                  <div className="border-b border-slate-700/60 pb-2">
                    <h5 className="text-sm font-black text-white tracking-tight">
                      {formatDate(leave.start_date)}
                      {leave.start_date !== leave.end_date && ` → ${formatDate(leave.end_date)}`}
                    </h5>
                    <div className="text-[11px] font-medium text-teal-300 mt-0.5">
                      {leave.leaveTypeName ?? "Leave"} · Approved Absence
                    </div>
                  </div>

                  {/* Distinct High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        From
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {leave.start_date.slice(5)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        To
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {leave.end_date.slice(5)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-teal-700 break-words leading-tight">
                        Leave
                      </p>
                      <p className="font-extrabold text-teal-700 text-xs break-words font-mono leading-tight">
                        {Number(leave.total_hours ?? 0).toFixed(1)}h
                      </p>
                    </div>
                  </div>

                  {leave.reason && (
                    <div className="text-[10px] text-slate-300 italic px-0.5 break-words" title={leave.reason}>
                      Reason: {leave.reason}
                    </div>
                  )}

                  {/* Footer: Repositioned Status of Leave Card on Left, Duration on Right */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-700/60 text-[11px] min-w-0">
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300 border border-slate-700 whitespace-nowrap">
                      {leave.status}
                    </span>
                    <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-teal-300 border border-slate-700 whitespace-nowrap font-mono">
                      {Number(leave.total_hours ?? 0).toFixed(1)}h Leave
                    </span>
                  </div>
                </article>
              );
            }
          })}
        </div>
      ) : (
        /* Structured Table View (matching the app's global design) */
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
          <div className="w-full overflow-x-hidden md:overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse table-fixed md:table-auto md:min-w-[720px]">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  <th className="p-2 sm:p-2.5 md:p-3 w-[34%] md:w-auto">Date</th>
                  <th className="p-2 sm:p-2.5 md:hidden w-[38%]">Shift / Hours</th>
                  <th className="p-2 sm:p-2.5 md:hidden text-right w-[28%]">Total (h)</th>
                  <th className="hidden md:table-cell p-3">Day</th>
                  <th className="hidden md:table-cell p-3">Type</th>
                  <th className="hidden md:table-cell p-3">Clock In</th>
                  <th className="hidden md:table-cell p-3">Lunch</th>
                  <th className="hidden md:table-cell p-3">Clock Out</th>
                  <th className="hidden md:table-cell p-3 text-right">Normal (h)</th>
                  <th className="hidden md:table-cell p-3 text-right">OT (h)</th>
                  <th className="hidden md:table-cell p-3 text-right">Paid (h)</th>
                  <th className="hidden md:table-cell p-3 text-center">Status</th>
                  <th className="hidden md:table-cell p-3">Notes / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((item) => {
                  if (item.type === "timesheet") {
                    const entry = item.data;
                    const isApproved = entry.status === "approved";
                    const isRejected = entry.status === "rejected";
                    const isSubmitted = entry.status === "submitted";
                    const paid = Number(entry.paid_hours ?? 0);
                    const ot = Number(entry.overtime_hours ?? 0);
                    const normal = Math.max(0, paid - ot);
                    const lunch =
                      entry.lunch_start && entry.lunch_end
                        ? `${formatTime(entry.lunch_start)} - ${formatTime(entry.lunch_end)}`
                        : "--";

                    return (
                      <tr
                        key={`ts-row-${entry.id}`}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        {/* Col 1: Date (Mobile + Desktop) */}
                        <td className="p-2 sm:p-2.5 md:p-3 align-middle">
                          <div className="font-extrabold text-foreground font-mono text-xs whitespace-nowrap">
                            {entry.work_date}
                          </div>
                          <div className="md:hidden flex items-center gap-1 text-[10px] text-muted mt-0.5 whitespace-nowrap">
                            <span>{formatDayOfWeek(entry.work_date)}</span>
                            <span>·</span>
                            <span className="font-semibold text-slate-700">Shift</span>
                          </div>
                        </td>

                        {/* Col 2: Mobile Shift & Hours */}
                        <td className="p-2 sm:p-2.5 md:hidden align-middle">
                          <div className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                            {formatTime(entry.clock_in)} - {formatTime(entry.clock_out)}
                          </div>
                          <div className="text-[10px] text-muted font-mono flex items-center gap-1 mt-0.5 whitespace-nowrap">
                            <span>{normal.toFixed(1)}h</span>
                            {ot > 0 ? (
                              <span className="font-bold text-amber-700">+{ot.toFixed(1)}h OT</span>
                            ) : null}
                            {entry.lunch_start ? (
                              <span className="text-[9px] text-slate-400">· Lunch</span>
                            ) : null}
                          </div>
                        </td>

                        {/* Col 3: Mobile Total & Status */}
                        <td className="p-2 sm:p-2.5 md:hidden text-right align-middle">
                          <div className="font-mono font-black text-xs text-emerald-700 whitespace-nowrap">
                            {paid.toFixed(2)}h
                          </div>
                          <div className="mt-0.5">
                            <span
                              className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider ${isApproved
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
                          </div>
                        </td>

                        {/* Desktop Only Columns */}
                        <td className="hidden md:table-cell p-3 text-muted whitespace-nowrap">
                          {formatDayOfWeek(entry.work_date)}
                        </td>
                        <td className="hidden md:table-cell p-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            <Clock3 className="size-2.5" />
                            Timesheet
                          </span>
                        </td>
                        <td className="hidden md:table-cell p-3 font-mono text-foreground whitespace-nowrap">
                          {formatTime(entry.clock_in)}
                        </td>
                        <td className="hidden md:table-cell p-3 font-mono text-muted whitespace-nowrap">
                          {lunch}
                        </td>
                        <td className="hidden md:table-cell p-3 font-mono text-foreground whitespace-nowrap">
                          {formatTime(entry.clock_out)}
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono text-muted whitespace-nowrap">
                          {normal.toFixed(2)}h
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono whitespace-nowrap">
                          {ot > 0 ? (
                            <span className="font-bold text-amber-700">
                              {ot.toFixed(2)}h
                            </span>
                          ) : (
                            <span className="text-muted">0.00h</span>
                          )}
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                          {paid.toFixed(2)}h
                        </td>
                        <td className="hidden md:table-cell p-3 text-center whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${isApproved
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
                        </td>
                        <td className="hidden md:table-cell p-3 text-muted text-[11px] max-w-xs break-words" title={entry.notes || undefined}>
                          {entry.notes || "--"}
                        </td>
                      </tr>
                    );
                  } else {
                    const leave = item.data;
                    const isApproved = leave.status === "approved";

                    return (
                      <tr
                        key={`leave-row-${leave.id}`}
                        className="bg-teal-50/40 hover:bg-teal-50/80 transition-colors"
                      >
                        {/* Col 1: Date (Mobile + Desktop) */}
                        <td className="p-2 sm:p-2.5 md:p-3 align-middle bg-teal-50/40">
                          <div className="font-extrabold text-teal-950 font-mono text-xs whitespace-nowrap">
                            {leave.start_date}
                          </div>
                          <div className="md:hidden flex flex-wrap items-center gap-1 text-[10px] text-teal-800 mt-0.5">
                            <span>{formatDayOfWeek(leave.start_date)}</span>
                            <span>·</span>
                            <span className="font-semibold text-teal-700 break-words">
                              {leave.leaveTypeName ?? "Leave"}
                            </span>
                          </div>
                        </td>

                        {/* Col 2: Mobile Shift & Hours */}
                        <td className="p-2 sm:p-2.5 md:hidden align-middle bg-teal-50/40">
                          <div className="font-mono text-xs font-semibold text-teal-900 whitespace-nowrap">
                            {leave.start_date === leave.end_date
                              ? "1 Full Day"
                              : `${leave.start_date.slice(5)} → ${leave.end_date.slice(5)}`}
                          </div>
                          <div className="text-[10px] text-teal-700 break-words leading-tight mt-0.5" title={leave.reason || undefined}>
                            {leave.reason || "Approved Absence"}
                          </div>
                        </td>

                        {/* Col 3: Mobile Total & Status */}
                        <td className="p-2 sm:p-2.5 md:hidden text-right align-middle bg-teal-50/40">
                          <div className="font-mono font-black text-xs text-teal-800 whitespace-nowrap">
                            {Number(leave.total_hours ?? 0).toFixed(1)}h
                          </div>
                          <div className="mt-0.5">
                            <span
                              className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider ${isApproved
                                  ? "bg-teal-700 text-white"
                                  : "bg-slate-900 text-white"
                                }`}
                            >
                              {leave.status}
                            </span>
                          </div>
                        </td>

                        {/* Desktop Only Columns */}
                        <td className="hidden md:table-cell p-3 text-teal-800 whitespace-nowrap">
                          {formatDayOfWeek(leave.start_date)}
                        </td>
                        <td className="hidden md:table-cell p-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <Palmtree className="size-2.5" />
                            {leave.leaveTypeName ?? "Leave"}
                          </span>
                        </td>
                        <td className="hidden md:table-cell p-3 font-mono text-muted text-center" colSpan={3}>
                          Period: {leave.start_date} &rarr; {leave.end_date}
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono text-muted whitespace-nowrap">
                          0.00h
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono text-muted whitespace-nowrap">
                          0.00h
                        </td>
                        <td className="hidden md:table-cell p-3 text-right font-mono font-black text-teal-800 whitespace-nowrap">
                          {Number(leave.total_hours ?? 0).toFixed(2)}h
                        </td>
                        <td className="hidden md:table-cell p-3 text-center whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${isApproved
                                ? "bg-teal-700 text-white"
                                : "bg-slate-900 text-white"
                              }`}
                          >
                            {leave.status}
                          </span>
                        </td>
                        <td className="hidden md:table-cell p-3 text-teal-900 text-[11px] max-w-xs break-words" title={leave.reason || undefined}>
                          {leave.reason || "Approved Leave"}
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
              <tfoot>
                {/* Mobile Footer */}
                <tr className="md:hidden border-t-2 border-slate-700 bg-slate-900 text-white text-xs font-bold">
                  <td className="p-2 sm:p-2.5">
                    <div className="font-mono font-black">Total</div>
                    <div className="text-[10px] text-slate-300 font-normal">
                      {filteredRecords.length} records
                    </div>
                  </td>
                  <td className="p-2 sm:p-2.5 font-mono text-[11px] leading-tight text-slate-200">
                    <div>Worked: {metrics.workedHours.toFixed(1)}h</div>
                    {metrics.totalOvertime > 0 && (
                      <div className="text-amber-300 font-semibold">
                        OT: +{metrics.totalOvertime.toFixed(1)}h
                      </div>
                    )}
                  </td>
                  <td className="p-2 sm:p-2.5 text-right font-mono">
                    <div className="text-emerald-400 font-black text-xs sm:text-sm">
                      {metrics.totalPaid.toFixed(2)}h
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                      Paid
                    </div>
                  </td>
                </tr>

                {/* Desktop Footer */}
                <tr className="hidden md:table-row border-t-2 border-slate-700 bg-slate-900 text-white text-xs font-bold">
                  <td className="p-3" colSpan={6}>
                    Payroll Period Totals ({filteredRecords.length} records)
                  </td>
                  <td className="p-3 text-right font-mono">
                    {metrics.workedHours.toFixed(2)}h
                  </td>
                  <td className="p-3 text-right font-mono text-amber-300">
                    {metrics.totalOvertime.toFixed(2)}h
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-400 text-sm">
                    {metrics.totalPaid.toFixed(2)}h
                  </td>
                  <td className="p-3 text-center" colSpan={2}>
                    Grand Total Paid Hours
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
