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
  createPastDraftTimeEntry,
  deleteDraftTimeEntry,
  saveDraftTimeEntry,
  submitSelectedTimesheets,
  submitTimesheetCorrection,
} from "@/lib/time-tracking/actions";
import {
  getWeekBounds,
  type CompanyLiveTimeOverview,
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

function checkDraftNoteRequirement(entry: TimeEntryRecord, scheduledHours: number = 8) {
  const hasClocking = Boolean(entry.clock_in && entry.clock_out);
  const paidHours = Number(entry.paid_hours ?? 0);
  const overtimeHours = Number(entry.overtime_hours ?? 0);
  const lunchHours = Number(entry.lunch_hours ?? 0);
  const hasLunch = Boolean(entry.lunch_start && entry.lunch_end && lunchHours > 0);

  const isNoLunch = hasClocking && !hasLunch;
  const isFlagged = Boolean(
    entry.missing_clocking ||
    entry.late_arrival ||
    entry.early_departure ||
    (entry.clock_in && paidHours <= 0),
  );
  const isShort = hasClocking && paidHours > 0 && paidHours < scheduledHours;
  const isOvertime = overtimeHours > 0 || paidHours > scheduledHours;

  const reasons: string[] = [];
  if (isNoLunch) reasons.push("No lunch");
  if (isFlagged) reasons.push("Flagged review");
  if (isShort) reasons.push(`Short (${paidHours.toFixed(1)}h)`);
  if (isOvertime) reasons.push(`OT (${overtimeHours > 0 ? `+${overtimeHours.toFixed(1)}h` : `${paidHours.toFixed(1)}h`})`);

  const requiresNote = false;
  const hasUserNote = Boolean(
    entry.notes &&
    entry.notes.trim().length > 0 &&
    !entry.notes.startsWith("Public holiday:") &&
    !entry.notes.startsWith("Created via schedule template") &&
    !entry.notes.startsWith("Bulk draft generated from"),
  );

  return {
    requiresNote,
    reasons,
    hasUserNote,
    isNoLunch,
    isFlagged,
    isShort,
    isOvertime,
  };
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
  includeLunch: boolean = true,
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
      if (day.lunch_minutes !== undefined) lunchMinutes = day.lunch_minutes;
    }
  } else if (todaySchedule) {
    if (todaySchedule.start_time) startTime = todaySchedule.start_time.slice(0, 5);
    if (todaySchedule.end_time) endTime = todaySchedule.end_time.slice(0, 5);
    if (todaySchedule.lunch_minutes !== undefined) lunchMinutes = todaySchedule.lunch_minutes;
  }

  if (!includeLunch || lunchMinutes <= 0) {
    return {
      scheduleName,
      clock_in: startTime,
      lunch_start: "",
      lunch_end: "",
      clock_out: endTime,
      lunch_minutes: 0,
    };
  }

  // Derive lunch break interval (optional lunch insertion)
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
  const { startOfPastWeek, endOfPastWeek, startOfCurrentWeek } = useMemo(
    () => getWeekBounds(currentWorkDate),
    [currentWorkDate],
  );
  const [isAddPastDayOpen, setIsAddPastDayOpen] = useState(false);
  const [includeLunchInPastDraft, setIncludeLunchInPastDraft] = useState(true);


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
  const scheduleTemplate = useMemo(
    () => getScheduleTemplate(workSchedule, todaySchedule, defaultLunchMinutes),
    [workSchedule, todaySchedule, defaultLunchMinutes],
  );

  const entriesByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.work_date, entry])),
    [entries],
  );
  const yesterdayDate = useMemo(() => {
    const [y, m, d] = currentWorkDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }, [currentWorkDate]);

  const missingPastWorkdays = useMemo(() => {
    const missing: string[] = [];
    const [y, m, d] = currentWorkDate.split("-").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    for (let i = 1; i <= 14; i++) {
      const dt = new Date(y, m - 1, d - i);
      const dayOfWeek = dt.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      if (iso < startOfPastWeek) break;
      if (!entriesByDate.has(iso) && !holidayDates.has(iso)) {
        missing.push(iso);
      }
    }
    return missing;
  }, [currentWorkDate, startOfPastWeek, entriesByDate, holidayDates]);

  const [targetPastDate, setTargetPastDate] = useState<string>(() => yesterdayDate);

  useEffect(() => {
    if (missingPastWorkdays.length > 0) {
      setTargetPastDate(missingPastWorkdays[0]);
    } else {
      setTargetPastDate(yesterdayDate);
    }
  }, [isAddPastDayOpen, missingPastWorkdays, yesterdayDate]);

  const targetSchedule = useMemo(() => {
    if (!targetPastDate) return null;
    return getScheduleTemplate(
      workSchedule,
      todaySchedule,
      defaultLunchMinutes,
      targetPastDate,
      includeLunchInPastDraft,
    );
  }, [workSchedule, todaySchedule, defaultLunchMinutes, targetPastDate, includeLunchInPastDraft]);

  useEffect(() => {
    if (createState.ok && createState.message) {
      setIsAddPastDayOpen(false);
    }
  }, [createState]);

  const [includeLunchInDraft, setIncludeLunchInDraft] = useState(true);
  const [inlineSubmissionNotes, setInlineSubmissionNotes] = useState<Record<string, string>>({});

  const [draftOverrides, setDraftOverrides] = useState<
    Map<string, { clock_in?: string; lunch_start?: string; lunch_end?: string; clock_out?: string }>
  >(() => new Map());

  const applyTemplateToDraft = useCallback(
    (entry: TimeEntryRecord, withLunch: boolean = true) => {
      const tpl = getScheduleTemplate(
        workSchedule,
        todaySchedule,
        defaultLunchMinutes,
        entry.work_date,
        withLunch,
      );
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
        setInlineSubmissionNotes({});
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
  const pastWeekEntries = useMemo(
    () => entries.filter((e) => e.work_date >= startOfPastWeek && e.work_date <= endOfPastWeek),
    [entries, startOfPastWeek, endOfPastWeek],
  );

  const currentWeekEntries = useMemo(
    () => entries.filter((e) => e.work_date >= startOfCurrentWeek && e.work_date <= currentWorkDate),
    [entries, startOfCurrentWeek, currentWorkDate],
  );

  const unsubmittedPastWeekDrafts = useMemo(
    () =>
      pastWeekEntries.filter(
        (e) =>
          (e.status === "draft" || e.status === "rejected") &&
          !holidayDates.has(e.work_date) &&
          !e.notes?.startsWith("Public holiday:"),
      ),
    [pastWeekEntries, holidayDates],
  );

  const unsubmittedPastWeekDraftsCount = unsubmittedPastWeekDrafts.length;
  const hasUnsubmittedPastWeekDrafts = unsubmittedPastWeekDraftsCount > 0;

  // Automatic draft selection:
  // If the user has drafts from last week that have not been submitted,
  // the ONLY thing they see on the review component is those drafts that need attention!
  const editableEntries = useMemo(() => {
    if (hasUnsubmittedPastWeekDrafts) {
      return unsubmittedPastWeekDrafts;
    }
    return currentWeekEntries.filter(
      (entry) =>
        (entry.status === "draft" || entry.status === "rejected") &&
        entry.work_date >= startOfPastWeek &&
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
  }, [hasUnsubmittedPastWeekDrafts, unsubmittedPastWeekDrafts, currentWeekEntries, startOfPastWeek, holidayDates]);

  const submittedEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.status !== "draft" &&
          entry.status !== "rejected" &&
          entry.work_date >= startOfPastWeek &&
          !holidayDates.has(entry.work_date) &&
          !entry.notes?.startsWith("Public holiday:"),
      ),
    [entries, startOfPastWeek, holidayDates],
  );

  const filteredEntries = useMemo(() => {
    if (hasUnsubmittedPastWeekDrafts) {
      return unsubmittedPastWeekDrafts;
    }
    return currentWeekEntries.filter(
      (entry) =>
        entry.work_date >= startOfPastWeek &&
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
  }, [hasUnsubmittedPastWeekDrafts, unsubmittedPastWeekDrafts, currentWeekEntries, startOfPastWeek, holidayDates]);

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
  const standardHours = Number(workSchedule?.standard_daily_hours ?? 8);

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

  const missingNoteSelected: TimeEntryRecord[] = [];
  const hasMissingNotes = false;

  const submitBlocked =
    selectedEntryIds.size === 0 ||
    (hasFlaggedSelected && !acknowledgedFlags);
  const rawMessage =
    createState.message ||
    deleteState.message ||
    correctionState.message ||
    saveState.message ||
    submitState.message;

  const message = useMemo(() => {
    if (!rawMessage) return null;
    const msg = rawMessage.trim();
    if (
      msg.includes("refresh_time_entry") ||
      msg.includes("does not exist") ||
      msg.includes("function public.")
    ) {
      return "Timesheet calculation service was updated. Please try submitting again.";
    }
    if (msg.includes("violates check constraint") || msg.includes("violates")) {
      return "Unable to save due to an invalid time range. Please verify your clock-in and clock-out times.";
    }
    return msg;
  }, [rawMessage]);
  const messageOk = createState.message
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
    const isPulsating = pulsatingEntryId === entry.id;
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

        const dayLeave = leaveByDate.get(entry.work_date);
    const isLeaveDay = Boolean(
      dayLeave ||
      entry.leave_type_id != null ||
      entry.notes?.startsWith("Leave:") ||
      entry.notes?.startsWith("Leave (Pending):") ||
      entry.notes?.startsWith("TOIL / Leave:") ||
      entry.notes?.toLowerCase().includes("leave") ||
      (entry.clock_in == null && entry.clock_out == null && Number(entry.paid_hours ?? 0) > 0)
    );

    if (isLeaveDay) {
      const leaveName =
        dayLeave?.leaveTypeName ||
        (entry.notes?.startsWith("Leave: ") ? entry.notes.replace(/^Leave:\s*/, "") : null) ||
        (entry.notes?.startsWith("Leave (Pending): ") ? entry.notes.replace(/^Leave \(Pending\):\s*/, "") : null) ||
        "Annual Leave";
      const leaveReason = dayLeave?.reason || (entry.notes && !entry.notes.startsWith("Leave:") ? entry.notes : "Authorized Paid Leave");
      const leaveHours = Number(entry.paid_hours) > 0
        ? Number(entry.paid_hours)
        : dayLeave?.total_hours
          ? Math.min(8, Number(dayLeave.total_hours))
          : 8;
      const isPending = dayLeave ? (dayLeave.status === "submitted" || dayLeave.status === "draft") : entry.status === "draft";

      return (
        <article
          key={entry.id}
          id={`timesheet-entry-${entry.id}`}
          className={`group flex flex-col justify-between gap-3 rounded-2xl p-4 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md min-w-0 w-full max-w-full bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 border border-violet-400/30 ${
            isPulsating ? "cw-timesheet-pulsating ring-4 ring-emerald-400" : ""
          }`}
        >
          {/* Top: Date Monogram Box, Date & Status Badge */}
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="relative shrink-0">
                <div className="flex size-9 flex-col items-center justify-center rounded-xl border border-violet-400/40 bg-violet-950/80 shadow-xs leading-none select-none">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-violet-200">
                    {dateParts.month}
                  </span>
                  <span className="text-xs font-black mt-0.5 text-white">
                    {dateParts.day}
                  </span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ring-violet-900 bg-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-white break-words leading-tight">
                  {formatDate(entry.work_date)}
                </p>
                <p className="text-[11px] font-medium text-violet-200 break-words leading-tight mt-0.5">
                  {leaveName} &middot; {isPending ? "Pending Review" : "Approved Leave"}
                </p>
              </div>
            </div>

            <RecordStatusBadge
              status={isApproved ? "verified" : entry.status}
              isFixed={isFixed}
            />
          </div>

          {/* Leave Card Dedicated Showcase (No IN, LUNCH, OUT, No Workstation) */}
          <div className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-400/25 text-white border border-white/20 shadow-xs">
                  <Calendar className="size-4.5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-white truncate">
                    {leaveName}
                  </p>
                  <p className="text-[11px] font-medium text-violet-200 truncate mt-0.5">
                    {leaveReason}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 border border-white/25 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                {isPending ? "Pending" : "Approved"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-violet-200">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-bold">Paid Absence Allocation</span>
              </div>
              <span className="font-mono font-black text-sm text-emerald-300">
                {formatHours(leaveHours)}
              </span>
            </div>
          </div>

          {/* Leave Card Clean Footer (No workstation, no clocking references) */}
          <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/25 px-2.5 py-1 text-[10px] font-bold text-violet-200 border border-white/10">
              <Calendar className="size-3 text-violet-300" />
              <span>Statutory Leave &middot; No Clocking Required</span>
            </span>
            <span className="shrink-0 rounded-md px-3 py-1 text-[10px] font-black text-white bg-black/35 border border-white/15 shadow-xs">
              {formatHours(leaveHours)} Paid
            </span>
          </div>
        </article>
      );
    } else if (isApproved) {
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
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-1.5 mb-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="size-3 text-slate-400" />
                Draft Times
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyTemplateToDraft(entry, true)}
                  className="inline-flex items-center gap-1 rounded bg-amber-50 hover:bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 border border-amber-200/80 transition-colors shadow-2xs cursor-pointer"
                  title={`Load schedule template with lunch: ${scheduleTemplate.scheduleName}`}
                >
                  <Sparkles className="size-2.5 text-amber-600" />
                  Load Schedule
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplateToDraft(entry, false)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-300 transition-colors shadow-2xs cursor-pointer"
                  title="Load schedule hours without lunch"
                >
                  No Lunch
                </button>
                {(draftOverrides.get(entry.id)?.lunch_start ||
                  draftOverrides.get(entry.id)?.lunch_end ||
                  entry.lunch_start ||
                  entry.lunch_end) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftOverrides((prev) => {
                        const next = new Map(prev);
                        const current = next.get(entry.id) ?? {};
                        next.set(entry.id, {
                          ...current,
                          lunch_start: "",
                          lunch_end: "",
                        });
                        return next;
                      });
                      handleEntryModified(entry.id);
                    }}
                    className="inline-flex items-center gap-0.5 rounded bg-rose-50 hover:bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                    title="Clear lunch times"
                  >
                    <X className="size-2.5 text-rose-600" />
                    Clear Lunch
                  </button>
                )}
              </div>
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

            <div className="flex items-center gap-1.5 rounded-md bg-slate-50 border border-slate-200/60 px-2 py-1 text-[10px] font-medium text-slate-600">
              <UtensilsCrossed className="size-3 text-slate-400 shrink-0" />
              <span>Flexible lunch: Lunch can be taken anytime, for any duration, or omitted completely.</span>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-1.5 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 truncate block">
                  Note
                </span>
              </div>
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
                  : hasMissingNotes
                    ? `Notes required (${missingNoteSelected.length} needed)`
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

        {/* Hidden inputs for any inline notes already filled for selected entries */}
        {Object.entries(inlineSubmissionNotes).map(([entryId, noteVal]) => {
          if (
            selectedEntryIds.has(entryId) &&
            !missingNoteSelected.some((e) => e.id === entryId) &&
            noteVal.trim()
          ) {
            return (
              <input
                key={`hidden-inline-note-${entryId}`}
                type="hidden"
                name={`note_${entryId}`}
                value={noteVal}
              />
            );
          }
          return null;
        })}
      </form>
    ) : null;

  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 pb-24 sm:pb-6">
      {/* Step 2 Review and Adjust Action Hub */}
      <div className="grid gap-4">
        {/* Status Notification Banner when past-week drafts need attention */}
        {hasUnsubmittedPastWeekDrafts ? (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-4 text-xs text-amber-950 dark:text-amber-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-extrabold text-sm text-amber-950 dark:text-amber-100">
                  Clock-in Locked: {unsubmittedPastWeekDraftsCount} Draft Timesheet{unsubmittedPastWeekDraftsCount === 1 ? "" : "s"} Needing Attention
                </p>
                <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
                  You have unsubmitted drafts from last week ({startOfPastWeek} to {endOfPastWeek}). Only these drafts are displayed below so you can review, adjust, and submit them to immediately unlock clock-in.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface/80 p-3 text-xs">
            <span className="text-muted font-medium">All past week timesheets have been submitted. Showing current week.</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-400">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Up to date</span>
            </span>
          </div>
        )}


        {/* Inline Draft Batch Selector Card */}
        {quickSubmitForm}

        {/* Tab Header & Action Bar */}
        <div ref={timesheetSectionRef} className="grid gap-3 scroll-mt-20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleTabChange("timesheets")}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  activeTab === "timesheets"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-foreground hover:bg-surface-muted"
                }`}
              >
                <span>Drafts</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    activeTab === "timesheets"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  {filteredEntries.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("requests")}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  activeTab === "requests"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-foreground hover:bg-surface-muted"
                }`}
              >
                <span>Requests</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    activeTab === "requests"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  {submittedEntries.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsAddPastDayOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 text-xs font-bold text-primary transition-colors shadow-2xs cursor-pointer"
              >
                <CalendarPlus className="size-3.5" />
                <span>Add past day</span>
              </button>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                messageOk
                  ? "border-accent/30 bg-accent/10 text-foreground"
                  : "border-danger/30 bg-danger/10 text-danger"
              }`}
            >
              {message}
            </div>
          )}

          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background/50 p-8 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarPlus className="size-5" />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">No drafts for this period</p>
                <p className="mt-1 text-xs text-muted max-w-sm">
                  You don&apos;t have any drafts for this period. Add past days to record past work, then submit when ready.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddPastDayOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2 text-xs font-bold shadow-soft transition-colors cursor-pointer"
                >
                  <CalendarPlus className="size-3.5" />
                  <span>Add past day</span>
                </button>
              </div>
            </div>
          ) : activeTab === "timesheets" ? (
            <div className="grid gap-3">
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
                        disabled={timesheetsPage === 1}
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                        title="First page"
                      >
                        <ChevronsLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(timesheetsPage - 1)}
                        disabled={timesheetsPage === 1}
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                        title="Previous page"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>

                      <span className="px-2 font-bold text-foreground">
                        {timesheetsPage} / {totalTimesheetsPages}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(timesheetsPage + 1)}
                        disabled={timesheetsPage === totalTimesheetsPages}
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                        title="Next page"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimesheetsPageChange(totalTimesheetsPages)}
                        disabled={timesheetsPage === totalTimesheetsPages}
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                        title="Last page"
                      >
                        <ChevronsRight className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {submittedEntries.map((entry) => (
                  <div key={entry.id} className="w-full min-w-0 max-w-full">
                    {renderTimesheetEntry(entry)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Past Day Modal */}
      {typeof document !== "undefined" && isAddPastDayOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !createPending) setIsAddPastDayOpen(false);
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-2xl border border-border/80 bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-surface-muted/40 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <CalendarPlus className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Add Past Workday</h3>
                  <p className="text-[11px] text-muted">Create a draft for a past day you worked</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPastDayOpen(false)}
                disabled={createPending}
                className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Date Selector */}
              <div className="space-y-1.5">
                <label htmlFor="past_work_date" className="text-xs font-bold text-foreground">
                  Select Work Date
                </label>
                <input
                  type="date"
                  id="past_work_date"
                  name="work_date"
                  value={targetPastDate}
                  onChange={(e) => setTargetPastDate(e.target.value)}
                  min={startOfPastWeek}
                  max={yesterdayDate}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-hidden"
                />

                {missingPastWorkdays.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-muted">Suggested missing workdays:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {missingPastWorkdays.slice(0, 5).map((day: string) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setTargetPastDate(day)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border transition-colors cursor-pointer ${
                            targetPastDate === day
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-surface-muted text-foreground border-border hover:bg-slate-200"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Target Schedule Info */}
              {targetSchedule && (
                <div className="rounded-xl border border-border bg-surface-muted/30 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="size-3.5 text-primary" />
                      Scheduled Shift
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLunchInPastDraft}
                        onChange={(e) => setIncludeLunchInPastDraft(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span>Include Lunch</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-background p-2 border border-border/60">
                      <span className="text-muted block text-[10px] uppercase font-bold">Hours</span>
                      <span className="font-bold text-foreground font-mono">
                        {targetSchedule.clock_in} - {targetSchedule.clock_out}
                      </span>
                    </div>
                    <div className="rounded-lg bg-background p-2 border border-border/60">
                      <span className="text-muted block text-[10px] uppercase font-bold">Lunch Break</span>
                      <span className="font-bold text-foreground font-mono">
                        {includeLunchInPastDraft ? `${targetSchedule.lunch_start} - ${targetSchedule.lunch_end}` : "None"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <form action={createAction}>
                  <input type="hidden" name="work_date" value={targetPastDate} />
                  <input type="hidden" name="clock_in" value={targetSchedule?.clock_in ?? "08:00"} />
                  <input
                    type="hidden"
                    name="lunch_start"
                    value={includeLunchInPastDraft ? (targetSchedule?.lunch_start ?? "13:00") : ""}
                  />
                  <input
                    type="hidden"
                    name="lunch_end"
                    value={includeLunchInPastDraft ? (targetSchedule?.lunch_end ?? "14:00") : ""}
                  />
                  <input type="hidden" name="clock_out" value={targetSchedule?.clock_out ?? "17:00"} />
                  <input
                    type="hidden"
                    name="notes"
                    value={
                      includeLunchInPastDraft
                        ? "Created via schedule template"
                        : "Created via schedule template (no lunch)"
                    }
                  />
                  <button
                    type="submit"
                    disabled={!targetPastDate || entriesByDate.has(targetPastDate) || holidayDates.has(targetPastDate) || createPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Plus className="size-4" />
                    <span>{createPending ? "Adding draft..." : "Add with Scheduled Hours"}</span>
                  </button>
                </form>

                <form action={createAction}>
                  <input type="hidden" name="work_date" value={targetPastDate} />
                  <button
                    type="submit"
                    disabled={!targetPastDate || entriesByDate.has(targetPastDate) || holidayDates.has(targetPastDate) || createPending}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-surface-muted px-4 py-2 text-xs font-bold text-foreground disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Plus className="size-3.5 text-muted" />
                    <span>Add Blank Draft</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
