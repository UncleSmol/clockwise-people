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
  CheckSquare,
  ChevronDown,
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
  Square,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import {
  createPastDraftTimeEntry,
  deleteDraftTimeEntry,
  saveDraftTimeEntry,
  submitSelectedTimesheets,
  submitTimesheetCorrection,
} from "@/lib/time-tracking/actions";
import type {
  CompanyLiveTimeOverview,
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
  liveOverview?: CompanyLiveTimeOverview | null;
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
  if (status === "submitted") return "bg-amber-500 text-white font-bold shadow-2xs";
  if (status === "approved") return "bg-emerald-600 text-white font-bold shadow-2xs";
  if (status === "rejected") return "bg-rose-600 text-white font-bold shadow-2xs";
  return "bg-slate-700 text-white font-bold shadow-2xs";
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

function getPaidHoursContainerClass(validation: TimeEntryRecord["scheduleValidation"]) {
  if (!validation) return "border-border bg-background";
  return validation.isCompliant
    ? "border-success/30 bg-success/10"
    : "border-danger/30 bg-danger/10";
}

function getPaidHoursTextClass(validation: TimeEntryRecord["scheduleValidation"]) {
  if (!validation) return "text-foreground";
  return validation.isCompliant ? "text-success" : "text-danger";
}

function getEntryBorderClass(entry: TimeEntryRecord) {
  const validation = entry.scheduleValidation;
  if (validation) {
    return validation.isCompliant
      ? "border-success/30 bg-success/10"
      : "border-danger/30 bg-danger/10";
  }
  return entry.missing_clocking || entry.late_arrival || entry.early_departure
    ? "border-danger/30 bg-danger/10"
    : "border-success/30 bg-success/10";
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
                  {event.latitude !== null && event.longitude !== null
                    ? ` • ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
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
    ? "bg-slate-900 text-white shadow-xs font-bold"
    : "border border-border bg-white text-foreground hover:bg-slate-100 font-semibold";
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

function PaginationControl({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = "records",
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) {
  if (totalItems <= pageSize) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2.5 text-xs text-muted">
      <span>
        Showing <strong className="text-foreground">{startItem}</strong> -{" "}
        <strong className="text-foreground">{endItem}</strong> of{" "}
        <strong className="text-foreground">{totalItems}</strong> {itemLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
        >
          Previous
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .map((page, idx, arr) => {
            const prevPage = arr[idx - 1];
            const showEllipsis = prevPage && page - prevPage > 1;

            return (
              <span key={page} className="flex items-center">
                {showEllipsis ? <span className="px-1 text-muted">…</span> : null}
                <button
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={`size-6 rounded text-xs font-bold ${
                    currentPage === page
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {page}
                </button>
              </span>
            );
          })}

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function EmployeeTimesheetCorrections({
  collapsedCalendar = false,
  correctionRequests,
  currentWorkDate,
  entries,
  publicHolidays,
  liveOverview = null,
}: EmployeeTimesheetCorrectionsProps) {
  const activeColleagues = useMemo(() => {
    if (!liveOverview?.entries) return [];
    return liveOverview.entries.filter(
      (c) => c.status === "working" || c.status === "on_lunch",
    );
  }, [liveOverview]);

  const [activeTab, setActiveTab] = useState<"timesheets" | "requests">("timesheets");
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>(() => {
    if (typeof window === "undefined") return "month";
    if (window.innerWidth < 640) return "day";
    if (window.innerWidth < 768) return "week";
    return "month";
  });
  const section = useWorkspaceSection();
  const { openPanel } = usePanel();

  const [showLegend, setShowLegend] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [detailEntry, setDetailEntry] = useState<TimeEntryRecord | null>(null);
  const [calendarFocusDate, setCalendarFocusDate] = useState(currentWorkDate);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [acknowledgedFlags, setAcknowledgedFlags] = useState(false);
  const [expandedDraftIds, setExpandedDraftIds] = useState<Set<string>>(() => new Set());
  const toggleDraftExpand = (id: string) => {
    setExpandedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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
      const label = `${e.status} - ${formatHours(e.paid_hours)}`;
      prev.push(label);
      map.set(e.work_date, prev);
    }
    return map;
  }, [entries, publicHolidays, holidayDates]);
  const [createState, createAction, createPending] = useActionState(
    createPastDraftTimeEntry,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDraftTimeEntry,
    initialState,
  );
  const [selectedCorrectionIds, setSelectedCorrectionIds] = useState<Set<string>>(() => new Set());
  const [correctionState, correctionAction, correctionPending] = useActionState(
    async (prev: CorrectionActionState, formData: FormData) => {
      const result = await submitTimesheetCorrection(prev, formData);
      if (result.ok) {
        setSelectedCorrectionIds(new Set());
      }
      return result;
    },
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

  const eligibleCorrectionEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.status === "submitted" &&
          entry.work_date < currentWorkDate &&
          latestRequestByEntry.get(entry.id)?.status !== "submitted",
      ),
    [entries, currentWorkDate, latestRequestByEntry],
  );

  const allCorrectionsSelected =
    eligibleCorrectionEntries.length > 0 &&
    selectedCorrectionIds.size === eligibleCorrectionEntries.length;

  const toggleCorrectionSelect = (id: string) => {
    setSelectedCorrectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllCorrections = () => {
    if (allCorrectionsSelected) {
      setSelectedCorrectionIds(new Set());
    } else {
      setSelectedCorrectionIds(new Set(eligibleCorrectionEntries.map((e) => e.id)));
    }
  };
  const entriesByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.work_date, entry])),
    [entries],
  );
  const calendarEvents = useMemo<EventInput[]>(() => {
    const timesheetEvents = entries
      .filter(
        (entry) =>
          !holidayDates.has(entry.work_date) &&
          !entry.notes?.startsWith("Public holiday:"),
      )
      .map((entry) => {
        const needsAttention = entry.missing_clocking || entry.late_arrival || entry.early_departure;

        return {
          id: entry.id,
          title: `${entry.status} - ${formatHours(entry.paid_hours)}`,
          start: entry.work_date,
          allDay: true,
          classNames: [
            timesheetCalendarClass(entry, false),
            needsAttention ? "cw-calendar-attention" : "",
          ],
          extendedProps: { entry },
        };
      });
    const holidayEvents = publicHolidays.map((holiday) => ({
      id: `holiday-${holiday.id}`,
      title: holiday.name,
      start: holiday.holiday_date,
      allDay: true,
      classNames: ["cw-calendar-holiday"],
    }));

    return [...holidayEvents, ...timesheetEvents];
  }, [entries, publicHolidays, holidayDates]);
  const editableEntries = entries.filter(
    (entry) =>
      (entry.status === "draft" || entry.status === "rejected") &&
      !holidayDates.has(entry.work_date) &&
      !entry.notes?.startsWith("Public holiday:"),
  );
  const submittedEntries = entries.filter(
    (entry) =>
      entry.status !== "draft" &&
      entry.status !== "rejected" &&
      !holidayDates.has(entry.work_date) &&
      !entry.notes?.startsWith("Public holiday:"),
  );
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          !holidayDates.has(entry.work_date) &&
          !entry.notes?.startsWith("Public holiday:"),
      ),
    [entries, holidayDates],
  );

  const [timesheetsPage, setTimesheetsPage] = useState(1);
  const [requestsPage, setRequestsPage] = useState(1);
  const timesheetsPageSize = 6;
  const requestsPageSize = 6;

  const totalTimesheetsPages = Math.max(1, Math.ceil(filteredEntries.length / timesheetsPageSize));
  const paginatedEntries = useMemo(
    () =>
      filteredEntries.slice(
        (timesheetsPage - 1) * timesheetsPageSize,
        timesheetsPage * timesheetsPageSize,
      ),
    [filteredEntries, timesheetsPage, timesheetsPageSize],
  );

  const totalRequestsPages = Math.max(1, Math.ceil(submittedEntries.length / requestsPageSize));
  const paginatedSubmittedEntries = useMemo(
    () =>
      submittedEntries.slice(
        (requestsPage - 1) * requestsPageSize,
        requestsPage * requestsPageSize,
      ),
    [submittedEntries, requestsPage, requestsPageSize],
  );

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
  const shouldGroupWeeks = filteredEntries.length >= 7;
  const weekGroups = useMemo(
    () => groupByWeek(filteredEntries),
    [filteredEntries],
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
    const entryForDate = entriesByDate.get(arg.dateStr);
    if (entryForDate) {
      setDetailEntry(entryForDate);
      if (entryForDate.status === "draft" || entryForDate.status === "rejected") {
        setExpandedDraftIds((prev) => new Set(prev).add(entryForDate.id));
      }
    } else {
      setDetailEntry(null);
    }
  };
  const handleEventClick = (arg: EventClickArg) => {
    const entry = arg.event.extendedProps.entry as TimeEntryRecord | undefined;
    if (entry) {
      setSelectedDate(entry.work_date);
      setCalendarFocusDate(entry.work_date);
      setDetailEntry(entry);
      if (entry.status === "draft" || entry.status === "rejected") {
        setExpandedDraftIds((prev) => new Set(prev).add(entry.id));
      }
    }
  };
  const payrollRangeLabel = useMemo(() => {
    const payrollStart = dateKey(weekStartDate(calendarFocusDate));
    const payrollEnd = addDays(payrollStart, 13);
    return `${formatDate(payrollStart)} - ${formatDate(payrollEnd)}`;
  }, [calendarFocusDate]);

  const renderTimesheetEntry = (entry: TimeEntryRecord) => {
    const editable = entry.status === "draft" || entry.status === "rejected";
    const isDraft = entry.status === "draft";
    const rejected = entry.status === "rejected";
    const isApproved = entry.status === "approved";
    const isSubmitted = entry.status === "submitted";
    const hasWarning = entry.missing_clocking || entry.late_arrival || entry.early_departure || rejected;
    const managerNote = extractManagerNote(entry.notes);
    const validation = entry.scheduleValidation;
    const isCompliant = validation?.isCompliant ?? !hasWarning;
    const isExpanded = expandedDraftIds.has(entry.id);

    return (
      <article
        key={entry.id}
        className={`grid gap-3 rounded-lg border-2 p-3.5 shadow-sm transition-all ${
          isApproved
            ? "border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70"
            : rejected
              ? "border-rose-500 bg-rose-50/50 hover:bg-rose-50/80"
              : isSubmitted
                ? "border-slate-700 bg-slate-900/5 hover:bg-slate-900/10"
                : isDraft
                  ? "border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/50 shadow-md animate-[pulse_2.5s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                  : "border-amber-400 bg-amber-50/40 hover:bg-amber-50/70"
        }`}
      >
        {/* Top Header: Date, Status Badge, Paid Hours & Edit Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                isApproved
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : rejected
                    ? "bg-rose-600 text-white shadow-2xs"
                    : isSubmitted
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-amber-500 text-white shadow-2xs"
              }`}
            >
              {isDraft ? (
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-200 opacity-80" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
              ) : rejected ? (
                <AlertTriangle className="size-3 text-white" />
              ) : isApproved ? (
                <CheckCircle2 className="size-3 text-white" />
              ) : isSubmitted ? (
                <Clock3 className="size-3 text-emerald-400" />
              ) : (
                <Edit3 className="size-3 text-white" />
              )}
              {rejected ? "Rejected" : editable ? "Draft" : entry.status}
            </span>
            <p className="truncate text-xs font-extrabold text-foreground whitespace-nowrap">
              {formatDate(entry.work_date)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex w-max shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-black shadow-2xs whitespace-nowrap ${
                isApproved
                  ? "bg-emerald-950 text-emerald-200"
                  : rejected
                    ? "bg-rose-950 text-rose-200"
                    : isSubmitted
                      ? "bg-slate-900 text-emerald-400"
                      : "bg-amber-950 text-amber-200"
              }`}
            >
              <Clock3 className="size-3" />
              {formatHours(entry.paid_hours)}
            </span>

            {editable ? (
              <button
                type="button"
                onClick={() => toggleDraftExpand(entry.id)}
                className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold transition-all shadow-2xs whitespace-nowrap ${
                  isExpanded
                    ? "bg-slate-900 text-white"
                    : isDraft
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-slate-800 text-white hover:bg-slate-900"
                }`}
                title={isExpanded ? "Collapse time editor" : "Edit times"}
              >
                <Edit3 className="size-2.5" />
                {isExpanded ? "Collapse" : "Edit"}
                <ChevronDown
                  className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : null}
          </div>
        </div>

        {rejected ? (
          <div className="rounded-md border border-rose-300 bg-rose-100/80 p-2.5 text-xs font-semibold text-rose-950 shadow-2xs">
            {managerNote
              ? `Rejected by manager: ${managerNote}`
              : "This timesheet was rejected. Correct the recorded times below, save, and submit."}
          </div>
        ) : null}

        {editable && isExpanded ? (
          <form action={saveAction} className="grid gap-2.5 min-w-0">
            <input type="hidden" name="time_entry_id" value={entry.id} />
            <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1.5 min-w-0">
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap block">In</span>
                <input
                  type="time"
                  name="clock_in"
                  defaultValue={inputTime(entry.clock_in)}
                  className="mt-0.5 w-full bg-transparent text-xs font-extrabold text-foreground outline-none"
                />
              </div>
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap block">Lunch In</span>
                <input
                  type="time"
                  name="lunch_start"
                  defaultValue={inputTime(entry.lunch_start)}
                  className="mt-0.5 w-full bg-transparent text-xs font-extrabold text-foreground outline-none"
                />
              </div>
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap block">Lunch Out</span>
                <input
                  type="time"
                  name="lunch_end"
                  defaultValue={inputTime(entry.lunch_end)}
                  className="mt-0.5 w-full bg-transparent text-xs font-extrabold text-foreground outline-none"
                />
              </div>
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap block">Out</span>
                <input
                  type="time"
                  name="clock_out"
                  defaultValue={inputTime(entry.clock_out)}
                  className="mt-0.5 w-full bg-transparent text-xs font-extrabold text-foreground outline-none"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-2 shadow-2xs min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap block">Note</span>
              <textarea
                name="notes"
                rows={1}
                defaultValue={entry.notes ?? ""}
                className="mt-0.5 w-full bg-transparent text-xs font-medium text-foreground outline-none resize-none"
                placeholder="Optional timesheet note"
              />
            </div>

            {renderLocationHistory(entry)}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                formAction={deleteAction}
                disabled={deletePending}
                className="inline-flex items-center gap-1.5 rounded border border-rose-400/60 bg-rose-50 px-3 py-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                {deletePending ? "Deleting..." : "Delete"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleDraftExpand(entry.id)}
                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  disabled={savePending}
                  className="inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {savePending ? "Saving..." : "Save Draft"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="grid gap-2 min-w-0">
            {/* High-Contrast Compact Smart Metric Grid */}
            <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1.5 text-center min-w-0">
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Clock In</p>
                <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortTime(entry.clock_in)}</p>
              </div>
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Lunch</p>
                <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortLunch(entry.lunch_start, entry.lunch_end)}</p>
              </div>
              <div className="rounded-md border border-border bg-white p-1.5 shadow-2xs min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Clock Out</p>
                <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortTime(entry.clock_out)}</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 shadow-2xs min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 truncate whitespace-nowrap">Total Paid</p>
                <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatHours(entry.paid_hours)}</p>
              </div>
            </div>

            {entry.warning_notes ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-1.5 text-xs font-semibold text-amber-950">
                {entry.warning_notes}
              </div>
            ) : null}
          </div>
        )}
      </article>
    );
  };

  const quickSubmitForm =
    editableEntries.length > 0 ? (
      <form action={submitAction} className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-foreground">Submit ready timesheets</p>
            <p className="mt-0.5 text-xs text-muted">
              Tap a start day, then tap an end day to select the range of shifts to submit for approval.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedEntryIds.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted hover:text-foreground shadow-2xs"
              >
                <X className="size-3.5" />
                Clear ({selectedEntryIds.size})
              </button>
            ) : null}
            <button
              disabled={submitBlocked || submitPending}
              className="inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="size-3.5" />
              {submitPending
                ? "Submitting..."
                : hasRejectedSelected
                  ? "Resubmit selected"
                  : `Submit selected (${selectedEntryIds.size})`}
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
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs font-bold text-amber-950">
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
                className={`flex items-center gap-2.5 rounded-lg border-2 p-2.5 text-left text-xs font-bold transition-all ${
                  isAnchor
                    ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                    : isSelected
                      ? "border-slate-900 bg-slate-900/10 text-foreground ring-1 ring-slate-900"
                      : isRejected
                        ? "border-rose-400 bg-rose-50/70 text-foreground hover:bg-rose-100"
                        : needsAttention
                          ? "border-amber-400 bg-amber-50/70 text-foreground hover:bg-amber-100"
                          : "border-border bg-white text-foreground hover:bg-slate-50"
                }`}
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded border text-xs font-black ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-border bg-background text-muted"
                  }`}
                >
                  {isSelected ? "✓" : isAnchor ? "A" : ""}
                </span>
                <span className="font-extrabold">{formatDate(entry.work_date)}</span>
                <span
                  className={`ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    isRejected
                      ? "bg-rose-600 text-white shadow-2xs"
                      : needsAttention
                        ? "bg-amber-500 text-white shadow-2xs"
                        : "bg-emerald-600 text-white shadow-2xs"
                  }`}
                >
                  {isRejected ? (
                    <X className="size-3" />
                  ) : needsAttention ? (
                    <AlertTriangle className="size-3" />
                  ) : (
                    <CheckCircle2 className="size-3" />
                  )}
                  {isRejected ? "Rejected" : needsAttention ? "Review" : "Ready"}
                </span>
              </button>
            );
          })}
        </div>

        {hasFlaggedSelected ? (
          <label className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/80 p-2.5 text-xs font-semibold text-amber-950">
            <input
              type="checkbox"
              checked={acknowledgedFlags}
              onChange={(event) => setAcknowledgedFlags(event.target.checked)}
              className="mt-0.5 size-4 accent-amber-600"
            />
            <span>I understand the flagged days need attention and will be sent for manager review.</span>
          </label>
        ) : null}
      </form>
    ) : null;

  return (
    <section className="card grid min-w-0 grid-cols-1 gap-3 p-4">
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

      {/* Active Colleagues Clocked In Strip */}
      {activeColleagues.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-50/50 p-3 shadow-2xs">
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
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Live Attendance
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {activeColleagues.map((colleague) => {
              const isOnLunch = colleague.status === "on_lunch";
              return (
                <div
                  key={colleague.employeeId}
                  className={`flex items-center gap-2 rounded-md border p-1 pr-2.5 shadow-2xs transition-all ${
                    isOnLunch
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
                      className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-1 ring-white ${
                        isOnLunch ? "bg-amber-500" : "bg-emerald-500"
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
          </div>
        </div>
      )}

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
        {message && (
          <div
            className={`rounded-md border px-3 py-2 text-sm font-semibold shadow-2xs ${
              messageOk
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-rose-300 bg-rose-50 text-rose-950"
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <CalendarDays className="size-4 text-accent" />
              Calendar
            </p>
            <p className="mt-1 text-xs text-muted max-sm:hidden">
              Click any day or draft event on the calendar to view, edit, or create draft timesheets.
            </p>
          </div>
          <div className="hidden sm:flex sm:flex-wrap sm:gap-1.5">
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
        </div>
        {calendarWindow === "payroll" ? (
          <p className="rounded-md border border-slate-300 bg-slate-100/70 px-3 py-2 text-xs font-bold text-foreground">
            Payroll period anchored to the selected week: {payrollRangeLabel}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted sm:hidden"
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
          className={`flex flex-wrap gap-1.5 text-xs font-bold ${showLegend ? "" : "hidden sm:flex"}`}
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
        <div ref={calendarRef} className="cw-timesheet-calendar min-w-0 max-sm:hidden">
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
              .filter(
                (e) =>
                  e.work_date === calendarFocusDate &&
                  !holidayDates.has(e.work_date) &&
                  !e.notes?.startsWith("Public holiday:"),
              )
              .map((entry) => {
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

        {/* Calendar Selected Day Inspector & Draft Editor */}
        {(() => {
          const focusedDate = selectedDate || calendarFocusDate;
          const activeCalendarEntry = (focusedDate ? entriesByDate.get(focusedDate) : null) ?? detailEntry;
          const activeHoliday = focusedDate
            ? publicHolidays.find((h) => h.holiday_date === focusedDate)
            : null;
          const isPastFocusedDay = Boolean(focusedDate) && focusedDate < currentWorkDate && !activeCalendarEntry && !activeHoliday;

          if (!focusedDate) return null;

          return (
            <div className="grid gap-2.5 border-t border-border/80 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-accent" />
                  <p className="text-xs font-black uppercase tracking-wider text-muted">
                    Selected Day · <span className="text-foreground">{formatDate(focusedDate)}</span>
                  </p>
                </div>
                {(selectedDate || detailEntry) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate("");
                      setDetailEntry(null);
                    }}
                    className="text-[11px] font-bold text-muted hover:text-foreground underline decoration-dotted"
                  >
                    Clear selection
                  </button>
                ) : null}
              </div>

              {activeCalendarEntry ? (
                <div className="grid gap-2">
                  {activeCalendarEntry.status === "draft" || activeCalendarEntry.status === "rejected" ? (
                    <div className="rounded-lg border-2 border-amber-400 bg-amber-50/40 p-3 shadow-2xs">
                      <div className="mb-2 flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <Edit3 className="size-4 text-amber-600" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                            {activeCalendarEntry.status === "rejected" ? "Correct Rejected Timesheet" : "Edit Draft Timesheet"}
                          </h4>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-2xs">
                          Edit Draft Direct
                        </span>
                      </div>
                      {renderTimesheetEntry(activeCalendarEntry)}
                    </div>
                  ) : (
                    <div>
                      {renderTimesheetEntry(activeCalendarEntry)}
                    </div>
                  )}
                </div>
              ) : activeHoliday ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-purple-300 bg-purple-50 p-3 text-xs shadow-2xs">
                  <div>
                    <span className="font-extrabold text-purple-950">{activeHoliday.name}</span>
                    <p className="text-[11px] font-medium text-purple-700">Public Holiday · {formatDate(focusedDate)}</p>
                  </div>
                  <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-2xs">
                    Holiday
                  </span>
                </div>
              ) : isPastFocusedDay ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-3.5 shadow-2xs">
                  <div>
                    <p className="text-xs font-black text-amber-950">
                      No timesheet recorded for {formatDate(focusedDate)}
                    </p>
                    <p className="text-[11px] font-medium text-amber-800">
                      Create a past draft timesheet for this day and record your work hours.
                    </p>
                  </div>
                  <form action={createAction}>
                    <input type="hidden" name="work_date" value={focusedDate} />
                    <button
                      disabled={createPending}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
                    >
                      <Plus className="size-3.5" />
                      {createPending ? "Creating Draft..." : `Create Draft for ${formatDate(focusedDate)}`}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })()}

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

      {filteredEntries.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No time entries yet.
        </p>
      ) : activeTab === "timesheets" ? (
        <div className="grid gap-3">
          <div className="columns-1 gap-3 sm:columns-2 xl:columns-3 [column-fill:_balance]">
            {paginatedEntries.map((entry) => (
              <div key={entry.id} className="break-inside-avoid mb-3">
                {renderTimesheetEntry(entry)}
              </div>
            ))}
          </div>

          <PaginationControl
            currentPage={timesheetsPage}
            totalPages={totalTimesheetsPages}
            totalItems={filteredEntries.length}
            pageSize={timesheetsPageSize}
            onPageChange={setTimesheetsPage}
            itemLabel="timesheets"
          />

          {section === "full" ? quickSubmitForm : null}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Select past submitted timesheets to request time corrections from your manager in bulk.
            </p>
            {eligibleCorrectionEntries.length > 0 ? (
              <button
                type="button"
                onClick={toggleSelectAllCorrections}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface"
              >
                {allCorrectionsSelected ? (
                  <>
                    <Square className="size-3.5" />
                    Deselect all
                  </>
                ) : (
                  <>
                    <CheckSquare className="size-3.5" />
                    Select all ({eligibleCorrectionEntries.length})
                  </>
                )}
              </button>
            ) : null}
          </div>

          {selectedCorrectionIds.size > 0 ? (
            <form action={correctionAction} className="grid gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    Request correction for {selectedCorrectionIds.size} {selectedCorrectionIds.size === 1 ? "timesheet" : "timesheets"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Selected:{" "}
                    {Array.from(selectedCorrectionIds)
                      .map((id) => entries.find((e) => e.id === id)?.work_date)
                      .filter(Boolean)
                      .sort()
                      .map((d) => formatDate(d!))
                      .join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCorrectionIds(new Set())}
                  className="w-max text-xs font-semibold text-muted hover:text-foreground"
                >
                  Clear selection
                </button>
              </div>

              {Array.from(selectedCorrectionIds).map((id) => (
                <input key={id} type="hidden" name="time_entry_ids" value={id} />
              ))}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed clock in</span>
                  <input
                    type="time"
                    name="proposed_clock_in"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed lunch start</span>
                  <input
                    type="time"
                    name="proposed_lunch_start"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed lunch end</span>
                  <input
                    type="time"
                    name="proposed_lunch_end"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed clock out</span>
                  <input
                    type="time"
                    name="proposed_clock_out"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                  />
                </div>
              </div>

              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Reason for correction *</span>
                <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
                  <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                  <textarea
                    name="reason"
                    required
                    rows={2}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                    placeholder="Explain what happened and why these times are correct for all selected days."
                  />
                </span>
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  disabled={correctionPending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:min-h-0"
                >
                  <Send className="size-4" />
                  {correctionPending
                    ? "Sending..."
                    : `Send ${selectedCorrectionIds.size} request${selectedCorrectionIds.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </form>
          ) : null}

          {submittedEntries.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
              Submit a timesheet first. Then requests will appear here.
            </p>
          ) : null}
          <div className="columns-1 gap-3 sm:columns-2 xl:columns-3 [column-fill:_balance]">
            {paginatedSubmittedEntries.map((entry) => {
              const correction = latestRequestByEntry.get(entry.id);
              const hasSubmittedCorrection = correction?.status === "submitted";
              const canRequestCorrection = entry.work_date < currentWorkDate;
              const isSelected = selectedCorrectionIds.has(entry.id);

              return (
                <div key={entry.id} className="break-inside-avoid mb-3">
                  <article
                    className={`grid gap-3 rounded-lg border-2 p-3.5 text-sm shadow-2xs transition-all ${
                      isSelected
                        ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                        : "border-border bg-white hover:bg-slate-50"
                    }`}
                  >
                  <div className="grid gap-2 lg:grid-cols-[auto_130px_1fr_auto] lg:items-center">
                    {canRequestCorrection && !hasSubmittedCorrection ? (
                      <label
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCorrectionSelect(entry.id)}
                          aria-label={`Select timesheet for ${formatDate(entry.work_date)}`}
                          className="size-4 accent-slate-900"
                        />
                      </label>
                    ) : null}

                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                        <Edit3 className="size-3.5 text-accent" />
                        {formatDate(entry.work_date)}
                      </p>
                      <span className="mt-1 inline-flex rounded bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-2xs">
                        {entry.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 items-start gap-x-2 gap-y-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
                      <span className="grid min-w-0 gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <Clock className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`In ${shortTime(entry.clock_in)}`}>
                          {shortTime(entry.clock_in)}
                        </span>
                      </span>
                      <span className="grid min-w-0 gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <UtensilsCrossed className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`Lunch ${shortLunch(entry.lunch_start, entry.lunch_end)}`}>
                          {shortLunch(entry.lunch_start, entry.lunch_end)}
                        </span>
                      </span>
                      <span className="grid min-w-0 gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <LogOut className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`Out ${shortTime(entry.clock_out)}`}>
                          {shortTime(entry.clock_out)}
                        </span>
                      </span>
                      <span className="grid min-w-0 gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        {entry.missing_clocking || entry.late_arrival || entry.early_departure ? (
                          <AlertTriangle className="size-3.5 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        )}
                        <span className="truncate text-xs font-extrabold text-foreground">
                          {entry.missing_clocking || entry.late_arrival || entry.early_departure
                            ? "Review Needed"
                            : "Compliant"}
                        </span>
                      </span>
                    </div>

                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-right shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Paid</p>
                      <p className="text-xs font-black text-emerald-950">
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
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">In</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{shortTime(correction.proposed_clock_in)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch start</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{shortTime(correction.proposed_lunch_start)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch end</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{shortTime(correction.proposed_lunch_end)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Out</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{shortTime(correction.proposed_clock_out)}</span>
                        </div>
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
                        Request individual correction
                      </summary>
                      <form action={correctionAction} className="grid gap-3 border-t border-border p-3">
                        <input type="hidden" name="time_entry_id" value={entry.id} />

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clock in</span>
                            <input type="time" name="proposed_clock_in" defaultValue={inputTime(entry.clock_in)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none" />
                          </div>
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch start</span>
                            <input type="time" name="proposed_lunch_start" defaultValue={inputTime(entry.lunch_start)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none" />
                          </div>
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch end</span>
                            <input type="time" name="proposed_lunch_end" defaultValue={inputTime(entry.lunch_end)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none" />
                          </div>
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clock out</span>
                            <input type="time" name="proposed_clock_out" defaultValue={inputTime(entry.clock_out)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none" />
                          </div>
                        </div>

                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Reason</span>
                          <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
                            <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                            <textarea name="reason" required rows={3} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none" placeholder="Explain what happened and why these times are correct." />
                          </span>
                        </label>

                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-muted">
                            Submitted correction requests cannot be edited by employees.
                          </p>
                          <button
                            disabled={correctionPending}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
              </div>
            );
          })}
        </div>

          <PaginationControl
            currentPage={requestsPage}
            totalPages={totalRequestsPages}
            totalItems={submittedEntries.length}
            pageSize={requestsPageSize}
            onPageChange={setRequestsPage}
            itemLabel="submitted timesheets"
          />
        </div>
      )}
        </>
      ) : null}

      <ViewportSidebar
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        maxWidth="max-w-2xl"
        eyebrow="Timesheet detail"
        title={detailEntry ? formatDate(detailEntry.work_date) : ""}
        description={detailEntry ? <span className="capitalize">{detailEntry.status} shift breakdown</span> : ""}
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {detailEntry ? (
          <div className="grid gap-4">
            {/* Solid Status Hero Card */}
            <div
              className={`flex items-center justify-between gap-3 rounded-lg p-4 shadow-sm ${
                detailEntry.status === "approved"
                  ? "bg-emerald-600 text-white ring-1 ring-emerald-700/60"
                  : detailEntry.status === "submitted"
                    ? "bg-slate-800 text-white ring-1 ring-slate-900/60"
                    : detailEntry.status === "rejected"
                      ? "bg-rose-600 text-white ring-1 ring-rose-700/60"
                      : "border border-zinc-300 bg-zinc-100 text-zinc-900"
              }`}
            >
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${detailEntry.status === "draft" ? "text-zinc-500" : "opacity-80"}`}>
                  Timesheet Status
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${
                      detailEntry.status === "approved"
                        ? "bg-emerald-950/40 text-white border border-emerald-400/30"
                        : detailEntry.status === "submitted"
                          ? "bg-slate-900/80 text-emerald-400 border border-slate-700"
                          : detailEntry.status === "rejected"
                            ? "bg-rose-950/50 text-white border border-rose-400/30"
                            : "bg-zinc-200 text-zinc-800 border border-zinc-300"
                    }`}
                  >
                    {detailEntry.status === "approved" ? (
                      <CheckCircle2 className="size-3 text-emerald-300" />
                    ) : detailEntry.status === "rejected" ? (
                      <AlertTriangle className="size-3 text-rose-200" />
                    ) : (
                      <Clock className="size-3" />
                    )}
                    {detailEntry.status}
                  </span>
                  <span className={`text-xs font-bold ${detailEntry.status === "draft" ? "text-zinc-600" : "text-white/90"}`}>
                    {formatDate(detailEntry.work_date)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${detailEntry.status === "draft" ? "text-zinc-500" : "opacity-80"}`}>
                  Paid duration
                </p>
                <p className="mt-0.5 text-2xl font-black">{formatHours(detailEntry.paid_hours)}</p>
              </div>
            </div>

            {/* Time Grid Cards */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Clock in</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTime(detailEntry.clock_in)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lunch</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTimeRange(detailEntry.lunch_start, detailEntry.lunch_end)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Clock out</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTime(detailEntry.clock_out)}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total Paid</p>
                <p className="mt-1 text-sm font-black text-emerald-950">
                  {formatHours(detailEntry.paid_hours)}
                </p>
              </div>
            </div>

            {/* Hours Calculation Details */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Normal (NT)</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatHours(detailEntry.normal_hours)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Overtime (OT)</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatHours(detailEntry.overtime_hours)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lunch break</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatHours(detailEntry.lunch_hours)}
                </p>
              </div>

              <div
                className={`rounded-lg border p-3 text-center ${
                  detailEntry.scheduleValidation?.isCompliant
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                    : "border-rose-200 bg-rose-50/70 text-rose-950"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider">Schedule Check</p>
                <p className="mt-1 text-xs font-black">
                  {detailEntry.scheduleValidation?.isCompliant ? "Compliant" : "Needs review"}
                </p>
              </div>
            </div>

            {/* Schedule issues alert if any */}
            {detailEntry.scheduleValidation && !detailEntry.scheduleValidation.isCompliant && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3.5 text-rose-950">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-800">
                  <AlertTriangle className="size-4 text-rose-600" />
                  Schedule Exceptions Detected
                </p>
                <ul className="mt-2 list-disc list-inside space-y-1 text-xs font-medium">
                  {detailEntry.scheduleValidation.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notes */}
            {detailEntry.notes ? (
              <div className="rounded-lg border border-border bg-background p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Shift notes</p>
                <p className="mt-1 text-xs font-medium text-foreground">{detailEntry.notes}</p>
              </div>
            ) : null}

            {/* Calculation Warning notes */}
            {detailEntry.warning_notes ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-amber-950">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Calculation notice</p>
                <p className="mt-1 text-xs font-medium text-amber-900">
                  {detailEntry.warning_notes}
                </p>
              </div>
            ) : null}

            {/* Location events history */}
            {detailEntry.locationEvents?.length ? (
              <div className="rounded-lg border border-border bg-background p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <MapPin className="size-4 text-accent" />
                  Location Audit History ({detailEntry.locationEvents.length})
                </p>
                <div className="mt-2.5 grid gap-2">
                  {detailEntry.locationEvents.map((event) => (
                    <div
                      key={event.id}
                      className="grid gap-1 rounded-md border border-border bg-surface p-2.5 text-xs sm:grid-cols-[130px_1fr_auto] sm:items-center"
                    >
                      <p className="font-bold capitalize text-foreground">
                        {event.event_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-muted">
                        {event.latitude !== null && event.longitude !== null
                          ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
                          : "No coordinates"}
                        {event.distance_meters !== null
                          ? ` · ${Math.round(event.distance_meters)}m away`
                          : ""}
                      </p>
                      <span
                        className={`inline-flex w-max items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${geofenceClass(event.geofence_status)}`}
                      >
                        <LocateFixed className="size-3" />
                        {geofenceLabel(event.geofence_status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
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
