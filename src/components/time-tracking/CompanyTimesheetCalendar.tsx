"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import type { DayCellMountArg } from "@fullcalendar/core";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import {
  createManagedDraftTimeEntry,
  deleteManagedDraftTimeEntry,
  deleteTimeEntry,
  loadManagedLeaveRequestsToTimesheets,
  reviewSubmittedTimesheets,
  updateManagedDraftTimeEntry,
} from "@/lib/time-tracking/actions";
import type {
  CompanyCalendarEmployeeOption,
  CompanyCalendarLeaveRequest,
  CompanyLiveTimeOverview,
  CompanyPublicHoliday,
  CompanyTimesheetCalendarEntry,
} from "@/lib/time-tracking/schema";

type CompanyTimesheetCalendarProps = {
  employees: CompanyCalendarEmployeeOption[];
  entries: CompanyTimesheetCalendarEntry[];
  leaveRequests: CompanyCalendarLeaveRequest[];
  publicHolidays: CompanyPublicHoliday[];
  liveOverview?: CompanyLiveTimeOverview | null;
};

const initialActionState = {
  ok: true,
  message: "",
};

type CalendarWindow = "day" | "week" | "payroll" | "month";

function viewButtonClass(active: boolean) {
  return active
    ? "bg-slate-900 text-white shadow-xs font-bold"
    : "border border-border bg-white text-foreground hover:bg-slate-100 font-semibold";
}

