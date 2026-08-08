"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventInput, DayCellMountArg } from "@fullcalendar/core";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Clock3,
  ClipboardCheck,
  Edit3,
  FileQuestion,
  FileText,
  LocateFixed,
  LogOut,
  MapPin,
  Plus,
  Save,
  Send,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useActionState, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import {
  createPastDraftTimeEntry,
  deleteDraftTimeEntry,
  saveDraftTimeEntry,
  submitSelectedTimesheets,
  submitTimesheetCorrection,
} from "@/lib/time-tracking/actions";
import type {
  CompanyPublicHoliday,
  TimeEntryRecord,
  TimesheetCorrectionRequest,
} from "@/lib/time-tracking/schema";
import { usePanel, useWorkspaceSection } from "@/components/dashboard/workspace-context";

type EmployeeTimesheetCorrectionsProps = {
  collapsedCalendar?: boolean;
  correctionRequests: TimesheetCorrectionRequest[];
  currentWorkDate: string;
  entries: TimeEntryRecord[];
  publicHolidays: CompanyPublicHoliday[];
};

type CorrectionActionState = {
  ok: boolean;
  message: string;
};

const initialState: CorrectionActionState = {
  ok: true,
  message: "",
};

type CalendarWindow = "day" | "week" | "payroll" | "month";

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string | null) {
  if (!value) return "Not recorded";

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

function entryNeedsAttention(entry: TimeEntryRecord) {
  return Boolean(
    entry.missing_clocking ||
      entry.late_arrival ||
      entry.early_departure ||
      (entry.clock_in && Number(entry.paid_hours) <= 0),
  );
}

function extractManagerNote(notes: string | null | undefined) {
  if (!notes) return null;
  const match = notes.match(/Manager note:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not recorded";
  if (start && !end) return `${formatTime(start)} - active`;
  if (!start && end) return `Started before ${formatTime(end)}`;
  return `${formatTime(start)} - ${formatTime(end)}`;
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

function inputTime(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function statusClass(status: TimesheetCorrectionRequest["status"]) {
  if (status === "submitted") return "bg-warning/10 text-warning";
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  return "bg-surface-muted text-foreground";
}

function geofenceLabel(status: string | null | undefined) {
  if (status === "in_range") return "In range";
  if (status === "out_of_range") return "Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null | undefined) {
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "no_location") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-surface-muted text-muted";
}

function renderLocationHistory(entry: TimeEntryRecord) {
  const events = entry.locationEvents ?? [];

  return (
    <details className="rounded-md border border-border/70 bg-surface/80">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
        <MapPin className="size-4 text-accent" />
        Location history ({events.length})
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {events.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted">
            No location events were captured for this shift.
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="grid gap-2 px-3 py-2 sm:grid-cols-[130px_1fr_auto] sm:items-center"
            >
              <div>
                <p className="font-semibold capitalize text-foreground">
                  {event.event_type.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatTime(event.local_event_time)}
                </p>
              </div>
              <div className="min-w-0 text-xs text-muted">
                <p className="truncate">
                  {event.workstationName ?? "No workstation"}
                  {event.distance_meters !== null
                    ? ` - ${Math.round(event.distance_meters)}m away`
                    : ""}
                </p>
                <p className="mt-1 truncate">
                  {event.latitude !== null && event.longitude !== null
                    ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`
                    : "No coordinates"}
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
    </details>
  );
}

function timesheetCalendarClass(entry: TimeEntryRecord, isHoliday: boolean) {
  if (isHoliday) return "cw-calendar-holiday-booked";
  if (entry.status === "draft") return "cw-calendar-draft";
  if (entry.status === "approved") return "cw-calendar-approved";
  if (entry.status === "rejected") return "cw-calendar-rejected";
  if (entry.status === "locked") return "cw-calendar-locked";
  return "cw-calendar-submitted";
}

function weekStartDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function viewButtonClass(active: boolean) {
  return active
    ? "bg-primary text-primary-foreground"
    : "border border-border bg-background text-foreground";
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatter = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function groupByWeek(entries: TimeEntryRecord[]) {
  const groups = new Map<string, { entries: TimeEntryRecord[]; label: string }>();

  entries.forEach((entry) => {
    const start = weekStartDate(entry.work_date);
    const key = dateKey(start);
    const existing = groups.get(key);

    if (existing) {
      existing.entries.push(entry);
      return;
    }

    groups.set(key, {
      entries: [entry],
      label: weekLabel(start),
    });
  });

  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    ...group,
  }));
}

export default function EmployeeTimesheetCorrections({
  collapsedCalendar = false,
  correctionRequests,
  currentWorkDate,
  entries,
  publicHolidays,
}: EmployeeTimesheetCorrectionsProps) {
  const [activeTab, setActiveTab] = useState<"timesheets" | "requests">("timesheets");
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>("month");
  const section = useWorkspaceSection();
  const { openPanel } = usePanel();

  useLayoutEffect(() => {
    if (window.innerWidth < 640) {
      setCalendarWindow("day");
    } else if (window.innerWidth < 768) {
      setCalendarWindow("week");
    }
  }, []);

  const [showLegend, setShowLegend] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [detailEntry, setDetailEntry] = useState<TimeEntryRecord | null>(null);
  const [calendarFocusDate, setCalendarFocusDate] = useState(currentWorkDate);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [acknowledgedFlags, setAcknowledgedFlags] = useState(false);
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
      const isHoliday = Boolean(e.notes?.startsWith("Public holiday:"));
      const label = isHoliday ? "Public holiday" : `${e.status} - ${formatHours(e.paid_hours)}`;
      prev.push(label);
      map.set(e.work_date, prev);
    }
    return map;
  }, [entries, publicHolidays]);
  const [createState, createAction, createPending] = useActionState(
    createPastDraftTimeEntry,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDraftTimeEntry,
    initialState,
  );
  const [correctionState, correctionAction, correctionPending] = useActionState(
    submitTimesheetCorrection,
    initialState,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveDraftTimeEntry,
    initialState,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitSelectedTimesheets,
    initialState,
  );
  const latestRequestByEntry = useMemo(() => {
    const requests = new Map<string, TimesheetCorrectionRequest>();

    correctionRequests.forEach((request) => {
      if (!requests.has(request.time_entry_id)) {
        requests.set(request.time_entry_id, request);
      }
    });

    return requests;
  }, [correctionRequests]);
  const entriesByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.work_date, entry])),
    [entries],
  );
  const holidayDates = useMemo(
    () => new Set(publicHolidays.map((holiday) => holiday.holiday_date)),
    [publicHolidays],
  );
  const calendarEvents = useMemo<EventInput[]>(() => {
    const timesheetEvents = entries.map((entry) => {
      const isHoliday = Boolean(entry.notes?.startsWith("Public holiday:"));
      const needsAttention = entry.missing_clocking || entry.late_arrival || entry.early_departure;

      return {
        id: entry.id,
        title: isHoliday
          ? "Public holiday"
          : `${entry.status} - ${formatHours(entry.paid_hours)}`,
        start: entry.work_date,
        allDay: true,
        classNames: [
          timesheetCalendarClass(entry, isHoliday),
          needsAttention ? "cw-calendar-attention" : "",
        ],
        extendedProps: { entry },
      };
    });
    const entryDates = new Set(entries.map((entry) => entry.work_date));
    const holidayEvents = publicHolidays
      .filter((holiday) => !entryDates.has(holiday.holiday_date))
      .map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));

    return [...holidayEvents, ...timesheetEvents];
  }, [entries, publicHolidays]);
  const editableEntries = entries.filter((entry) => entry.status === "draft" || entry.status === "rejected");
  const submittedEntries = entries.filter((entry) => entry.status !== "draft" && entry.status !== "rejected");
  const handleRangeSelect = (entryId: string) => {
    setAcknowledgedFlags(false);

    if (!rangeAnchorId) {
      setRangeAnchorId(entryId);
      setSelectedEntryIds(new Set([entryId]));
      return;
    }

    const anchorIndex = editableEntries.findIndex((entry) => entry.id === rangeAnchorId);
    const targetIndex = editableEntries.findIndex((entry) => entry.id === entryId);

    if (anchorIndex === -1 || targetIndex === -1) {
      setRangeAnchorId(entryId);
      setSelectedEntryIds(new Set([entryId]));
      return;
    }

    const [start, end] = [
      Math.min(anchorIndex, targetIndex),
      Math.max(anchorIndex, targetIndex),
    ];
    const rangeIds = editableEntries.slice(start, end + 1).map((entry) => entry.id);
    setSelectedEntryIds(new Set(rangeIds));
    setRangeAnchorId(null);
  };
  const clearSelection = () => {
    setSelectedEntryIds(new Set());
    setRangeAnchorId(null);
    setAcknowledgedFlags(false);
  };
  const flaggedSelected = editableEntries.filter(
    (entry) => selectedEntryIds.has(entry.id) && entryNeedsAttention(entry),
  );
  const hasFlaggedSelected = flaggedSelected.length > 0;
  const hasRejectedSelected = editableEntries.some(
    (entry) => selectedEntryIds.has(entry.id) && entry.status === "rejected",
  );
  const submitBlocked =
    selectedEntryIds.size === 0 || (hasFlaggedSelected && !acknowledgedFlags);
  const message =
    createState.message ||
    deleteState.message ||
    correctionState.message ||
    saveState.message ||
    submitState.message;
  const messageOk = createState.message
    ? createState.ok
    : deleteState.message
      ? deleteState.ok
      : correctionState.message
        ? correctionState.ok
        : saveState.message
          ? saveState.ok
          : submitState.ok;
  const shouldGroupWeeks = entries.length >= 7;
  const weekGroups = useMemo(
    () => groupByWeek(entries),
    [entries],
  );
  const selectedEntry = selectedDate ? entriesByDate.get(selectedDate) : null;
  const selectedIsHoliday = selectedDate ? holidayDates.has(selectedDate) : false;
  const selectedCanAdd =
    Boolean(selectedDate) &&
    selectedDate < currentWorkDate &&
    !selectedEntry &&
    !selectedIsHoliday;
  const handleDateClick = (arg: DateClickArg) => {
    setSelectedDate(arg.dateStr);
    setCalendarFocusDate(arg.dateStr);
  };
  const handleEventClick = (arg: EventClickArg) => {
    const entry = arg.event.extendedProps.entry as TimeEntryRecord | undefined;
    if (entry) {
      setCalendarFocusDate(entry.work_date);
      setDetailEntry(entry);
    }
  };
  const payrollRangeLabel = useMemo(() => {
    const payrollStart = dateKey(weekStartDate(calendarFocusDate));
    const payrollEnd = addDays(payrollStart, 13);
    return `${formatDate(payrollStart)} - ${formatDate(payrollEnd)}`;
  }, [calendarFocusDate]);

  const renderTimesheetEntry = (entry: TimeEntryRecord) => {
    const editable = entry.status === "draft" || entry.status === "rejected";
    const rejected = entry.status === "rejected";
    const hasWarning = entry.missing_clocking || entry.late_arrival || entry.early_departure || rejected;
    const managerNote = extractManagerNote(entry.notes);

    return (
      <article
        key={entry.id}
        className={`grid gap-3 rounded-md border p-3 text-sm shadow-sm ${
          hasWarning
            ? "border-danger/30 bg-danger/10"
            : "border-success/30 bg-success/10"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            {hasWarning ? (
              <AlertTriangle className="size-4 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            )}
            <span className="truncate">{formatDate(entry.work_date)}</span>
          </p>
          <span className="inline-flex w-max shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">
            <Clock3 className="size-3.5" />
            {formatHours(entry.paid_hours)}
          </span>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          {rejected ? "Rejected" : editable ? "Draft" : entry.status}
        </p>

        {rejected ? (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
            {managerNote
              ? `Rejected by your manager: ${managerNote}`
              : "This timesheet was rejected. Correct the times below, save, then resubmit."}
          </p>
        ) : null}

        {editable ? (
          <form action={saveAction} className="grid gap-2">
            <input type="hidden" name="time_entry_id" value={entry.id} />
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">In</span>
                <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                  <Clock className="size-4 shrink-0 text-muted" />
                  <input type="time" name="clock_in" defaultValue={inputTime(entry.clock_in)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch start</span>
                <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                  <Clock className="size-4 shrink-0 text-muted" />
                  <input type="time" name="lunch_start" defaultValue={inputTime(entry.lunch_start)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch end</span>
                <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                  <Clock className="size-4 shrink-0 text-muted" />
                  <input type="time" name="lunch_end" defaultValue={inputTime(entry.lunch_end)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Out</span>
                <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                  <Clock className="size-4 shrink-0 text-muted" />
                  <input type="time" name="clock_out" defaultValue={inputTime(entry.clock_out)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                </span>
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Note</span>
              <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
                <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                <textarea name="notes" rows={2} defaultValue={entry.notes ?? ""} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none" placeholder="Optional" />
              </span>
            </label>
            {renderLocationHistory(entry)}
            <div className="flex justify-end">
              <button
                formAction={deleteAction}
                disabled={deletePending}
                className="mr-auto inline-flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {deletePending ? "Deleting..." : "Delete"}
              </button>
              <button
                disabled={savePending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Save className="size-4" />
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-4 items-start gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
              <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                <Clock className="size-3.5 text-accent" />
                <span className="truncate text-xs font-semibold text-foreground" title={`In ${shortTime(entry.clock_in)}`}>
                  {shortTime(entry.clock_in)}
                </span>
              </span>
              <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                <UtensilsCrossed className="size-3.5 text-accent" />
                <span className="truncate text-xs font-semibold text-foreground" title={`Lunch ${shortLunch(entry.lunch_start, entry.lunch_end)}`}>
                  {shortLunch(entry.lunch_start, entry.lunch_end)}
                </span>
              </span>
              <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                <LogOut className="size-3.5 text-accent" />
                <span className="truncate text-xs font-semibold text-foreground" title={`Out ${shortTime(entry.clock_out)}`}>
                  {shortTime(entry.clock_out)}
                </span>
              </span>
              <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                {hasWarning ? (
                  <AlertTriangle className="size-3.5 text-warning" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-success" />
                )}
                <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
                  Submitted
                </span>
              </span>
            </div>
            {entry.warning_notes ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                {entry.warning_notes}
              </p>
            ) : null}
          </div>
        )}
      </article>
    );
  };

  const quickSubmitForm =
    editableEntries.length > 0 ? (
      <form action={submitAction} className="rounded-md border border-border bg-surface p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-foreground">Submit ready timesheets</p>
            <p className="mt-1 text-xs text-muted">
              Tap a start day, then tap an end day to select the whole range.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedEntryIds.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"
              >
                <X className="size-4" />
                Clear ({selectedEntryIds.size})
              </button>
            ) : null}
            <button
              disabled={submitBlocked || submitPending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Send className="size-4" />
              {submitPending
                ? "Submitting..."
                : hasRejectedSelected
                  ? "Resubmit selected"
                  : "Submit selected"}
            </button>
          </div>
        </div>

        {Array.from(selectedEntryIds).map((entryId) => (
          <input key={entryId} type="hidden" name="time_entry_ids" value={entryId} />
        ))}
        {acknowledgedFlags
          ? flaggedSelected.map((entry) => (
              <input key={`ack-${entry.id}`} type="hidden" name="acknowledged_ids" value={entry.id} />
            ))
          : null}

        {hasFlaggedSelected ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            The selected range includes timesheets that need attention:{" "}
            {flaggedSelected.map((entry) => formatDate(entry.work_date)).join(", ")}. Flag them
            below to continue.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2">
          {editableEntries.map((entry) => {
            const needsAttention = entryNeedsAttention(entry);
            const isSelected = selectedEntryIds.has(entry.id);
            const isAnchor = rangeAnchorId === entry.id;
            const isRejected = entry.status === "rejected";

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleRangeSelect(entry.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isAnchor
                    ? "border-accent bg-accent/10 text-foreground"
                    : isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : isRejected
                        ? "border-danger/30 bg-danger/[0.07] text-foreground"
                        : needsAttention
                          ? "border-danger/30 bg-danger/[0.07] text-foreground"
                          : "border-border bg-background text-foreground"
                }`}
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-muted text-muted"
                  }`}
                >
                  {isSelected ? "✓" : isAnchor ? "A" : ""}
                </span>
                <span>{formatDate(entry.work_date)}</span>
                <span
                  className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isRejected
                      ? "bg-danger/10 text-danger"
                      : needsAttention
                        ? "bg-danger/10 text-danger"
                        : "bg-success/10 text-success"
                  }`}
                >
                  {isRejected ? (
                    <X className="size-3.5" />
                  ) : needsAttention ? (
                    <AlertTriangle className="size-3.5" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  {isRejected ? "Rejected" : needsAttention ? "Check" : "Good"}
                </span>
              </button>
            );
          })}
        </div>

        {hasFlaggedSelected ? (
          <label className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={acknowledgedFlags}
              onChange={(event) => setAcknowledgedFlags(event.target.checked)}
              className="mt-0.5 size-4 accent-current"
            />
            <span>I understand the flagged days need attention and will be sent for review.</span>
          </label>
        ) : null}
      </form>
    ) : null;

  return (
    <section className="card grid min-w-0 gap-3 p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Timesheets</h2>
          <p className="mt-1 text-xs text-muted">
            Use the calendar to add past days, fix drafts, then submit when ready.
          </p>
        </div>
        <span className="w-max rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {entries.length} records
        </span>
      </div>

      {section !== "records" ? (
        <details className="grid gap-3 rounded-md border border-border bg-background p-3" open={!collapsedCalendar}>
          {collapsedCalendar ? (
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground [&::-webkit-details-marker]:hidden [&::marker]:hidden">
              <CalendarDays className="size-4 text-accent" />
              Detailed calendar
              <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">
                Expand
              </span>
            </summary>
          ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <CalendarDays className="size-4 text-accent" />
              Calendar
            </p>
            <p className="mt-1 text-xs text-muted max-sm:hidden">
              Select a past work day to create a draft timesheet. Public holidays are booked automatically.
            </p>
          </div>
          <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
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
        </div>
        {calendarWindow === "payroll" ? (
          <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-foreground">
            Payroll period anchored to the selected week: {payrollRangeLabel}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted sm:hidden"
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
          className={`flex flex-wrap gap-2 text-xs font-semibold ${showLegend ? "" : "hidden sm:flex"}`}
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
        <div ref={calendarRef} className="cw-timesheet-calendar max-sm:hidden">
          <FullCalendar
            key={`${calendarWindow}-${calendarFocusDate}`}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialDate={calendarFocusDate}
            initialView={
              calendarWindow === "day"
                ? "dayGridDay"
                : calendarWindow === "week"
                  ? "dayGridWeek"
                  : calendarWindow === "payroll"
                    ? "dayGridPayroll"
                    : "dayGridMonth"
            }
            height="auto"
            firstDay={1}
            events={calendarEvents}
            dayMaxEventRows={3}
            dayMaxEvents={2}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventMouseEnter={(info) => {
              setDayTooltip(null);
              const rect = info.el.getBoundingClientRect();
              const calRect = calendarRef.current?.getBoundingClientRect();
              const entry = info.event.extendedProps.entry as TimeEntryRecord | undefined;
              if (entry) {
                const lines = [
                  entry.status,
                  `${formatTime(entry.clock_in)} \u2192 ${formatTime(entry.clock_out)}`,
                  formatHours(entry.paid_hours),
                  entry.missing_clocking ? "Missing clocking" : "",
                  entry.late_arrival ? "Late arrival" : "",
                  entry.early_departure ? "Early departure" : "",
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
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            moreLinkClick="popover"
            views={{
              dayGridPayroll: {
                buttonText: "Payroll",
                duration: { days: 14 },
                type: "dayGrid",
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
              onClick={() => setCalendarFocusDate(currentWorkDate)}
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
              .map((entry) => {
                const isHoliday = Boolean(entry.notes?.startsWith("Public holiday:"));
                if (isHoliday) return null;
                const hasWarning = entry.missing_clocking || entry.late_arrival || entry.early_departure;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setCalendarFocusDate(entry.work_date);
                      setDetailEntry(entry);
                    }}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      hasWarning
                        ? "border-danger/30 bg-danger/[0.07]"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {entry.status === "draft" ? "Draft" : entry.status}
                      </p>
                      <span className="text-sm font-semibold text-foreground">
                        {formatHours(entry.paid_hours)}
                        {Number(entry.overtime_hours ?? 0) > 0
                          ? ` +${formatHours(entry.overtime_hours)}`
                          : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                      {entry.lunch_start || entry.lunch_end
                        ? ` \u00b7 Lunch ${formatTimeRange(entry.lunch_start, entry.lunch_end)}`
                        : ""}
                    </p>
                    {entry.warning_notes || (entry.notes && !entry.notes.startsWith("Public holiday:")) ? (
                      <p className="mt-1 truncate text-xs text-muted">
                        {entry.warning_notes || entry.notes}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            {entries.filter((e) => e.work_date === calendarFocusDate).length === 0 &&
            publicHolidays.filter((h) => h.holiday_date === calendarFocusDate).length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                No entries for this day
              </div>
            ) : null}
          </div>
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

        {section === "calendar" ? (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => openPanel("leave")}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/15"
            >
              <CalendarPlus className="size-4" />
              Request leave / TOIL
            </button>
            {quickSubmitForm}
          </div>
        ) : null}
      </details>
      ) : null}

      {section !== "calendar" ? (
        <>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1">
        <button
          type="button"
          onClick={() => setActiveTab("timesheets")}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
            activeTab === "timesheets"
              ? "bg-primary text-primary-foreground"
              : "text-foreground"
          }`}
        >
          <ClipboardCheck className="size-4" />
          Timesheets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
            activeTab === "requests"
              ? "bg-primary text-primary-foreground"
              : "text-foreground"
          }`}
        >
          <FileQuestion className="size-4" />
          Requests
        </button>
      </div>

      {message && (
        <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
            messageOk
              ? "border-accent/30 bg-accent/10 text-foreground"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {message}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No time entries yet.
        </p>
      ) : activeTab === "timesheets" ? (
        <div className="grid gap-3">
          {section === "full" ? quickSubmitForm : null}

          <div className="grid gap-2">
            {shouldGroupWeeks
              ? weekGroups.map((group) => (
                  <details
                    key={group.key}
                    className="rounded-md border border-border bg-background"
                    open={group.key === weekGroups[0]?.key}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                      <span>{group.label}</span>
                      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                        {group.entries.length} records
                      </span>
                    </summary>
                    <div className="grid gap-2 border-t border-border p-2">
                      {group.entries.map(renderTimesheetEntry)}
                    </div>
                  </details>
                ))
              : entries.map(renderTimesheetEntry)}
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {submittedEntries.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
              Submit a timesheet first. Then requests will appear here.
            </p>
          ) : null}
          {submittedEntries.map((entry) => {
            const correction = latestRequestByEntry.get(entry.id);
            const hasSubmittedCorrection = correction?.status === "submitted";
            const canRequestCorrection = entry.work_date < currentWorkDate;

            return (
              <article
                key={entry.id}
                className="grid gap-3 rounded-md border border-border bg-background p-3 text-sm shadow-sm"
              >
                <div className="grid gap-2 lg:grid-cols-[130px_1fr_auto] lg:items-center">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <Edit3 className="size-4 text-accent" />
                      {formatDate(entry.work_date)}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      {entry.status}
                    </p>
                  </div>

                  <div className="grid grid-cols-4 items-start gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
                    <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                      <Clock className="size-3.5 text-accent" />
                      <span className="truncate text-xs font-semibold text-foreground" title={`In ${shortTime(entry.clock_in)}`}>
                        {shortTime(entry.clock_in)}
                      </span>
                    </span>
                    <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                      <UtensilsCrossed className="size-3.5 text-accent" />
                      <span className="truncate text-xs font-semibold text-foreground" title={`Lunch ${shortLunch(entry.lunch_start, entry.lunch_end)}`}>
                        {shortLunch(entry.lunch_start, entry.lunch_end)}
                      </span>
                    </span>
                    <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                      <LogOut className="size-3.5 text-accent" />
                      <span className="truncate text-xs font-semibold text-foreground" title={`Out ${shortTime(entry.clock_out)}`}>
                        {shortTime(entry.clock_out)}
                      </span>
                    </span>
                    <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                      {entry.missing_clocking || entry.late_arrival || entry.early_departure ? (
                        <AlertTriangle className="size-3.5 text-warning" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-success" />
                      )}
                      <span className="truncate text-xs font-semibold text-muted">
                        {entry.missing_clocking || entry.late_arrival || entry.early_departure
                          ? "Review"
                          : "Clear"}
                      </span>
                    </span>
                  </div>

                  <div className="rounded-md bg-surface-muted px-3 py-2 text-right">
                    <p className="text-xs text-muted">Paid</p>
                    <p className="font-semibold text-foreground">
                      {formatHours(entry.paid_hours)}
                    </p>
                  </div>
                </div>

                {correction ? (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          Correction request
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Submitted {new Date(correction.submitted_at).toLocaleString("en-ZA")}
                        </p>
                      </div>
                      <span
                        className={`w-max rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(correction.status)}`}
                      >
                        {correction.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{correction.reason}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <Clock className="size-3.5 shrink-0 text-accent" />
                        {shortTime(correction.proposed_clock_in)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <UtensilsCrossed className="size-3.5 shrink-0 text-accent" />
                        {shortTime(correction.proposed_lunch_start)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <UtensilsCrossed className="size-3.5 shrink-0 text-accent" />
                        {shortTime(correction.proposed_lunch_end)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <LogOut className="size-3.5 shrink-0 text-accent" />
                        {shortTime(correction.proposed_clock_out)}
                      </span>
                    </div>
                    {correction.review_notes ? (
                      <p className="mt-2 text-sm font-medium text-foreground">
                        Review note: {correction.review_notes}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {canRequestCorrection && !hasSubmittedCorrection ? (
                  <details className="rounded-lg border border-border bg-surface">
                    <summary className="cursor-pointer px-3 py-2 font-semibold text-foreground">
                      Request correction
                    </summary>
                    <form action={correctionAction} className="grid gap-3 border-t border-border p-3">
                      <input type="hidden" name="time_entry_id" value={entry.id} />

                      <div className="grid gap-2 sm:grid-cols-4">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clock in</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-4 shrink-0 text-muted" />
                            <input type="time" name="proposed_clock_in" defaultValue={inputTime(entry.clock_in)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch start</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-4 shrink-0 text-muted" />
                            <input type="time" name="proposed_lunch_start" defaultValue={inputTime(entry.lunch_start)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch end</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-4 shrink-0 text-muted" />
                            <input type="time" name="proposed_lunch_end" defaultValue={inputTime(entry.lunch_end)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clock out</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-4 shrink-0 text-muted" />
                            <input type="time" name="proposed_clock_out" defaultValue={inputTime(entry.clock_out)} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                          </span>
                        </label>
                      </div>

                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Reason</span>
                        <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
                          <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                          <textarea name="reason" required rows={3} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none" placeholder="Explain what happened and why these times are correct." />
                        </span>
                      </label>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted">
                          Submitted correction requests cannot be edited by employees.
                        </p>
                        <button
                          disabled={correctionPending}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          <Send className="size-4" />
                          {correctionPending ? "Sending..." : "Send request"}
                        </button>
                      </div>
                    </form>
                  </details>
                ) : hasSubmittedCorrection ? (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                    A submitted correction is locked for this record until management reviews it.
                  </p>
                ) : (
                  <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-muted">
                    Corrections become available after the work date has passed.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
        </>
      ) : null}

      <ViewportSidebar
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        maxWidth="max-w-2xl"
        eyebrow="Timesheet"
        title={detailEntry ? formatDate(detailEntry.work_date) : ""}
        description={detailEntry ? <span className="capitalize">{detailEntry.status}</span> : ""}
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4"
      >
        {detailEntry ? (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Clock in</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatTime(detailEntry.clock_in)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Lunch</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatTimeRange(detailEntry.lunch_start, detailEntry.lunch_end)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Clock out</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatTime(detailEntry.clock_out)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Paid</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatHours(detailEntry.paid_hours)}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">NT</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatHours(detailEntry.normal_hours)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">OT</p>
                <p className="mt-1 font-semibold text-warning">
                  {formatHours(detailEntry.overtime_hours)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Lunch break</p>
                <p className="mt-1 font-semibold text-foreground">
                  {formatHours(detailEntry.lunch_hours)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Warnings</p>
                <p className="mt-1 font-semibold text-foreground">
                  {detailEntry.missing_clocking || detailEntry.late_arrival || detailEntry.early_departure
                    ? "Needs review"
                    : "Clear"}
                </p>
              </div>
            </div>

            {detailEntry.notes ? (
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Notes</p>
                <p className="mt-1 text-sm text-foreground">{detailEntry.notes}</p>
              </div>
            ) : null}

            {detailEntry.warning_notes ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                <p className="text-xs text-warning">Calculation note</p>
                <p className="mt-1 text-sm font-medium text-warning">
                  {detailEntry.warning_notes}
                </p>
              </div>
            ) : null}

            {detailEntry.locationEvents?.length ? (
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted">Location history</p>
                <div className="mt-2 grid gap-2">
                  {detailEntry.locationEvents.map((event) => (
                    <div
                      key={event.id}
                      className="grid gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs sm:grid-cols-[130px_1fr_auto] sm:items-center"
                    >
                      <p className="font-semibold capitalize text-foreground">
                        {event.event_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-muted">
                        {event.latitude !== null && event.longitude !== null
                          ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`
                          : "No coordinates"}
                        {event.accuracy_meters !== null
                          ? ` · ±${Math.round(event.accuracy_meters)}m`
                          : ""}
                        {event.distance_meters !== null
                          ? ` · ${Math.round(event.distance_meters)}m from workstation`
                          : ""}
                      </p>
                      <span
                        className={`inline-flex w-max items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${geofenceClass(event.geofence_status)}`}
                      >
                        <LocateFixed className="size-3" />
                        {geofenceLabel(event.geofence_status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </ViewportSidebar>

      <ViewportSidebar
        open={Boolean(selectedDate) && !detailEntry}
        onClose={() => setSelectedDate("")}
        eyebrow="Date actions"
        title={selectedDate ? formatDate(selectedDate) : ""}
        description="Choose an action for this day without leaving the calendar."
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4"
      >
        {selectedEntry ? (
          <>
            <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
              This day already has a {selectedEntry.status} timesheet.
            </p>
            <button
              type="button"
              onClick={() => {
                setDetailEntry(selectedEntry);
                setSelectedDate("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Clock3 className="size-4" />
              Open timesheet
            </button>
          </>
        ) : selectedIsHoliday ? (
          <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
            This day is a company public holiday and is handled automatically.
          </p>
        ) : selectedDate >= currentWorkDate ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Employees can only add past timesheets from the calendar.
          </p>
        ) : (
          <form action={createAction} className="grid gap-3">
            <input type="hidden" name="work_date" value={selectedDate} />
            <p className="text-sm text-muted">
              Create a draft timesheet for this work day. You can refine the times before submission.
            </p>
            <button
              disabled={!selectedCanAdd || createPending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-4" />
              {createPending ? "Adding..." : "Add draft"}
            </button>
          </form>
        )}
      </ViewportSidebar>
    </section>
  );
}
