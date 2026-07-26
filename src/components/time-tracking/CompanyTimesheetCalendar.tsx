"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import type { DayCellMountArg } from "@fullcalendar/core";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Clock3,
  FileText,
  LocateFixed,
  MapPin,
  Pencil,
  Timer,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  createManagedDraftTimeEntry,
  deleteManagedDraftTimeEntry,
  loadManagedLeaveRequestsToTimesheets,
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
    <div className="grid min-w-0 gap-0.5 text-[11px] leading-4">
      <span className="truncate font-semibold">{displayName(entry)}</span>
      <span className="truncate opacity-75">
        {Number(entry.paid_hours ?? 0).toFixed(2)}h
        {Number(entry.overtime_hours ?? 0) > 0
          ? ` + ${Number(entry.overtime_hours).toFixed(2)}h OT`
          : ""}
      </span>
    </div>
  );
}

function TimeInput({
  name,
  value,
  editable,
  onChange,
}: {
  name: string;
  value: string | null;
  editable: boolean;
  onChange: (name: string, value: string) => void;
}) {
  if (!editable) {
    return <span className="mt-1 font-semibold text-foreground">{formatTime(value)}</span>;
  }

  return (
    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
      <Clock className="size-4 shrink-0 text-muted" />
      <input
        type="time"
        name={name}
        defaultValue={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
      />
    </span>
  );
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
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>("month");
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
          <p className="mt-1 text-sm text-muted">
            Click a date to create timesheets or load leave. Click an existing entry to view or edit.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:w-130">
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

        <div className="mb-3 flex flex-wrap gap-2">
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
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${viewButtonClass(calendarWindow === value)}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">
            <span className="size-2 rounded-full bg-accent" />
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
            <div ref={calendarRef} className="cw-timesheet-calendar">
              <FullCalendar
                key={`${calendarWindow}-${calendarFocusDate}`}
                dayMaxEventRows={3}
                dayMaxEvents={2}
                eventClassNames={(arg) => {
                  const entry = arg.event.extendedProps.entry as
                    | CompanyTimesheetCalendarEntry
                    | undefined;

                  return entry ? statusClass(entry.status) : ["cw-calendar-holiday"];
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
                      entry.branchName ? entry.branchName : "",
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
                    dayMaxEventRows: 3,
                  },
                  dayGridWeek: {
                    dayMaxEventRows: 6,
                  },
                }}
              />
            </div>
            {(tooltip ?? dayTooltip) ? (
              <div
                className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-lg"
                style={{ left: (tooltip ?? dayTooltip)!.x, top: (tooltip ?? dayTooltip)!.y }}
              >
                {(tooltip ?? dayTooltip)!.content}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted">
            No company timesheets have been recorded for the current year yet.
          </div>
        )}
      </div>

      {/* Date action modal */}
      {showDateActions ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
          <div className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-border bg-surface shadow-2xl animate-slide-in-right">
            <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  {selectedDate}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">
                  {existingEntriesForDate.length} {existingEntriesForDate.length === 1 ? "entry" : "entries"}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {existingEntriesForDate.length > 0
                    ? "Click an entry to view or edit its details."
                    : "No entries for this date yet."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDateActions}
                className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4">
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
                        onClick={() => { setSelectedEntry(entry); setSelectedDate(""); setShowDateActions(false); }}
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
                              {request.employeeName} ({request.employeeNumber})
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
                                  {request.employeeName} ({request.employeeNumber})
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
            </div>
          </div>
        </div>
      ) : null}

      {/* Entry detail/edit modal */}
      {selectedEntry ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
          <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-surface shadow-2xl animate-slide-in-right">
            <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                    Timesheet
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadgeClass(selectedEntry.status)}`}
                  >
                    {selectedEntry.status}
                  </span>
                </div>
                <h3 className="mt-1 text-xl font-semibold text-foreground">
                  {displayName(selectedEntry)}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {selectedEntry.employeeNumber} - {selectedEntry.branchName ?? "No branch"} -{" "}
                  {selectedEntry.work_date}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit(selectedEntry.status) && !editing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-accent/10 hover:text-accent"
                    aria-label="Edit timesheet"
                  >
                    <Pencil className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeEntryModal}
                  className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground"
                  aria-label="Close timesheet details"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4">
              {/* Editable time fields */}
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Clock in</p>
                  {editing ? (
                    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                      <Clock className="size-4 shrink-0 text-muted" />
                      <input
                        type="time"
                        name="clock_in"
                        defaultValue={selectedEntry.clock_in ?? ""}
                        onChange={(e) => handleTimeChange("clock_in", e.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                      />
                    </span>
                  ) : (
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(selectedEntry.clock_in)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Lunch start</p>
                  {editing ? (
                    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                      <Clock className="size-4 shrink-0 text-muted" />
                      <input
                        type="time"
                        name="lunch_start"
                        defaultValue={selectedEntry.lunch_start ?? ""}
                        onChange={(e) => handleTimeChange("lunch_start", e.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                      />
                    </span>
                  ) : (
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(selectedEntry.lunch_start)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Lunch end</p>
                  {editing ? (
                    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                      <Clock className="size-4 shrink-0 text-muted" />
                      <input
                        type="time"
                        name="lunch_end"
                        defaultValue={selectedEntry.lunch_end ?? ""}
                        onChange={(e) => handleTimeChange("lunch_end", e.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                      />
                    </span>
                  ) : (
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(selectedEntry.lunch_end)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Clock out</p>
                  {editing ? (
                    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                      <Clock className="size-4 shrink-0 text-muted" />
                      <input
                        type="time"
                        name="clock_out"
                        defaultValue={selectedEntry.clock_out ?? ""}
                        onChange={(e) => handleTimeChange("clock_out", e.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                      />
                    </span>
                  ) : (
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(selectedEntry.clock_out)}
                    </p>
                  )}
                </div>
              </div>

              {/* Notes field (editable) */}
              {editing ? (
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Notes</p>
                  <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
                    <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                    <textarea
                      name="notes"
                      defaultValue={selectedEntry.notes ?? ""}
                      onChange={(e) => handleTimeChange("notes", e.target.value)}
                      rows={2}
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                    />
                  </span>
                </div>
              ) : selectedEntry.notes ? (
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Notes</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedEntry.notes}</p>
                </div>
              ) : null}

              {/* Hours stats */}
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Timer className="size-3.5" />
                    NT
                  </p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatHours(selectedEntry.normal_hours)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">OT</p>
                  <p className="mt-1 font-semibold text-warning">
                    {formatHours(selectedEntry.overtime_hours)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Paid leave</p>
                  <p className="mt-1 font-semibold text-accent">
                    {formatHours(selectedEntry.paidTimeOffHours)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted">Lunch break</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatHours(selectedEntry.lunch_hours)}
                  </p>
                </div>
              </div>

              {selectedEntry.warning_notes ? (
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                  <p className="text-xs text-warning">Calculation note</p>
                  <p className="mt-1 text-sm font-medium text-warning">
                    {selectedEntry.warning_notes}
                  </p>
                </div>
              ) : null}

              {/* Location history (read-only) */}
              <div className="rounded-md border border-border bg-background">
                <div className="border-b border-border px-3 py-3">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    <MapPin className="size-4 text-accent" />
                    Location history
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {selectedEntry.locationEvents.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted">
                      No location events were captured for this shift.
                    </p>
                  ) : (
                    selectedEntry.locationEvents.map((event) => (
                      <div key={event.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[150px_1fr_auto] sm:items-center">
                        <div>
                          <p className="text-sm font-semibold capitalize text-foreground">
                            {event.event_type.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-xs text-muted">{formatTime(event.local_event_time)}</p>
                        </div>
                        <div className="min-w-0 text-xs text-muted">
                          <p className="truncate">
                            {event.workstationName ?? "No workstation"}
                            {event.distance_meters !== null
                              ? ` - ${Math.round(event.distance_meters)}m from workstation`
                              : ""}
                          </p>
                          <p className="mt-1 truncate">
                            {event.latitude !== null && event.longitude !== null
                              ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`
                              : "No coordinates captured"}
                            {event.accuracy_meters !== null
                              ? ` - +/-${Math.round(event.accuracy_meters)}m`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-max items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${geofenceClass(event.geofence_status)}`}
                        >
                          <LocateFixed className="size-3.5" />
                          {geofenceLabel(event.geofence_status)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Edit action bar */}
              {editing && canEdit(selectedEntry.status) ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-3">
                  <form
                    action={deleteAction}
                    onSubmit={() => {
                      setTimeout(closeEntryModal, 100);
                    }}
                  >
                    <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                    <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                    <button
                      disabled={deletePending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                      {deletePending ? "Deleting..." : "Delete draft"}
                    </button>
                  </form>
                  <form
                    action={updateAction}
                    onSubmit={() => {
                      setTimeout(closeEntryModal, 100);
                    }}
                    className="flex items-center gap-2"
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
                      onClick={() => {
                        setEditing(false);
                        setEditedTimes({});
                      }}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={updatePending}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {updatePending ? "Saving..." : "Save changes"}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