function displayName(entry: CompanyTimesheetCalendarEntry) {
  return entry.knownAs ?? entry.fullName;
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

function shortTime(value: string | null) {
  return value ? formatTime(value) : "–";
}

function formatHours(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}h`;
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "--";
  if (start && end) return `${formatTime(start)} - ${formatTime(end)}`;
  return formatTime(start ?? end);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function geofenceLabel(status: string | null) {
  if (status === "in_range") return "In range";
  if (status === "out_of_range") return "Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null) {
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "no_location") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-surface-muted text-muted";
}

function getPaidHoursContainerClass(validation: CompanyTimesheetCalendarEntry["scheduleValidation"]) {
  if (!validation) return "border-border bg-background";
  return validation.isCompliant
    ? "border-success/30 bg-success/10"
    : "border-danger/30 bg-danger/10";
}

function getPaidHoursTextClass(validation: CompanyTimesheetCalendarEntry["scheduleValidation"]) {
  if (!validation) return "text-foreground";
  return validation.isCompliant ? "text-success" : "text-danger";
}

function getEntryBorderClass(entry: CompanyTimesheetCalendarEntry) {
  const validation = entry.scheduleValidation;
  if (validation) {
    return validation.isCompliant
      ? "border-emerald-300/80 bg-emerald-50/40 hover:bg-emerald-50/70"
      : "border-rose-300 bg-rose-50/40 hover:bg-rose-50/70";
  }
  return entry.missing_clocking || entry.late_arrival || entry.early_departure
    ? "border-rose-300 bg-rose-50/40 hover:bg-rose-50/70"
    : "border-border bg-white hover:bg-slate-50";
}

function statusClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return ["cw-company-timesheet-event", "cw-calendar-draft"];
  if (status === "approved") return ["cw-company-timesheet-event", "cw-calendar-approved"];
  if (status === "rejected") return ["cw-company-timesheet-event", "cw-calendar-rejected"];
  if (status === "locked") return ["cw-company-timesheet-event", "cw-calendar-locked"];
  return ["cw-company-timesheet-event", "cw-calendar-submitted"];
}

function statusBadgeClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return "bg-amber-500 text-white shadow-2xs";
  if (status === "approved") return "bg-emerald-600 text-white shadow-2xs";
  if (status === "rejected") return "bg-rose-600 text-white shadow-2xs";
  if (status === "locked") return "bg-slate-500 text-white shadow-2xs";
  return "bg-slate-900 text-white shadow-2xs";
}

function canEdit(status: CompanyTimesheetCalendarEntry["status"]) {
  return status === "draft" || status === "rejected";
}

function renderEventContent(eventInfo: EventContentArg) {
  const entry = eventInfo.event.extendedProps.entry as
    | CompanyTimesheetCalendarEntry
    | undefined;

  if (!entry) {
    return (
      <div className="truncate text-[11px] font-semibold leading-4">
        {eventInfo.event.title}
      </div>
    );
  }

  return (
    <span
      className={`cw-calendar-avatar-event inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ${avatarRingClass(entry.status)}`}
      title={`${displayName(entry)} · ${formatHours(entry.paid_hours)}`}
    >
      <EmployeeAvatar
        name={displayName(entry)}
        src={entry.avatarUrl}
        className="size-6 rounded-full border-0"
      />
    </span>
  );
}

function avatarRingClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return "ring-warning/70";
  if (status === "approved") return "ring-success/70";
  if (status === "rejected") return "ring-danger/70";
  if (status === "locked") return "ring-muted/50";
  return "ring-primary/60";
}

export default function CompanyTimesheetCalendar({
  employees,
  entries,
  leaveRequests,
  publicHolidays,
  liveOverview = null,
}: CompanyTimesheetCalendarProps) {
  const activeColleagues = useMemo(() => {
    if (!liveOverview?.entries) return [];
    return liveOverview.entries.filter(
      (c) => c.status === "working" || c.status === "on_lunch",
    );
  }, [liveOverview]);

  const [showAllColleagues, setShowAllColleagues] = useState(false);
  const [showAllMobileEntries, setShowAllMobileEntries] = useState(false);

  const visibleColleagues = useMemo(() => {
    if (showAllColleagues || activeColleagues.length <= 6) {
      return activeColleagues;
    }
    return activeColleagues.slice(0, 6);
  }, [activeColleagues, showAllColleagues]);

  const hiddenColleaguesCount = Math.max(0, activeColleagues.length - 6);

  const [selectedEntry, setSelectedEntry] = useState<CompanyTimesheetCalendarEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [showDateActions, setShowDateActions] = useState(false);
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return "day";
    if (typeof window !== "undefined" && window.innerWidth < 768) return "week";
    return "month";
  });

  const [showLegend, setShowLegend] = useState(false);

  const [calendarFocusDate, setCalendarFocusDate] = useState(() => {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
  });
  const [editing, setEditing] = useState(false);
  const [editedTimes, setEditedTimes] = useState<Record<string, string>>({});
  const [tooltip, setTooltip] = useState<{
    content: string;
    x: number;
    y: number;
  } | null>(null);
  const [dayTooltip, setDayTooltip] = useState<{
    content: string;
    x: number;
    y: number;
  } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const holidayDates = useMemo(
    () => new Set(publicHolidays.map((holiday) => holiday.holiday_date)),
    [publicHolidays],
  );

  const mobileEntriesForFocusDate = useMemo(() => {
    return entries.filter(
      (e) =>
        e.work_date === calendarFocusDate &&
        !holidayDates.has(e.work_date) &&
        !e.notes?.startsWith("Public holiday:"),
    );
  }, [entries, calendarFocusDate, holidayDates]);

  const visibleMobileEntries = useMemo(() => {
    if (showAllMobileEntries || mobileEntriesForFocusDate.length <= 6) {
      return mobileEntriesForFocusDate;
    }
    return mobileEntriesForFocusDate.slice(0, 6);
  }, [mobileEntriesForFocusDate, showAllMobileEntries]);

  const hiddenMobileEntriesCount = Math.max(0, mobileEntriesForFocusDate.length - 6);
  const dayEventsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of publicHolidays) {
      const prev = map.get(h.holiday_date) ?? [];
      prev.push(h.name);
      map.set(h.holiday_date, prev);
    }
    for (const e of entries) {
      if (holidayDates.has(e.work_date) || e.notes?.startsWith("Public holiday:")) {
        continue;
      }
      const prev = map.get(e.work_date) ?? [];
      prev.push(displayName(e));
      map.set(e.work_date, prev);
    }
    return map;
  }, [entries, publicHolidays, holidayDates]);

  const [createState, createAction, createPending] = useActionState(
    createManagedDraftTimeEntry,
    initialActionState,
  );
  const [loadLeaveState, loadLeaveAction, loadLeavePending] = useActionState(
    loadManagedLeaveRequestsToTimesheets,
    initialActionState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateManagedDraftTimeEntry,
    initialActionState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteManagedDraftTimeEntry,
    initialActionState,
  );
  const [forceDeleteState, forceDeleteAction, forceDeletePending] = useActionState(
    deleteTimeEntry,
    initialActionState,
  );
  const [approvalState, approvalAction, approvalPending] = useActionState(
    reviewSubmittedTimesheets,
    initialActionState,
  );
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(
    () => new Set(),
  );

  const employeeSubmitted = useMemo(() => {
    if (!selectedEntry) return [];
    return entries.filter(
      (entry) =>
        entry.employee_id === selectedEntry.employee_id &&
        entry.status === "submitted" &&
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
  }, [entries, selectedEntry, holidayDates]);

  const events = useMemo<EventInput[]>(
    () => {
      const holidayEvents = publicHolidays.map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));
      const timesheetEvents = entries
        .filter(
          (entry) =>
            !holidayDates.has(entry.work_date) &&
            !entry.notes?.startsWith("Public holiday:"),
        )
        .map((entry) => ({
          id: entry.id,
          title: displayName(entry),
          start: entry.work_date,
          allDay: true,
          classNames: [
            "cw-company-timesheet-event",
            entry.missing_clocking || entry.late_arrival || entry.early_departure
              ? "cw-company-timesheet-event-warning"
              : "",
          ],
          extendedProps: { entry },
        }));

      return [...holidayEvents, ...timesheetEvents];
    },
    [entries, publicHolidays, holidayDates],
  );

  const totals = useMemo(() => {
    const validEntries = entries.filter(
      (entry) =>
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
    return {
      approved: validEntries.filter((entry) => entry.status === "approved").length,
      issues: validEntries.filter(
        (entry) => entry.missing_clocking || entry.late_arrival || entry.early_departure,
      ).length,
      submitted: validEntries.filter((entry) => entry.status === "submitted").length,
      total: validEntries.length,
    };
  }, [entries, holidayDates]);

  const existingEntriesForDate = useMemo(() => {
    if (!selectedDate || holidayDates.has(selectedDate)) return [];
    return entries.filter(
      (e) =>
        e.work_date === selectedDate &&
        !e.notes?.startsWith("Public holiday:"),
    );
  }, [entries, selectedDate, holidayDates]);

  const leaveRequestsForDate = useMemo(() => {
    if (!selectedDate) return leaveRequests;
    return leaveRequests.filter((r) => selectedDate >= r.start_date && selectedDate <= r.end_date);
  }, [leaveRequests, selectedDate]);

  const handleEventClick = (arg: EventClickArg) => {
    const entry = arg.event.extendedProps.entry as
      | CompanyTimesheetCalendarEntry
      | undefined;

    if (entry) {
      setCalendarFocusDate(entry.work_date);
      setSelectedEntry(entry);
      setEditing(false);
      setEditedTimes({});
      setSelectedApprovalIds(
        new Set(
          entries
            .filter(
              (e) => e.employee_id === entry.employee_id && e.status === "submitted",
            )
            .map((e) => e.id),
        ),
      );
    }
  };

  const handleDateClick = (arg: DateClickArg) => {
    setSelectedDate(arg.dateStr);
    setCalendarFocusDate(arg.dateStr);
    setShowDateActions(true);
  };

  const closeDateActions = () => {
    setShowDateActions(false);
    setSelectedDate("");
  };

  const closeEntryModal = () => {
    setSelectedEntry(null);
    setEditing(false);
    setEditedTimes({});
    setSelectedApprovalIds(new Set());
  };

  const startEditing = () => {
    if (!selectedEntry) return;
    setEditing(true);
    setEditedTimes({
      clock_in: selectedEntry.clock_in ?? "",
      lunch_start: selectedEntry.lunch_start ?? "",
      lunch_end: selectedEntry.lunch_end ?? "",
      clock_out: selectedEntry.clock_out ?? "",
      notes: selectedEntry.notes ?? "",
    });
  };

  const handleTimeChange = (name: string, value: string) => {
    setEditedTimes((prev) => ({ ...prev, [name]: value }));
  };

  const toggleApprovalId = (id: string) => {
    setSelectedApprovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setAllApprovalSelection = (checked: boolean) => {
    setSelectedApprovalIds(new Set(checked ? employeeSubmitted.map((entry) => entry.id) : []));
  };

  const globalMessage = createState.message || loadLeaveState.message || updateState.message || deleteState.message;
  const globalOk = updateState.message ? updateState.ok
    : deleteState.message ? deleteState.ok
      : createState.message ? createState.ok
        : loadLeaveState.ok;

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
      <div className="rounded-xl bg-primary p-4 text-primary-foreground shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/75">
              Company Calendar
            </p>
            <h2 className="mt-0.5 text-xl font-black text-primary-foreground sm:text-2xl">
              Team Timesheets
            </h2>
            <p className="mt-0.5 hidden text-xs text-primary-foreground/85 sm:block">
              Click any date cell to create shifts or load approved leave. Click any employee avatar to view or edit.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[32rem]">
            <div className="rounded-lg border border-white/20 bg-white/10 p-2.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-200">
                <CalendarDays className="size-3.5 text-slate-300" />
                Shifts
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.total}</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 p-2.5 text-white shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Clock3 className="size-3.5 text-emerald-400" />
                Submitted
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.submitted}</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 p-2.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                Approved
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.approved}</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 p-2.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-300">
                <AlertTriangle className="size-3.5 text-rose-400" />
                Exceptions
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.issues}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-4">
        {activeColleagues.length > 0 && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/50 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                </span>
                <p className="text-xs font-black text-emerald-950">
                  Colleagues on shift right now ({activeColleagues.length})
                </p>
              </div>

              {activeColleagues.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setShowAllColleagues((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-white px-2 py-0.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100/80 transition-colors cursor-pointer shadow-2xs"
                  aria-label={showAllColleagues ? "Collapse colleagues list" : `Show ${hiddenColleaguesCount} more colleagues`}
                >
                  <span>{showAllColleagues ? "Show less" : `+${hiddenColleaguesCount} more`}</span>
                  {showAllColleagues ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {visibleColleagues.map((colleague) => {
                const isOnLunch = colleague.status === "on_lunch";
                return (
                  <div
                    key={colleague.employeeId}
                    className={`flex items-center gap-2 rounded-md border p-1.5 pr-3 shadow-sm transition-all ${isOnLunch
                      ? "border-amber-300 bg-white hover:bg-amber-50"
                      : "border-emerald-300 bg-white hover:bg-emerald-50"
                      }`}
                  >
                    <div className="relative shrink-0">
                      <EmployeeAvatar
                        name={colleague.knownAs ?? colleague.fullName}
                        src={colleague.avatarUrl}
                        className={`size-7 ring-2 ${isOnLunch ? "ring-amber-500" : "ring-emerald-500"}`}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-1 ring-white ${isOnLunch ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                      />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="max-w-[120px] truncate text-xs font-extrabold text-foreground">
                        {colleague.knownAs ?? colleague.fullName}
                      </p>
                      <p className="text-[10px] font-semibold text-muted">
                        {isOnLunch ? "On lunch" : `In ${shortTime(colleague.clockIn)}`}
                      </p>
                    </div>
                  </div>
                );
              })}

              {!showAllColleagues && hiddenColleaguesCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllColleagues(true)}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-emerald-500/50 bg-white/80 px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
                  aria-label={`Show ${hiddenColleaguesCount} more colleagues`}
                >
                  <span>+{hiddenColleaguesCount} more</span>
                  <ChevronDown className="size-3.5 text-emerald-700" />
                </button>
              ) : showAllColleagues && hiddenColleaguesCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllColleagues(false)}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-emerald-500/50 bg-white/80 px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
                  aria-label="Show fewer colleagues"
                >
                  <span>Show less</span>
                  <ChevronUp className="size-3.5 text-emerald-700" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {globalMessage ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm font-semibold ${globalOk
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
              }`}
          >
            {globalMessage}
          </div>
        ) : null}

        <div className="hidden flex-wrap gap-2 sm:flex">
          {([
            ["day", "Daily View"],
            ["week", "Weekly View"],
            ["payroll", "Payroll Period"],
            ["month", "Monthly View"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCalendarWindow(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${viewButtonClass(calendarWindow === value)}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="flex w-fit items-center gap-1.5 text-xs font-bold text-muted sm:hidden"
        >
          <span
            className="inline-flex size-2 rounded-full"
            style={{
              background:
                "conic-gradient(var(--color-holiday),var(--color-warning),var(--color-primary),var(--color-success),var(--color-danger))",
            }}
          />
          Legend ({showLegend ? "hide" : "show"})
        </button>

        <div
          className={`flex flex-wrap gap-2 text-xs font-bold ${showLegend ? "" : "hidden sm:flex"}`}
        >
          <span className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-100/70 px-2 py-0.5 text-[11px] text-purple-900">
            <span className="size-1.5 rounded-full bg-purple-600" />
            Public Holiday
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100/70 px-2 py-0.5 text-[11px] text-amber-900">
            <span className="size-1.5 rounded-full bg-amber-600" />
            Draft
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-white">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Submitted
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100/70 px-2 py-0.5 text-[11px] text-emerald-900">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Approved
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-100/70 px-2 py-0.5 text-[11px] text-rose-900">
            <span className="size-1.5 rounded-full bg-rose-600" />
            Rejected
          </span>
        </div>

        {events.length > 0 || publicHolidays.length > 0 ? (
          <>
            <div ref={calendarRef} className="cw-timesheet-calendar min-w-0 max-sm:hidden">
              <FullCalendar
                key={`${calendarWindow}-${calendarFocusDate}`}
                dayMaxEventRows={6}
                dayMaxEvents={6}
                eventClassNames={(arg) => {
                  const entry = arg.event.extendedProps.entry as
                    | CompanyTimesheetCalendarEntry
                    | undefined;

                  return entry
                    ? [...statusClass(entry.status), "cw-calendar-avatar-event"]
                    : ["cw-calendar-holiday"];
                }}
                eventContent={renderEventContent}
                eventClick={handleEventClick}
                dateClick={handleDateClick}
                eventMouseEnter={(info) => {
                  setDayTooltip(null);
                  const rect = info.el.getBoundingClientRect();
                  const calRect = calendarRef.current?.getBoundingClientRect();
                  const entry = info.event.extendedProps.entry as CompanyTimesheetCalendarEntry | undefined;
                  if (entry) {
                    const lines = [
                      displayName(entry),
                      entry.clock_in || entry.clock_out
                        ? `${formatTime(entry.clock_in)} \u2192 ${formatTime(entry.clock_out)}`
                        : "",
                      `${formatHours(entry.paid_hours)}${entry.overtime_hours > 0 ? ` + ${formatHours(entry.overtime_hours)} OT` : ""}`,
                      entry.status,
                      entry.workstationName ? entry.workstationName : "",
                      entry.warning_notes || entry.notes || "",
                    ].filter(Boolean).join(" · ");

                    let x = rect.left + rect.width / 2;
                    let y = rect.bottom + 8;

                    if (calRect && y + 120 > calRect.bottom) {
                      y = rect.top - 8;
                    }
                    if (calRect) {
                      x = Math.max(calRect.left + 4, Math.min(x, calRect.right - 4));
                      y = Math.max(calRect.top + 4, y);
                    }
                    setTooltip({ content: lines, x, y });
                  } else {
                    let x = rect.left + rect.width / 2;
                    let y = rect.top - 8;
                    if (calRect) {
                      x = Math.max(calRect.left + 4, Math.min(x, calRect.right - 4));
                      y = Math.max(calRect.top + 4, y);
                    }
                    setTooltip({ content: info.event.title, x, y });
                  }
                }}
                eventMouseLeave={() => setTooltip(null)}
                dayCellDidMount={(arg: DayCellMountArg) => {
                  const dateStr = arg.dateStr;
                  const eventsForDay = dayEventsMap.get(dateStr);
                  if (!eventsForDay) return;
                  arg.el.addEventListener("mouseenter", (e: MouseEvent) => {
                    const target = e.target as HTMLElement;
                    if (target.closest(".fc-event")) return;
                    const calRect = calendarRef.current?.getBoundingClientRect();
                    if (!calRect) return;
                    const cellRect = arg.el.getBoundingClientRect();
                    let x = cellRect.left + cellRect.width / 2;
                    let y = cellRect.top - 4;
                    x = Math.max(calRect.left + 4, Math.min(x, calRect.right - 4));
                    y = Math.max(calRect.top + 4, y);
                    setDayTooltip({
                      content: eventsForDay.join(" · "),
                      x,
                      y,
                    });
                  });
                  arg.el.addEventListener("mouseleave", () => {
                    setDayTooltip(null);
                  });
                }}
                events={events}
                firstDay={1}
                initialDate={calendarFocusDate}
                headerToolbar={{
                  center: "title",
                  left: "prev,next today",
                  right: "",
                }}
                height="auto"
                initialView={
                  calendarWindow === "day"
                    ? "dayGridDay"
                    : calendarWindow === "week"
                      ? "dayGridWeek"
                      : calendarWindow === "payroll"
                        ? "dayGridPayroll"
                        : "dayGridMonth"
                }
                moreLinkClick="popover"
                plugins={[dayGridPlugin, interactionPlugin]}
                views={{
                  dayGridPayroll: {
                    buttonText: "Payroll",
                    duration: { days: 14 },
                    type: "dayGrid",
                    dayMaxEvents: 6,
                  },
                  dayGridMonth: {
                    dayMaxEvents: 6,
                  },
                  dayGridWeek: {
                    dayMaxEvents: 6,
                  },
                }}
              />
            </div>

            <div className="hidden min-w-0 max-w-full flex-col gap-4 max-sm:flex">
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="date"
                  value={calendarFocusDate}
                  onChange={(e) => setCalendarFocusDate(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setCalendarFocusDate(
                      [
                        today.getFullYear(),
                        String(today.getMonth() + 1).padStart(2, "0"),
                        String(today.getDate()).padStart(2, "0"),
                      ].join("-"),
                    );
                  }}
                  className="shrink-0 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent"
                >
                  Today
                </button>
              </div>

              <div className="flex min-w-0 max-w-full flex-col gap-2">
                {publicHolidays
                  .filter((h) => h.holiday_date === calendarFocusDate)
                  .map((holiday) => (
                    <div
                      key={`holiday-${holiday.id}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-holiday/30 bg-holiday/10 px-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-holiday">{holiday.name}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-holiday/20 bg-holiday/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-holiday">
                        Holiday
                      </span>
                    </div>
                  ))}
                {visibleMobileEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setCalendarFocusDate(entry.work_date);
                      setSelectedEntry(entry);
                      setEditing(false);
                      setEditedTimes({});
                      setSelectedApprovalIds(
                        new Set(
                          entries
                            .filter(
                              (e) =>
                                e.employee_id === entry.employee_id &&
                                e.status === "submitted",
                            )
                            .map((e) => e.id),
                        ),
                      );
                    }}
                    className={`block w-full min-w-0 max-w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors ${getEntryBorderClass(entry)}`}
                    aria-label={`${displayName(entry)} timesheet entry for ${formatDate(entry.work_date)}`}
                  >
                    <div className="flex w-full min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {displayName(entry)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`whitespace-nowrap text-sm font-semibold ${getPaidHoursTextClass(entry.scheduleValidation)}`}>
                          {formatHours(entry.paid_hours)}
                          {Number(entry.overtime_hours ?? 0) > 0
                            ? ` +${formatHours(entry.overtime_hours)}`
                            : ""}
                        </span>
                        <span
                          className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadgeClass(entry.status)}`}
                        >
                          {entry.status}
                        </span>
                      </div>
                    </div>
                    {entry.warning_notes || entry.notes ? (
                      <p className="line-clamp-2 mt-1 break-words text-xs text-muted">
                        {entry.warning_notes || entry.notes}
                      </p>
                    ) : null}
                  </button>
                ))}
                {hiddenMobileEntriesCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllMobileEntries((prev) => !prev)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2.5 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-2xs"
                    aria-label={showAllMobileEntries ? "Collapse users list" : `Show ${hiddenMobileEntriesCount} more users`}
                  >
                    {showAllMobileEntries ? (
                      <>
                        <span>Show less</span>
                        <ChevronUp className="size-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Show {hiddenMobileEntriesCount} more users</span>
                        <ChevronDown className="size-3.5" />
                      </>
                    )}
                  </button>
                ) : null}
                {mobileEntriesForFocusDate.length === 0 &&
                  publicHolidays.filter((h) => h.holiday_date === calendarFocusDate).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                    No entries for this day
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedDate(calendarFocusDate);
                  setShowDateActions(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-semibold text-muted"
              >
                <Plus className="size-4" />
                Add entries for this day
              </button>
            </div>

            {(tooltip ?? dayTooltip) ? createPortal(
              <div
                className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-lg"
                style={{ left: (tooltip ?? dayTooltip)!.x, top: (tooltip ?? dayTooltip)!.y }}
              >
                {(tooltip ?? dayTooltip)!.content}
              </div>,
              document.body,
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted max-sm:hidden">
            No company timesheets have been recorded for the current year yet.
          </div>
        )}
      </div>

      <ViewportSidebar
        open={showDateActions}
        onClose={closeDateActions}
        eyebrow={selectedDate}
        title={`${existingEntriesForDate.length} ${existingEntriesForDate.length === 1 ? "entry" : "entries"}`}
        description={
          existingEntriesForDate.length > 0
            ? "Click an entry to view or edit its details."
            : "No entries for this date yet."
        }
        bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        <form action={createAction} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
          <div>
            <p className="font-semibold text-foreground">Create draft entry</p>
            <p className="mt-1 text-xs text-muted">
              Add a manual draft timesheet row for an employee on this date.
            </p>
          </div>
          <input name="work_date" type="hidden" value={selectedDate} />
          {existingEntriesForDate.length > 0 ? (
            <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-surface">
              {existingEntriesForDate.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSelectedEntry(entry);
                    setSelectedDate("");
                    setShowDateActions(false);
                    setSelectedApprovalIds(
                      new Set(
                        entries
                          .filter(
                            (e) =>
                              e.employee_id === entry.employee_id && e.status === "submitted",
                          )
                          .map((e) => e.id),
                      ),
                    );
                  }}
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-surface-muted last:border-b-0"
                >
                  <span className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadgeClass(entry.status)}`}>
                    {entry.status}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">
                      {displayName(entry)}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatTime(entry.clock_in)} \u2192 {formatTime(entry.clock_out)} · {formatHours(entry.paid_hours)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <User className="size-4 shrink-0 text-muted" />
              <select
                name="employee_id"
                required
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Choose employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </span>
            <button
              disabled={createPending}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createPending ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>

        <form action={loadLeaveAction} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
          <div>
            <p className="font-semibold text-foreground">Load approved leave</p>
            <p className="mt-1 text-xs text-muted">
              Tick approved leave requests to load them into timesheet rows.
            </p>
          </div>
          {leaveRequestsForDate.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted">
              {leaveRequests.length === 0
                ? "No approved leave requests available."
                : "No approved leave requests cover this date."}
            </div>
          ) : (
            <>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
                {leaveRequestsForDate.map((request) => (
                  <label
                    key={request.id}
                    className="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <input
                      className="mt-1 size-4 accent-current"
                      name="leave_request_ids"
                      type="checkbox"
                      value={request.id}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">
                        {request.employeeName}
                      </span>
                      <span className="block text-xs text-muted">
                        {request.leaveTypeName} - {request.start_date} to {request.end_date} -{" "}
                        {formatHours(request.total_hours)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {leaveRequests.length > leaveRequestsForDate.length ? (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">
                    Show all {leaveRequests.length} requests
                  </summary>
                  <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-border bg-surface">
                    {leaveRequests.map((request) => (
                      <label
                        key={request.id}
                        className="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                      >
                        <input
                          className="mt-1 size-4 accent-current"
                          name="leave_request_ids"
                          type="checkbox"
                          value={request.id}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">
                            {request.employeeName}
                          </span>
                          <span className="block text-xs text-muted">
                            {request.leaveTypeName} - {request.start_date} to {request.end_date} -{" "}
                            {formatHours(request.total_hours)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}
              <button
                disabled={loadLeavePending}
                className="justify-self-end rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {loadLeavePending ? "Loading..." : "Load selected leave"}
              </button>
            </>
          )}
        </form>
      </ViewportSidebar>

      <ViewportSidebar
        open={Boolean(selectedEntry)}
        onClose={closeEntryModal}
        maxWidth="max-w-md"
        eyebrow="Timesheet record"
        title={selectedEntry ? displayName(selectedEntry) : ""}
        description={
          selectedEntry
            ? `${selectedEntry.workstationName ?? "No workstation"} · ${selectedEntry.work_date}`
            : ""
        }
        actions={
          selectedEntry && canEdit(selectedEntry.status) && !editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="grid size-8 place-items-center rounded border border-border bg-surface text-foreground hover:bg-surface-muted"
              aria-label="Edit timesheet"
            >
              <Pencil className="size-4" />
            </button>
          ) : null
        }
        bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        {selectedEntry ? (
          <>
            <div
              className={`flex items-center justify-between gap-3 rounded-lg p-3.5 shadow-sm ${selectedEntry.status === "approved"
                ? "bg-emerald-600 text-white ring-1 ring-emerald-700/60"
                : selectedEntry.status === "submitted"
                  ? "bg-slate-800 text-white ring-1 ring-slate-900/60"
                  : selectedEntry.status === "rejected"
                    ? "bg-rose-600 text-white ring-1 ring-rose-700/60"
                    : "border border-zinc-300 bg-zinc-100 text-zinc-900"
                }`}
            >
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${selectedEntry.status === "draft" ? "text-zinc-500" : "opacity-80"}`}>
                  Timesheet Status
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${selectedEntry.status === "approved"
                      ? "border border-emerald-400/30 bg-emerald-950/40 text-white"
                      : selectedEntry.status === "submitted"
                        ? "border border-slate-700 bg-slate-900/80 text-emerald-400"
                        : selectedEntry.status === "rejected"
                          ? "border border-rose-400/30 bg-rose-950/50 text-white"
                          : "border border-zinc-300 bg-zinc-200 text-zinc-800"
                      }`}
                  >
                    {selectedEntry.status}
                  </span>
                  <span className={`text-xs font-bold ${selectedEntry.status === "draft" ? "text-zinc-600" : "text-white/90"}`}>
                    {selectedEntry.work_date}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${selectedEntry.status === "draft" ? "text-zinc-500" : "opacity-80"}`}>
                  Paid Total
                </p>
                <p className="mt-0.5 text-xl font-black">{formatHours(selectedEntry.paid_hours)}</p>
              </div>
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["clock_in", "lunch_start", "lunch_end", "clock_out"] as const).map((field) => (
                  <div key={field} className="min-w-0 rounded-lg border border-border bg-background p-2">
                    <p className="leading-none text-[10px] font-bold uppercase text-muted">{field === "clock_in" ? "In" : field === "clock_out" ? "Out" : field.replace("_", " ")}</p>
                    <input
                      type="time"
                      name={field}
                      defaultValue={selectedEntry[field] ?? ""}
                      onChange={(e) => handleTimeChange(field, e.target.value)}
                      className="mt-1 h-7 w-full rounded border border-border bg-surface px-1 text-xs font-bold text-foreground outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">In</p>
                  <p className="mt-0.5 text-xs font-extrabold text-foreground">{formatTime(selectedEntry.clock_in)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">Lunch</p>
                  <p className="mt-0.5 text-xs font-extrabold text-foreground">{formatTimeRange(selectedEntry.lunch_start, selectedEntry.lunch_end)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">Out</p>
                  <p className="mt-0.5 text-xs font-extrabold text-foreground">{formatTime(selectedEntry.clock_out)}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-emerald-800">Paid</p>
                  <p className="mt-0.5 text-xs font-black text-emerald-950">{formatHours(selectedEntry.paid_hours)}</p>
                </div>
              </div>
            )}

            {!editing && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">Normal (NT)</p>
                  <p className="mt-0.5 text-xs font-extrabold text-foreground">{formatHours(selectedEntry.normal_hours)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-700">Overtime</p>
                  <p className="mt-0.5 text-xs font-black text-slate-900">{formatHours(selectedEntry.overtime_hours)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">Lunch Break</p>
                  <p className="mt-0.5 text-xs font-extrabold text-foreground">{formatHours(selectedEntry.lunch_hours)}</p>
                </div>
              </div>
            )}

            {editing ? (
              <div>
                <p className="leading-none text-[9px] text-muted">Notes</p>
                <textarea name="notes" defaultValue={selectedEntry.notes ?? ""} onChange={(e) => handleTimeChange("notes", e.target.value)} rows={1} className="mt-1 w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none" />
              </div>
            ) : selectedEntry.notes ? (
              <div className="border-t border-border pt-3">
                <p className="leading-none text-[9px] text-muted">Notes</p>
                <p className="mt-1 text-xs text-foreground">{selectedEntry.notes}</p>
              </div>
            ) : null}

            {selectedEntry.warning_notes ? (
              <div className="border-t border-border pt-3">
                <p className="leading-none text-[9px] text-warning">Note</p>
                <p className="mt-1 text-xs text-warning">{selectedEntry.warning_notes}</p>
              </div>
            ) : null}

            <div className="border-t border-border pt-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                <MapPin className="size-3 text-accent" />
                Location history
              </p>
              {selectedEntry.locationEvents.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  No location events were captured for this shift.
                </p>
              ) : (
                <div className="mt-2 divide-y divide-border">
                  {selectedEntry.locationEvents.map((event) => (
                    <div key={event.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="shrink-0 capitalize font-semibold text-foreground">
                        {event.event_type.replaceAll("_", " ")}
                      </span>
                      <span className="shrink-0 text-muted">{formatTime(event.local_event_time)}</span>
                      <span className="min-w-0 truncate text-muted">
                        {event.workstationName ?? "No workstation"}
                        {event.distance_meters !== null ? ` ${Math.round(event.distance_meters)}m` : ""}
                      </span>
                      <span
                        className={`ml-auto shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${geofenceClass(event.geofence_status)}`}
                      >
                        {geofenceLabel(event.geofence_status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedEntry.status === "submitted" && employeeSubmitted.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-border bg-background">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                    <ClipboardCheck className="size-3 text-accent" />
                    {employeeSubmitted.length} submitted
                  </p>
                  {employeeSubmitted.length > 1 ? (
                    <span className="flex shrink-0 gap-2 text-[10px] font-semibold text-muted">
                      <button
                        type="button"
                        onClick={() => setAllApprovalSelection(true)}
                        className="underline-offset-2 hover:text-accent hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllApprovalSelection(false)}
                        className="underline-offset-2 hover:text-accent hover:underline"
                      >
                        Deselect
                      </button>
                    </span>
                  ) : null}
                </div>
                <form action={approvalAction} className="grid gap-2 p-2.5">
                  <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-surface">
                    {employeeSubmitted.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-start gap-2 border-b border-border px-2 py-1.5 text-xs last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          name="time_entry_ids"
                          value={entry.id}
                          checked={selectedApprovalIds.has(entry.id)}
                          onChange={() => toggleApprovalId(entry.id)}
                          className="mt-0.5 size-3.5 shrink-0 accent-current"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-foreground">
                              {formatDate(entry.work_date)}
                            </span>
                            <span className="shrink-0 font-semibold text-foreground">
                              {formatHours(entry.paid_hours)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-muted">
                            {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                            {Number(entry.overtime_hours ?? 0) > 0
                              ? ` + ${formatHours(entry.overtime_hours)} OT`
                              : ""}
                            {entry.missing_clocking ||
                              entry.late_arrival ||
                              entry.early_departure
                              ? " · needs review"
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    name="approval_notes"
                    rows={1}
                    placeholder="Approval note (optional)"
                    className="w-full resize-none rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      name="decision"
                      value="reject"
                      disabled={approvalPending || selectedApprovalIds.size === 0}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded border border-danger/30 bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
                    >
                      <XCircle className="size-3.5 shrink-0" />
                      {approvalPending ? "Working..." : "Reject"}
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="approve"
                      disabled={approvalPending || selectedApprovalIds.size === 0}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      {approvalPending ? "Working..." : "Approve"}
                    </button>
                  </div>
                  {approvalState.message ? (
                    <p
                      className={`text-[11px] ${approvalState.ok ? "text-success" : "text-danger"
                        }`}
                    >
                      {approvalState.message}
                    </p>
                  ) : null}
                </form>
              </div>
            ) : null}

            {!editing ? (
              <div className="border-t border-border pt-3">
                <form
                  action={forceDeleteAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                  className="flex items-center justify-between"
                >
                  <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                  <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                  <button
                    disabled={forceDeletePending}
                    className="inline-flex min-h-10 items-center gap-1 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]"
                  >
                    <Trash2 className="size-3 shrink-0" />
                    {forceDeletePending ? "..." : "Delete entry"}
                  </button>
                  {forceDeleteState.message ? (
                    <span className={`text-[11px] ${forceDeleteState.ok ? "text-success" : "text-danger"}`}>
                      {forceDeleteState.message}
                    </span>
                  ) : null}
                </form>
              </div>
            ) : null}

            {editing && canEdit(selectedEntry.status) ? (
              <div className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2.5 py-1.5">
                <form
                  action={deleteAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                >
                  <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                  <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                  <button
                    disabled={deletePending}
                    className="inline-flex min-h-10 items-center gap-1 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]"
                  >
                    <Trash2 className="size-3 shrink-0" />
                    {deletePending ? "..." : "Delete"}
                  </button>
                </form>
                <form
                  action={updateAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                  className="flex items-center gap-1"
                >
                  <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                  <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                  <input type="hidden" name="clock_in" value={editedTimes.clock_in ?? ""} />
                  <input type="hidden" name="lunch_start" value={editedTimes.lunch_start ?? ""} />
                  <input type="hidden" name="lunch_end" value={editedTimes.lunch_end ?? ""} />
                  <input type="hidden" name="clock_out" value={editedTimes.clock_out ?? ""} />
                  <input type="hidden" name="notes" value={editedTimes.notes ?? ""} />
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setEditedTimes({}); }}
                    className="inline-flex min-h-10 items-center justify-center rounded border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={updatePending}
                    className="inline-flex min-h-10 items-center justify-center rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]"
                  >
                    {updatePending ? "..." : "Save"}
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : null}
      </ViewportSidebar>
    </section>
  );
}
