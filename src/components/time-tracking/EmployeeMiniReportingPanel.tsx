"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Info,
  LayoutGrid,
  LayoutList,
  MapPin,
  Navigation,
  Palmtree,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  TimeEntryRecord,
  CompanyPublicHoliday,
  TimeClockLocationEvent,
} from "@/lib/time-tracking/schema";
import type {
  LeaveRequest,
  LeaveBalance,
  LeaveType,
} from "@/lib/work-rules/schema";
import {
  generatePayrollPeriods,
  formatPeriodDate,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";
import {
  isGenderAllowedForLeave,
  isUnpaidLeave,
} from "@/lib/work-rules/realtime-accrual";
import type { TimesheetPdfOptions, TimesheetPdfDailyRow } from "@/lib/reports/exporters";
import TimesheetPdfPreviewModal from "@/components/time-tracking/TimesheetPdfPreviewModal";

const TimesheetRouteMap = dynamic(
  () => import("@/components/time-tracking/TimesheetRouteMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-8 text-xs text-muted">
        Loading route map...
      </div>
    ),
  },
);

type EmployeeMiniReportingPanelProps = {
  employeeName: string;
  employeeNumber?: string;
  departmentName?: string;
  workstationName?: string;
  jobTitle?: string;
  canViewLocation?: boolean;
  entries: TimeEntryRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalances?: LeaveBalance[];
  leaveTypes?: LeaveType[];
  publicHolidays?: CompanyPublicHoliday[];
  payrollConfig?: PayrollPeriodConfig;
  companyName?: string;
  toilEnabled?: boolean;
  employeeGender?: "male" | "female" | "other" | string | null;
};

type RecordFilterType = "all" | "worked" | "drafts" | "leave" | "balances";
type DisplayViewMode = "cards" | "table";

export type DailyTimesheetItem = {
  date: string;
  dayOfWeek: string;
  type: "worked" | "draft" | "leave" | "holiday" | "rest";
  status: string;
  clockIn: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  clockOut: string | null;
  lunch: string | null;
  normalHours: number;
  overtimeHours: number;
  paidHours: number;
  notes: string | null;
  warningNotes?: string | null;
  hasWarning?: boolean;
  entry?: TimeEntryRecord;
  leave?: LeaveRequest;
  holidayName?: string;
  locationEvents?: TimeClockLocationEvent[];
  workstationName?: string | null;
};

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

