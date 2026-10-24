"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventInput, DayCellMountArg } from "@fullcalendar/core";
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Clock3,
  ClipboardCheck,
  Edit3,
  FileQuestion,
  FileText,
  Footprints,
  Layers,
  LocateFixed,
  MapPin,
  Plus,
  Save,
  Send,
  Sparkles,
  Square,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import RecordStatusBadge from "./RecordStatusBadge";

const TimesheetRouteMap = dynamic(() => import("./TimesheetRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-slate-400">
      Loading shift route map...
    </div>
  ),
});
import {
  createBulkDraftTimeEntriesAction,
  createPastDraftTimeEntry,
  deleteDraftTimeEntry,
  saveDraftTimeEntry,
  submitSelectedTimesheets,
  submitTimesheetCorrection,
} from "@/lib/time-tracking/actions";
import type {
  CompanyLiveTimeOverview,
  CompanyPublicHoliday,
  EmployeeScheduleInfo,
  TimeEntryRecord,
  TimesheetCorrectionRequest,
} from "@/lib/time-tracking/schema";
import type { LeaveRequest } from "@/lib/work-rules/schema";
import { usePanel, useWorkspaceSection } from "@/components/dashboard/workspace-context";
import AnalogTimePicker from "@/components/time-tracking/AnalogTimePicker";

type EmployeeTimesheetCorrectionsProps = {
  collapsedCalendar?: boolean;
  correctionRequests: TimesheetCorrectionRequest[];
  currentWorkDate: string;
  entries: TimeEntryRecord[];
  leaveRequests?: LeaveRequest[];
  publicHolidays: CompanyPublicHoliday[];
  liveOverview?: CompanyLiveTimeOverview | null;
  workSchedule?: EmployeeScheduleInfo | null;
  todaySchedule?: {
    start_time: string | null;
    end_time: string | null;
    lunch_minutes: number;
    is_working_day: boolean;
  } | null;
  defaultLunchMinutes?: number;
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

function getDateBadgeParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return {
    day: String(day),
    month: new Intl.DateTimeFormat("en-ZA", { month: "short" }).format(date).toUpperCase(),
    weekday: new Intl.DateTimeFormat("en-ZA", { weekday: "short" }).format(date),
  };
}

function getEntryWorkstationName(entry: TimeEntryRecord): string | null {
  return entry.locationEvents?.find((e) => e.workstationName)?.workstationName ?? null;
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
  if (status === "out_of_range") return "Deviance · Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null | undefined) {
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-rose-400 bg-rose-100/90 text-rose-800 font-bold";
  if (status === "no_location") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-surface-muted text-muted";
}


