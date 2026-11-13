"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Clock,
  FileText,
  Footprints,
  Layers,
  LocateFixed,
  LogOut,
  MapPin,
  Square,
  Timer,
  UserCheck,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useActionState, useState, useMemo, useEffect, useCallback, useRef } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import { reviewSubmittedTimesheets } from "@/lib/time-tracking/actions";
import type { CompanySubmittedTimesheet } from "@/lib/time-tracking/schema";
import {
  generatePayrollPeriods,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";

const TimesheetRouteMap = dynamic(() => import("./TimesheetRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-slate-400">
      Loading shift route map...
    </div>
  ),
});

type CompanyTimesheetApprovalQueueProps = {
  timesheets: CompanySubmittedTimesheet[];
  payrollConfig?: PayrollPeriodConfig;
};

type ApprovalState = {
  ok: boolean;
  message: string;
};

const initialState: ApprovalState = {
  ok: true,
  message: "",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string | null) {
  if (!value) return "--";

  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-ZA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}h`;
}

function shortTime(value: string | null) {
  return value ? formatTime(value) : "–";
}

function shortLunch(start: string | null, end: string | null) {
  if (!start && !end) return "–";
  if (start && !end) return formatTime(start);
  if (!start && end) return formatTime(end);
  return `${shortTime(start)}-${shortTime(end)}`;
}

function geofenceLabel(status: string | null) {
  if (status === "in_range") return "In range";
  if (status === "out_of_range") return "Deviance · Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null) {
  if (status === "in_range") return "border-emerald-300 bg-emerald-100/70 text-emerald-800";
  if (status === "out_of_range") return "border-rose-300 bg-rose-100/80 text-rose-800 font-extrabold";
  if (status === "no_location") return "border-amber-300 bg-amber-100/70 text-amber-800";
  return "border-border bg-surface-muted text-muted";
}

type ResolvedShiftMilestone = {
  id: string;
  eventType: string;
  title: string;
  time: string;
  workstationName: string | null;
  distanceMeters: number | null;
  geofenceStatus: string | null;
  isDeviance: boolean;
};

function getShiftMilestones(timesheet: CompanySubmittedTimesheet): ResolvedShiftMilestone[] {
  const events = timesheet.locationEvents ?? [];
  const milestones: ResolvedShiftMilestone[] = [];

  const clockInEvt = events.find((e) => e.event_type === "clock_in");
  const lunchStartEvt = events.find((e) => e.event_type === "lunch_start");
  const lunchEndEvt = events.find((e) => e.event_type === "lunch_end");
  const clockOutEvt = events.find((e) => e.event_type === "clock_out");

  if (clockInEvt || timesheet.clock_in) {
    const status = clockInEvt?.geofence_status ?? "in_range";
    milestones.push({
      id: clockInEvt?.id ?? `${timesheet.id}-clock_in`,
      eventType: "clock_in",
      title: "Clock In",
      time: clockInEvt?.local_event_time || timesheet.clock_in || "",
      workstationName: clockInEvt?.workstationName || timesheet.workstationName || "Workstation",
      distanceMeters: clockInEvt?.distance_meters ?? null,
      geofenceStatus: status,
      isDeviance: status === "out_of_range",
    });
  }

  if (lunchStartEvt || timesheet.lunch_start) {
    const status = lunchStartEvt?.geofence_status ?? "in_range";
    milestones.push({
      id: lunchStartEvt?.id ?? `${timesheet.id}-lunch_start`,
      eventType: "lunch_start",
      title: "Take Lunch (Start)",
      time: lunchStartEvt?.local_event_time || timesheet.lunch_start || "",
      workstationName: lunchStartEvt?.workstationName || timesheet.workstationName || "Workstation",
      distanceMeters: lunchStartEvt?.distance_meters ?? null,
      geofenceStatus: status,
      isDeviance: status === "out_of_range",
    });
  }

  if (lunchEndEvt || timesheet.lunch_end) {
    const status = lunchEndEvt?.geofence_status ?? "in_range";
    milestones.push({
      id: lunchEndEvt?.id ?? `${timesheet.id}-lunch_end`,
      eventType: "lunch_end",
      title: "Return from Lunch (End)",
      time: lunchEndEvt?.local_event_time || timesheet.lunch_end || "",
      workstationName: lunchEndEvt?.workstationName || timesheet.workstationName || "Workstation",
      distanceMeters: lunchEndEvt?.distance_meters ?? null,
      geofenceStatus: status,
      isDeviance: status === "out_of_range",
    });
  }

  if (clockOutEvt || timesheet.clock_out) {
    const status = clockOutEvt?.geofence_status ?? "in_range";
    milestones.push({
      id: clockOutEvt?.id ?? `${timesheet.id}-clock_out`,
      eventType: "clock_out",
      title: "Clock Out",
      time: clockOutEvt?.local_event_time || timesheet.clock_out || "",
      workstationName: clockOutEvt?.workstationName || timesheet.workstationName || "Workstation",
      distanceMeters: clockOutEvt?.distance_meters ?? null,
      geofenceStatus: status,
      isDeviance: status === "out_of_range",
    });
  }

  events
    .filter(
      (e) =>
        e.event_type !== "clock_in" &&
        e.event_type !== "lunch_start" &&
        e.event_type !== "lunch_end" &&
        e.event_type !== "clock_out",
    )
    .forEach((e) => {
      milestones.push({
        id: e.id,
        eventType: e.event_type,
        title:
          e.event_type === "switch_workstation"
            ? "Switch Workstation"
            : String(e.event_type).replace(/_/g, " "),
        time: e.local_event_time || "",
        workstationName: e.workstationName || timesheet.workstationName || "Workstation",
        distanceMeters: e.distance_meters ?? null,
        geofenceStatus: e.geofence_status,
        isDeviance: e.geofence_status === "out_of_range",
      });
    });

  return milestones;
}

type CompiledEmployeeTimesheet = {
  employeeId: string;
  fullName: string;
  knownAs: string | null;
  employeeNumber: string;
  avatarUrl: string | null;
  workstationName: string | null;
  entries: CompanySubmittedTimesheet[];
  totalPaidHours: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  totalLeaveHours: number;
  totalBreakHours: number;
  devianceCount: number;
  isCompliant: boolean;
};

export default function CompanyTimesheetApprovalQueue({
  timesheets,
  payrollConfig,
}: CompanyTimesheetApprovalQueueProps) {
  const queueSectionRef = useRef<HTMLElement>(null);
  const [activeMapEntryId, setActiveMapEntryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [expandedEmployeeIds, setExpandedEmployeeIds] = useState<Set<string>>(() => new Set());

  const todayIso = new Date().toISOString().slice(0, 10);
  const effectiveConfig = payrollConfig ?? defaultPayrollConfig;

  // Generate periods and filter ONLY to periods that have submitted timesheet records (or the current period)
  const availablePeriods = useMemo(() => {
    const all = generatePayrollPeriods(effectiveConfig, todayIso, 24);
    return all.filter((p) => {
      const hasRecords = timesheets.some(
        (ts) => ts.work_date >= p.startDate && ts.work_date <= p.endDate,
      );
      return hasRecords || p.isCurrent;
    });
  }, [effectiveConfig, todayIso, timesheets]);

  // Initial period: prioritize the period with the most submitted timesheets, or the current period
  const initialPeriodId = useMemo(() => {
    if (availablePeriods.length === 0) return "all";
    const periodWithMost = [...availablePeriods].sort((a, b) => {
      const countA = timesheets.filter((ts) => ts.work_date >= a.startDate && ts.work_date <= a.endDate).length;
      const countB = timesheets.filter((ts) => ts.work_date >= b.startDate && ts.work_date <= b.endDate).length;
      return countB - countA;
    })[0];
    return periodWithMost?.id ?? availablePeriods[0]?.id ?? "all";
  }, [availablePeriods, timesheets]);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(initialPeriodId);

  // Sync selectedPeriodId if availablePeriods updates
  useEffect(() => {
    if (selectedPeriodId !== "all" && !availablePeriods.some((p) => p.id === selectedPeriodId)) {
      setSelectedPeriodId(initialPeriodId);
    }
  }, [availablePeriods, selectedPeriodId, initialPeriodId]);

  const selectedPeriod = useMemo(
    () => availablePeriods.find((p) => p.id === selectedPeriodId) ?? null,
    [availablePeriods, selectedPeriodId],
  );

  // Filter submitted timesheets strictly within the selected payroll period
  const periodFilteredTimesheets = useMemo(() => {
    if (!selectedPeriod || selectedPeriodId === "all") return timesheets;
    return timesheets.filter(
      (ts) => ts.work_date >= selectedPeriod.startDate && ts.work_date <= selectedPeriod.endDate,
    );
  }, [timesheets, selectedPeriod, selectedPeriodId]);

  // Compile individual drafts into a single timesheet per employee for this payroll period
  const compiledEmployees: CompiledEmployeeTimesheet[] = useMemo(() => {
    const map = new Map<string, CompiledEmployeeTimesheet>();

    for (const ts of periodFilteredTimesheets) {
      let rec = map.get(ts.employee_id);
      if (!rec) {
        rec = {
          employeeId: ts.employee_id,
          fullName: ts.fullName,
          knownAs: ts.knownAs,
          employeeNumber: ts.employeeNumber,
          avatarUrl: ts.avatarUrl,
          workstationName: ts.workstationName,
          entries: [],
          totalPaidHours: 0,
          totalNormalHours: 0,
          totalOvertimeHours: 0,
          totalLeaveHours: 0,
          totalBreakHours: 0,
          devianceCount: 0,
          isCompliant: true,
        };
        map.set(ts.employee_id, rec);
      }

      rec.entries.push(ts);
      rec.totalPaidHours += Number(ts.paid_hours ?? 0);
      rec.totalNormalHours += Number(ts.normal_hours ?? 0);
      rec.totalOvertimeHours += Number(ts.overtime_hours ?? 0);
      rec.totalLeaveHours += Number(ts.paidTimeOffHours ?? 0);
      rec.totalBreakHours += Number(ts.lunch_hours ?? 0);

      const milestones = getShiftMilestones(ts);
      const deviances = milestones.filter((m) => m.isDeviance);
      rec.devianceCount += deviances.length;
      if (deviances.length > 0 || ts.missing_clocking || ts.late_arrival || ts.early_departure) {
        rec.isCompliant = false;
      }
    }

    // Sort entries within each employee by work_date
    for (const rec of map.values()) {
      rec.entries.sort((a, b) => a.work_date.localeCompare(b.work_date));
    }

    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [periodFilteredTimesheets]);

  // Pagination for compiled employee records
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalEmployees = compiledEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const paginatedEmployees = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return compiledEmployees.slice(startIndex, startIndex + pageSize);
  }, [compiledEmployees, page, pageSize]);

  const startIndex = totalEmployees > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(page * pageSize, totalEmployees);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        queueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const totalTimesheets = periodFilteredTimesheets.length;
  const allSelected = totalTimesheets > 0 && selectedIds.size === totalTimesheets;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectEmployee = useCallback((employee: CompiledEmployeeTimesheet) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const employeeEntryIds = employee.entries.map((e) => e.id);
      const allSelectedForEmp = employeeEntryIds.every((id) => next.has(id));

      if (allSelectedForEmp) {
        employeeEntryIds.forEach((id) => next.delete(id));
      } else {
        employeeEntryIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(periodFilteredTimesheets.map((t) => t.id)));
    }
  }, [allSelected, periodFilteredTimesheets]);

  const toggleSelectCurrentPage = useCallback(() => {
    const pageIds = paginatedEmployees.flatMap((e) => e.entries.map((t) => t.id));
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [paginatedEmployees, selectedIds]);

  const toggleExpandEmployee = useCallback((employeeId: string) => {
    setExpandedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }, []);

  const [state, formAction, pending] = useActionState(
    async (prev: ApprovalState, formData: FormData) => {
      const result = await reviewSubmittedTimesheets(prev, formData);
      if (result.ok) {
        setSelectedIds(new Set());
      }
      return result;
    },
    initialState,
  );

  return (
    <section ref={queueSectionRef} className="grid gap-5 min-w-0">
      {/* Sleek Toolbar for Selection & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface-muted/40 p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700">
            <ClipboardCheck className="size-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Compiled Employee Timesheets
            </h3>
            <p className="text-[11px] text-muted">
              {totalEmployees} employee{totalEmployees === 1 ? "" : "s"} · {totalTimesheets} shift draft{totalTimesheets === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {availablePeriods.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                Payroll Period:
              </span>
              <div className="relative">
                <select
                  value={selectedPeriodId}
                  onChange={(e) => {
                    setSelectedPeriodId(e.target.value);
                    setSelectedIds(new Set());
                    setPage(1);
                  }}
                  className="appearance-none rounded-full border border-border bg-surface pl-3 pr-8 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted shadow-2xs transition-all cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {availablePeriods.map((p) => {
                    const countInPeriod = timesheets.filter(
                      (ts) => ts.work_date >= p.startDate && ts.work_date <= p.endDate,
                    ).length;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.label} ({countInPeriod} shift{countInPeriod === 1 ? "" : "s"})
                      </option>
                    );
                  })}
                  <option value="all">All Dates ({timesheets.length} shifts)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
              </div>
            </div>
          )}

          {periodFilteredTimesheets.length > 0 ? (
            <>
              <button
                type="button"
                onClick={toggleSelectCurrentPage}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-extrabold text-foreground hover:bg-surface-muted shadow-2xs transition-all cursor-pointer"
              >
                <CheckSquare className="size-3.5 text-primary" />
                Select page ({paginatedEmployees.length})
              </button>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-extrabold text-foreground hover:bg-surface-muted shadow-2xs transition-all cursor-pointer"
              >
                {allSelected ? <Square className="size-3.5 text-primary" /> : <CheckSquare className="size-3.5 text-primary" />}
                {allSelected ? "Clear all" : `Select all (${totalTimesheets})`}
              </button>
            </>
          ) : null}
          {selectedIds.size > 0 ? (
            <span className="rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-xs font-black text-primary">
              {selectedIds.size} selected
            </span>
          ) : null}
        </div>
      </div>

      {state.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft ${
            state.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {compiledEmployees.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border/80 bg-surface p-12 text-center text-sm font-medium text-muted shadow-soft">
          No submitted timesheets or drafts require review for this period.
        </p>
      ) : (
        <form action={formAction} className="grid gap-4 min-w-0">
          {/* Compiled Employee Timesheet Cards */}
          <div className="grid gap-4">
            {paginatedEmployees.map((emp) => {
              const isExpanded = expandedEmployeeIds.has(emp.employeeId);
              const employeeEntryIds = emp.entries.map((e) => e.id);
              const allEmployeeSelected =
                employeeEntryIds.length > 0 && employeeEntryIds.every((id) => selectedIds.has(id));
              const someEmployeeSelected =
                !allEmployeeSelected && employeeEntryIds.some((id) => selectedIds.has(id));

              return (
                <div
                  key={emp.employeeId}
                  className={`rounded-3xl border transition-all overflow-hidden shadow-soft ${
                    allEmployeeSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border/80 bg-surface hover:border-primary/40"
                  }`}
                >
                  {/* Top Compiled Summary Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 bg-surface">
                    {/* Left: Checkbox, Avatar, Employee Info & Workstation */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <label
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-xl border border-border bg-background shadow-2xs hover:bg-surface-muted transition-colors"
                        title={allEmployeeSelected ? "Deselect employee" : "Select all drafts for employee"}
                      >
                        <input
                          type="checkbox"
                          checked={allEmployeeSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someEmployeeSelected;
                          }}
                          onChange={() => toggleSelectEmployee(emp)}
                          className="size-4.5 accent-primary cursor-pointer"
                        />
                      </label>

                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={emp.knownAs ?? emp.fullName}
                          src={emp.avatarUrl}
                          className="size-11 rounded-2xl border border-border shadow-soft"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface ${
                            emp.isCompliant ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-extrabold text-foreground truncate">
                            {emp.knownAs ?? emp.fullName}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${
                              emp.isCompliant
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            }`}
                          >
                            {emp.isCompliant ? (
                              <>
                                <CheckCircle2 className="size-3 text-emerald-600" />
                                Ready
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="size-3 text-amber-600" />
                                {emp.devianceCount > 0 ? `${emp.devianceCount} Deviance` : "Exceptions"}
                              </>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {emp.workstationName ?? "Assigned Workstation"} ·{" "}
                          <span className="font-semibold text-foreground">
                            {emp.entries.length} shift{emp.entries.length === 1 ? "" : "s"} submitted
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2.5 shrink-0 ml-auto sm:ml-0">
                      {/* One-click: Approve all drafts for this employee */}
                      <button
                        type="button"
                        onClick={async () => {
                          const fd = new FormData();
                          fd.set("decision", "approve");
                          emp.entries.forEach((e) => fd.append("time_entry_ids", e.id));
                          await formAction(fd);
                        }}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-soft cursor-pointer"
                        title={`Approve entire timesheet (${emp.entries.length} drafts) for ${emp.fullName}`}
                      >
                        <UserCheck className="size-3.5" />
                        Approve Timesheet ({emp.entries.length})
                      </button>

                      {/* Toggle Expand / Collapse Drafts List */}
                      <button
                        type="button"
                        onClick={() => toggleExpandEmployee(emp.employeeId)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors shadow-2xs cursor-pointer"
                        aria-expanded={isExpanded}
                      >
                        <Layers className="size-3.5 text-muted" />
                        <span>{isExpanded ? "Hide Drafts" : `View Drafts (${emp.entries.length})`}</span>
                        {isExpanded ? <ChevronUp className="size-3.5 text-muted" /> : <ChevronDown className="size-3.5 text-muted" />}
                      </button>
                    </div>
                  </div>

                  {/* Dedicated Full-Width Metric Strip (Clean, spacious, zero text collision) */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-border/70 bg-surface-muted/30 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                    <div className="p-3 sm:p-3.5 flex flex-col justify-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">Total Paid</span>
                      <span className="font-black text-primary text-base font-mono mt-0.5">
                        {formatHours(emp.totalPaidHours)}
                      </span>
                    </div>

                    <div className="p-3 sm:p-3.5 flex flex-col justify-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Normal (NT)</span>
                      <span className="font-bold text-foreground text-base font-mono mt-0.5">
                        {formatHours(emp.totalNormalHours)}
                      </span>
                    </div>

                    <div className="p-3 sm:p-3.5 flex flex-col justify-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Overtime (OT)</span>
                      <span className="font-bold text-amber-700 text-base font-mono mt-0.5">
                        {formatHours(emp.totalOvertimeHours)}
                      </span>
                    </div>

                    <div className="p-3 sm:p-3.5 flex flex-col justify-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Leave Hours</span>
                      <span className="font-bold text-violet-700 text-base font-mono mt-0.5">
                        {formatHours(emp.totalLeaveHours)}
                      </span>
                    </div>

                    <div className="p-3 sm:p-3.5 flex flex-col justify-center col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Break Time</span>
                      <span className="font-bold text-slate-700 text-base font-mono mt-0.5">
                        {formatHours(emp.totalBreakHours)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded List of Individual Draft Shifts */}
                  {isExpanded ? (
                    <div className="border-t border-border/80 bg-surface-muted/30 p-4 sm:p-5 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between pb-1">
                        <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                          Shift Drafts Breakdown ({emp.entries.length} entries for {emp.knownAs ?? emp.fullName})
                        </p>
                        <span className="text-[11px] text-muted">
                          Each submitted shift automatically updates here upon clock-out.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5">
                        {emp.entries.map((timesheet) => {
                          const validation = timesheet.scheduleValidation;
                          const hasWarning =
                            timesheet.missing_clocking ||
                            timesheet.late_arrival ||
                            timesheet.early_departure;
                          const milestones = getShiftMilestones(timesheet);
                          const deviances = milestones.filter((m) => m.isDeviance);
                          const clockInDeviance = milestones.find((m) => m.eventType === "clock_in")?.isDeviance;
                          const lunchDeviance = milestones.some(
                            (m) => (m.eventType === "lunch_start" || m.eventType === "lunch_end") && m.isDeviance,
                          );
                          const clockOutDeviance = milestones.find((m) => m.eventType === "clock_out")?.isDeviance;
                          const isCompliant = (validation?.isCompliant ?? !hasWarning) && deviances.length === 0;
                          const isSelected = selectedIds.has(timesheet.id);

                          return (
                            <article
                              key={timesheet.id}
                              className={`flex flex-col justify-between gap-3 rounded-2xl p-4 shadow-soft transition-all w-full max-w-full overflow-hidden ${
                                isSelected
                                  ? "ring-3 ring-primary shadow-xl scale-[1.01]"
                                  : ""
                              } ${
                                isCompliant
                                  ? "card-hero-green text-white"
                                  : "bg-rose-600 text-white"
                              }`}
                            >
                              {/* Top Bar: Checkbox, Date & Compliance Badge */}
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <label className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border border-white/30 bg-white/20 shadow-soft hover:bg-white/30 transition-colors">
                                    <input
                                      type="checkbox"
                                      name="time_entry_ids"
                                      value={timesheet.id}
                                      checked={isSelected}
                                      onChange={() => toggleSelect(timesheet.id)}
                                      aria-label={`Select timesheet for ${timesheet.work_date}`}
                                      className="size-4 accent-primary cursor-pointer"
                                    />
                                  </label>

                                  <div className="min-w-0">
                                    <p className="text-xs font-extrabold text-white truncate">
                                      {formatDate(timesheet.work_date)}
                                    </p>
                                    <p className="text-[11px] font-medium text-white/80 truncate">
                                      {timesheet.workstationName ?? "Assigned Workstation"}
                                    </p>
                                  </div>
                                </div>

                                <span
                                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                                    isCompliant
                                      ? "bg-white/20 text-white border border-white/30"
                                      : "bg-rose-950/50 text-rose-200 border border-rose-400/30"
                                  }`}
                                >
                                  {isCompliant ? (
                                    <CheckCircle2 className="size-2.5 text-white" />
                                  ) : (
                                    <AlertTriangle className="size-2.5 text-rose-200" />
                                  )}
                                  {isCompliant
                                    ? "Compliant"
                                    : deviances.length > 0
                                      ? `${deviances.length} Deviance${deviances.length > 1 ? "s" : ""}`
                                      : "Exception"}
                                </span>
                              </div>

                              {/* Shift Time Metric Boxes */}
                              <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1 rounded-xl bg-white p-2 text-center text-slate-900 shadow-xs min-w-0 w-full">
                                <div className="min-w-0">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Clock In</p>
                                  <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight flex items-center justify-center gap-1">
                                    {shortTime(timesheet.clock_in)}
                                    {clockInDeviance && (
                                      <span className="size-2 rounded-full bg-rose-500 shrink-0" title="Clock-in deviance" />
                                    )}
                                  </p>
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Lunch</p>
                                  <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight flex items-center justify-center gap-1">
                                    {shortLunch(timesheet.lunch_start, timesheet.lunch_end)}
                                    {lunchDeviance && (
                                      <span className="size-2 rounded-full bg-rose-500 shrink-0" title="Lunch deviance" />
                                    )}
                                  </p>
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Clock Out</p>
                                  <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight flex items-center justify-center gap-1">
                                    {shortTime(timesheet.clock_out)}
                                    {clockOutDeviance && (
                                      <span className="size-2 rounded-full bg-rose-500 shrink-0" title="Clock-out deviance" />
                                    )}
                                  </p>
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Paid</p>
                                  <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(timesheet.paid_hours)}</p>
                                </div>
                              </div>

                              {/* Normal Time & Overtime Breakdown */}
                              <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/95 p-1.5 text-center text-slate-900 shadow-xs min-w-0 w-full text-[11px]">
                                <div>
                                  <span className="text-[8.5px] uppercase font-bold text-slate-500 block">NT</span>
                                  <span className="font-mono font-extrabold">{formatHours(timesheet.normal_hours)}</span>
                                </div>
                                <div>
                                  <span className="text-[8.5px] uppercase font-bold text-slate-500 block">OT</span>
                                  <span className="font-mono font-extrabold">{formatHours(timesheet.overtime_hours)}</span>
                                </div>
                                <div>
                                  <span className="text-[8.5px] uppercase font-bold text-slate-500 block">Break</span>
                                  <span className="font-mono font-extrabold">{formatHours(timesheet.lunch_hours)}</span>
                                </div>
                              </div>

                              {/* Milestones & Route Map */}
                              <details className="rounded-xl border border-border/80 bg-surface overflow-hidden shadow-soft text-foreground" open={activeMapEntryId === timesheet.id}>
                                <summary className="flex cursor-pointer items-center justify-between gap-1.5 px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <MapPin className="size-3.5 text-primary shrink-0" />
                                    <span className="truncate">Milestones ({milestones.length})</span>
                                  </div>
                                  {timesheet.locationEvents.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setActiveMapEntryId((prev) => (prev === timesheet.id ? null : timesheet.id));
                                      }}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white hover:bg-primary-hover shadow-soft"
                                    >
                                      <Footprints className="size-2.5" />
                                      {activeMapEntryId === timesheet.id ? "Hide Map" : "Route Map"}
                                    </button>
                                  )}
                                </summary>

                                {activeMapEntryId === timesheet.id && (
                                  <div className="p-2 border-t border-border bg-slate-950">
                                    <TimesheetRouteMap
                                      employeeName={timesheet.knownAs ?? timesheet.fullName}
                                      workDate={timesheet.work_date}
                                      locationEvents={timesheet.locationEvents}
                                      onClose={() => setActiveMapEntryId(null)}
                                    />
                                  </div>
                                )}

                                <div className="divide-y divide-border border-t border-border bg-surface p-1 max-h-36 overflow-y-auto">
                                  {milestones.length === 0 ? (
                                    <p className="p-2 text-center text-xs text-muted">No location pings</p>
                                  ) : (
                                    milestones.map((m) => (
                                      <div key={m.id} className="flex items-center justify-between gap-2 p-1.5 text-[11px]">
                                        <span className="font-bold capitalize">{m.title}</span>
                                        <span className="font-mono text-muted">{formatTime(m.time)}</span>
                                        <span className={`rounded-full px-2 py-0.2 text-[9px] font-bold border ${geofenceClass(m.geofenceStatus)}`}>
                                          {geofenceLabel(m.geofenceStatus)}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </details>

                              {/* Single Draft Action Buttons */}
                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/20">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const fd = new FormData();
                                    fd.set("decision", "reject");
                                    fd.append("time_entry_ids", timesheet.id);
                                    await formAction(fd);
                                  }}
                                  disabled={pending}
                                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const fd = new FormData();
                                    fd.set("decision", "approve");
                                    fd.append("time_entry_ids", timesheet.id);
                                    await formAction(fd);
                                  }}
                                  disabled={pending}
                                  className="rounded-full bg-white px-3.5 py-1 text-xs font-bold text-emerald-900 hover:bg-white/90 transition shadow-soft cursor-pointer"
                                >
                                  Approve Draft
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalEmployees > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/90 backdrop-blur-md p-3.5 sm:p-4 text-xs shadow-soft">
              <div className="flex flex-wrap items-center gap-2 text-muted">
                <span>
                  Showing <strong className="font-bold text-foreground">{startIndex}</strong> to{" "}
                  <strong className="font-bold text-foreground">{endIndex}</strong> of{" "}
                  <strong className="font-bold text-foreground">{totalEmployees}</strong> compiled employees ({totalTimesheets} total shifts)
                </span>

                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[11px] font-semibold text-muted">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2.5 py-1 text-xs rounded-full bg-background border border-border/80 text-foreground focus:outline-none focus:border-primary shadow-2xs font-semibold cursor-pointer"
                  >
                    {[5, 10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedIds.size > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                    {selectedIds.size} shifts selected
                  </span>
                )}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={page <= 1}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="First page"
                    aria-label="First page"
                  >
                    <ChevronsLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((item) => (
                        <button
                          key={`emp-page-${item}`}
                          type="button"
                          onClick={() => handlePageChange(item)}
                          className={`grid size-7 place-items-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item === page
                              ? "bg-primary text-primary-foreground shadow-2xs scale-105"
                              : "hover:bg-surface-muted text-muted hover:text-foreground"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={page >= totalPages}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Last page"
                    aria-label="Last page"
                  >
                    <ChevronsRight className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Action Note Box & Bulk Decision Buttons */}
          <div className="grid gap-3 rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-soft">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Review note</span>
              <span className="flex items-start gap-2 rounded-2xl border border-border/80 bg-background px-3 pt-2 shadow-soft focus-within:border-primary">
                <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                <textarea
                  name="approval_notes"
                  rows={2}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none resize-none"
                  placeholder="Optional review note or rejection reason applied to selected timesheets"
                />
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                name="decision"
                value="reject"
                disabled={pending || selectedIds.size === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-6 py-2.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-all shadow-soft cursor-pointer"
              >
                <XCircle className="size-4 shrink-0" />
                {pending
                  ? "Working..."
                  : selectedIds.size > 0
                    ? `Reject selected (${selectedIds.size})`
                    : "Reject selected"}
              </button>
              <button
                name="decision"
                value="approve"
                disabled={pending || selectedIds.size === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover disabled:opacity-50 shadow-soft transition-all cursor-pointer"
              >
                <CheckCircle2 className="size-4 shrink-0 text-white" />
                {pending
                  ? "Working..."
                  : selectedIds.size > 0
                    ? `Approve selected (${selectedIds.size})`
                    : "Approve selected"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