// Generate all calendar dates between two YYYY-MM-DD bounds inclusive
function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const stop = new Date(`${endDate}T00:00:00`);

  if (isNaN(current.getTime()) || isNaN(stop.getTime())) {
    return [startDate];
  }

  while (current <= stop) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function EmployeeMiniReportingPanel({
  employeeName,
  employeeNumber,
  departmentName,
  workstationName,
  jobTitle,
  canViewLocation = false,
  entries,
  leaveRequests,
  leaveBalances = [],
  leaveTypes = [],
  publicHolidays = [],
  payrollConfig = defaultPayrollConfig,
  companyName = "ClockWise People",
  toilEnabled,
  employeeGender,
}: EmployeeMiniReportingPanelProps) {
  const todayIso = new Date().toISOString().slice(0, 10);

  // Generate payroll periods (strictly exclude future cycles)
  const generatedPeriods = useMemo(
    () =>
      generatePayrollPeriods(payrollConfig, todayIso, 12).filter(
        (p) => p.startDate <= todayIso,
      ),
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
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [selectedMapDay, setSelectedMapDay] = useState<DailyTimesheetItem | null>(null);

  // Holiday lookups
  const holidayMap = useMemo(() => {
    const map = new Map<string, CompanyPublicHoliday>();
    for (const h of publicHolidays) {
      map.set(h.holiday_date, h);
    }
    return map;
  }, [publicHolidays]);

  // Formatted live leave balances
  const formattedBalances = useMemo(() => {
    return leaveBalances
      .filter((b) => {
        const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
        const name = rel?.name ?? "Leave";
        const category = rel?.category ?? "general";

        if (isUnpaidLeave(name, category)) return false;

        if (toilEnabled === false) {
          if (
            rel?.category === "toil_taken" ||
            rel?.name?.toLowerCase().includes("toil")
          ) {
            return false;
          }
        }

        if (!isGenderAllowedForLeave(name, category, employeeGender)) {
          return false;
        }

        return true;
      })
      .map((b) => {
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
  }, [leaveBalances, toilEnabled, employeeGender]);

  // Search-filtered live leave balances
  const filteredBalances = useMemo(() => {
    if (!searchTerm) return formattedBalances;
    const term = searchTerm.toLowerCase();
    return formattedBalances.filter(
      (b) =>
        b.name.toLowerCase().includes(term) ||
        b.category.toLowerCase().includes(term) ||
        (b.isPaid ? "paid" : "unpaid").includes(term),
    );
  }, [formattedBalances, searchTerm]);

  // Map entries in current period by date
  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntryRecord>();
    for (const e of entries) {
      if (e.work_date >= effectiveStartDate && e.work_date <= effectiveEndDate) {
        map.set(e.work_date, e);
      }
    }
    return map;
  }, [entries, effectiveStartDate, effectiveEndDate]);

  // Filtered Leave requests in period
  const periodLeaves = useMemo(() => {
    return leaveRequests.filter((l) => {
      if (l.status === "cancelled") return false;
      return l.end_date >= effectiveStartDate && l.start_date <= effectiveEndDate;
    });
  }, [leaveRequests, effectiveStartDate, effectiveEndDate]);

  // Generate ALL days in the payroll cycle (worked days, unclocked drafts, leave, holidays, rest days)
  const cycleDays = useMemo<DailyTimesheetItem[]>(() => {
    const dates = enumerateDates(effectiveStartDate, effectiveEndDate);

    return dates.map((date) => {
      const dayOfWeek = formatDayOfWeek(date);
      const dayOfWeekNum = new Date(`${date}T00:00:00`).getDay();
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
      const entry = entriesByDate.get(date);

      // Check if day is covered by leave
      const matchingLeave = periodLeaves.find(
        (l) => l.start_date <= date && l.end_date >= date,
      );

      // Check if day is a public holiday
      const holiday = holidayMap.get(date);

      if (entry) {
        const paid = Number(entry.paid_hours ?? 0);
        const ot = Number(entry.overtime_hours ?? 0);
        const normal = Math.max(0, paid - ot);
        const lunch =
          entry.lunch_start && entry.lunch_end
            ? `${formatTime(entry.lunch_start)} - ${formatTime(entry.lunch_end)}`
            : null;
        const hasWarning = Boolean(
          entry.missing_clocking || entry.late_arrival || entry.early_departure,
        );

        let warningText: string | null = null;
        if (entry.missing_clocking) warningText = "Missing clock event";
        else if (entry.late_arrival && entry.early_departure) warningText = "Late in & early out";
        else if (entry.late_arrival) warningText = "Late arrival";
        else if (entry.early_departure) warningText = "Early departure";

        const isWorked = Boolean(entry.clock_in || entry.clock_out || paid > 0);

        return {
          date,
          dayOfWeek,
          type: isWorked ? "worked" : entry.status === "draft" ? "draft" : "worked",
          status: entry.status,
          clockIn: entry.clock_in,
          lunchStart: entry.lunch_start,
          lunchEnd: entry.lunch_end,
          clockOut: entry.clock_out,
          lunch,
          normalHours: normal,
          overtimeHours: ot,
          paidHours: paid,
          notes: entry.notes || null,
          warningNotes: warningText,
          hasWarning,
          entry,
          locationEvents: entry.locationEvents ?? [],
          workstationName: workstationName ?? null,
        };
      }

      if (matchingLeave) {
        const isApproved = matchingLeave.status === "approved";
        return {
          date,
          dayOfWeek,
          type: "leave",
          status: matchingLeave.status,
          clockIn: null,
          lunchStart: null,
          lunchEnd: null,
          clockOut: null,
          lunch: null,
          normalHours: 0,
          overtimeHours: 0,
          paidHours: isApproved ? 8 : 0,
          notes: matchingLeave.reason
            ? `${matchingLeave.leaveTypeName ?? "Leave"}: ${matchingLeave.reason}`
            : (matchingLeave.leaveTypeName ?? "Leave"),
          leave: matchingLeave,
          locationEvents: [],
        };
      }

      if (holiday) {
        return {
          date,
          dayOfWeek,
          type: "holiday",
          status: "holiday",
          clockIn: null,
          lunchStart: null,
          lunchEnd: null,
          clockOut: null,
          lunch: null,
          normalHours: 0,
          overtimeHours: 0,
          paidHours: holiday.is_paid ? 8 : 0,
          notes: holiday.name,
          holidayName: holiday.name,
          locationEvents: [],
        };
      }

      if (isWeekend) {
        return {
          date,
          dayOfWeek,
          type: "rest",
          status: "rest",
          clockIn: null,
          lunchStart: null,
          lunchEnd: null,
          clockOut: null,
          lunch: null,
          normalHours: 0,
          overtimeHours: 0,
          paidHours: 0,
          notes: "Rest Day / Weekend",
          locationEvents: [],
        };
      }

      // Default: weekday with no record is an unclocked Draft
      return {
        date,
        dayOfWeek,
        type: "draft",
        status: "draft",
        clockIn: null,
        lunchStart: null,
        lunchEnd: null,
        clockOut: null,
        lunch: null,
        normalHours: 0,
        overtimeHours: 0,
        paidHours: 0,
        notes: "No clocking recorded (Draft)",
        locationEvents: [],
      };
    });
  }, [
    effectiveStartDate,
    effectiveEndDate,
    entriesByDate,
    periodLeaves,
    holidayMap,
    workstationName,
  ]);

  // Aggregated hours and period metrics
  const metrics = useMemo(() => {
    let workedHours = 0;
    let ot15 = 0;
    let ot20 = 0;
    let daysWorked = 0;
    let missingClockings = 0;
    let lateArrivals = 0;
    let earlyDepartures = 0;
    let leaveHours = 0;
    let leaveDays = 0;
    let draftDays = 0;

    for (const d of cycleDays) {
      if (d.type === "worked") {
        workedHours += d.normalHours;
        const dayOfWeek = new Date(`${d.date}T00:00:00`).getDay();
        const isSunday = dayOfWeek === 0;
        const isHoliday = holidayMap.has(d.date);

        if (isSunday || isHoliday) {
          ot20 += d.overtimeHours;
        } else {
          ot15 += d.overtimeHours;
        }

        if (d.paidHours > 0 || d.clockIn || d.clockOut) {
          daysWorked += 1;
        }

        if (d.entry?.missing_clocking) missingClockings += 1;
        if (d.entry?.late_arrival) lateArrivals += 1;
        if (d.entry?.early_departure) earlyDepartures += 1;
      } else if (d.type === "leave") {
        if (d.status === "approved") {
          leaveDays += 1;
          leaveHours += d.paidHours;
        }
      } else if (d.type === "draft") {
        draftDays += 1;
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
      draftDays,
      totalPaid,
      daysWorked,
      missingClockings,
      lateArrivals,
      earlyDepartures,
    };
  }, [cycleDays, holidayMap]);

  // Filtered cycle days based on tab selection, search term, and status filter
  const filteredDays = useMemo(() => {
    return cycleDays.filter((item) => {
      // Tab category filter
      if (recordType === "worked" && item.type !== "worked") return false;
      if (recordType === "drafts" && item.type !== "draft") return false;
      if (recordType === "leave" && item.type !== "leave" && item.type !== "holiday")
        return false;

      // Status dropdown filter
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      // Search query filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchDate = item.date.includes(term);
        const matchNotes = (item.notes ?? "").toLowerCase().includes(term);
        const matchStatus = item.status.toLowerCase().includes(term);
        const matchDay = item.dayOfWeek.toLowerCase().includes(term);
        if (!matchDate && !matchNotes && !matchStatus && !matchDay) return false;
      }

      return true;
    });
  }, [cycleDays, recordType, statusFilter, searchTerm]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    let worked = 0;
    let drafts = 0;
    let leave = 0;
    for (const d of cycleDays) {
      if (d.type === "worked") worked++;
      else if (d.type === "draft") drafts++;
      else if (d.type === "leave" || d.type === "holiday") leave++;
    }
    return {
      all: cycleDays.length,
      worked,
      drafts,
      leave,
      balances: formattedBalances.length,
    };
  }, [cycleDays, formattedBalances]);

  // Timesheet PDF Export payload
  const timesheetPdfOptions = useMemo<TimesheetPdfOptions>(() => {
    const dailyRows: TimesheetPdfDailyRow[] = cycleDays.map((d) => {
      let displayStatus = d.status.toUpperCase();
      if (d.type === "leave") displayStatus = "LEAVE";
      else if (d.type === "holiday") displayStatus = "HOLIDAY";
      else if (d.type === "rest") displayStatus = "REST DAY";
      else if (d.type === "draft") displayStatus = "DRAFT";

      return {
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        clockIn: d.clockIn ? formatTime(d.clockIn) : null,
        lunch: d.lunch,
        clockOut: d.clockOut ? formatTime(d.clockOut) : null,
        normalHours: d.normalHours,
        overtimeHours: d.overtimeHours,
        paidHours: d.paidHours,
        status: displayStatus,
        workstation: d.workstationName || workstationName || "--",
        notes: d.notes,
      };
    });

    const ts = new Date().toISOString().slice(0, 10);

    return {
      companyName,
      periodLabel,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      filename: `${employeeName.replace(/\s+/g, "_")}_Timesheet_${effectiveStartDate}_to_${effectiveEndDate}_${ts}`,
      employeeInfo: {
        name: employeeName,
        employeeNumber,
        department: departmentName,
        workstation: workstationName,
        jobTitle,
      },
      metrics: {
        totalDaysInPeriod: cycleDays.length,
        daysWorked: metrics.daysWorked,
        totalPaidHours: metrics.totalPaid,
        normalHours: metrics.workedHours,
        overtimeHours: metrics.totalOvertime,
        leaveHours: metrics.leaveHours,
        missingCount: metrics.missingClockings,
      },
      dailyRows,
    };
  }, [
    companyName,
    periodLabel,
    effectiveStartDate,
    effectiveEndDate,
    employeeName,
    employeeNumber,
    departmentName,
    workstationName,
    jobTitle,
    metrics,
    cycleDays,
  ]);

  return (
    <div className="space-y-3.5 sm:space-y-4 pb-24 sm:pb-6">
      {/* Header & Payroll Cycle Selector */}
      <div className="rounded-2xl border border-border bg-surface p-3.5 sm:p-5 text-foreground shadow-soft">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-primary">
                Payroll Cycle Timesheets
              </span>
              {departmentName && (
                <span className="rounded-full bg-surface-muted border border-border px-2 py-0.5 text-[10px] font-bold text-muted truncate max-w-[140px]">
                  {departmentName}
                </span>
              )}
              {jobTitle && (
                <span className="hidden sm:inline-flex rounded-full bg-surface-muted border border-border px-2 py-0.5 text-[10px] font-bold text-muted truncate max-w-[140px]">
                  {jobTitle}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 mt-1 sm:mt-1.5">
              <h3 className="text-base font-extrabold sm:text-xl tracking-tight text-foreground truncate">
                {employeeName}&apos;s Timesheet Statement
              </h3>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="btn btn-primary sm:hidden rounded-full px-3 py-1.5 text-xs font-bold shadow-primary shrink-0"
                title="View timesheet statement directly on mobile"
              >
                <Eye className="size-3" />
                <span>View PDF</span>
              </button>
            </div>
            <p className="hidden sm:block mt-0.5 text-xs text-muted">
              Complete cycle timesheets with drafts for unclocked days, location movements, and official statement export.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="btn btn-primary rounded-full px-4 sm:px-5 py-2 text-xs font-bold shadow-primary"
              title="Preview official timesheet statement on desktop or mobile"
            >
              <FileText className="size-3.5" />
              <span>View Timesheet (PDF)</span>
            </button>
          </div>
        </div>

        {/* Period Selector Bar */}
        <div className="mt-2.5 pt-2.5 sm:mt-4 sm:pt-3 border-t border-border flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-muted shrink-0">
              Payroll Cycle:
            </span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="h-8.5 sm:h-9 px-3 text-xs font-bold rounded-xl sm:rounded-full bg-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs cursor-pointer w-full"
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
            <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-xl border border-border shadow-2xs w-full sm:w-auto">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer flex-1"
              />
              <span className="text-muted text-xs font-bold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer flex-1"
              />
            </div>
          )}

          <div className="hidden sm:block ml-auto text-xs text-muted font-medium">
            Active: <span className="font-bold text-foreground">{periodLabel}</span>
          </div>
        </div>
      </div>

      {/* Segmented KPI Cards */}
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 min-w-0">
        {/* Normal Worked */}
        <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-left border border-border bg-surface text-foreground shadow-2xs min-w-0 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted break-words leading-tight">
            Normal Worked
          </p>
          <p className="mt-1 text-lg sm:text-xl font-black font-mono text-foreground break-words">
            {metrics.workedHours.toFixed(2)}h
          </p>
          <p className="text-[9px] sm:text-[10px] text-muted font-semibold break-words leading-tight mt-0.5">
            {metrics.daysWorked} days worked
          </p>
        </div>

        {/* Overtime (OT) */}
        <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-left border border-amber-300/80 bg-amber-50/80 text-amber-950 shadow-2xs min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-800 break-words leading-tight">
              Overtime (OT)
            </p>
            {metrics.totalOvertime > 0 && (
              <span className="flex size-2 rounded-full bg-amber-500 shrink-0" />
            )}
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black font-mono text-amber-950 break-words">
            {metrics.totalOvertime.toFixed(2)}h
          </p>
          <p className="text-[9px] sm:text-[10px] text-amber-700 font-semibold break-words leading-tight mt-0.5 truncate">
            1.5x: {metrics.ot15.toFixed(1)}h · 2.0x: {metrics.ot20.toFixed(1)}h
          </p>
        </div>

        {/* Leave Taken */}
        <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-left border border-emerald-300/80 bg-emerald-50/80 text-emerald-950 shadow-2xs min-w-0 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800 break-words leading-tight">
            Leave Taken
          </p>
          <p className="mt-1 text-lg sm:text-xl font-black font-mono text-emerald-950 break-words">
            {metrics.leaveHours.toFixed(2)}h
          </p>
          <p className="text-[9px] sm:text-[10px] text-emerald-700 font-semibold break-words leading-tight mt-0.5">
            {metrics.leaveDays} {metrics.leaveDays === 1 ? "day" : "days"} taken
          </p>
        </div>

        {/* Grand Total Paid */}
        <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-left bg-gradient-to-br from-[#2E9B5F] to-[#207A48] text-white shadow-primary min-w-0 flex flex-col justify-between border border-white/10">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/90 break-words leading-tight">
            Grand Total Paid
          </p>
          <p className="mt-1 text-lg sm:text-xl font-black font-mono text-white break-words">
            {metrics.totalPaid.toFixed(2)}h
          </p>
          <p className="text-[9px] sm:text-[10px] text-white/80 font-semibold break-words leading-tight mt-0.5">
            Worked + OT + Leave
          </p>
        </div>

        {/* Drafts & Alerts */}
        <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-left border border-border bg-surface text-foreground shadow-2xs col-span-2 min-[480px]:col-span-1 min-w-0 flex flex-row min-[480px]:flex-col justify-between items-center min-[480px]:items-start">
          <div>
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted break-words leading-tight">
              Drafts &amp; Alerts
            </p>
            <p className="text-[9px] sm:text-[10px] text-muted font-semibold break-words leading-tight mt-0.5">
              {metrics.draftDays} drafts · {metrics.missingClockings} alerts
            </p>
          </div>
          <p
            className={`text-lg sm:text-xl font-black font-mono break-words ${
              metrics.missingClockings > 0
                ? "text-rose-600"
                : metrics.draftDays > 0
                  ? "text-amber-600"
                  : "text-[#2E9B5F]"
            }`}
          >
            {metrics.missingClockings > 0
              ? `${metrics.missingClockings}!`
              : metrics.draftDays > 0
                ? `${metrics.draftDays}d`
                : "✓"}
          </p>
        </div>
      </div>

      {/* Leave Entitlements & Balances Drawer */}
      <div className="rounded-xl border border-border bg-surface p-3 sm:p-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 sm:size-7 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Palmtree className="size-3.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wide">
                  Leave Balances &amp; Entitlements
                </h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold text-slate-800 border border-slate-200">
                  {formattedBalances.length} active
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted">
                Available balance ledger, accrued days, and taken hours.
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
          <div className="mt-3 pt-3 border-t border-border">
            {formattedBalances.length === 0 ? (
              <p className="text-xs text-muted italic">
                No leave balances assigned yet to your employee profile.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                {filteredBalances.map((b) => {
                  const totalMinutes = Math.round(b.balanceHours * 60);
                  const h = Math.floor(totalMinutes / 60);
                  const m = totalMinutes % 60;
                  const formattedTime = `${h}h ${m.toString().padStart(2, "0")}m`;
                  const daysDisplay =
                    b.balanceDays % 1 === 0
                      ? b.balanceDays.toFixed(0)
                      : b.balanceDays.toFixed(1);

                  return (
                    <article
                      key={b.id}
                      className="flex flex-col justify-between rounded-xl bg-slate-900 p-3 text-white shadow-xs ring-1 ring-slate-800 min-w-0"
                    >
                      <p className="text-xs font-black text-white tracking-tight truncate">
                        {b.name}
                      </p>

                      <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-base sm:text-lg font-black font-mono tracking-tight text-white">
                          {formattedTime}
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 font-mono">
                          ({daysDisplay} {Number(daysDisplay) === 1 ? "day" : "days"})
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs Bar & View Switcher */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        {/* Segmented Tab Buttons (Scrollable & Zero Truncation) */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 overflow-x-auto no-scrollbar w-full sm:w-auto min-w-0">
          <button
            type="button"
            onClick={() => setRecordType("all")}
            className={`shrink-0 rounded-lg px-2 sm:px-3 py-1.5 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 min-w-0 ${
              recordType === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All Days</span>
            </span>
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.2 text-[10px] font-mono font-black shrink-0 ${
                recordType === "all" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-800"
              }`}
            >
              {tabCounts.all}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRecordType("worked")}
            className={`shrink-0 rounded-lg px-2 sm:px-3 py-1.5 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 min-w-0 ${
              recordType === "worked"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>Worked</span>
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.2 text-[10px] font-mono font-black shrink-0 ${
                recordType === "worked" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-800"
              }`}
            >
              {tabCounts.worked}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRecordType("drafts")}
            className={`shrink-0 rounded-lg px-2 sm:px-3 py-1.5 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 min-w-0 ${
              recordType === "drafts"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>Drafts</span>
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.2 text-[10px] font-mono font-black shrink-0 ${
                recordType === "drafts" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-800"
              }`}
            >
              {tabCounts.drafts}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRecordType("leave")}
            className={`shrink-0 rounded-lg px-2 sm:px-3 py-1.5 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 min-w-0 ${
              recordType === "leave"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>
              <span className="sm:hidden">Leave</span>
              <span className="hidden sm:inline">Leave &amp; Holidays</span>
            </span>
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.2 text-[10px] font-mono font-black shrink-0 ${
                recordType === "leave" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-800"
              }`}
            >
              {tabCounts.leave}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRecordType("balances")}
            className={`hidden sm:inline-flex rounded-lg px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 items-center gap-1 ${
              recordType === "balances"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>Balances</span>
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.2 text-[10px] font-mono font-black ${
                recordType === "balances" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-800"
              }`}
            >
              {tabCounts.balances}
            </span>
          </button>
        </div>

        {/* Display View Mode Switcher for Desktop (Cards vs Table) */}
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setDisplayMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition-all ${
              displayMode === "cards"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Card View"
          >
            <LayoutGrid className="size-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("table")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition-all ${
              displayMode === "table"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Table View"
          >
            <LayoutList className="size-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2 sm:p-2.5 shadow-2xs min-w-0">
        {/* Full-width Search on Mobile & Desktop */}
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-h-[36px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors min-w-0">
            <Search className="size-3.5 shrink-0 text-muted" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={
                recordType === "balances"
                  ? "Search leave balance type..."
                  : "Search date (YYYY-MM-DD), day, notes, or status..."
              }
              className="min-w-0 flex-1 bg-transparent py-1 text-xs font-semibold text-foreground placeholder:text-muted outline-none border-0"
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

          {/* Desktop Status Filter (in toolbar) */}
          {recordType !== "balances" ? (
            <label className="hidden sm:flex h-9 min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors shrink-0">
              <Filter className="size-3 shrink-0 text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-foreground outline-none cursor-pointer pr-1"
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="submitted">Submitted</option>
                <option value="draft">Draft</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          ) : null}

          <span className="hidden md:inline-flex shrink-0 items-center rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs">
            {recordType === "balances" ? filteredBalances.length : filteredDays.length} records
          </span>
        </div>

        {/* Mobile Toolbar Sub-Row: Status Filter (Left) + View Mode Switcher (Right) */}
        <div className="flex sm:hidden items-center justify-between gap-2 pt-0.5">
          {recordType !== "balances" ? (
            <label className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors min-w-0">
              <Filter className="size-2.5 shrink-0 text-muted" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-foreground outline-none cursor-pointer pr-0.5 max-w-[90px] truncate"
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="submitted">Submitted</option>
                <option value="draft">Draft</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          ) : (
            <span className="text-[10px] font-bold text-muted">
              {filteredBalances.length} balance types
            </span>
          )}

          {/* Mobile Cards vs Table View Switcher */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setDisplayMode("cards")}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold cursor-pointer transition-all ${
                displayMode === "cards"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Card View"
            >
              <LayoutGrid className="size-3" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold cursor-pointer transition-all ${
                displayMode === "table"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Table View"
            >
              <LayoutList className="size-3" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {recordType === "balances" ? (
        displayMode === "cards" ? (
          /* Leave Balances Cards Grid */
          filteredBalances.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
              No leave balances match the search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-2.5 min-w-0">
              {filteredBalances.map((b) => {
                const isToil =
                  b.category === "toil_taken" ||
                  b.name.toLowerCase().includes("toil");
                const isPositive = b.balanceHours > 0;
                const isSick = b.category === "sick";
                const isAnnual = b.category === "annual";

                const cardBg = isToil
                  ? "card-gold"
                  : isSick
                    ? "bg-rose-700 text-white ring-1 ring-rose-800"
                    : isAnnual
                      ? "card-hero-green"
                      : "bg-indigo-700 text-white ring-1 ring-indigo-800";

                return (
                  <article
                    key={`balance-card-${b.id}`}
                    className={`group flex flex-col justify-between gap-2 rounded-xl p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-default min-w-0 ${cardBg}`}
                  >
                    <div className="border-b border-white/20 pb-1.5 flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h5 className="text-xs sm:text-sm font-black text-white tracking-tight break-words">
                          {b.name}
                        </h5>
                        <div className="text-[10px] font-medium text-white/80 mt-0.5 capitalize truncate">
                          {b.category.replace(/_/g, " ")} · {b.isPaid ? "Paid Benefit" : "Unpaid"}
                        </div>
                      </div>

                      <span className="shrink-0 rounded-full bg-black/25 text-white border border-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                        {isToil ? "TOIL" : b.isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                      <div className="min-w-0">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                          Accrued
                        </p>
                        <p className="font-extrabold text-slate-900 text-[11px] break-words font-mono leading-tight">
                          +{b.accruedHours.toFixed(1)}h
                        </p>
                        <p className="text-[8.5px] text-slate-400 font-medium leading-tight">
                          ({b.accruedDays}d)
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600 break-words leading-tight">
                          Taken
                        </p>
                        <p className="font-extrabold text-rose-600 text-[11px] break-words font-mono leading-tight">
                          -{b.takenHours.toFixed(1)}h
                        </p>
                        <p className="text-[8.5px] text-slate-400 font-medium leading-tight">
                          ({b.takenDays}d)
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">
                          Available
                        </p>
                        <p
                          className={`font-extrabold text-[11px] break-words font-mono leading-tight ${
                            isPositive ? "text-emerald-700" : "text-slate-500"
                          }`}
                        >
                          {b.balanceHours.toFixed(1)}h
                        </p>
                        <p className="text-[8.5px] text-emerald-800 font-medium leading-tight">
                          ({b.balanceDays}d)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/20 text-[10px] min-w-0">
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-bold text-white/90">
                        {isToil ? "Time-Off Bank" : "BCEA Statutory"}
                      </span>
                      <span className="font-mono font-bold text-[9px] text-white/90">
                        Net: {b.balanceHours.toFixed(2)}h
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          /* Leave Balances Ledger View (Table mode) */
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="p-3 border-b border-border bg-surface-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palmtree className="size-3.5 text-emerald-700" />
                <h4 className="text-xs sm:text-sm font-bold text-foreground">
                  Employee Leave Entitlement Ledger
                </h4>
              </div>
              <span className="text-[11px] text-muted font-medium">
                Standard basis: 8h/day
              </span>
            </div>

            <div className="w-full overflow-x-hidden sm:overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse table-fixed sm:table-auto">
                <thead>
                  <tr className="border-b border-border bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-white">
                    <th className="p-2 sm:p-2.5 w-[42%] sm:w-auto">Leave Type</th>
                    <th className="p-2 sm:hidden text-right w-[28%]">Accrued / Taken</th>
                    <th className="hidden sm:table-cell p-2.5">Category</th>
                    <th className="hidden sm:table-cell p-2.5 text-right">Accrued</th>
                    <th className="hidden sm:table-cell p-2.5 text-right">Taken</th>
                    <th className="p-2 sm:p-2.5 text-right font-black text-white w-[30%] sm:w-auto">
                      Available
                    </th>
                    <th className="hidden sm:table-cell p-2.5 text-center">Benefit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBalances.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 sm:p-2.5 font-bold text-foreground">
                        <div className="break-words leading-tight">{b.name}</div>
                        <div className="sm:hidden text-[9px] text-muted font-normal capitalize mt-0.5 break-words">
                          {b.category} · {b.isPaid ? "Paid" : "Unpaid"}
                        </div>
                      </td>
                      <td className="p-2 sm:hidden text-right font-mono text-[10px] leading-tight">
                        <div className="text-slate-600 font-semibold">+{b.accruedHours.toFixed(1)}h</div>
                        <div className="text-rose-600 font-bold">-{b.takenHours.toFixed(1)}h</div>
                      </td>
                      <td className="hidden sm:table-cell p-2.5 text-muted capitalize text-[11px]">
                        {b.category}
                      </td>
                      <td className="hidden sm:table-cell p-2.5 text-right font-mono text-muted text-[11px]">
                        {b.accruedHours.toFixed(1)}h ({b.accruedDays}d)
                      </td>
                      <td className="hidden sm:table-cell p-2.5 text-right font-mono text-rose-600 font-bold text-[11px]">
                        {b.takenHours.toFixed(1)}h ({b.takenDays}d)
                      </td>
                      <td className="p-2 sm:p-2.5 text-right font-mono font-black text-emerald-700 text-xs">
                        <div>{b.balanceHours.toFixed(2)}h</div>
                        <div className="text-[9px] text-slate-500 font-medium">({b.balanceDays}d)</div>
                      </td>
                      <td className="hidden sm:table-cell p-2.5 text-center">
                        <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-800">
                          {b.isPaid ? "Paid Benefit" : "Unpaid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : filteredDays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
          No timesheet entries match the selected filters for this payroll cycle.
        </div>
      ) : displayMode === "cards" ? (
        /* Cycle Timesheets Cards Grid */
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-2.5 min-w-0">
          {filteredDays.map((item) => {
            const hasGpsData =
              canViewLocation &&
              item.locationEvents &&
              item.locationEvents.length > 0;

            if (item.type === "worked") {
              const isApproved = item.status === "approved";
              const isRejected = item.status === "rejected";
              const isSubmitted = item.status === "submitted";

              return (
                <article
                  key={`day-card-${item.date}`}
                  className="group flex flex-col justify-between gap-2 rounded-xl bg-slate-900 p-3 text-white shadow-sm ring-1 ring-slate-800 min-w-0"
                >
                  {/* Top: Date & Shift Header */}
                  <div className="border-b border-slate-800 pb-1.5 flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs sm:text-sm font-black text-white tracking-tight">
                        {formatDate(item.date)}
                      </h5>
                      <div className="text-[10px] font-medium text-slate-300 mt-0.5">
                        {item.dayOfWeek} · Work Shift
                      </div>
                    </div>

                    {item.hasWarning && (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-700 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 shrink-0"
                        title={item.warningNotes || "Attendance flag"}
                      >
                        <AlertTriangle className="size-2.5 text-rose-400" />
                        <span className="hidden sm:inline">{item.warningNotes}</span>
                      </span>
                    )}
                  </div>

                  {/* High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        In
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {formatTime(item.clockIn)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">
                        {item.lunchStart ? "Lunch" : "Out"}
                      </p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">
                        {item.lunch ?? formatTime(item.clockOut)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">
                        Total
                      </p>
                      <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">
                        {item.paidHours.toFixed(2)}h
                      </p>
                    </div>
                  </div>

                  {/* Hours Breakdown Strip */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 px-0.5">
                    <span>
                      Normal: <strong className="text-white">{item.normalHours.toFixed(2)}h</strong>
                    </span>
                    {item.overtimeHours > 0 ? (
                      <span className="text-amber-300 font-bold">
                        OT: +{item.overtimeHours.toFixed(2)}h
                      </span>
                    ) : (
                      <span className="text-slate-400">OT: 0.00h</span>
                    )}
                  </div>

                  {/* Location & Map Movement Button for Managers/Admin/HR */}
                  {canViewLocation && (
                    <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-1 text-[10px]">
                      {hasGpsData ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMapDay(item)}
                          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold hover:underline cursor-pointer"
                        >
                          <MapPin className="size-3 text-emerald-400 shrink-0" />
                          <span>{item.locationEvents?.length} GPS pings · View Map</span>
                        </button>
                      ) : (
                        <span className="text-slate-500 text-[9px] flex items-center gap-1">
                          <MapPin className="size-2.5 text-slate-600" />
                          <span>No GPS telemetry</span>
                        </span>
                      )}
                    </div>
                  )}

                  {item.notes && (
                    <div
                      className="text-[9.5px] text-slate-300 italic px-0.5 break-words line-clamp-1"
                      title={item.notes}
                    >
                      Note: {item.notes}
                    </div>
                  )}

                  {/* Footer: Status badge & Paid Hours */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800 text-[10px] min-w-0">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded bg-slate-950 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border whitespace-nowrap ${
                        isApproved
                          ? "text-emerald-400 border-emerald-900"
                          : isRejected
                            ? "text-rose-400 border-rose-900"
                            : isSubmitted
                              ? "text-slate-200 border-slate-700"
                              : "text-amber-400 border-amber-900"
                      }`}
                    >
                      {isApproved ? (
                        <>
                          <CheckCircle2 className="size-2.5 text-emerald-400" />
                          <span>Shift Done</span>
                        </>
                      ) : isSubmitted ? (
                        <>
                          <Clock className="size-2.5 text-slate-300" />
                          <span>Submitted</span>
                        </>
                      ) : (
                        <span>{item.status}</span>
                      )}
                    </span>

                    <span className="shrink-0 rounded bg-slate-950 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-slate-800 whitespace-nowrap font-mono">
                      {item.paidHours.toFixed(2)}h Paid
                    </span>
                  </div>
                </article>
              );
            }

            if (item.type === "draft") {
              return (
                <article
                  key={`day-card-${item.date}`}
                  className="group flex flex-col justify-between gap-2 rounded-xl border border-dashed border-slate-300 bg-surface p-3 text-foreground shadow-2xs min-w-0"
                >
                  <div className="border-b border-border pb-1.5 flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs sm:text-sm font-extrabold text-foreground tracking-tight">
                        {formatDate(item.date)}
                      </h5>
                      <div className="text-[10px] font-medium text-muted mt-0.5">
                        {item.dayOfWeek} · Working Day
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600 uppercase">
                      Draft
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted/60 p-1.5 text-center text-muted min-w-0">
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-muted leading-tight">
                        In
                      </p>
                      <p className="font-mono text-xs text-muted leading-tight">--:--</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-muted leading-tight">
                        Out
                      </p>
                      <p className="font-mono text-xs text-muted leading-tight">--:--</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-muted leading-tight">
                        Total
                      </p>
                      <p className="font-mono text-xs text-muted leading-tight">0.00h</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted italic">
                    Unclocked shift draft in cycle
                  </p>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-border text-[10px] min-w-0">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      Draft Record
                    </span>
                    <span className="font-mono text-[9px] font-bold text-muted">
                      0.00h Paid
                    </span>
                  </div>
                </article>
              );
            }

            if (item.type === "leave") {
              const isApproved = item.status === "approved";
              const isRejected = item.status === "rejected";
              const leaveBg = isApproved
                ? "bg-emerald-800 text-white ring-1 ring-emerald-900"
                : isRejected
                  ? "bg-rose-800 text-white ring-1 ring-rose-900"
                  : "bg-amber-700 text-white ring-1 ring-amber-800";

              return (
                <article
                  key={`day-card-${item.date}`}
                  className={`group flex flex-col justify-between gap-2 rounded-xl p-3 text-white shadow-sm min-w-0 ${leaveBg}`}
                >
                  <div className="border-b border-white/20 pb-1.5 flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs sm:text-sm font-black text-white tracking-tight">
                        {formatDate(item.date)}
                      </h5>
                      <div className="text-[10px] font-medium text-white/80 mt-0.5">
                        {item.dayOfWeek} · {item.leave?.leaveTypeName ?? "Leave Absence"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-black/25 text-white border border-white/20 px-2 py-0.5 text-[9px] font-black uppercase">
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                    <div className="min-w-0 col-span-2 text-left px-1">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 leading-tight">
                        Reason
                      </p>
                      <p className="font-semibold text-slate-900 text-[10px] truncate leading-tight">
                        {item.leave?.reason || "Approved Leave"}
                      </p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-700 leading-tight">
                        Paid
                      </p>
                      <p className="font-extrabold text-emerald-700 text-xs font-mono leading-tight">
                        {item.paidHours.toFixed(1)}h
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/20 text-[10px] min-w-0">
                    <span className="text-[9px] font-bold text-white/90">
                      {isApproved ? "Approved Benefit" : "Leave Request"}
                    </span>
                    <span className="font-mono text-[9px] font-bold text-white/90">
                      {item.paidHours.toFixed(1)}h Paid
                    </span>
                  </div>
                </article>
              );
            }

            if (item.type === "holiday") {
              return (
                <article
                  key={`day-card-${item.date}`}
                  className="group flex flex-col justify-between gap-2 rounded-xl bg-indigo-900 text-white p-3 shadow-sm ring-1 ring-indigo-950 min-w-0"
                >
                  <div className="border-b border-indigo-800 pb-1.5 flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs sm:text-sm font-black text-white tracking-tight">
                        {formatDate(item.date)}
                      </h5>
                      <div className="text-[10px] font-medium text-indigo-200 mt-0.5">
                        {item.dayOfWeek} · Public Holiday
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 text-[9px] font-bold uppercase">
                      Holiday
                    </span>
                  </div>

                  <div className="rounded-md bg-indigo-950/80 p-2 text-indigo-100 min-w-0">
                    <p className="text-[10.5px] font-extrabold truncate">
                      {item.holidayName}
                    </p>
                    <p className="text-[9px] text-indigo-300">
                      Statutory South African Paid Holiday
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-indigo-800 text-[10px] min-w-0">
                    <span className="text-[9px] font-bold text-indigo-300">
                      Statutory Holiday
                    </span>
                    <span className="font-mono text-[9px] font-bold text-indigo-200">
                      {item.paidHours.toFixed(1)}h Paid
                    </span>
                  </div>
                </article>
              );
            }

            // Rest day (weekend)
            return (
              <article
                key={`day-card-${item.date}`}
                className="group flex flex-col justify-between gap-2 rounded-xl border border-border bg-surface-muted/40 p-3 text-muted shadow-2xs min-w-0 opacity-75"
              >
                <div className="border-b border-border/70 pb-1.5 flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h5 className="text-xs font-bold text-muted tracking-tight">
                      {formatDate(item.date)}
                    </h5>
                    <div className="text-[10px] text-muted mt-0.5">
                      {item.dayOfWeek} · Rest Day
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface border border-border px-2 py-0.5 text-[9px] font-bold text-muted uppercase">
                    Rest
                  </span>
                </div>

                <div className="p-2 text-center text-[10px] text-muted italic">
                  Scheduled Rest Day / Weekend
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-border/70 text-[9px] min-w-0 text-muted">
                  <span>Non-working</span>
                  <span className="font-mono">0.00h</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Structured Table View for All Cycle Days */
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
          <div className="w-full overflow-x-hidden md:overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse table-fixed md:table-auto md:min-w-[760px]">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  <th className="p-2 sm:p-2.5 w-[34%] md:w-auto">Date</th>
                  <th className="p-2 sm:p-2.5 md:hidden w-[38%]">Shift / Hours</th>
                  <th className="p-2 sm:p-2.5 md:hidden text-right w-[28%]">Total (h)</th>
                  <th className="hidden md:table-cell p-2.5">Day</th>
                  <th className="hidden md:table-cell p-2.5">Type</th>
                  <th className="hidden md:table-cell p-2.5">Clock In</th>
                  <th className="hidden md:table-cell p-2.5">Lunch</th>
                  <th className="hidden md:table-cell p-2.5">Clock Out</th>
                  <th className="hidden md:table-cell p-2.5 text-right">Normal</th>
                  <th className="hidden md:table-cell p-2.5 text-right">OT</th>
                  <th className="hidden md:table-cell p-2.5 text-right">Paid</th>
                  <th className="hidden md:table-cell p-2.5 text-center">Status</th>
                  {canViewLocation && (
                    <th className="hidden md:table-cell p-2.5 text-center">GPS / Map</th>
                  )}
                  <th className="hidden md:table-cell p-2.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDays.map((item) => {
                  const hasGpsData =
                    canViewLocation &&
                    item.locationEvents &&
                    item.locationEvents.length > 0;
                  const isWorked = item.type === "worked";
                  const isApproved = item.status === "approved";
                  const isRejected = item.status === "rejected";
                  const isSubmitted = item.status === "submitted";

                  return (
                    <tr
                      key={`day-row-${item.date}`}
                      className={`hover:bg-slate-50 transition-colors ${
                        item.type === "leave"
                          ? "bg-emerald-50/30"
                          : item.type === "holiday"
                            ? "bg-indigo-50/30"
                            : item.type === "rest"
                              ? "bg-slate-50/60 opacity-80"
                              : ""
                      }`}
                    >
                      {/* Col 1: Date */}
                      <td className="p-2 sm:p-2.5 align-middle">
                        <div className="font-extrabold text-foreground font-mono text-xs whitespace-nowrap">
                          {item.date}
                        </div>
                        <div className="md:hidden flex items-center gap-1 text-[10px] text-muted mt-0.5 whitespace-nowrap">
                          <span>{item.dayOfWeek}</span>
                          <span>·</span>
                          <span className="font-semibold text-slate-700 capitalize">
                            {item.type}
                          </span>
                        </div>
                      </td>

                      {/* Col 2: Mobile Shift & Hours */}
                      <td className="p-2 sm:p-2.5 md:hidden align-middle">
                        {isWorked ? (
                          <>
                            <div className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                              {formatTime(item.clockIn)} - {formatTime(item.clockOut)}
                            </div>
                            <div className="text-[10px] text-muted font-mono flex items-center gap-1 mt-0.5 whitespace-nowrap">
                              <span>{item.normalHours.toFixed(1)}h</span>
                              {item.overtimeHours > 0 ? (
                                <span className="font-bold text-amber-700">
                                  +{item.overtimeHours.toFixed(1)}h OT
                                </span>
                              ) : null}
                            </div>
                          </>
                        ) : item.type === "leave" ? (
                          <div className="text-xs font-semibold text-emerald-800 truncate">
                            {item.notes || "Approved Leave"}
                          </div>
                        ) : item.type === "holiday" ? (
                          <div className="text-xs font-semibold text-indigo-900 truncate">
                            {item.holidayName || "Public Holiday"}
                          </div>
                        ) : item.type === "draft" ? (
                          <div className="text-xs text-muted italic">Unclocked Draft</div>
                        ) : (
                          <div className="text-xs text-muted">Rest Day</div>
                        )}

                        {/* Mobile GPS Trigger */}
                        {canViewLocation && hasGpsData && (
                          <button
                            type="button"
                            onClick={() => setSelectedMapDay(item)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"
                          >
                            <MapPin className="size-2.5" />
                            <span>GPS Map ({item.locationEvents?.length})</span>
                          </button>
                        )}
                      </td>

                      {/* Col 3: Mobile Total & Status */}
                      <td className="p-2 sm:p-2.5 md:hidden text-right align-middle">
                        <div className="font-mono font-black text-xs text-emerald-700 whitespace-nowrap">
                          {item.paidHours.toFixed(2)}h
                        </div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider ${
                              isApproved
                                ? "bg-emerald-600 text-white"
                                : isRejected
                                  ? "bg-rose-600 text-white"
                                  : isSubmitted
                                    ? "bg-slate-900 text-white"
                                    : item.type === "holiday"
                                      ? "bg-indigo-600 text-white"
                                      : item.type === "leave"
                                        ? "bg-emerald-700 text-white"
                                        : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </td>

                      {/* Desktop Only Columns */}
                      <td className="hidden md:table-cell p-2.5 text-muted whitespace-nowrap">
                        {item.dayOfWeek}
                      </td>

                      <td className="hidden md:table-cell p-2.5 whitespace-nowrap capitalize font-medium text-slate-700">
                        {item.type}
                      </td>

                      <td className="hidden md:table-cell p-2.5 font-mono text-foreground whitespace-nowrap">
                        {formatTime(item.clockIn)}
                      </td>

                      <td className="hidden md:table-cell p-2.5 font-mono text-muted whitespace-nowrap">
                        {item.lunch || "--:--"}
                      </td>

                      <td className="hidden md:table-cell p-2.5 font-mono text-foreground whitespace-nowrap">
                        {formatTime(item.clockOut)}
                      </td>

                      <td className="hidden md:table-cell p-2.5 text-right font-mono text-muted whitespace-nowrap">
                        {item.normalHours.toFixed(2)}h
                      </td>

                      <td className="hidden md:table-cell p-2.5 text-right font-mono whitespace-nowrap">
                        {item.overtimeHours > 0 ? (
                          <span className="font-bold text-amber-700">
                            {item.overtimeHours.toFixed(2)}h
                          </span>
                        ) : (
                          <span className="text-muted">0.00h</span>
                        )}
                      </td>

                      <td className="hidden md:table-cell p-2.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                        {item.paidHours.toFixed(2)}h
                      </td>

                      <td className="hidden md:table-cell p-2.5 text-center whitespace-nowrap">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            isApproved
                              ? "bg-emerald-600 text-white"
                              : isRejected
                                ? "bg-rose-600 text-white"
                                : isSubmitted
                                  ? "bg-slate-900 text-white"
                                  : item.type === "holiday"
                                    ? "bg-indigo-600 text-white"
                                    : item.type === "leave"
                                      ? "bg-emerald-700 text-white"
                                      : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      {/* Desktop GPS Column */}
                      {canViewLocation && (
                        <td className="hidden md:table-cell p-2.5 text-center whitespace-nowrap">
                          {hasGpsData ? (
                            <button
                              type="button"
                              onClick={() => setSelectedMapDay(item)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                              title="View map movements and GPS events"
                            >
                              <MapPin className="size-3 text-emerald-600" />
                              <span>{item.locationEvents?.length} GPS</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted">--</span>
                          )}
                        </td>
                      )}

                      <td
                        className="hidden md:table-cell p-2.5 text-muted text-[11px] max-w-xs truncate"
                        title={item.notes || undefined}
                      >
                        {item.notes || "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* Mobile Footer */}
                <tr className="md:hidden border-t-2 border-slate-700 bg-slate-900 text-white text-xs font-bold">
                  <td className="p-2 sm:p-2.5">
                    <div className="font-mono font-black">Cycle Total</div>
                    <div className="text-[10px] text-slate-300 font-normal">
                      {filteredDays.length} days
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
                  <td className="p-2.5" colSpan={canViewLocation ? 8 : 7}>
                    Payroll Cycle Summary ({filteredDays.length} days · {metrics.daysWorked} worked · {metrics.draftDays} drafts)
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    {metrics.workedHours.toFixed(2)}h
                  </td>
                  <td className="p-2.5 text-right font-mono text-amber-300">
                    {metrics.totalOvertime.toFixed(2)}h
                  </td>
                  <td className="p-2.5 text-right font-mono font-black text-emerald-400 text-sm">
                    {metrics.totalPaid.toFixed(2)}h
                  </td>
                  <td className="p-2.5 text-center" colSpan={canViewLocation ? 3 : 2}>
                    Grand Total Paid Hours
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* GPS Route Map Modal for Managers, Admins & HR Viewers */}
      {selectedMapDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in">
          <div className="relative w-full max-w-4xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-3.5 border-b border-border bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold">
                    GPS Movements &amp; Route — {selectedMapDay.date} ({selectedMapDay.dayOfWeek})
                  </h4>
                  <p className="text-[10px] text-slate-300">
                    {employeeName} · {selectedMapDay.locationEvents?.length ?? 0} recorded GPS telemetry pings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMapDay(null)}
                className="rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close map"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 min-h-[420px] p-2 bg-slate-100">
              <TimesheetRouteMap
                employeeName={employeeName}
                workDate={selectedMapDay.date}
                locationEvents={selectedMapDay.locationEvents ?? []}
                onClose={() => setSelectedMapDay(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Official Timesheet PDF Preview Modal (Dual Mobile In-App View & Desktop A4) */}
      <TimesheetPdfPreviewModal
        open={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        options={timesheetPdfOptions}
      />
    </div>
  );
}