function renderLocationHistory(entry: TimeEntryRecord) {
  const events = entry.locationEvents ?? [];
  const deviances = events.filter((e) => e.geofence_status === "out_of_range");

  return (
    <details className="rounded-md border border-border/70 bg-surface/80">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-accent" />
          Location history ({events.length})
        </span>
        {deviances.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800 border border-rose-300">
            <AlertTriangle className="size-2.5 text-rose-600" />
            {deviances.length} deviance{deviances.length > 1 ? "s" : ""}
          </span>
        )}
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {events.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted">
            No location events were captured for this shift.
          </p>
        ) : (
          events.map((event) => {
            const isOutOfRange = event.geofence_status === "out_of_range";
            const eventLabel =
              event.event_type === "clock_in"
                ? "Clock In"
                : event.event_type === "lunch_start"
                ? "Take Lunch"
                : event.event_type === "lunch_end"
                ? "Return from Lunch"
                : event.event_type === "clock_out"
                ? "Clock Out"
                : event.event_type === "app_interaction"
                ? "App Interaction"
                : event.event_type.replaceAll("_", " ");

            return (
              <div
                key={event.id}
                className={`grid gap-2 px-3 py-2 sm:grid-cols-[130px_1fr_auto] sm:items-center ${
                  isOutOfRange ? "bg-rose-50/70" : ""
                }`}
              >
                <div>
                  <p className="font-semibold capitalize text-foreground">
                    {eventLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatTime(event.local_event_time)}
                  </p>
                </div>
                <div className="min-w-0 text-xs text-muted">
                  <p className="break-words leading-tight">
                    {event.workstationName ?? "No workstation"}
                    {event.distance_meters !== null
                      ? ` - ${Math.round(event.distance_meters)}m away`
                      : ""}
                    {event.latitude !== null && event.longitude !== null
                      ? ` • ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
                      : isOutOfRange
                      ? " • Outside radius (Coordinates hidden for privacy)"
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
            );
          })
        )}
      </div>
    </details>
  );
}

function timesheetCalendarClass(entry: TimeEntryRecord, isHoliday: boolean, isFixed: boolean = false) {
  if (isHoliday) return "cw-calendar-holiday-booked";
  if (isFixed) return "cw-calendar-fixed";
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
    ? "bg-primary text-white shadow-soft font-bold rounded-full"
    : "border border-border/80 bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground font-semibold rounded-full";
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getScheduleTemplate(
  schedule: EmployeeScheduleInfo | null | undefined,
  todaySchedule: {
    start_time: string | null;
    end_time: string | null;
    lunch_minutes: number;
    is_working_day: boolean;
  } | null | undefined,
  defaultLunchMinutes: number = 60,
  targetDate?: string,
) {
  let startTime = "08:00";
  let endTime = "17:00";
  let lunchMinutes = defaultLunchMinutes > 0 ? defaultLunchMinutes : 60;
  const scheduleName = schedule?.name ?? "Standard Work Schedule";

  if (schedule?.days && schedule.days.length > 0) {
    let day: (typeof schedule.days)[0] | undefined;
    if (targetDate) {
      const [y, m, d] = targetDate.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      day = schedule.days.find((item) => item.day_of_week === dayOfWeek && item.is_working_day);
    }
    if (!day) {
      day =
        schedule.days.find((item) => item.is_working_day && item.start_time && item.end_time) ??
        schedule.days[0];
    }
    if (day) {
      if (day.start_time) startTime = day.start_time.slice(0, 5);
      if (day.end_time) endTime = day.end_time.slice(0, 5);
      if (day.lunch_minutes > 0) lunchMinutes = day.lunch_minutes;
    }
  } else if (todaySchedule) {
    if (todaySchedule.start_time) startTime = todaySchedule.start_time.slice(0, 5);
    if (todaySchedule.end_time) endTime = todaySchedule.end_time.slice(0, 5);
    if (todaySchedule.lunch_minutes > 0) lunchMinutes = todaySchedule.lunch_minutes;
  }

  // Derive lunch break interval (mandatory lunch insertion)
  const [sh = 8, sm = 0] = startTime.split(":").map(Number);
  const [eh = 17, em = 0] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const duration = lunchMinutes > 0 ? lunchMinutes : 60;

  let lunchStartMins = 13 * 60; // 13:00 default
  if (lunchStartMins <= startMins || lunchStartMins + duration >= endMins) {
    lunchStartMins = startMins + Math.floor((endMins - startMins - duration) / 2);
    lunchStartMins = Math.round(lunchStartMins / 15) * 15;
  }
  const lunchEndMins = lunchStartMins + duration;

  const toTime = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return {
    scheduleName,
    clock_in: startTime,
    lunch_start: toTime(lunchStartMins),
    lunch_end: toTime(lunchEndMins),
    clock_out: endTime,
    lunch_minutes: duration,
  };
}

function getPresetDates(preset: "this_week" | "last_week" | "last_14_days" | "this_month", currentWorkDate: string) {
  const [y = 2026, m = 1, d = 1] = currentWorkDate.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  const dayOfWeek = cur.getDay(); // 0 is Sun, 1 is Mon...

  const yesterday = new Date(cur);
  yesterday.setDate(yesterday.getDate() - 1);
  const formatDateStr = (date: Date) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const da = String(date.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  };

  if (preset === "this_week") {
    const diffToMon = (dayOfWeek + 6) % 7;
    const mon = new Date(cur);
    mon.setDate(cur.getDate() - diffToMon);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    const end = fri < yesterday ? fri : yesterday;
    return {
      start: formatDateStr(mon),
      end: formatDateStr(end < mon ? mon : end),
    };
  } else if (preset === "last_week") {
    const diffToMon = (dayOfWeek + 6) % 7;
    const lastMon = new Date(cur);
    lastMon.setDate(cur.getDate() - diffToMon - 7);
    const lastFri = new Date(lastMon);
    lastFri.setDate(lastMon.getDate() + 4);
    return {
      start: formatDateStr(lastMon),
      end: formatDateStr(lastFri),
    };
  } else if (preset === "last_14_days") {
    const start = new Date(yesterday);
    start.setDate(yesterday.getDate() - 13);
    return {
      start: formatDateStr(start),
      end: formatDateStr(yesterday),
    };
  } else {
    const start = new Date(y, m - 1, 1);
    return {
      start: formatDateStr(start),
      end: formatDateStr(yesterday < start ? start : yesterday),
    };
  }
}

export default function EmployeeTimesheetCorrections({
  collapsedCalendar = false,
  correctionRequests,
  currentWorkDate,
  entries,
  leaveRequests = [],
  publicHolidays,
  liveOverview = null,
  workSchedule = null,
  todaySchedule = null,
  defaultLunchMinutes = 60,
}: EmployeeTimesheetCorrectionsProps) {

  const [attendanceFilter, setAttendanceFilter] = useState<"working" | "on_lunch" | "worked" | "not_started" | "all">("working");

  const filteredAttendanceColleagues = useMemo(() => {
    if (!liveOverview?.entries) return [];
    if (attendanceFilter === "working") {
      return liveOverview.entries.filter((c) => c.status === "working");
    }
    if (attendanceFilter === "on_lunch") {
      return liveOverview.entries.filter((c) => c.status === "on_lunch");
    }
    if (attendanceFilter === "worked") {
      return liveOverview.entries.filter((c) => c.status === "worked");
    }
    if (attendanceFilter === "not_started") {
      return liveOverview.entries.filter((c) => c.status === "not_started");
    }
    return liveOverview.entries;
  }, [liveOverview, attendanceFilter]);

  const [activeTab, setActiveTab] = useState<"timesheets" | "requests">("timesheets");
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>("month");

  useEffect(() => {
    if (window.innerWidth < 640) setCalendarWindow("day");
    else if (window.innerWidth < 768) setCalendarWindow("week");
  }, []);
  const section = useWorkspaceSection();
  const { openPanel } = usePanel();

  const [showLegend, setShowLegend] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(!collapsedCalendar);
  const [selectedDate, setSelectedDate] = useState("");
  const [detailEntry, setDetailEntry] = useState<TimeEntryRecord | null>(null);
  const [showDetailMap, setShowDetailMap] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState(currentWorkDate);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());
  const [selectorFilter, setSelectorFilter] = useState<"all" | "ready" | "fixed" | "attention">("all");
  const lastClickedEntryIdRef = useRef<string | null>(null);
  const [acknowledgedFlags, setAcknowledgedFlags] = useState(false);
  const [expandedDraftIds, setExpandedDraftIds] = useState<Set<string>>(() => new Set());
  const [pulsatingEntryId, setPulsatingEntryId] = useState<string | null>(null);
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
  const [fixedEntryIds, setFixedEntryIds] = useState<Set<string>>(() => new Set());
  const [modifiedEntryIds, setModifiedEntryIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("cw_fixed_timesheet_ids");
      if (stored) {
        setFixedEntryIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "cw_fixed_timesheet_ids",
        JSON.stringify(Array.from(fixedEntryIds)),
      );
    } catch {
      // Ignore storage errors
    }
  }, [fixedEntryIds]);

  const isEntryFixed = useCallback(
    (entry: TimeEntryRecord | null | undefined): boolean => {
      if (!entry) return false;
      if (
        entry.status === "submitted" ||
        entry.status === "approved" ||
        entry.status === "locked" ||
        entry.status === "cancelled"
      ) {
        return false;
      }
      const managerNote = extractManagerNote(entry.notes);
      const wasRejected = Boolean(managerNote);
      if (entry.status === "draft" && wasRejected) return true;
      if (fixedEntryIds.has(entry.id)) return true;
      if (entry.status === "rejected" && modifiedEntryIds.has(entry.id)) return true;
      return false;
    },
    [fixedEntryIds, modifiedEntryIds],
  );

  const handleEntryModified = (id: string) => {
    setModifiedEntryIds((prev) => new Set(prev).add(id));
  };

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
      const label = `${isEntryFixed(e) ? "fixed" : e.status} - ${formatHours(e.paid_hours)}`;
      prev.push(label);
      map.set(e.work_date, prev);
    }
    return map;
  }, [entries, publicHolidays, holidayDates, isEntryFixed]);
  const [createState, createAction, createPending] = useActionState(
    createPastDraftTimeEntry,
    initialState,
  );
  const [bulkState, bulkAction, bulkPending] = useActionState(
    createBulkDraftTimeEntriesAction,
    initialState,
  );
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const scheduleTemplate = useMemo(
    () => getScheduleTemplate(workSchedule, todaySchedule, defaultLunchMinutes),
    [workSchedule, todaySchedule, defaultLunchMinutes],
  );

  const initialPreset = useMemo(
    () => getPresetDates("last_week", currentWorkDate),
    [currentWorkDate],
  );

  const [bulkStartDate, setBulkStartDate] = useState(initialPreset.start);
  const [bulkEndDate, setBulkEndDate] = useState(initialPreset.end);
  const [bulkExcludeWeekends, setBulkExcludeWeekends] = useState(true);
  const [bulkClockIn, setBulkClockIn] = useState(scheduleTemplate.clock_in);
  const [bulkLunchStart, setBulkLunchStart] = useState(scheduleTemplate.lunch_start);
  const [bulkLunchEnd, setBulkLunchEnd] = useState(scheduleTemplate.lunch_end);
  const [bulkClockOut, setBulkClockOut] = useState(scheduleTemplate.clock_out);
  const [bulkNotes, setBulkNotes] = useState("Bulk draft generated from work schedule template");

  useEffect(() => {
    setBulkClockIn(scheduleTemplate.clock_in);
    setBulkLunchStart(scheduleTemplate.lunch_start);
    setBulkLunchEnd(scheduleTemplate.lunch_end);
    setBulkClockOut(scheduleTemplate.clock_out);
  }, [scheduleTemplate]);

  useEffect(() => {
    if (bulkState.ok && bulkState.message) {
      setIsBulkModalOpen(false);
    }
  }, [bulkState]);

  const [draftOverrides, setDraftOverrides] = useState<
    Map<string, { clock_in?: string; lunch_start?: string; lunch_end?: string; clock_out?: string }>
  >(() => new Map());

  const applyTemplateToDraft = useCallback(
    (entry: TimeEntryRecord) => {
      const tpl = getScheduleTemplate(workSchedule, todaySchedule, defaultLunchMinutes, entry.work_date);
      setDraftOverrides((prev) => {
        const next = new Map(prev);
        next.set(entry.id, {
          clock_in: tpl.clock_in,
          lunch_start: tpl.lunch_start,
          lunch_end: tpl.lunch_end,
          clock_out: tpl.clock_out,
        });
        return next;
      });
      handleEntryModified(entry.id);
    },
    [workSchedule, todaySchedule, defaultLunchMinutes, handleEntryModified],
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
    async (prev: CorrectionActionState, formData: FormData) => {
      const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
      const result = await saveDraftTimeEntry(prev, formData);
      if (result.ok && timeEntryId) {
        setFixedEntryIds((current) => new Set(current).add(timeEntryId));
        setModifiedEntryIds((current) => {
          const next = new Set(current);
          next.delete(timeEntryId);
          return next;
        });
      }
      return result;
    },
    initialState,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    async (prev: CorrectionActionState, formData: FormData) => {
      const result = await submitSelectedTimesheets(prev, formData);
      if (result.ok) {
        setSelectedEntryIds(new Set());
        setFixedEntryIds((current) => {
          const next = new Set(current);
          const submittedIds = formData.getAll("time_entry_ids").map(String);
          submittedIds.forEach((id) => next.delete(id));
          return next;
        });
        setModifiedEntryIds(new Set());
      }
      return result;
    },
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
  const leaveByDate = useMemo(() => {
    const map = new Map<string, LeaveRequest>();
    for (const lr of leaveRequests ?? []) {
      const [sy, sm, sd] = lr.start_date.split("-").map(Number);
      const [ey, em, ed] = lr.end_date.split("-").map(Number);
      const curr = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        map.set(`${y}-${m}-${d}`, lr);
        curr.setDate(curr.getDate() + 1);
      }
    }
    return map;
  }, [leaveRequests]);

  const calendarEvents = useMemo<EventInput[]>(() => {
    const timesheetEvents = entries
      .filter(
        (entry) =>
          !holidayDates.has(entry.work_date) &&
          !entry.notes?.startsWith("Public holiday:"),
      )
      .map((entry) => {
        const isFixed = isEntryFixed(entry);
        const needsAttention = (entry.missing_clocking || entry.late_arrival || entry.early_departure) && !isFixed;

        return {
          id: entry.id,
          title: `${isFixed ? "fixed" : entry.status} - ${formatHours(entry.paid_hours)}`,
          start: entry.work_date,
          allDay: true,
          classNames: [
            timesheetCalendarClass(entry, false, isFixed),
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

    const existingDateSet = new Set(entries.map((e) => e.work_date));
    const leaveRequestEvents: EventInput[] = [];

    for (const lr of leaveRequests ?? []) {
      const [sy, sm, sd] = lr.start_date.split("-").map(Number);
      const [ey, em, ed] = lr.end_date.split("-").map(Number);
      const curr = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);

      while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;

        if (!existingDateSet.has(dateStr) && !holidayDates.has(dateStr)) {
          const isApproved = lr.status === "approved";
          const isPending = lr.status === "submitted" || lr.status === "draft";
          leaveRequestEvents.push({
            id: `leave-${lr.id}-${dateStr}`,
            title: `${lr.leaveTypeName || "Leave"} (${isApproved ? "Approved" : isPending ? "Pending" : lr.status})`,
            start: dateStr,
            allDay: true,
            classNames: [
              "cw-calendar-leave",
              isApproved ? "cw-calendar-leave-approved" : isPending ? "cw-calendar-leave-pending" : "cw-calendar-leave-rejected",
            ],
            extendedProps: { leaveRequest: lr, isLeave: true },
          });
        }
        curr.setDate(curr.getDate() + 1);
      }
    }

    return [...holidayEvents, ...timesheetEvents, ...leaveRequestEvents];
  }, [entries, leaveRequests, publicHolidays, holidayDates, isEntryFixed]);
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

  const timesheetSectionRef = useRef<HTMLDivElement>(null);

  const scrollToTimesheetSection = useCallback(() => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      timesheetSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Timesheets Tab Pagination
  const [timesheetsPage, setTimesheetsPage] = useState(1);
  const [timesheetsPageSize, setTimesheetsPageSize] = useState(12);

  const totalTimesheets = filteredEntries.length;
  const totalTimesheetsPages = Math.max(1, Math.ceil(totalTimesheets / timesheetsPageSize));

  useEffect(() => {
    if (timesheetsPage > totalTimesheetsPages) {
      setTimesheetsPage(1);
    }
  }, [timesheetsPage, totalTimesheetsPages]);

  const paginatedEntries = useMemo(() => {
    const startIndex = (timesheetsPage - 1) * timesheetsPageSize;
    return filteredEntries.slice(startIndex, startIndex + timesheetsPageSize);
  }, [filteredEntries, timesheetsPage, timesheetsPageSize]);

  const timesheetStartIndex = totalTimesheets > 0 ? (timesheetsPage - 1) * timesheetsPageSize + 1 : 0;
  const timesheetEndIndex = Math.min(timesheetsPage * timesheetsPageSize, totalTimesheets);

  const handleTimesheetsPageChange = useCallback((page: number) => {
    setTimesheetsPage(page);
    scrollToTimesheetSection();
  }, [scrollToTimesheetSection]);

  // Requests Tab Pagination
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPageSize, setRequestsPageSize] = useState(12);

  const totalRequests = submittedEntries.length;
  const totalRequestsPages = Math.max(1, Math.ceil(totalRequests / requestsPageSize));

  useEffect(() => {
    if (requestsPage > totalRequestsPages) {
      setRequestsPage(1);
    }
  }, [requestsPage, totalRequestsPages]);

  const paginatedSubmittedEntries = useMemo(() => {
    const startIndex = (requestsPage - 1) * requestsPageSize;
    return submittedEntries.slice(startIndex, startIndex + requestsPageSize);
  }, [submittedEntries, requestsPage, requestsPageSize]);

  const requestStartIndex = totalRequests > 0 ? (requestsPage - 1) * requestsPageSize + 1 : 0;
  const requestEndIndex = Math.min(requestsPage * requestsPageSize, totalRequests);

  const handleRequestsPageChange = useCallback((page: number) => {
    setRequestsPage(page);
    scrollToTimesheetSection();
  }, [scrollToTimesheetSection]);

  const handleTabChange = useCallback((tab: "timesheets" | "requests") => {
    setActiveTab(tab);
    scrollToTimesheetSection();
  }, [scrollToTimesheetSection]);

  useEffect(() => {
    const handleHighlight = (detail?: { highlightEntryId?: string | null; mode?: string | null }) => {
      let targetId = detail?.highlightEntryId || null;
      let targetMode = detail?.mode || null;

      if (!targetId && typeof window !== "undefined") {
        const search = new URLSearchParams(window.location.search);
        targetId = search.get("highlightEntryId");
        targetMode = search.get("mode");
      }

      if (!targetId) return;

      const foundEntry = entries.find((e) => e.id === targetId);
      if (!foundEntry) return;

      // Ensure Timesheets tab is active and calendar focus date jumps to this date
      setActiveTab("timesheets");
      setCalendarFocusDate(foundEntry.work_date);

      // Check if entry needs edit (rejected or draft)
      const isReject = foundEntry.status === "rejected" || targetMode === "edit";
      if (isReject) {
        setExpandedDraftIds((prev) => new Set(prev).add(targetId!));
        setSelectorFilter("all");
      } else {
        setPulsatingEntryId(targetId);
      }

      // Calculate which page of pagination this entry is on
      const entryIdx = filteredEntries.findIndex((e) => e.id === targetId);
      if (entryIdx !== -1) {
        const targetPage = Math.floor(entryIdx / timesheetsPageSize) + 1;
        setTimesheetsPage(targetPage);
      }

      // Smooth scroll into view
      setTimeout(() => {
        const el = document.getElementById(`timesheet-entry-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 350);
    };

    handleHighlight();

    const handleNavEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleHighlight(detail);
    };

    window.addEventListener("clockwise:notification-nav", handleNavEvent);
    window.addEventListener("popstate", () => handleHighlight());

    return () => {
      window.removeEventListener("clockwise:notification-nav", handleNavEvent);
      window.removeEventListener("popstate", () => handleHighlight());
    };
  }, [entries, filteredEntries, timesheetsPageSize]);

  const readyEntries = useMemo(
    () =>
      editableEntries.filter(
        (e) => !isEntryFixed(e) && !entryNeedsAttention(e) && e.status !== "rejected",
      ),
    [editableEntries, isEntryFixed],
  );
  const fixedEntries = useMemo(
    () => editableEntries.filter((e) => isEntryFixed(e)),
    [editableEntries, isEntryFixed],
  );
  const attentionEntries = useMemo(
    () =>
      editableEntries.filter(
        (e) => (entryNeedsAttention(e) || e.status === "rejected") && !isEntryFixed(e),
      ),
    [editableEntries, isEntryFixed],
  );

  const displayedEditableEntries = useMemo(() => {
    if (selectorFilter === "ready") return readyEntries;
    if (selectorFilter === "fixed") return fixedEntries;
    if (selectorFilter === "attention") return attentionEntries;
    return editableEntries;
  }, [selectorFilter, readyEntries, fixedEntries, attentionEntries, editableEntries]);

  const isAllDisplayedSelected =
    displayedEditableEntries.length > 0 &&
    displayedEditableEntries.every((e) => selectedEntryIds.has(e.id));

  const toggleEntrySelection = (entryId: string, shiftKey?: boolean) => {
    setAcknowledgedFlags(false);

    if (shiftKey && lastClickedEntryIdRef.current) {
      const lastIndex = displayedEditableEntries.findIndex(
        (e) => e.id === lastClickedEntryIdRef.current,
      );
      const currentIndex = displayedEditableEntries.findIndex((e) => e.id === entryId);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = displayedEditableEntries.slice(start, end + 1).map((e) => e.id);
        setSelectedEntryIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
        lastClickedEntryIdRef.current = entryId;
        return;
      }
    }

    lastClickedEntryIdRef.current = entryId;
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const selectAllDisplayed = () => {
    setAcknowledgedFlags(false);
    if (isAllDisplayedSelected) {
      setSelectedEntryIds((prev) => {
        const next = new Set(prev);
        displayedEditableEntries.forEach((e) => next.delete(e.id));
        return next;
      });
    } else {
      setSelectedEntryIds((prev) => {
        const next = new Set(prev);
        displayedEditableEntries.forEach((e) => next.add(e.id));
        return next;
      });
    }
  };

  const selectByType = (type: "ready" | "fixed" | "all") => {
    setAcknowledgedFlags(false);
    if (type === "ready") {
      setSelectedEntryIds(new Set(readyEntries.map((e) => e.id)));
    } else if (type === "fixed") {
      setSelectedEntryIds(new Set(fixedEntries.map((e) => e.id)));
    } else {
      setSelectedEntryIds(new Set(editableEntries.map((e) => e.id)));
    }
  };

  const clearSelection = () => {
    setSelectedEntryIds(new Set());
    lastClickedEntryIdRef.current = null;
    setAcknowledgedFlags(false);
  };
  const flaggedSelected = editableEntries.filter(
    (entry) => selectedEntryIds.has(entry.id) && entryNeedsAttention(entry) && !isEntryFixed(entry),
  );
  const hasFlaggedSelected = flaggedSelected.length > 0;
  const hasFixedSelected = editableEntries.some(
    (entry) => selectedEntryIds.has(entry.id) && isEntryFixed(entry),
  );
  const hasRejectedSelected = editableEntries.some(
    (entry) => selectedEntryIds.has(entry.id) && entry.status === "rejected" && !isEntryFixed(entry),
  );
  const submitBlocked =
    selectedEntryIds.size === 0 || (hasFlaggedSelected && !acknowledgedFlags);
  const message =
    bulkState.message ||
    createState.message ||
    deleteState.message ||
    correctionState.message ||
    saveState.message ||
    submitState.message;
  const messageOk = bulkState.message
    ? bulkState.ok
    : createState.message
      ? createState.ok
      : deleteState.message
        ? deleteState.ok
        : correctionState.message
          ? correctionState.ok
          : saveState.message
            ? saveState.ok
            : submitState.ok;
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
    const isFixed = isEntryFixed(entry);
    const editable = entry.status === "draft" || entry.status === "rejected";
    const isDraft = entry.status === "draft" && !isFixed;
    const rejected = entry.status === "rejected" && !isFixed;
    const isApproved = entry.status === "approved";
    const managerNote = extractManagerNote(entry.notes);
    const isExpanded = expandedDraftIds.has(entry.id);
    const dateParts = getDateBadgeParts(entry.work_date);

    let cardBg = "bg-slate-800 text-white ring-1 ring-slate-900/60";
    let dateBoxBg = "bg-slate-900/80 border-slate-700 text-white";
    let statusDotColor = "bg-emerald-400 ring-slate-800";
    let subtitleText = "Submitted · Pending Approval";
    let subtitleColor = "text-slate-300";
    let badgeBg = "bg-slate-900/80 text-emerald-400 border border-slate-700";
    let badgeText = "Submitted";
    let badgeIcon = <CheckCircle2 className="size-2.5 text-emerald-400" />;
    let footerLeftBg = "bg-slate-700/80 text-slate-200";
    let footerRightBg = "bg-slate-900/60 text-slate-300 border border-slate-700";

    if (isApproved) {
      cardBg = "bg-emerald-700 text-white ring-1 ring-emerald-800/60";
      dateBoxBg = "bg-emerald-800/80 border-emerald-500/50 text-white";
      statusDotColor = "bg-emerald-300 ring-emerald-700";
      subtitleText = "Approved Timesheet";
      subtitleColor = "text-emerald-100";
      badgeBg = "bg-emerald-950/40 text-emerald-200 border border-emerald-400/30";
      badgeText = "Approved";
      badgeIcon = <CheckCircle2 className="size-2.5 text-emerald-300" />;
      footerLeftBg = "bg-emerald-800/80 text-emerald-100";
      footerRightBg = "bg-emerald-950/40 text-white border border-emerald-400/20";
    } else if (isFixed) {
      cardBg = "bg-emerald-800 text-white ring-1 ring-emerald-900/60";
      dateBoxBg = "bg-emerald-900/80 border-emerald-500/50 text-white";
      statusDotColor = "bg-emerald-300 ring-emerald-800";
      subtitleText = "Fixed · Ready to Submit";
      subtitleColor = "text-emerald-100";
      badgeBg = "bg-emerald-950/40 text-emerald-200 border border-emerald-400/30";
      badgeText = "Fixed";
      badgeIcon = <CheckCircle2 className="size-2.5 text-emerald-300" />;
      footerLeftBg = "bg-emerald-900/80 text-emerald-100";
      footerRightBg = "bg-emerald-950/40 text-white border border-emerald-400/20";
    } else if (rejected) {
      cardBg = "bg-rose-700 text-white ring-1 ring-rose-800/60";
      dateBoxBg = "bg-rose-800/80 border-rose-500/50 text-white";
      statusDotColor = "bg-rose-300 ring-rose-700";
      subtitleText = "Action Required · Rejected";
      subtitleColor = "text-rose-100";
      badgeBg = "bg-rose-950/50 text-rose-200 border border-rose-400/30";
      badgeText = "Rejected";
      badgeIcon = <AlertTriangle className="size-2.5 text-rose-200" />;
      footerLeftBg = "bg-rose-800/80 text-rose-100";
      footerRightBg = "bg-rose-950/50 text-white border border-rose-400/20";
    } else if (isDraft || editable) {
      cardBg = "bg-amber-700 text-white ring-1 ring-amber-800/80";
      dateBoxBg = "bg-amber-800/90 border-amber-400/50 text-white";
      statusDotColor = "bg-amber-300 ring-amber-700";
      subtitleText = "Draft Timesheet";
      subtitleColor = "text-white/85";
      badgeBg = "bg-black/25 text-white border border-white/20";
      badgeText = "Draft";
      badgeIcon = <Edit3 className="size-2.5 text-white" />;
      footerLeftBg = "bg-black/20 text-white";
      footerRightBg = "bg-black/25 text-white border border-white/20";
    }

    const isPulsating = pulsatingEntryId === entry.id;

    return (
      <article
        key={entry.id}
        id={`timesheet-entry-${entry.id}`}
        className={`group flex flex-col justify-between gap-2.5 rounded-xl p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md min-w-0 w-full max-w-full scroll-mt-20 sm:scroll-mt-24 ${cardBg} ${
          isPulsating ? "cw-timesheet-pulsating ring-4 ring-emerald-400" : ""
        }`}
      >
        {/* Top: Date Monogram Box, Date & Status Badge */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative shrink-0">
              <div
                className={`flex size-8.5 flex-col items-center justify-center rounded-lg border shadow-xs leading-none select-none ${dateBoxBg}`}
              >
                <span className="text-[8px] font-bold uppercase tracking-wider opacity-80">
                  {dateParts.month}
                </span>
                <span className="text-xs font-black mt-0.5">
                  {dateParts.day}
                </span>
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ${statusDotColor}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-white break-words leading-tight">
                {formatDate(entry.work_date)}
              </p>
              <p className={`text-[11px] font-medium break-words leading-tight mt-0.5 ${subtitleColor}`}>
                {subtitleText}
              </p>
            </div>
          </div>

          <RecordStatusBadge
            status={isApproved ? "verified" : entry.status}
            isFixed={isFixed}
          />
        </div>

        {/* Pulsating Indicator for Approved Timesheet clicked from notification */}
        {isPulsating ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-950/80 p-2 text-xs font-black text-emerald-200 border border-emerald-400 shadow-md">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-300 animate-pulse" />
            <span>Approved Timesheet Verified &amp; Highlighted</span>
          </div>
        ) : null}

        {/* Manager note / alerts */}
        {isFixed ? (
          <div className="flex items-center gap-2 rounded-md bg-emerald-950/40 p-2 text-[11px] font-semibold text-emerald-100 border border-emerald-400/30">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <p className="font-extrabold text-white">Timesheet fixed &amp; ready to resubmit</p>
              {managerNote ? (
                <p className="text-[10px] text-emerald-200 mt-0.5 truncate">Note: &ldquo;{managerNote}&rdquo;</p>
              ) : null}
            </div>
          </div>
        ) : rejected ? (
          <div className="rounded-md bg-rose-950/60 p-2 text-[11px] font-semibold text-rose-100 border border-rose-400/30">
            {managerNote
              ? `Rejected by manager: ${managerNote}`
              : "This timesheet was rejected. Correct recorded times below and resubmit."}
          </div>
        ) : null}

        {/* Leave application status banner if leave or time off was requested for this day */}
        {leaveByDate.has(entry.work_date) ? (() => {
          const lr = leaveByDate.get(entry.work_date)!;
          const isApproved = lr.status === "approved";
          const isPending = lr.status === "submitted" || lr.status === "draft";
          const isRejected = lr.status === "rejected";
          return (
            <div className={`flex items-center justify-between gap-2 rounded-md p-2 text-[11px] font-semibold border ${
              isApproved
                ? "bg-emerald-950/40 text-emerald-100 border-emerald-400/30"
                : isRejected
                  ? "bg-rose-950/40 text-rose-100 border-rose-400/30"
                  : "bg-amber-950/40 text-amber-100 border-amber-400/30"
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <Calendar className="size-3.5 shrink-0 text-amber-200" />
                <span className="truncate">
                  {lr.leaveTypeName || "Leave"} · {lr.total_hours}h {lr.reason?.includes("Time Off") ? "(Time Off)" : ""}
                </span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                isApproved
                  ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                  : isRejected
                    ? "bg-rose-500/20 text-rose-200 border border-rose-400/30"
                    : "bg-amber-500/20 text-amber-200 border border-amber-400/30"
              }`}>
                {isPending ? "Pending Approval" : lr.status}
              </span>
            </div>
          );
        })() : null}

        {/* Middle: High-Contrast Inset White Metrics Box OR Expanded Editor */}
        {editable && isExpanded ? (
          <form action={saveAction} className="grid gap-2 min-w-0 w-full rounded-md bg-white p-2.5 text-slate-900 shadow-xs">
            <input type="hidden" name="time_entry_id" value={entry.id} />
            
            {/* Quick schedule template loader bar */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="size-3 text-slate-400" />
                Draft Times
              </span>
              <button
                type="button"
                onClick={() => applyTemplateToDraft(entry)}
                className="inline-flex items-center gap-1 rounded bg-amber-50 hover:bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 border border-amber-200/80 transition-colors shadow-2xs"
                title={`Load schedule template: ${scheduleTemplate.scheduleName} (${scheduleTemplate.clock_in} - ${scheduleTemplate.clock_out})`}
              >
                <Sparkles className="size-2.5 text-amber-600" />
                Load Work Schedule
              </button>
            </div>

            <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1 min-w-0 w-full">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-1 min-w-0 text-center">
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 truncate block">In</span>
                <AnalogTimePicker
                  name="clock_in"
                  value={draftOverrides.get(entry.id)?.clock_in !== undefined ? draftOverrides.get(entry.id)!.clock_in : inputTime(entry.clock_in)}
                  onChange={(e) => {
                    setDraftOverrides((prev) => new Map(prev).set(entry.id, { ...(prev.get(entry.id) ?? {}), clock_in: e.target.value }));
                    handleEntryModified(entry.id);
                  }}
                  compact
                  className="mt-0.5 flex h-6 w-full items-center justify-center gap-1 rounded bg-transparent px-1 text-[11px] sm:text-xs font-black text-slate-900 outline-none text-center hover:bg-slate-200/60 transition-colors"
                />
              </div>
              <div className="rounded-md border border-amber-200/80 bg-amber-50/50 p-1 min-w-0 text-center relative">
                <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-amber-800 truncate block">
                  Lunch In
                </span>
                <AnalogTimePicker
                  name="lunch_start"
                  value={draftOverrides.get(entry.id)?.lunch_start !== undefined ? draftOverrides.get(entry.id)!.lunch_start : inputTime(entry.lunch_start)}
                  onChange={(e) => {
                    setDraftOverrides((prev) => new Map(prev).set(entry.id, { ...(prev.get(entry.id) ?? {}), lunch_start: e.target.value }));
                    handleEntryModified(entry.id);
                  }}
                  compact
                  className="mt-0.5 flex h-6 w-full items-center justify-center gap-1 rounded bg-transparent px-1 text-[11px] sm:text-xs font-black text-slate-900 outline-none text-center hover:bg-slate-200/60 transition-colors"
                />
              </div>
              <div className="rounded-md border border-amber-200/80 bg-amber-50/50 p-1 min-w-0 text-center relative">
                <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-amber-800 truncate block">
                  Lunch Out
                </span>
                <AnalogTimePicker
                  name="lunch_end"
                  value={draftOverrides.get(entry.id)?.lunch_end !== undefined ? draftOverrides.get(entry.id)!.lunch_end : inputTime(entry.lunch_end)}
                  onChange={(e) => {
                    setDraftOverrides((prev) => new Map(prev).set(entry.id, { ...(prev.get(entry.id) ?? {}), lunch_end: e.target.value }));
                    handleEntryModified(entry.id);
                  }}
                  compact
                  className="mt-0.5 flex h-6 w-full items-center justify-center gap-1 rounded bg-transparent px-1 text-[11px] sm:text-xs font-black text-slate-900 outline-none text-center hover:bg-slate-200/60 transition-colors"
                />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-1 min-w-0 text-center">
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 truncate block">Out</span>
                <AnalogTimePicker
                  name="clock_out"
                  value={draftOverrides.get(entry.id)?.clock_out !== undefined ? draftOverrides.get(entry.id)!.clock_out : inputTime(entry.clock_out)}
                  onChange={(e) => {
                    setDraftOverrides((prev) => new Map(prev).set(entry.id, { ...(prev.get(entry.id) ?? {}), clock_out: e.target.value }));
                    handleEntryModified(entry.id);
                  }}
                  compact
                  className="mt-0.5 flex h-6 w-full items-center justify-center gap-1 rounded bg-transparent px-1 text-[11px] sm:text-xs font-black text-slate-900 outline-none text-center hover:bg-slate-200/60 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-md bg-amber-50/80 border border-amber-200/60 px-2 py-1 text-[10px] font-semibold text-amber-900">
              <UtensilsCrossed className="size-3 text-amber-600 shrink-0" />
              <span>Lunch break is required on draft timesheets for labor compliance.</span>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-1.5 min-w-0 w-full">
              <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 truncate block">Note</span>
              <textarea
                name="notes"
                rows={1}
                defaultValue={entry.notes ?? ""}
                onChange={() => handleEntryModified(entry.id)}
                className="mt-0.5 w-full bg-transparent text-[11px] sm:text-xs font-medium text-slate-900 outline-none resize-none"
                placeholder="Optional timesheet note"
              />
            </div>

            {renderLocationHistory(entry)}

            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
              <button
                formAction={deleteAction}
                disabled={deletePending}
                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 className="size-3" />
                {deletePending ? "Deleting..." : "Delete"}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleDraftExpand(entry.id)}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  disabled={savePending}
                  className={`inline-flex items-center justify-center gap-1 rounded px-3 py-1 text-[11px] font-extrabold text-white shadow-xs disabled:opacity-50 ${isFixed || entry.status === "rejected"
                    ? "bg-teal-600 hover:bg-teal-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                >
                  <Save className="size-3" />
                  {savePending
                    ? "Saving..."
                    : isFixed || entry.status === "rejected"
                      ? "Save Corrections"
                      : "Save Draft"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-4 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
              <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(entry.clock_in)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Lunch</p>
              <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortLunch(entry.lunch_start, entry.lunch_end)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Out</p>
              <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(entry.clock_out)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Total</p>
              <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(entry.paid_hours)}</p>
            </div>
          </div>
        )}

        {entry.warning_notes ? (
          <div className="rounded-md bg-black/35 p-1.5 text-[11px] font-medium text-white border border-white/20">
            {entry.warning_notes}
          </div>
        ) : null}

        {/* Footer Pills */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0 pt-0.5">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 font-semibold text-[10px] break-words ${footerLeftBg}`}
            title={getEntryWorkstationName(entry) ?? "Workstation logged"}
          >
            <MapPin className="mr-1 inline size-2.5 shrink-0 opacity-80" />
            <span className="break-words leading-tight">
              {getEntryWorkstationName(entry) ?? "Workstation"}
            </span>
          </span>

          <div className="flex items-center gap-1.5">
            {editable ? (
              <button
                type="button"
                onClick={() => toggleDraftExpand(entry.id)}
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-black text-slate-900 shadow-2xs hover:bg-slate-100 transition-colors"
                title={isExpanded ? "Collapse time editor" : "Edit times"}
              >
                <Edit3 className="size-2.5" />
                {isExpanded ? "Collapse" : "Edit"}
                <ChevronDown
                  className={`size-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : (
              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap border ${footerRightBg}`}>
                {Number(entry.overtime_hours ?? 0) > 0 ? `+${formatHours(entry.overtime_hours)} OT` : `${formatHours(entry.paid_hours)} Paid`}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  };

  const quickSubmitForm =
    editableEntries.length > 0 ? (
      <form action={submitAction} className="rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm sm:text-base font-extrabold text-foreground">Submit timesheets</p>
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold text-muted">
                {selectedEntryIds.size} of {editableEntries.length} selected
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Choose records to submit for approval. Tap any day to select, or use the quick buttons below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedEntryIds.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-muted hover:text-foreground hover:bg-surface-muted shadow-soft transition-colors"
              >
                <X className="size-3.5" />
                Clear
              </button>
            ) : null}
            <button
              disabled={submitBlocked || submitPending}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-soft hover:bg-primary-hover disabled:opacity-50 transition-all"
            >
              <Send className="size-3.5" />
              {submitPending
                ? "Submitting..."
                : selectedEntryIds.size === 0
                  ? "Select timesheets"
                  : hasFixedSelected && !hasRejectedSelected
                    ? `Resubmit fixed (${selectedEntryIds.size})`
                    : hasRejectedSelected
                      ? `Resubmit selected (${selectedEntryIds.size})`
                      : `Submit selected (${selectedEntryIds.size})`}
            </button>
          </div>
        </div>

        {/* Status Type Filters & Quick Actions */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectorFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${selectorFilter === "all"
                ? "bg-primary text-white shadow-soft"
                : "bg-surface-muted text-muted hover:text-foreground hover:bg-slate-200"
                }`}
            >
              All ({editableEntries.length})
            </button>
            {readyEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectorFilter("ready")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${selectorFilter === "ready"
                  ? "bg-primary text-white shadow-soft"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
              >
                Ready ({readyEntries.length})
              </button>
            )}
            {fixedEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectorFilter("fixed")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${selectorFilter === "fixed"
                  ? "bg-primary text-white shadow-soft"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
              >
                Fixed ({fixedEntries.length})
              </button>
            )}
            {attentionEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectorFilter("attention")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${selectorFilter === "attention"
                  ? "bg-amber-600 text-white shadow-soft"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
              >
                Needs Review ({attentionEntries.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={selectAllDisplayed}
              className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-bold text-foreground hover:bg-surface-muted shadow-soft transition-colors"
            >
              {isAllDisplayedSelected ? "Deselect view" : "Select all in view"}
            </button>
            {readyEntries.length > 0 && selectorFilter === "all" && (
              <button
                type="button"
                onClick={() => selectByType("ready")}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 shadow-soft transition-colors"
              >
                Select all Ready
              </button>
            )}
            {fixedEntries.length > 0 && selectorFilter === "all" && (
              <button
                type="button"
                onClick={() => selectByType("fixed")}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 shadow-soft transition-colors"
              >
                Select all Fixed
              </button>
            )}
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
          <div className="mt-3.5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950 shadow-soft">
            <div className="flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <span>Selected records that need attention:</span>
            </div>
            <p className="mt-1 font-semibold text-amber-900">
              {flaggedSelected.map((entry) => formatDate(entry.work_date)).join(", ")}
            </p>
          </div>
        ) : null}

        <div className="mt-3.5 grid gap-2">
          {displayedEditableEntries.map((entry) => {
            const isFixed = isEntryFixed(entry);
            const isRejected = entry.status === "rejected" && !isFixed;
            const needsAttention = entryNeedsAttention(entry) && !isFixed;
            const isSelected = selectedEntryIds.has(entry.id);

            return (
              <div
                key={entry.id}
                onClick={(e) => {
                  toggleEntrySelection(entry.id, e.shiftKey);
                }}
                className={`group flex cursor-pointer select-none items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${isSelected
                  ? "border-primary bg-primary/5 shadow-soft ring-2 ring-primary/20"
                  : isFixed
                    ? "border-emerald-300/80 bg-surface hover:border-primary hover:bg-emerald-50/30"
                    : isRejected
                      ? "border-rose-300/80 bg-surface hover:border-rose-500 hover:bg-rose-50/30"
                      : needsAttention
                        ? "border-amber-300/80 bg-surface hover:border-amber-500 hover:bg-amber-50/30"
                        : "border-border/80 bg-surface hover:border-primary/50 hover:bg-surface-muted/30"
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      // Handled by parent click
                    }}
                    className="size-4.5 rounded border border-border text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                  />
                  <div className="flex flex-wrap items-center gap-x-2 min-w-0">
                    <span className="font-extrabold text-xs sm:text-sm text-foreground">
                      {formatDate(entry.work_date)}
                    </span>
                    {entry.paid_hours ? (
                      <span className="text-xs font-semibold text-muted">
                        {formatHours(entry.paid_hours)}
                        {entry.clock_in && entry.clock_out
                          ? ` · ${shortTime(entry.clock_in)} – ${shortTime(entry.clock_out)}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                <span
                  className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider ${isFixed
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : isRejected
                      ? "bg-rose-600 text-white shadow-2xs"
                      : needsAttention
                        ? "bg-amber-500 text-white shadow-2xs"
                        : "bg-emerald-600 text-white shadow-2xs"
                    }`}
                >
                  {isFixed ? (
                    <CheckCircle2 className="size-3" />
                  ) : isRejected ? (
                    <X className="size-3" />
                  ) : needsAttention ? (
                    <AlertTriangle className="size-3" />
                  ) : (
                    <CheckCircle2 className="size-3" />
                  )}
                  {isFixed ? "Fixed" : isRejected ? "Rejected" : needsAttention ? "Review" : "Ready"}
                </span>
              </div>
            );
          })}
        </div>

        {hasFlaggedSelected ? (
          <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs font-semibold text-amber-950">
            <input
              type="checkbox"
              checked={acknowledgedFlags}
              onChange={(event) => setAcknowledgedFlags(event.target.checked)}
              className="mt-0.5 size-4 accent-amber-600 cursor-pointer"
            />
            <span>I understand the flagged days need attention and will be sent for manager review.</span>
          </label>
        ) : null}
      </form>
    ) : null;

  return (
    <section className="grid min-w-0 grid-cols-1 gap-4">
      {/* Primary Section Heading */}
      <div className="rounded-xl bg-primary text-primary-foreground p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/75">
              Time Records &amp; Adjustments
            </p>
            <h2 className="mt-0.5 text-lg font-black sm:text-xl text-primary-foreground">Timesheets</h2>
            <p className="mt-0.5 text-xs text-primary-foreground/85">
              Use the calendar to add past days, fix drafts, then submit when ready.
            </p>
          </div>
          <span className="w-max rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white shadow-2xs">
            {entries.length} records
          </span>
        </div>
      </div>

      {/* Today's Attendance Section */}
      {liveOverview && liveOverview.entries.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-2xs">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
              </span>
              <p className="text-xs font-black text-foreground">
                Today&apos;s attendance
              </p>
              <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-muted">
                {liveOverview.workDate}
              </span>
            </div>

            <button
              type="button"
              onClick={() => openPanel("attendance")}
              className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
            >
              View full attendance &rarr;
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2.5">
            <button
              type="button"
              onClick={() => setAttendanceFilter("working")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendanceFilter === "working"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-emerald-300/80 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-100"
                }`}
            >
              Clocked in ({liveOverview.totals.activeEmployees})
            </button>

            <button
              type="button"
              onClick={() => setAttendanceFilter("on_lunch")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendanceFilter === "on_lunch"
                ? "bg-amber-500 text-white shadow-xs"
                : "border border-amber-300/80 bg-amber-50/50 text-amber-900 hover:bg-amber-100"
                }`}
            >
              Lunch ({liveOverview.totals.onLunch})
            </button>

            <button
              type="button"
              onClick={() => setAttendanceFilter("worked")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendanceFilter === "worked"
                ? "bg-slate-800 text-white shadow-xs"
                : "border border-slate-300 bg-slate-100/60 text-slate-800 hover:bg-slate-200"
                }`}
            >
              Shift done ({liveOverview.totals.workedToday})
            </button>

            <button
              type="button"
              onClick={() => setAttendanceFilter("not_started")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendanceFilter === "not_started"
                ? "bg-zinc-700 text-white shadow-xs"
                : "border border-border bg-background text-muted hover:bg-surface-muted"
                }`}
            >
              Not started ({liveOverview.totals.notStarted})
            </button>

            <button
              type="button"
              onClick={() => setAttendanceFilter("all")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendanceFilter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "border border-border bg-background text-muted hover:bg-surface-muted"
                }`}
            >
              All ({liveOverview.totals.totalEmployees})
            </button>
          </div>

          {/* Colleague List */}
          <div className="mt-3">
            {filteredAttendanceColleagues.length === 0 ? (
              <p className="py-2 text-xs font-medium text-muted">
                No colleagues matching this status right now.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredAttendanceColleagues.map((colleague) => {
                  if (colleague.status === "worked") {
                    return (
                      <article
                        key={colleague.employeeId}
                        onClick={() => openPanel("attendance")}
                        className="group flex flex-col justify-between gap-2.5 rounded-xl bg-slate-800 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-slate-900/60 min-w-0"
                      >
                        {/* Top: Avatar, Name & Solid Status Badge */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <EmployeeAvatar
                                name={colleague.knownAs ?? colleague.fullName}
                                src={colleague.avatarUrl}
                                className="size-8.5 ring-2 ring-slate-600 shadow-xs"
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-400 ring-2 ring-slate-800" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">
                                {colleague.knownAs ?? colleague.fullName}
                              </p>
                              <p className="text-[11px] font-medium text-slate-300 break-words leading-tight mt-0.5">
                                {colleague.jobTitle ?? "Team Member"}
                              </p>
                            </div>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 border border-slate-700 whitespace-nowrap">
                            <CheckCircle2 className="size-2.5 text-emerald-400" />
                            Shift Done
                          </span>
                        </div>

                        {/* High-Contrast White Metrics Box */}
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockIn)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Out</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockOut)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Total</p>
                            <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(colleague.paidHours)}</p>
                          </div>
                        </div>

                        {/* Footer Pills */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                          <span
                            className="inline-flex items-center rounded bg-slate-700/80 px-2 py-0.5 font-semibold text-slate-200 text-[10px] break-words"
                            title={colleague.workstationName ?? "Assigned workstation"}
                          >
                            <MapPin className="mr-1 inline size-2.5 shrink-0 text-slate-400" />
                            <span className="break-words leading-tight">{colleague.workstationName ?? "Workstation"}</span>
                          </span>
                          <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700 whitespace-nowrap">
                            {colleague.departmentName ?? "General"}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  if (colleague.status === "working") {
                    return (
                      <article
                        key={colleague.employeeId}
                        onClick={() => openPanel("attendance")}
                        className="group flex flex-col justify-between gap-2.5 rounded-xl bg-emerald-700 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-emerald-800/60 min-w-0"
                      >
                        {/* Top: Avatar, Name & Status Badge */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <EmployeeAvatar
                                name={colleague.knownAs ?? colleague.fullName}
                                src={colleague.avatarUrl}
                                className="size-8.5 ring-2 ring-emerald-400 shadow-xs"
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-300 ring-2 ring-emerald-700" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">
                                {colleague.knownAs ?? colleague.fullName}
                              </p>
                              <p className="text-[11px] font-medium text-emerald-100 break-words leading-tight mt-0.5">
                                {colleague.jobTitle ?? "Team Member"}
                              </p>
                            </div>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 border border-emerald-400/30 whitespace-nowrap">
                            <span className="relative flex size-1.5 shrink-0">
                              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                            </span>
                            Clocked In
                          </span>
                        </div>

                        {/* High-Contrast White Metrics Box */}
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockIn)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 break-words leading-tight">Status</p>
                            <p className="font-extrabold text-emerald-600 text-xs break-words leading-tight">Active</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Duration</p>
                            <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(colleague.paidHours)}</p>
                          </div>
                        </div>

                        {/* Footer Pills */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                          <span
                            className="inline-flex items-center rounded bg-emerald-800/80 px-2 py-0.5 font-semibold text-emerald-100 text-[10px] break-words"
                            title={colleague.workstationName ?? "Assigned workstation"}
                          >
                            <MapPin className="mr-1 inline size-2.5 shrink-0 text-emerald-200" />
                            <span className="break-words leading-tight">{colleague.workstationName ?? "Workstation"}</span>
                          </span>
                          <span className="shrink-0 rounded bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-white border border-emerald-400/20 whitespace-nowrap">
                            {colleague.departmentName ?? "General"}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  if (colleague.status === "on_lunch") {
                    return (
                      <article
                        key={colleague.employeeId}
                        onClick={() => openPanel("attendance")}
                        className="group flex flex-col justify-between gap-2.5 rounded-xl bg-amber-600 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-amber-700/60 min-w-0"
                      >
                        {/* Top: Avatar, Name & Status Badge */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <EmployeeAvatar
                                name={colleague.knownAs ?? colleague.fullName}
                                src={colleague.avatarUrl}
                                className="size-8.5 ring-2 ring-amber-400 shadow-xs"
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-amber-300 ring-2 ring-amber-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">
                                {colleague.knownAs ?? colleague.fullName}
                              </p>
                              <p className="text-[11px] font-medium text-amber-100 break-words leading-tight mt-0.5">
                                {colleague.jobTitle ?? "Team Member"}
                              </p>
                            </div>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-amber-300/30 whitespace-nowrap">
                            <UtensilsCrossed className="size-2.5 text-amber-200" />
                            On Lunch
                          </span>
                        </div>

                        {/* High-Contrast White Metrics Box */}
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockIn)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 break-words leading-tight">Lunch</p>
                            <p className="font-extrabold text-amber-600 text-xs break-words font-mono leading-tight">{shortTime(colleague.lunchStart)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-700 break-words leading-tight">Worked</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{formatHours(colleague.paidHours)}</p>
                          </div>
                        </div>

                        {/* Footer Pills */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                          <span
                            className="inline-flex items-center rounded bg-amber-700/80 px-2 py-0.5 font-semibold text-amber-100 text-[10px] break-words"
                            title={colleague.workstationName ?? "Assigned workstation"}
                          >
                            <MapPin className="mr-1 inline size-2.5 shrink-0 text-amber-200" />
                            <span className="break-words leading-tight">{colleague.workstationName ?? "Workstation"}</span>
                          </span>
                          <span className="shrink-0 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-white border border-amber-300/20 whitespace-nowrap">
                            {colleague.departmentName ?? "General"}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  if (colleague.status === "needs_review") {
                    return (
                      <article
                        key={colleague.employeeId}
                        onClick={() => openPanel("attendance")}
                        className="group flex flex-col justify-between gap-2.5 rounded-xl bg-rose-700 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-rose-800/60 min-w-0"
                      >
                        {/* Top: Avatar, Name & Status Badge */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <EmployeeAvatar
                                name={colleague.knownAs ?? colleague.fullName}
                                src={colleague.avatarUrl}
                                className="size-8.5 ring-2 ring-white shadow-xs"
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-rose-300 ring-2 ring-rose-700" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">
                                {colleague.knownAs ?? colleague.fullName}
                              </p>
                              <p className="text-[11px] font-medium text-rose-100 break-words leading-tight mt-0.5">
                                {colleague.jobTitle ?? "Team Member"}
                              </p>
                            </div>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-950/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-rose-400/30 whitespace-nowrap">
                            <AlertTriangle className="size-2.5 text-rose-200" />
                            Review
                          </span>
                        </div>

                        {/* High-Contrast White Metrics Box */}
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockIn)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Out</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(colleague.clockOut)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-rose-700 break-words leading-tight">Flag</p>
                            <p className="font-extrabold text-rose-600 text-xs break-words leading-tight">Review</p>
                          </div>
                        </div>

                        {/* Footer Pills */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                          <span
                            className="inline-flex items-center rounded bg-rose-800/80 px-2 py-0.5 font-semibold text-rose-100 text-[10px] break-words"
                            title={colleague.workstationName ?? "Assigned workstation"}
                          >
                            <MapPin className="mr-1 inline size-2.5 shrink-0 text-rose-200" />
                            <span className="break-words leading-tight">{colleague.workstationName ?? "Workstation"}</span>
                          </span>
                          <span className="shrink-0 rounded bg-rose-950/50 px-2 py-0.5 text-[10px] font-bold text-white border border-rose-400/20 whitespace-nowrap">
                            {colleague.departmentName ?? "General"}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  // Default: not_started (Sizwe card from screenshot)
                  return (
                    <article
                      key={colleague.employeeId}
                      onClick={() => openPanel("attendance")}
                      className="group flex flex-col justify-between gap-2.5 rounded-xl border border-zinc-300/80 bg-zinc-100/90 p-3 text-zinc-800 shadow-xs transition-all hover:bg-zinc-100 hover:border-zinc-400 hover:shadow-sm cursor-pointer min-w-0"
                    >
                      {/* Top: Avatar, Name & Status Badge */}
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="relative shrink-0">
                            <EmployeeAvatar
                              name={colleague.knownAs ?? colleague.fullName}
                              src={colleague.avatarUrl}
                              className="size-8.5 ring-2 ring-zinc-300 shadow-xs"
                            />
                            <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-zinc-400 ring-2 ring-zinc-100" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-extrabold text-zinc-900 break-words leading-tight">
                              {colleague.knownAs ?? colleague.fullName}
                            </p>
                            <p className="text-[11px] font-medium text-zinc-500 break-words leading-tight mt-0.5">
                              {colleague.jobTitle ?? "Team Member"}
                            </p>
                          </div>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-zinc-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-700 border border-zinc-300 whitespace-nowrap">
                          Not Started
                        </span>
                      </div>

                      {/* High-Contrast White Metrics Box */}
                      <div className="grid grid-cols-2 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 break-words leading-tight">Status</p>
                          <p className="font-extrabold text-slate-600 text-xs break-words leading-tight">Not Started</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 break-words leading-tight">Logged</p>
                          <p className="font-extrabold text-zinc-500 text-xs break-words font-mono leading-tight">--:--</p>
                        </div>
                      </div>

                      {/* Footer Pills */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0">
                        <span
                          className="inline-flex items-center rounded bg-zinc-200/80 px-2 py-0.5 font-semibold text-zinc-600 text-[10px] break-words"
                          title={colleague.workstationName ?? "Assigned workstation"}
                        >
                          <MapPin className="mr-1 inline size-2.5 shrink-0 text-zinc-400" />
                          <span className="break-words leading-tight">{colleague.workstationName ?? "Workstation"}</span>
                        </span>
                        <span className="shrink-0 rounded bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold text-zinc-600 border border-zinc-300 whitespace-nowrap">
                          {colleague.departmentName ?? "General"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar Section (Divided by clean line) */}
      {section !== "records" ? (
        <div className="grid gap-3 border-t border-border pt-4">
          {collapsedCalendar ? (
            <button
              type="button"
              onClick={() => setCalendarExpanded((prev) => !prev)}
              aria-expanded={calendarExpanded}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/50 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-muted shadow-2xs"
            >
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <CalendarDays className="size-4 text-accent" />
                Detailed calendar
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <span>{calendarExpanded ? "Collapse" : "Expand"}</span>
                <ChevronDown
                  className={`size-3.5 transition-transform duration-200 ${calendarExpanded ? "rotate-180" : ""
                    }`}
                />
              </span>
            </button>
          ) : null}

          {(!collapsedCalendar || calendarExpanded) && (
            <div className="grid min-w-0 max-w-full gap-3">
              {message && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm font-semibold shadow-2xs ${messageOk
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
                <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100/70 px-2 py-0.5 text-[11px] text-emerald-900">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  Approved / Working
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-white">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Shift Done / Submitted
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100/70 px-2 py-0.5 text-[11px] text-amber-900">
                  <span className="size-1.5 rounded-full bg-amber-600" />
                  Draft / On Lunch
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-100/70 px-2 py-0.5 text-[11px] text-rose-900">
                  <span className="size-1.5 rounded-full bg-rose-600" />
                  Review Needed / Rejected
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                  <span className="size-1.5 rounded-full bg-zinc-400" />
                  Not Started
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

              <div className="hidden max-sm:block min-w-0 max-w-full">
                <div className="flex items-center gap-3 min-w-0">
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

                <div className="mt-3 space-y-2 min-w-0 max-w-full">
                  {publicHolidays
                    .filter((h) => h.holiday_date === calendarFocusDate)
                    .map((holiday) => (
                      <div
                        key={`holiday-${holiday.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-holiday/30 bg-holiday/10 px-3 py-2.5 min-w-0"
                      >
                        <span className="text-sm font-semibold text-holiday break-words leading-tight min-w-0">{holiday.name}</span>
                        <span className="shrink-0 rounded-full border border-holiday/20 bg-holiday/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-holiday whitespace-nowrap">
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
                          className={`block w-full min-w-0 max-w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors ${hasWarning
                            ? "border-danger/30 bg-danger/[0.07]"
                            : "border-border bg-background"
                            }`}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {entry.status === "draft" ? "Draft" : entry.status}
                            </p>
                            <span className="shrink-0 text-sm font-semibold text-foreground whitespace-nowrap">
                              {formatHours(entry.paid_hours)}
                              {Number(entry.overtime_hours ?? 0) > 0
                                ? ` +${formatHours(entry.overtime_hours)}`
                                : ""}
                            </span>
                          </div>
                          <p className="mt-0.5 break-words leading-tight text-xs text-muted">
                            {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                            {entry.lunch_start || entry.lunch_end
                              ? ` \u00b7 Lunch ${formatTimeRange(entry.lunch_start, entry.lunch_end)}`
                              : ""}
                          </p>
                          {entry.warning_notes || (entry.notes && !entry.notes.startsWith("Public holiday:")) ? (
                            <p className="mt-1 text-xs text-muted break-words line-clamp-2">
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
                        {renderTimesheetEntry(activeCalendarEntry)}
                      </div>
                    ) : activeHoliday ? (
                      <article className="group flex flex-col justify-between gap-2.5 rounded-xl bg-slate-800 p-3.5 text-white shadow-sm ring-1 ring-slate-900/60 min-w-0">
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <div className="flex size-8.5 flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 shadow-xs leading-none text-white">
                                <span className="text-[8px] font-bold uppercase tracking-wider opacity-80">{getDateBadgeParts(focusedDate).month}</span>
                                <span className="text-xs font-black mt-0.5">{getDateBadgeParts(focusedDate).day}</span>
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-400 ring-2 ring-slate-800" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">{activeHoliday.name}</p>
                              <p className="text-[11px] font-medium text-slate-300 break-words leading-tight mt-0.5">Public Holiday · {formatDate(focusedDate)}</p>
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 border border-slate-700 whitespace-nowrap">
                            Holiday Paid
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Type</p>
                            <p className="font-extrabold text-slate-900 text-xs">Public Holiday</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Benefit</p>
                            <p className="font-extrabold text-emerald-700 text-xs">Paid Day</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Hours</p>
                            <p className="font-extrabold text-emerald-700 text-xs">8.00h</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                          <span className="rounded bg-slate-700/80 px-2 py-0.5 font-semibold text-slate-200 text-[10px]">BCEA Protected Holiday</span>
                          <span className="rounded bg-slate-900/60 px-2 py-0.5 font-bold text-slate-300 text-[10px] border border-slate-700">Full Day Off</span>
                        </div>
                      </article>
                    ) : isPastFocusedDay ? (
                      <article className="group flex flex-col justify-between gap-2.5 rounded-xl bg-amber-700 p-3.5 text-white shadow-sm ring-1 ring-amber-800/80 min-w-0">
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="relative shrink-0">
                              <div className="flex size-8.5 flex-col items-center justify-center rounded-lg border border-amber-400/50 bg-amber-800/90 shadow-xs leading-none text-white">
                                <span className="text-[8px] font-bold uppercase tracking-wider opacity-80">{getDateBadgeParts(focusedDate).month}</span>
                                <span className="text-xs font-black mt-0.5">{getDateBadgeParts(focusedDate).day}</span>
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-amber-300 ring-2 ring-amber-700" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">No timesheet recorded</p>
                              <p className="text-[11px] font-medium text-white/85 break-words leading-tight mt-0.5">Missing record for {formatDate(focusedDate)}</p>
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-black/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-white/20 whitespace-nowrap">
                            Unrecorded
                          </span>
                        </div>
                        <div className="rounded-md bg-white p-2 text-center text-slate-900 shadow-xs">
                          <p className="text-xs font-semibold text-slate-700">Create a past draft timesheet for this day to record your work hours.</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                          <form action={createAction}>
                            <input type="hidden" name="work_date" value={focusedDate} />
                            <input type="hidden" name="use_template" value="true" />
                            <input type="hidden" name="clock_in" value={scheduleTemplate.clock_in} />
                            <input type="hidden" name="lunch_start" value={scheduleTemplate.lunch_start} />
                            <input type="hidden" name="lunch_end" value={scheduleTemplate.lunch_end} />
                            <input type="hidden" name="clock_out" value={scheduleTemplate.clock_out} />
                            <button
                              disabled={createPending}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 px-3.5 py-1.5 text-xs font-black text-amber-950 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                              title={`Load schedule template: ${scheduleTemplate.scheduleName} (${scheduleTemplate.clock_in} - ${scheduleTemplate.clock_out})`}
                            >
                              <Sparkles className="size-3.5 text-amber-900" />
                              {createPending ? "Loading..." : "Load Schedule Draft"}
                            </button>
                          </form>
                          <form action={createAction}>
                            <input type="hidden" name="work_date" value={focusedDate} />
                            <button
                              disabled={createPending}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 hover:bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <Plus className="size-3.5" />
                              Blank Draft
                            </button>
                          </form>
                        </div>
                      </article>
                    ) : null}
                  </div>
                );
              })()}

              {section === "calendar" ? (
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openPanel("leave")}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/15"
                    >
                      <CalendarPlus className="size-4" />
                      Request leave
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBulkModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/15"
                    >
                      <Layers className="size-4" />
                      Bulk Drafts
                    </button>
                  </div>
                  {quickSubmitForm}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* Timesheet Records / Requests Section (Divided by clean line) */}
      {section !== "calendar" ? (
        <div ref={timesheetSectionRef} className="grid gap-3 border-t border-border pt-4 scroll-mt-20 sm:scroll-mt-24">
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => handleTabChange("timesheets")}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "timesheets"
                ? "bg-primary text-primary-foreground"
                : "text-foreground"
                }`}
            >
              <ClipboardCheck className="size-4" />
              <span>Timesheets</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "timesheets"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface-muted text-muted"
              }`}>
                {filteredEntries.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("requests")}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "requests"
                ? "bg-primary text-primary-foreground"
                : "text-foreground"
                }`}
            >
              <FileQuestion className="size-4" />
              <span>Requests</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "requests"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface-muted text-muted"
              }`}>
                {submittedEntries.length}
              </span>
            </button>
          </div>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm font-medium ${messageOk
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
              {/* Work Schedule Rule & Quick Bulk Draft Engine Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/75 p-3.5 sm:p-4 backdrop-blur-xs shadow-soft">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground">
                        {workSchedule?.name ? `${workSchedule.name} Rule` : "Work Schedule Template"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                        <Clock className="size-3" />
                        {scheduleTemplate.clock_in} - {scheduleTemplate.clock_out}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                        <UtensilsCrossed className="size-3" />
                        Lunch: {scheduleTemplate.lunch_start} - {scheduleTemplate.lunch_end} (req.)
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Quickly draft timesheets aligned with your company rules and mandatory lunch policy.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 text-xs font-bold text-primary transition-colors shadow-2xs"
                  >
                    <Layers className="size-3.5" />
                    <span>Bulk Draft Uploader</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {paginatedEntries.map((entry) => (
                  <div key={entry.id} className="w-full min-w-0 max-w-full">
                    {renderTimesheetEntry(entry)}
                  </div>
                ))}
              </div>

              {/* Timesheets Tab Pagination Controls */}
              {totalTimesheets > 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/90 backdrop-blur-md p-3.5 sm:p-4 text-xs shadow-soft">
                  <div className="flex flex-wrap items-center gap-2 text-muted">
                    <span>
                      Showing <strong className="font-bold text-foreground">{timesheetStartIndex}</strong> to{" "}
                      <strong className="font-bold text-foreground">{timesheetEndIndex}</strong> of{" "}
                      <strong className="font-bold text-foreground">{totalTimesheets}</strong> timesheets
                    </span>

                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-[11px] font-semibold text-muted">Per page:</span>
                      <select
                        value={timesheetsPageSize}
                        onChange={(e) => {
                          setTimesheetsPageSize(Number(e.target.value));
                          setTimesheetsPage(1);
                        }}
                        className="px-2.5 py-1 text-xs rounded-full bg-background border border-border/80 text-foreground focus:outline-none focus:border-primary shadow-2xs font-semibold cursor-pointer"
                      >
                        {[6, 12, 24, 48].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {totalTimesheetsPages > 1 ? (
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(1)}
                        disabled={timesheetsPage <= 1}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="First page"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(Math.max(1, timesheetsPage - 1))}
                        disabled={timesheetsPage <= 1}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="Previous page"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>

                      <div className="flex items-center gap-1 px-1">
                        {Array.from({ length: totalTimesheetsPages }, (_, i) => i + 1)
                          .filter((p) => {
                            return (
                              p === 1 ||
                              p === totalTimesheetsPages ||
                              Math.abs(p - timesheetsPage) <= 1
                            );
                          })
                          .reduce<Array<number | string>>((acc, p, idx, arr) => {
                            if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) {
                              acc.push("...");
                            }
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, idx) =>
                            typeof item === "string" ? (
                              <span key={`ts-page-ellipsis-${idx}`} className="px-1 text-muted">
                                ...
                              </span>
                            ) : (
                              <button
                                key={`ts-page-${item}`}
                                type="button"
                                onClick={() => handleTimesheetsPageChange(item)}
                                className={`grid size-7 place-items-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  item === timesheetsPage
                                    ? "bg-primary text-primary-foreground shadow-2xs scale-105"
                                    : "hover:bg-surface-muted text-muted hover:text-foreground"
                                }`}
                              >
                                {item}
                              </button>
                            )
                          )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(Math.min(totalTimesheetsPages, timesheetsPage + 1))}
                        disabled={timesheetsPage >= totalTimesheetsPages}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="Next page"
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(totalTimesheetsPages)}
                        disabled={timesheetsPage >= totalTimesheetsPages}
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
                      <AnalogTimePicker
                        name="proposed_clock_in"
                        placeholder="Select clock in"
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed lunch start</span>
                      <AnalogTimePicker
                        name="proposed_lunch_start"
                        placeholder="Select lunch start"
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed lunch end</span>
                      <AnalogTimePicker
                        name="proposed_lunch_end"
                        placeholder="Select lunch end"
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Proposed clock out</span>
                      <AnalogTimePicker
                        name="proposed_clock_out"
                        placeholder="Select clock out"
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

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {paginatedSubmittedEntries.map((entry) => {
                  const correction = latestRequestByEntry.get(entry.id);
                  const hasSubmittedCorrection = correction?.status === "submitted";
                  const canRequestCorrection = entry.work_date < currentWorkDate;
                  const isSelected = selectedCorrectionIds.has(entry.id);
                  const dateParts = getDateBadgeParts(entry.work_date);

                  return (
                    <div key={entry.id} className="w-full min-w-0 max-w-full">
                      <article
                        className={`group flex flex-col justify-between gap-2.5 rounded-xl bg-slate-800 p-3 sm:p-3.5 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md min-w-0 w-full max-w-full scroll-mt-20 sm:scroll-mt-24 ${isSelected
                          ? "ring-2 ring-emerald-400 bg-slate-850"
                          : "ring-1 ring-slate-900/80"
                          }`}
                      >
                        {/* Top: Checkbox, Date & Status Badge */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {canRequestCorrection && !hasSubmittedCorrection ? (
                              <label
                                className={`grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border transition-all ${
                                  isSelected
                                    ? "bg-emerald-500 border-emerald-400 text-white shadow-xs"
                                    : "bg-slate-900/80 border-slate-700 text-transparent hover:border-slate-500 hover:bg-slate-900"
                                }`}
                                onClick={(e) => e.stopPropagation()}
                                title={isSelected ? "Deselect timesheet" : "Select timesheet"}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCorrectionSelect(entry.id)}
                                  aria-label={`Select timesheet for ${formatDate(entry.work_date)}`}
                                  className="sr-only"
                                />
                                <Check
                                  className={`size-4 stroke-[3] transition-all ${
                                    isSelected ? "scale-100 opacity-100" : "scale-75 opacity-0"
                                  }`}
                                />
                              </label>
                            ) : null}

                            <div className="relative shrink-0">
                              <div className="flex size-8.5 flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 shadow-xs leading-none text-white">
                                <span className="text-[8px] font-bold uppercase tracking-wider opacity-80">{dateParts.month}</span>
                                <span className="text-xs font-black mt-0.5">{dateParts.day}</span>
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-400 ring-2 ring-slate-800" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-white break-words leading-tight">
                                {formatDate(entry.work_date)}
                              </p>
                              <p className="text-[11px] font-medium text-slate-300 break-words leading-tight mt-0.5">
                                {hasSubmittedCorrection ? "Correction Submitted" : "Submitted Timesheet"}
                              </p>
                            </div>
                          </div>

                          <RecordStatusBadge
                            status={hasSubmittedCorrection ? "submitted" : entry.status}
                          />
                        </div>

                        {/* Middle: High-Contrast White Metrics Box */}
                        <div className="grid grid-cols-4 gap-1 rounded-md bg-white p-1.5 text-center text-slate-900 shadow-xs min-w-0">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">In</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(entry.clock_in)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Lunch</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortLunch(entry.lunch_start, entry.lunch_end)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Out</p>
                            <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(entry.clock_out)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Total</p>
                            <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(entry.paid_hours)}</p>
                          </div>
                        </div>

                        {/* Footer Pills */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0 pt-0.5">
                          <span
                            className="inline-flex items-center rounded bg-slate-700/80 px-2 py-0.5 font-semibold text-slate-200 text-[10px] break-words"
                            title={getEntryWorkstationName(entry) ?? "Assigned workstation"}
                          >
                            <MapPin className="mr-1 inline size-2.5 shrink-0 text-slate-400" />
                            <span className="break-words leading-tight">{getEntryWorkstationName(entry) ?? "Workstation logged"}</span>
                          </span>

                          <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700 whitespace-nowrap">
                            {entry.missing_clocking || entry.late_arrival || entry.early_departure ? "Review Needed" : "Compliant"}
                          </span>
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
                                  <AnalogTimePicker name="proposed_clock_in" defaultValue={inputTime(entry.clock_in)} />
                                </div>
                                <div className="grid gap-1">
                                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch start</span>
                                  <AnalogTimePicker name="proposed_lunch_start" defaultValue={inputTime(entry.lunch_start)} />
                                </div>
                                <div className="grid gap-1">
                                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch end</span>
                                  <AnalogTimePicker name="proposed_lunch_end" defaultValue={inputTime(entry.lunch_end)} />
                                </div>
                                <div className="grid gap-1">
                                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clock out</span>
                                  <AnalogTimePicker name="proposed_clock_out" defaultValue={inputTime(entry.clock_out)} />
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

              {/* Requests Tab Pagination Controls */}
              {totalRequests > 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/90 backdrop-blur-md p-3.5 sm:p-4 text-xs shadow-soft">
                  <div className="flex flex-wrap items-center gap-2 text-muted">
                    <span>
                      Showing <strong className="font-bold text-foreground">{requestStartIndex}</strong> to{" "}
                      <strong className="font-bold text-foreground">{requestEndIndex}</strong> of{" "}
                      <strong className="font-bold text-foreground">{totalRequests}</strong> requests
                    </span>

                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-[11px] font-semibold text-muted">Per page:</span>
                      <select
                        value={requestsPageSize}
                        onChange={(e) => {
                          setRequestsPageSize(Number(e.target.value));
                          setRequestsPage(1);
                        }}
                        className="px-2.5 py-1 text-xs rounded-full bg-background border border-border/80 text-foreground focus:outline-none focus:border-primary shadow-2xs font-semibold cursor-pointer"
                      >
                        {[6, 12, 24, 48].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {totalRequestsPages > 1 ? (
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleRequestsPageChange(1)}
                        disabled={requestsPage <= 1}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="First page"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestsPageChange(Math.max(1, requestsPage - 1))}
                        disabled={requestsPage <= 1}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="Previous page"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>

                      <div className="flex items-center gap-1 px-1">
                        {Array.from({ length: totalRequestsPages }, (_, i) => i + 1)
                          .filter((p) => {
                            return (
                              p === 1 ||
                              p === totalRequestsPages ||
                              Math.abs(p - requestsPage) <= 1
                            );
                          })
                          .reduce<Array<number | string>>((acc, p, idx, arr) => {
                            if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) {
                              acc.push("...");
                            }
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, idx) =>
                            typeof item === "string" ? (
                              <span key={`req-page-ellipsis-${idx}`} className="px-1 text-muted">
                                ...
                              </span>
                            ) : (
                              <button
                                key={`req-page-${item}`}
                                type="button"
                                onClick={() => handleRequestsPageChange(item)}
                                className={`grid size-7 place-items-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  item === requestsPage
                                    ? "bg-primary text-primary-foreground shadow-2xs scale-105"
                                    : "hover:bg-surface-muted text-muted hover:text-foreground"
                                }`}
                              >
                                {item}
                              </button>
                            )
                          )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRequestsPageChange(Math.min(totalRequestsPages, requestsPage + 1))}
                        disabled={requestsPage >= totalRequestsPages}
                        className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                        title="Next page"
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestsPageChange(totalRequestsPages)}
                        disabled={requestsPage >= totalRequestsPages}
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
            </div>
          )}
        </div>
      ) : null}

      <ViewportSidebar
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        maxWidth="max-w-2xl"
        eyebrow="Timesheet detail"
        title={detailEntry ? formatDate(detailEntry.work_date) : ""}
        description={detailEntry ? <span className="capitalize">{isEntryFixed(detailEntry) ? "Fixed timesheet breakdown" : `${detailEntry.status} shift breakdown`}</span> : ""}
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {detailEntry ? (
          <div className="grid gap-4">
            {/* Solid Status Hero Card */}
            <div
              className={`flex items-center justify-between gap-3 rounded-2xl p-4 shadow-soft ${detailEntry.status === "approved"
                ? "bg-emerald-600 text-white ring-1 ring-emerald-700/60"
                : detailEntry.status === "submitted"
                  ? "bg-slate-800 text-white ring-1 ring-slate-900/60"
                  : isEntryFixed(detailEntry)
                    ? "bg-emerald-700 text-white ring-1 ring-emerald-800/60"
                    : detailEntry.status === "rejected"
                      ? "bg-rose-600 text-white ring-1 ring-rose-700/60"
                      : "border border-zinc-200 bg-surface text-foreground"
                }`}
            >
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${detailEntry.status === "draft" && !isEntryFixed(detailEntry) ? "text-muted" : "opacity-80"}`}>
                  Timesheet Status
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <RecordStatusBadge
                    status={detailEntry.status === "approved" ? "verified" : detailEntry.status}
                    isFixed={isEntryFixed(detailEntry)}
                    size={32}
                  />
                  <span className={`text-xs font-bold ${detailEntry.status === "draft" && !isEntryFixed(detailEntry) ? "text-muted" : "text-white/90"}`}>
                    {formatDate(detailEntry.work_date)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${detailEntry.status === "draft" ? "text-muted" : "opacity-80"}`}>
                  Paid duration
                </p>
                <p className="mt-0.5 text-2xl font-black">{formatHours(detailEntry.paid_hours)}</p>
              </div>
            </div>

            {/* Time Grid Cards */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/80 bg-surface p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Clock in</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTime(detailEntry.clock_in)}
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lunch</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTimeRange(detailEntry.lunch_start, detailEntry.lunch_end)}
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Clock out</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatTime(detailEntry.clock_out)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total Paid</p>
                <p className="mt-1 text-sm font-black text-emerald-950">
                  {formatHours(detailEntry.paid_hours)}
                </p>
              </div>
            </div>

            {/* Hours Calculation Details */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/80 bg-surface p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Normal (NT)</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatHours(detailEntry.normal_hours)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Overtime (OT)</p>
                <p className="mt-1 text-sm font-black text-amber-950">
                  {formatHours(detailEntry.overtime_hours)}
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface p-3 text-center shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lunch break</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {formatHours(detailEntry.lunch_hours)}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-3 text-center shadow-soft ${detailEntry.scheduleValidation?.isCompliant
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
              <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-rose-950 shadow-soft">
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
              <div className="rounded-2xl border border-border/80 bg-surface p-3.5 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Shift notes</p>
                <p className="mt-1 text-xs font-medium text-foreground">{detailEntry.notes}</p>
              </div>
            ) : null}

            {/* Calculation Warning notes */}
            {detailEntry.warning_notes ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Calculation notice</p>
                <p className="mt-1 text-xs font-medium text-amber-900">
                  {detailEntry.warning_notes}
                </p>
              </div>
            ) : null}

            {/* Location events history & Visual Map */}
            {detailEntry.locationEvents?.length ? (
              <div className="rounded-2xl border border-border/80 bg-surface p-3.5 shadow-soft">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                    <MapPin className="size-4 text-accent" />
                    Location Audit History ({detailEntry.locationEvents.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDetailMap((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-primary-hover shadow-soft transition-colors"
                  >
                    <Footprints className="size-3 text-white" />
                    {showDetailMap ? "Hide Route Map" : "View Route Map"}
                  </button>
                </div>

                {showDetailMap && (
                  <div className="mb-3 overflow-hidden rounded-lg border border-border">
                    <TimesheetRouteMap
                      employeeName="Shift Movement"
                      workDate={detailEntry.work_date}
                      locationEvents={detailEntry.locationEvents}
                      onClose={() => setShowDetailMap(false)}
                    />
                  </div>
                )}

                <div className="mt-1 grid gap-2">
                  {detailEntry.locationEvents.map((event) => {
                    const isOutOfRange = event.geofence_status === "out_of_range";
                    const eventLabel =
                      event.event_type === "clock_in"
                        ? "Clock In"
                        : event.event_type === "lunch_start"
                        ? "Take Lunch"
                        : event.event_type === "lunch_end"
                        ? "Return from Lunch"
                        : event.event_type === "clock_out"
                        ? "Clock Out"
                        : event.event_type === "app_interaction"
                        ? "App Interaction"
                        : event.event_type.replaceAll("_", " ");

                    return (
                      <div
                        key={event.id}
                        className={`grid gap-1 rounded-md border border-border p-2.5 text-xs sm:grid-cols-[130px_1fr_auto] sm:items-center ${
                          isOutOfRange ? "bg-rose-50/70 border-rose-300" : "bg-surface"
                        }`}
                      >
                        <p className="font-bold capitalize text-foreground">
                          {eventLabel}
                        </p>
                        <p className="text-muted">
                          {event.latitude !== null && event.longitude !== null
                            ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
                            : isOutOfRange
                            ? "Outside radius (Location hidden for privacy)"
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
                    );
                  })}
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
            <p className="rounded-xl border border-border/80 bg-surface px-4 py-3 text-sm text-muted shadow-soft">
              This day already has a <strong className="text-foreground">{selectedEntry.status}</strong> timesheet.
            </p>
            <button
              type="button"
              onClick={() => {
                setDetailEntry(selectedEntry);
                setSelectedDate("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover transition-colors"
            >
              <Clock3 className="size-4" />
              Open timesheet
            </button>
          </>
        ) : selectedIsHoliday ? (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground shadow-soft">
            This day is a company public holiday and is handled automatically.
          </p>
        ) : selectedDate >= currentWorkDate ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning shadow-soft">
            Employees can only add past timesheets from the calendar.
          </p>
        ) : (() => {
          const daySchedule = getScheduleTemplate(workSchedule, todaySchedule, defaultLunchMinutes, selectedDate);
          return (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-xs">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>{daySchedule.scheduleName}</span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface/80 p-2 border border-border/60">
                    <span className="text-[10px] text-muted uppercase font-bold block">Shift Hours</span>
                    <strong className="text-foreground">{daySchedule.clock_in} - {daySchedule.clock_out}</strong>
                  </div>
                  <div className="rounded-lg bg-surface/80 p-2 border border-border/60">
                    <span className="text-[10px] text-muted uppercase font-bold block">Required Lunch</span>
                    <strong className="text-foreground">{daySchedule.lunch_start} - {daySchedule.lunch_end}</strong>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted leading-relaxed">
                  Quick-load an editable draft pre-filled with your assigned shift hours and required {daySchedule.lunch_minutes}m lunch break.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <form action={createAction}>
                  <input type="hidden" name="work_date" value={selectedDate} />
                  <input type="hidden" name="use_template" value="true" />
                  <input type="hidden" name="clock_in" value={daySchedule.clock_in} />
                  <input type="hidden" name="lunch_start" value={daySchedule.lunch_start} />
                  <input type="hidden" name="lunch_end" value={daySchedule.lunch_end} />
                  <input type="hidden" name="clock_out" value={daySchedule.clock_out} />
                  <button
                    type="submit"
                    disabled={!selectedCanAdd || createPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-soft hover:bg-primary-hover disabled:opacity-50 transition-colors"
                  >
                    <Sparkles className="size-4" />
                    {createPending ? "Adding draft..." : "Load Schedule Draft"}
                  </button>
                </form>

                <form action={createAction}>
                  <input type="hidden" name="work_date" value={selectedDate} />
                  <button
                    type="submit"
                    disabled={!selectedCanAdd || createPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50 transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add Blank Draft
                  </button>
                </form>
              </div>
            </div>
          );
        })()}
      </ViewportSidebar>

      {/* Bulk Draft Uploader Modal */}
      {typeof document !== "undefined" && isBulkModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !bulkPending) setIsBulkModalOpen(false);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-lg max-h-[90vh] rounded-3xl border border-border/80 bg-surface shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground truncate">
                    Bulk Draft Uploader
                  </h3>
                  <p className="text-xs text-muted truncate">
                    Create draft timesheets across date ranges using work rules.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                disabled={bulkPending}
                className="rounded-full p-1.5 text-muted hover:bg-surface-muted hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form action={bulkAction} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6 gap-4">
              {/* Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Quick Range Presets</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: "this_week", label: "This Week" },
                      { id: "last_week", label: "Last Week" },
                      { id: "last_14_days", label: "Last 14 Days" },
                      { id: "this_month", label: "This Month" },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const dates = getPresetDates(preset.id, currentWorkDate);
                        setBulkStartDate(dates.start);
                        setBulkEndDate(dates.end);
                      }}
                      className="rounded-lg border border-border/70 bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-semibold text-foreground">
                  <span>Start Date <span className="text-danger">*</span></span>
                  <input
                    type="date"
                    name="start_date"
                    required
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    max={currentWorkDate}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold text-foreground">
                  <span>End Date <span className="text-danger">*</span></span>
                  <input
                    type="date"
                    name="end_date"
                    required
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    max={currentWorkDate}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  />
                </label>
              </div>

              {/* Exclude Weekends Checkbox */}
              <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="exclude_weekends"
                  value="true"
                  checked={bulkExcludeWeekends}
                  onChange={(e) => setBulkExcludeWeekends(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <span>Skip weekend days (Saturday & Sunday)</span>
              </label>

              {/* Work Schedule Rule Hours */}
              <div className="rounded-2xl border border-border/80 bg-surface-muted/50 p-4 grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">
                      {scheduleTemplate.scheduleName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkClockIn(scheduleTemplate.clock_in);
                      setBulkLunchStart(scheduleTemplate.lunch_start);
                      setBulkLunchEnd(scheduleTemplate.lunch_end);
                      setBulkClockOut(scheduleTemplate.clock_out);
                    }}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Reset to Rule
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <label className="grid gap-1 text-[11px] font-semibold text-foreground">
                    <span>Shift Start</span>
                    <AnalogTimePicker
                      name="clock_in"
                      value={bulkClockIn}
                      onValueChange={(val) => setBulkClockIn(val)}
                      compact
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </label>

                  <label className="grid gap-1 text-[11px] font-bold text-primary">
                    <span className="flex items-center gap-1">
                      <UtensilsCrossed className="size-3" />
                      Lunch Start
                    </span>
                    <AnalogTimePicker
                      name="lunch_start"
                      value={bulkLunchStart}
                      onValueChange={(val) => setBulkLunchStart(val)}
                      compact
                      className="rounded-lg border border-primary/40 bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </label>

                  <label className="grid gap-1 text-[11px] font-bold text-primary">
                    <span className="flex items-center gap-1">
                      <UtensilsCrossed className="size-3" />
                      Lunch End
                    </span>
                    <AnalogTimePicker
                      name="lunch_end"
                      value={bulkLunchEnd}
                      onValueChange={(val) => setBulkLunchEnd(val)}
                      compact
                      className="rounded-lg border border-primary/40 bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </label>

                  <label className="grid gap-1 text-[11px] font-semibold text-foreground">
                    <span>Shift End</span>
                    <AnalogTimePicker
                      name="clock_out"
                      value={bulkClockOut}
                      onValueChange={(val) => setBulkClockOut(val)}
                      compact
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </label>
                </div>

                {/* Mandatory Lunch notice */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                  <span>Lunch break insertion is mandatory by rule policy and cannot be left blank.</span>
                </div>
              </div>

              {/* Notes */}
              <label className="grid gap-1 text-xs font-semibold text-foreground">
                <span>Batch Notes (Optional)</span>
                <input
                  type="text"
                  name="notes"
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder="e.g. Bulk draft generated from work schedule template"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </label>

              {bulkState?.ok === false && bulkState.message && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger">
                  {bulkState.message}
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  disabled={bulkPending}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-surface disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkPending}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Layers className="size-3.5" />
                  {bulkPending ? "Generating Drafts..." : "Generate Draft Timesheets"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
