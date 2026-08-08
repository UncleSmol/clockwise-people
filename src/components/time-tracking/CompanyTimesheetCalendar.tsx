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
  CompanyPublicHoliday,
  CompanyTimesheetCalendarEntry,
} from "@/lib/time-tracking/schema";

type CompanyTimesheetCalendarProps = {
  employees: CompanyCalendarEmployeeOption[];
  entries: CompanyTimesheetCalendarEntry[];
  leaveRequests: CompanyCalendarLeaveRequest[];
  publicHolidays: CompanyPublicHoliday[];
};

const initialActionState = {
  ok: true,
  message: "",
};

type CalendarWindow = "day" | "week" | "payroll" | "month";

function viewButtonClass(active: boolean) {
  return active
    ? "bg-primary text-primary-foreground"
    : "border border-border bg-background text-foreground";
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

function statusClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return ["cw-company-timesheet-event", "cw-calendar-draft"];
  if (status === "approved") return ["cw-company-timesheet-event", "cw-calendar-approved"];
  if (status === "rejected") return ["cw-company-timesheet-event", "cw-calendar-rejected"];
  if (status === "locked") return ["cw-company-timesheet-event", "cw-calendar-locked"];
  return ["cw-company-timesheet-event", "cw-calendar-submitted"];
}

function statusBadgeClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return "border-warning/30 bg-warning/10 text-warning";
  if (status === "approved") return "border-success/30 bg-success/10 text-success";
  if (status === "rejected") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "locked") return "border-muted/30 bg-muted/10 text-muted";
  return "border-primary/30 bg-primary/10 text-primary";
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
}: CompanyTimesheetCalendarProps) {
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
  const dayEventsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of publicHolidays) {
      const prev = map.get(h.holiday_date) ?? [];
      prev.push(h.name);
      map.set(h.holiday_date, prev);
    }
    for (const e of entries) {
      const prev = map.get(e.work_date) ?? [];
      prev.push(displayName(e));
      map.set(e.work_date, prev);
    }
    return map;
  }, [entries, publicHolidays]);

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
        entry.employee_id === selectedEntry.employee_id && entry.status === "submitted",
    );
  }, [entries, selectedEntry]);

  const events = useMemo<EventInput[]>(
    () => {
      const holidayEvents = publicHolidays.map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));
      const timesheetEvents = entries.map((entry) => ({
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
    [entries, publicHolidays],
  );

  const totals = useMemo(
    () => ({
      approved: entries.filter((entry) => entry.status === "approved").length,
      issues: entries.filter(
        (entry) => entry.missing_clocking || entry.late_arrival || entry.early_departure,
      ).length,
      submitted: entries.filter((entry) => entry.status === "submitted").length,
      total: entries.length,
    }),
    [entries],
  );

  const existingEntriesForDate = useMemo(() => {
    if (!selectedDate) return [];
    return entries.filter((e) => e.work_date === selectedDate);
  }, [entries, selectedDate]);

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
    <section className="card">
      <div className="grid gap-3 border-b border-border px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Company calendar
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Timesheet calendar</h2>
          <p className="mt-1 text-sm text-muted max-sm:hidden">
            Click a date to create timesheets or load leave. Click an existing entry to view or edit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-130">
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <CalendarDays className="size-4" />
              Total
            </div>
            <p className="mt-1 font-semibold text-foreground">{totals.total}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Clock3 className="size-4" />
              Submitted
            </div>
            <p className="mt-1 font-semibold text-foreground">{totals.submitted}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="text-xs text-muted">Approved</div>
            <p className="mt-1 font-semibold text-success">{totals.approved}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <AlertTriangle className="size-4" />
              Issues
            </div>
            <p className="mt-1 font-semibold text-danger">{totals.issues}</p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4">
        {globalMessage ? (
          <div
            className={`mb-3 rounded-md border px-3 py-2 text-sm font-medium ${
              globalOk
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {globalMessage}
          </div>
        ) : null}

        <div className="mb-3 hidden sm:flex sm:flex-wrap sm:gap-2">
          {([
            ["day", "Daily"],
            ["week", "Weekly"],
            ["payroll", "Payroll period"],
            ["month", "Monthly"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCalendarWindow(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold max-sm:px-2 max-sm:py-1 max-sm:text-[0.625rem] ${viewButtonClass(calendarWindow === value)}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted sm:hidden"
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
          className={`mb-3 flex flex-wrap gap-2 text-xs font-semibold ${showLegend ? "" : "hidden sm:flex"}`}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-holiday/30 bg-holiday/10 px-2.5 py-1 text-holiday">
            <span className="size-2 rounded-full bg-holiday" />
            Public holiday
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-warning">
            <span className="size-2 rounded-full bg-warning" />
            Draft
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
            <span className="size-2 rounded-full bg-primary" />
            Submitted
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
            <span className="size-2 rounded-full bg-success" />
            Approved
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-danger">
            <span className="size-2 rounded-full bg-danger" />
            Rejected
          </span>
        </div>

        {events.length > 0 || publicHolidays.length > 0 ? (
          <>
            <div ref={calendarRef} className="cw-timesheet-calendar max-sm:hidden">
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
                    let y = rect.top - 8;
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
                  },
                  dayGridMonth: {
                    dayMaxEventRows: 6,
                  },
                  dayGridWeek: {
                    dayMaxEventRows: 6,
                  },
                }}
              />
            </div>

            <div className="hidden max-sm:block">
              <div className="flex items-center gap-3">
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

              <div className="mt-3 space-y-2">
                {publicHolidays
                  .filter((h) => h.holiday_date === calendarFocusDate)
                  .map((holiday) => (
                    <div
                      key={`holiday-${holiday.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-holiday/30 bg-holiday/10 px-3 py-2.5"
                    >
                      <span className="text-sm font-semibold text-holiday">{holiday.name}</span>
                      <span className="rounded-full border border-holiday/20 bg-holiday/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-holiday">
                        Holiday
                      </span>
                    </div>
                  ))}
                {entries
                  .filter((e) => e.work_date === calendarFocusDate)
                  .map((entry) => (
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
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        entry.missing_clocking || entry.late_arrival || entry.early_departure
                          ? "border-danger/30 bg-danger/[0.07]"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {displayName(entry)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {formatHours(entry.paid_hours)}
                            {Number(entry.overtime_hours ?? 0) > 0
                              ? ` +${formatHours(entry.overtime_hours)}`
                              : ""}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(entry.status)}`}
                          >
                            {entry.status}
                          </span>
                        </div>
                      </div>
                      {entry.warning_notes || entry.notes ? (
                        <p className="mt-1 truncate text-xs text-muted">
                          {entry.warning_notes || entry.notes}
                        </p>
                      ) : null}
                    </button>
                  ))}
                {entries.filter((e) => e.work_date === calendarFocusDate).length === 0 &&
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-semibold text-muted"
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

      {/* Date action modal */}
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
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4"
      >
        {/* Create draft section */}
        <form action={createAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
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
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted"
                >
                  <span className={statusBadgeClass(entry.status)}>
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

        {/* Load approved leave section */}
        <form action={loadLeaveAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
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

      {/* Entry detail/edit modal */}
      <ViewportSidebar
        open={Boolean(selectedEntry)}
        onClose={closeEntryModal}
        maxWidth="max-w-md"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <span>Timesheet</span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${selectedEntry ? statusBadgeClass(selectedEntry.status) : ""}`}
            >
              {selectedEntry?.status}
            </span>
          </span>
        }
        title={selectedEntry ? displayName(selectedEntry) : ""}
        description={
          selectedEntry
            ? `${selectedEntry.workstationName ?? "No workstation"} - ${selectedEntry.work_date}`
            : ""
        }
        actions={
          selectedEntry && canEdit(selectedEntry.status) && !editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="grid size-10 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-accent/10 hover:text-accent"
              aria-label="Edit timesheet"
            >
              <Pencil className="size-4" />
            </button>
          ) : null
        }
        bodyClassName="flex flex-col overflow-y-auto px-3 py-2"
      >
        {selectedEntry ? (
          <>
            {/* Editable time fields */}
            {editing ? (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(["clock_in","lunch_start","lunch_end","clock_out"] as const).map((field) => (
                  <div key={field} className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                    <p className="text-[10px] text-muted leading-none">{field === "clock_in" ? "In" : field === "clock_out" ? "Out" : field.replace("_"," ")}</p>
                    <input
                      type="time"
                      name={field}
                      defaultValue={selectedEntry[field] ?? ""}
                      onChange={(e) => handleTimeChange(field, e.target.value)}
                      className="h-6 w-full bg-transparent text-xs text-foreground outline-none sm:h-6"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-0.5 text-muted pr-4">Clock in</td><td className="font-semibold text-foreground">{formatTime(selectedEntry.clock_in)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">Lunch</td><td className="font-semibold text-foreground">{formatTimeRange(selectedEntry.lunch_start, selectedEntry.lunch_end)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">Clock out</td><td className="font-semibold text-foreground">{formatTime(selectedEntry.clock_out)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">Paid</td><td className="font-semibold text-foreground">{formatHours(selectedEntry.paid_hours)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">NT</td><td className="font-semibold text-foreground">{formatHours(selectedEntry.normal_hours)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">OT</td><td className="font-semibold text-warning">{formatHours(selectedEntry.overtime_hours)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">Paid leave</td><td className="font-semibold text-accent">{formatHours(selectedEntry.paidTimeOffHours)}</td></tr>
                  <tr><td className="py-0.5 text-muted pr-4">Lunch break</td><td className="font-semibold text-foreground">{formatHours(selectedEntry.lunch_hours)}</td></tr>
                </tbody>
              </table>
            )}

            {/* Notes */}
            {editing ? (
              <div className="mt-2">
                <p className="text-[9px] text-muted leading-none">Notes</p>
                <textarea name="notes" defaultValue={selectedEntry.notes ?? ""} onChange={(e) => handleTimeChange("notes", e.target.value)} rows={1} className="mt-1 w-full rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none resize-none" />
              </div>
            ) : selectedEntry.notes ? (
              <div className="mt-2 border-t border-border pt-2">
                <p className="text-[9px] text-muted leading-none">Notes</p>
                <p className="mt-0.5 text-xs text-foreground">{selectedEntry.notes}</p>
              </div>
            ) : null}

            {selectedEntry.warning_notes ? (
              <div className="mt-2 border-t border-border pt-2">
                <p className="text-[9px] text-warning leading-none">Note</p>
                <p className="mt-0.5 text-xs text-warning">{selectedEntry.warning_notes}</p>
              </div>
            ) : null}

            {/* Location history */}
            <div className="mt-2 border-t border-border pt-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                <MapPin className="size-3 text-accent" />
                Location history
              </p>
              {selectedEntry.locationEvents.length === 0 ? (
                <p className="mt-1 text-xs text-muted">
                  No location events were captured for this shift.
                </p>
              ) : (
                <div className="mt-1 divide-y divide-border">
                  {selectedEntry.locationEvents.map((event) => (
                    <div key={event.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="font-semibold capitalize text-foreground shrink-0">
                        {event.event_type.replaceAll("_", " ")}
                      </span>
                      <span className="text-muted shrink-0">{formatTime(event.local_event_time)}</span>
                      <span className="text-muted truncate min-w-0">
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

            {/* Bulk approval for submitted entries */}
            {selectedEntry.status === "submitted" && employeeSubmitted.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
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
                      className={`text-[11px] ${
                        approvalState.ok ? "text-success" : "text-danger"
                      }`}
                    >
                      {approvalState.message}
                    </p>
                  ) : null}
                </form>
              </div>
            ) : null}

            {/* Delete action (always available) */}
            {!editing ? (
              <div className="mt-2 border-t border-border pt-2">
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

            {/* Edit action bar */}
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
