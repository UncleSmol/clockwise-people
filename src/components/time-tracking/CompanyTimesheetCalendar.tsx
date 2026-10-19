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
  ShieldCheck,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import RecordStatusBadge from "./RecordStatusBadge";
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
import AnalogTimePicker from "@/components/time-tracking/AnalogTimePicker";

type CompanyTimesheetCalendarProps = {
  employees: CompanyCalendarEmployeeOption[];
  entries: CompanyTimesheetCalendarEntry[];
  leaveRequests: CompanyCalendarLeaveRequest[];
  publicHolidays: CompanyPublicHoliday[];
  liveOverview?: CompanyLiveTimeOverview | null;
  isSysAdmin?: boolean;
};

const initialActionState = {
  ok: true,
  message: "",
};

type CalendarWindow = "day" | "week" | "payroll" | "month";

function viewButtonClass(active: boolean) {
  return active
    ? "bg-primary text-white shadow-soft font-semibold"
    : "border border-border/80 bg-surface text-foreground hover:bg-surface-muted font-semibold";
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

function isLeaveEntry(entry?: Partial<CompanyTimesheetCalendarEntry> | null): boolean {
  if (!entry) return false;
  return Boolean(
    entry.leave_type_id != null ||
    entry.notes?.startsWith("Leave:") ||
    entry.notes?.startsWith("TOIL / Leave:") ||
    entry.notes?.toLowerCase().includes("leave")
  );
}

function getEntryBorderClass(entry: CompanyTimesheetCalendarEntry) {
  if (isLeaveEntry(entry)) {
    return "border-violet-300 bg-violet-50/50 hover:bg-violet-50/80";
  }
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

function statusClass(status: CompanyTimesheetCalendarEntry["status"], isLeave?: boolean) {
  if (isLeave) return ["cw-company-timesheet-event", "cw-calendar-leave"];
  if (status === "draft") return ["cw-company-timesheet-event", "cw-calendar-draft"];
  if (status === "approved") return ["cw-company-timesheet-event", "cw-calendar-approved"];
  if (status === "rejected") return ["cw-company-timesheet-event", "cw-calendar-rejected"];
  if (status === "locked") return ["cw-company-timesheet-event", "cw-calendar-locked"];
  return ["cw-company-timesheet-event", "cw-calendar-submitted"];
}

function statusBadgeClass(status: CompanyTimesheetCalendarEntry["status"], isLeave?: boolean) {
  if (isLeave) return "bg-violet-600 text-white shadow-soft";
  if (status === "draft") return "bg-amber-500 text-white shadow-soft";
  if (status === "approved") return "bg-emerald-600 text-white shadow-soft";
  if (status === "rejected") return "bg-rose-600 text-white shadow-soft";
  if (status === "locked") return "bg-slate-500 text-white shadow-soft";
  return "bg-primary text-white shadow-soft";
}

function getCalendarEntryCardTheme(entry: CompanyTimesheetCalendarEntry) {
  if (isLeaveEntry(entry)) {
    return {
      cardBg: "bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-soft",
      avatarBg: "bg-white/20 text-white",
      subText: "text-white/85",
      dotBg: "bg-violet-300",
      badgeClass: "bg-white/20 text-white border border-white/30",
      statusLabel: "On Leave",
      footerPillBg: "bg-white/15 text-white border-white/25",
    };
  }

  const isException = Boolean(
    entry.missing_clocking ||
    entry.late_arrival ||
    entry.early_departure ||
    entry.status === "rejected" ||
    (entry.scheduleValidation && !entry.scheduleValidation.isCompliant)
  );

  if (isException) {
    return {
      cardBg: "bg-rose-600 text-white shadow-soft",
      avatarBg: "bg-rose-800/90 text-rose-100",
      subText: "text-rose-100",
      dotBg: "bg-rose-300",
      badgeClass: "bg-rose-900/60 text-white border border-rose-400/40",
      statusLabel: entry.status === "rejected" ? "Rejected" : "Exception",
      footerPillBg: "bg-rose-900/50 text-rose-100 border-rose-400/30",
    };
  }

  if (entry.status === "draft") {
    return {
      cardBg: "card-gold text-white shadow-soft",
      avatarBg: "bg-black/20 text-white",
      subText: "text-white/85",
      dotBg: "bg-amber-300",
      badgeClass: "bg-black/25 text-white border border-white/20",
      statusLabel: "Draft",
      footerPillBg: "bg-black/20 text-white border border-white/20",
    };
  }

  if (entry.status === "approved") {
    return {
      cardBg: "card-hero-green text-white shadow-soft",
      avatarBg: "bg-white/20 text-white",
      subText: "text-white/85",
      dotBg: "bg-emerald-300",
      badgeClass: "bg-white/20 text-white border border-white/30",
      statusLabel: "Approved",
      footerPillBg: "bg-white/15 text-white border-white/25",
    };
  }

  // submitted / locked / compliant default -> emerald hero
  return {
    cardBg: "card-hero-green text-white shadow-soft",
    avatarBg: "bg-white/20 text-white",
    subText: "text-white/85",
    dotBg: "bg-emerald-300",
    badgeClass: "bg-white/20 text-white border border-white/30",
    statusLabel: entry.status === "locked" ? "Locked" : "Submitted",
    footerPillBg: "bg-white/15 text-white border-white/25",
  };
}

function canEdit(status: CompanyTimesheetCalendarEntry["status"]) {
  return status === "draft" || status === "rejected";
}

function renderEventContent(eventInfo: EventContentArg) {
  const entry = eventInfo.event.extendedProps.entry as
    | CompanyTimesheetCalendarEntry
    | undefined;
  const isLeave = Boolean(
    eventInfo.event.extendedProps.isLeave ||
    (entry && isLeaveEntry(entry))
  );

  if (!entry && !isLeave) {
    return (
      <div className="truncate text-[11px] font-semibold leading-4">
        {eventInfo.event.title}
      </div>
    );
  }

  const name = entry
    ? displayName(entry)
    : (eventInfo.event.extendedProps.employeeName as string) || eventInfo.event.title;
  const avatarUrl = entry
    ? entry.avatarUrl
    : (eventInfo.event.extendedProps.avatarUrl as string | null);
  const leaveName =
    (eventInfo.event.extendedProps.leaveTypeName as string) ||
    entry?.notes ||
    "Leave";
  const hours = entry
    ? formatHours(entry.paid_hours)
    : eventInfo.event.extendedProps.totalHours
      ? formatHours(eventInfo.event.extendedProps.totalHours as number)
      : "";

  if (isLeave) {
    return (
      <span
        className="cw-calendar-avatar-event relative inline-grid shrink-0 place-items-center overflow-visible rounded-full ring-2 ring-violet-500 ring-offset-1 bg-violet-500/20 shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        title={`${name} · On Leave (${leaveName})${hours ? ` · ${hours}` : ""}`}
      >
        <EmployeeAvatar
          name={name}
          src={avatarUrl}
          className="size-6 rounded-full border-0"
        />
        <span
          className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-1 ring-white bg-violet-600 shadow-xs z-10"
          title="On Leave"
        />
      </span>
    );
  }

  if (!entry) {
    return null;
  }

  return (
    <span
      className={`cw-calendar-avatar-event inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ${avatarRingClass(entry.status, false)}`}
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

function avatarRingClass(status: CompanyTimesheetCalendarEntry["status"], isLeave: boolean = false) {
  if (isLeave) return "ring-violet-500 bg-violet-500/20 shadow-[0_0_8px_rgba(139,92,246,0.6)] ring-offset-1";
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
  isSysAdmin = false,
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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
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
    const dayEntries = entries.filter(
      (e) =>
        e.work_date === calendarFocusDate &&
        !holidayDates.has(e.work_date) &&
        !e.notes?.startsWith("Public holiday:"),
    );

    const existingEmployeesOnDate = new Set(dayEntries.map((e) => e.employee_id));
    const extraLeave: CompanyTimesheetCalendarEntry[] = [];

    for (const lr of leaveRequests ?? []) {
      if (lr.status !== "approved") continue;
      if (calendarFocusDate >= lr.start_date && calendarFocusDate <= lr.end_date) {
        if (!existingEmployeesOnDate.has(lr.employee_id) && !holidayDates.has(calendarFocusDate)) {
          extraLeave.push({
            id: `leave-req-${lr.id}-${calendarFocusDate}`,
            company_id: "",
            employee_id: lr.employee_id,
            work_date: calendarFocusDate,
            clock_in: null,
            lunch_start: null,
            lunch_end: null,
            clock_out: null,
            normal_hours: Number(lr.total_hours ?? 8),
            overtime_hours: 0,
            paid_hours: Number(lr.total_hours ?? 8),
            missing_clocking: false,
            late_arrival: false,
            early_departure: false,
            status: "approved",
            notes: `Leave: ${lr.leaveTypeName}`,
            warning_notes: null,
            workstation_id: null,
            gross_hours: Number(lr.total_hours ?? 8),
            lunch_hours: 0,
            leave_type_id: "leave",
            employeeNumber: lr.employeeNumber,
            fullName: lr.employeeName,
            knownAs: null,
            avatarUrl: lr.avatarUrl ?? null,
            workstationName: "On Leave",
            paidTimeOffHours: Number(lr.total_hours ?? 8),
            locationEvents: [],
            scheduleValidation: { isCompliant: true, issues: [] },
          });
        }
      }
    }

    return [...dayEntries, ...extraLeave];
  }, [entries, leaveRequests, calendarFocusDate, holidayDates]);

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
        (entry.status === "submitted" || (isSysAdmin && entry.status === "draft")) &&
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
  }, [entries, selectedEntry, holidayDates, isSysAdmin]);

  const events = useMemo<EventInput[]>(
    () => {
      const holidayEvents = publicHolidays.map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));

      const existingKeySet = new Set(
        entries.map((entry) => `${entry.employee_id}_${entry.work_date}`),
      );

      const leaveRequestEvents: EventInput[] = [];
      for (const lr of leaveRequests ?? []) {
        if (lr.status !== "approved") continue;
        const [sy, sm, sd] = lr.start_date.split("-").map(Number);
        const [ey, em, ed] = lr.end_date.split("-").map(Number);
        const curr = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);

        while (curr <= end) {
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, "0");
          const d = String(curr.getDate()).padStart(2, "0");
          const dateStr = `${y}-${m}-${d}`;

          if (!existingKeySet.has(`${lr.employee_id}_${dateStr}`) && !holidayDates.has(dateStr)) {
            leaveRequestEvents.push({
              id: `leave-req-${lr.id}-${dateStr}`,
              title: `${lr.employeeName} · On Leave`,
              start: dateStr,
              allDay: true,
              classNames: ["cw-company-timesheet-event", "cw-calendar-leave"],
              extendedProps: {
                isLeave: true,
                employeeId: lr.employee_id,
                employeeName: lr.employeeName,
                employeeNumber: lr.employeeNumber,
                leaveTypeName: lr.leaveTypeName,
                avatarUrl: lr.avatarUrl ?? null,
                totalHours: lr.total_hours,
                workDate: dateStr,
              },
            });
          }
          curr.setDate(curr.getDate() + 1);
        }
      }

      const timesheetEvents = entries
        .filter(
          (entry) =>
            !holidayDates.has(entry.work_date) &&
            !entry.notes?.startsWith("Public holiday:"),
        )
        .map((entry) => {
          const isLeave = isLeaveEntry(entry);
          return {
            id: entry.id,
            title: isLeave ? `${displayName(entry)} · On Leave` : displayName(entry),
            start: entry.work_date,
            allDay: true,
            classNames: [
              "cw-company-timesheet-event",
              isLeave
                ? "cw-calendar-leave"
                : entry.missing_clocking || entry.late_arrival || entry.early_departure
                  ? "cw-company-timesheet-event-warning"
                  : "",
            ],
            extendedProps: { entry, isLeave },
          };
        });

      return [...holidayEvents, ...timesheetEvents, ...leaveRequestEvents];
    },
    [entries, leaveRequests, publicHolidays, holidayDates],
  );

  const totals = useMemo(() => {
    const validEntries = entries.filter(
      (entry) =>
        !holidayDates.has(entry.work_date) &&
        !entry.notes?.startsWith("Public holiday:"),
    );
    const leaveEntriesCount = validEntries.filter(isLeaveEntry).length;

    const existingKeySet = new Set(validEntries.map((e) => `${e.employee_id}_${e.work_date}`));
    let extraLeaveCount = 0;
    for (const lr of leaveRequests ?? []) {
      if (lr.status !== "approved") continue;
      const [sy, sm, sd] = lr.start_date.split("-").map(Number);
      const [ey, em, ed] = lr.end_date.split("-").map(Number);
      const curr = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);

      while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        if (!existingKeySet.has(`${lr.employee_id}_${dateStr}`) && !holidayDates.has(dateStr)) {
          extraLeaveCount++;
        }
        curr.setDate(curr.getDate() + 1);
      }
    }

    return {
      approved: validEntries.filter((entry) => entry.status === "approved" && !isLeaveEntry(entry)).length,
      onLeave: leaveEntriesCount + extraLeaveCount,
      issues: validEntries.filter(
        (entry) => (entry.missing_clocking || entry.late_arrival || entry.early_departure) && !isLeaveEntry(entry),
      ).length,
      submitted: validEntries.filter((entry) => entry.status === "submitted").length,
      total: validEntries.length + extraLeaveCount,
    };
  }, [entries, leaveRequests, holidayDates]);

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
              (e) =>
                e.employee_id === entry.employee_id &&
                (e.status === "submitted" || (isSysAdmin && e.status === "draft")),
            )
            .map((e) => e.id),
        ),
      );
    } else if (arg.event.extendedProps.isLeave) {
      const ep = arg.event.extendedProps;
      const workDate = (ep.workDate as string) || (arg.event.startStr ? arg.event.startStr.slice(0, 10) : "");
      const syntheticEntry: CompanyTimesheetCalendarEntry = {
        id: arg.event.id,
        company_id: "",
        employee_id: (ep.employeeId as string) || "",
        work_date: workDate,
        clock_in: null,
        lunch_start: null,
        lunch_end: null,
        clock_out: null,
        normal_hours: Number(ep.totalHours ?? 8),
        overtime_hours: 0,
        paid_hours: Number(ep.totalHours ?? 8),
        missing_clocking: false,
        late_arrival: false,
        early_departure: false,
        status: "approved",
        notes: `Leave: ${ep.leaveTypeName || "Approved Leave"}`,
        warning_notes: null,
        workstation_id: null,
        gross_hours: Number(ep.totalHours ?? 8),
        lunch_hours: 0,
        leave_type_id: "leave",
        employeeNumber: (ep.employeeNumber as string) || "",
        fullName: (ep.employeeName as string) || "",
        knownAs: null,
        avatarUrl: (ep.avatarUrl as string) || null,
        workstationName: "On Leave",
        paidTimeOffHours: Number(ep.totalHours ?? 8),
        locationEvents: [],
        scheduleValidation: { isCompliant: true, issues: [] },
      };
      setCalendarFocusDate(workDate);
      setSelectedEntry(syntheticEntry);
      setEditing(false);
      setEditedTimes({});
      setSelectedApprovalIds(new Set());
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
    setIsReviewModalOpen(false);
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
      <div className="card-hero-green rounded-2xl p-5 text-white shadow-soft sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
              Company Calendar
            </p>
            <h2 className="mt-0.5 text-xl font-black text-white sm:text-2xl">
              Team Timesheets
            </h2>
            <p className="mt-0.5 hidden text-xs text-white/85 sm:block">
              Click any date cell to create shifts or load approved leave. Click any employee avatar to view or edit.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:w-[38rem]">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Shifts
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.total}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-white shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Submitted
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.submitted}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Approved
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.approved}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                On Leave
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.onLeave}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Exceptions
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.issues}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-4">
        {activeColleagues.length > 0 && (
          <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                </span>
                <p className="text-xs font-bold text-foreground">
                  Colleagues on shift right now ({activeColleagues.length})
                </p>
              </div>

              {activeColleagues.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setShowAllColleagues((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-soft"
                  aria-label={showAllColleagues ? "Collapse colleagues list" : `Show ${hiddenColleaguesCount} more colleagues`}
                >
                  <span>{showAllColleagues ? "Show less" : `+${hiddenColleaguesCount} more`}</span>
                  {showAllColleagues ? (
                    <ChevronUp className="size-3.5 text-muted" />
                  ) : (
                    <ChevronDown className="size-3.5 text-muted" />
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
                    className={`flex items-center gap-2 rounded-full border p-1.5 pr-3 shadow-soft transition-all ${isOnLunch
                      ? "border-amber-200 bg-surface hover:bg-amber-50"
                      : "border-emerald-200 bg-surface hover:bg-emerald-50"
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
                      <p className="text-xs font-extrabold text-foreground break-words leading-tight">
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
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-primary/50 bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 hover:border-primary transition-all cursor-pointer shadow-soft"
                  aria-label={`Show ${hiddenColleaguesCount} more colleagues`}
                >
                  <span>+{hiddenColleaguesCount} more</span>
                  <ChevronDown className="size-3.5 text-primary" />
                </button>
              ) : showAllColleagues && hiddenColleaguesCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllColleagues(false)}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-primary/50 bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 hover:border-primary transition-all cursor-pointer shadow-soft"
                  aria-label="Show fewer colleagues"
                >
                  <span>Show less</span>
                  <ChevronUp className="size-3.5 text-primary" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {globalMessage ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft ${globalOk
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
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewButtonClass(calendarWindow === value)}`}
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-3 py-1 text-[11px] font-medium text-foreground shadow-soft">
            <span className="size-1.5 rounded-full bg-slate-400" />
            Public Holiday
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-900 shadow-soft">
            <span className="size-1.5 rounded-full bg-amber-500" />
            Draft
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary shadow-soft">
            <span className="size-1.5 rounded-full bg-primary" />
            Submitted
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-900 shadow-soft">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Approved
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-medium text-violet-900 shadow-soft">
            <span className="size-1.5 rounded-full bg-violet-600" />
            On Leave
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-900 shadow-soft">
            <span className="size-1.5 rounded-full bg-rose-500" />
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
                  const isLeave = Boolean(arg.event.extendedProps.isLeave);
                  if (isLeave) {
                    return ["cw-company-timesheet-event", "cw-calendar-leave", "cw-calendar-avatar-event"];
                  }
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
                  const isLeave = Boolean(info.event.extendedProps.isLeave);
                  const entry = info.event.extendedProps.entry as CompanyTimesheetCalendarEntry | undefined;

                  if (isLeave) {
                    const employeeName =
                      (info.event.extendedProps.employeeName as string) ||
                      (entry ? displayName(entry) : "Employee");
                    const leaveTypeName =
                      (info.event.extendedProps.leaveTypeName as string) ||
                      entry?.notes?.replace("Leave: ", "") ||
                      "Approved Leave";
                    const lines = `${employeeName} · On Leave (${leaveTypeName})`;

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
                  } else if (entry) {
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
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="date"
                  value={calendarFocusDate}
                  onChange={(e) => setCalendarFocusDate(e.target.value)}
                  className="min-w-0 flex-1 rounded-full border border-border/80 bg-surface px-4 py-2 text-sm font-semibold text-foreground outline-none shadow-soft focus:border-primary"
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
                  className="shrink-0 rounded-full border border-primary bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-soft"
                >
                  Today
                </button>
              </div>

              <div className="flex min-w-0 max-w-full flex-col gap-3">
                {publicHolidays
                  .filter((h) => h.holiday_date === calendarFocusDate)
                  .map((holiday) => (
                    <div
                      key={`holiday-${holiday.id}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-holiday/30 bg-holiday/10 p-3.5 shadow-soft"
                    >
                      <span className="min-w-0 text-sm font-semibold text-holiday break-words leading-tight">{holiday.name}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-holiday/20 bg-holiday/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-holiday">
                        Holiday
                      </span>
                    </div>
                  ))}
                {visibleMobileEntries.map((entry) => {
                  const theme = getCalendarEntryCardTheme(entry);
                  const initials = displayName(entry).split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "EM";
                  return (
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
                                  (e.status === "submitted" || (isSysAdmin && e.status === "draft")),
                              )
                              .map((e) => e.id),
                          ),
                        );
                      }}
                      className={`block w-full min-w-0 max-w-full overflow-hidden rounded-2xl p-4 text-left transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ${theme.cardBg}`}
                      aria-label={`${displayName(entry)} timesheet entry for ${formatDate(entry.work_date)}`}
                    >
                      {/* Top: Monogram Avatar with Status Dot + Name/Date & Top-Right Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className={`flex size-8 items-center justify-center rounded-full text-xs font-black uppercase ${theme.avatarBg}`}>
                              {initials}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-slate-900 ${theme.dotBg}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate leading-tight">
                              {displayName(entry)}
                            </p>
                            <p className={`text-[11px] font-medium truncate mt-0.5 ${theme.subText}`}>
                              {formatDate(entry.work_date)} · Shift Log
                            </p>

                          </div>
                        </div>
                        <RecordStatusBadge
                          status={entry.status}
                          size={38}
                        />
                      </div>

                      {/* Inset Crisp White Metrics Island */}
                      <div className="my-2.5 grid grid-cols-3 gap-1 rounded-xl bg-white p-2 text-center text-slate-900 shadow-xs">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">In</p>
                          <p className="font-mono text-xs font-extrabold text-slate-900">
                            {formatTime(entry.clock_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {entry.lunch_start ? "Lunch" : "Out"}
                          </p>
                          <p className="font-mono text-xs font-extrabold text-slate-900">
                            {entry.lunch_start && entry.lunch_end
                              ? `${formatTime(entry.lunch_start)}-${formatTime(entry.lunch_end)}`
                              : formatTime(entry.clock_out)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Total Paid</p>
                          <p className="font-mono text-xs font-extrabold text-emerald-700">
                            {formatHours(entry.paid_hours)}
                            {Number(entry.overtime_hours ?? 0) > 0 ? ` +${formatHours(entry.overtime_hours)}` : ""}
                          </p>
                        </div>
                      </div>

                      {/* Complementary Footer Pills */}
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold border truncate ${theme.footerPillBg}`}>
                          <MapPin className="size-2.5 shrink-0 opacity-70" />
                          <span className="truncate">{entry.workstationName || "Standard Office"}</span>
                        </span>
                        {entry.warning_notes || entry.notes ? (
                          <span className={`rounded-full px-2.5 py-0.5 font-medium border truncate max-w-[55%] ${theme.footerPillBg}`} title={entry.warning_notes || entry.notes || ""}>
                            {entry.warning_notes || entry.notes}
                          </span>
                        ) : (
                          <span className={`rounded-full px-2.5 py-0.5 font-medium border ${theme.footerPillBg}`}>
                            {entry.status === "approved" ? "Verified" : "Click to review"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {hiddenMobileEntriesCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllMobileEntries((prev) => !prev)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border/80 bg-surface py-2.5 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-soft"
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
                  <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted shadow-soft">
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
                className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/40 bg-surface py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-all shadow-soft"
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
                              e.employee_id === entry.employee_id &&
                              (e.status === "submitted" || (isSysAdmin && e.status === "draft")),
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
                    <span className="block font-semibold text-foreground break-words leading-tight">
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
        bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-20"
      >
        {selectedEntry ? (
          <>
            <div
              className={`flex items-center justify-between gap-3 rounded-lg p-3.5 shadow-sm ${isLeaveEntry(selectedEntry)
                ? "bg-violet-600 text-white ring-1 ring-violet-700/60"
                : selectedEntry.status === "approved"
                  ? "bg-emerald-600 text-white ring-1 ring-emerald-700/60"
                  : selectedEntry.status === "submitted"
                    ? "bg-slate-800 text-white ring-1 ring-slate-900/60"
                    : selectedEntry.status === "rejected"
                      ? "bg-rose-600 text-white ring-1 ring-rose-700/60"
                      : "border border-zinc-300 bg-zinc-100 text-zinc-900"
                }`}
            >
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${selectedEntry.status === "draft" && !isLeaveEntry(selectedEntry) ? "text-zinc-500" : "opacity-80"}`}>
                  {isLeaveEntry(selectedEntry) ? "Leave Record" : "Timesheet Status"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {isLeaveEntry(selectedEntry) ? (
                    <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">
                      On Leave
                    </span>
                  ) : (
                    <RecordStatusBadge
                      status={selectedEntry.status}
                      size={32}
                    />
                  )}
                  <span className={`text-xs font-bold ${selectedEntry.status === "draft" && !isLeaveEntry(selectedEntry) ? "text-zinc-600" : "text-white/90"}`}>
                    {selectedEntry.work_date}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${selectedEntry.status === "draft" && !isLeaveEntry(selectedEntry) ? "text-zinc-500" : "opacity-80"}`}>
                  Paid Total
                </p>
                <p className="mt-0.5 text-xl font-black">{formatHours(selectedEntry.paid_hours)}</p>
              </div>
            </div>

            {selectedEntry.status === "draft" && !isSysAdmin ? (
              <div className="rounded-lg border border-border bg-surface-muted p-2.5 text-xs font-medium text-muted">
                Draft timesheet — pending employee submission before manager approval.
              </div>
            ) : null}

            {editing ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["clock_in", "lunch_start", "lunch_end", "clock_out"] as const).map((field) => (
                  <div key={field} className="min-w-0 rounded-lg border border-border bg-background p-2">
                    <p className="leading-none text-[10px] font-bold uppercase text-muted">{field === "clock_in" ? "In" : field === "clock_out" ? "Out" : field.replace("_", " ")}</p>
                    <AnalogTimePicker
                      name={field}
                      defaultValue={selectedEntry[field] ?? ""}
                      onChange={(e) => handleTimeChange(field, e.target.value)}
                      compact
                      className="mt-1 flex h-7 w-full items-center justify-center gap-1 rounded border border-border bg-surface px-1 text-xs font-bold text-foreground outline-none hover:border-primary/50"
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
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning shadow-2xs">
                  <p className="font-bold uppercase tracking-wider text-[10px]">Note</p>
                  <p className="mt-0.5 font-medium">{selectedEntry.warning_notes}</p>
                </div>
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
                      <span className="min-w-0 break-words leading-tight text-muted">
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

            {(selectedEntry.status === "submitted" || (isSysAdmin && selectedEntry.status === "draft")) &&
            employeeSubmitted.length > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5 shadow-2xs">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                    {isSysAdmin && employeeSubmitted.some((e) => e.status === "draft") ? (
                      <ShieldCheck className="size-4 shrink-0 text-amber-600" />
                    ) : (
                      <ClipboardCheck className="size-4 shrink-0 text-accent" />
                    )}
                    <span>
                      {employeeSubmitted.length} timesheet{employeeSubmitted.length === 1 ? "" : "s"} pending review
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-muted">
                    {employeeSubmitted.some((e) => e.status === "draft") ? (
                      <span className="text-amber-700">
                        Includes {employeeSubmitted.filter((e) => e.status === "draft").length} unsubmitted draft{employeeSubmitted.filter((e) => e.status === "draft").length === 1 ? "" : "s"} available for approval.
                      </span>
                    ) : (
                      "Submitted timesheets ready for manager approval."
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-soft hover:bg-primary-hover transition-all cursor-pointer"
                >
                  <ClipboardCheck className="size-3.5 text-white" />
                  <span>Review &amp; Approve ({employeeSubmitted.length})</span>
                </button>
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
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft"
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
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-background p-2.5 shadow-soft">
                <form
                  action={deleteAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                >
                  <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                  <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                  <button
                    disabled={deletePending}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft"
                  >
                    <Trash2 className="size-3 shrink-0" />
                    {deletePending ? "..." : "Delete"}
                  </button>
                </form>
                <form
                  action={updateAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
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
                    onClick={() => { setEditing(false); setEditedTimes({}); }}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={updatePending}
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft hover:bg-primary-hover"
                  >
                    {updatePending ? "..." : "Save"}
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : null}
      </ViewportSidebar>

      {isReviewModalOpen && selectedEntry && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 sm:p-6 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsReviewModalOpen(false);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-lg max-h-[85vh] rounded-3xl border border-border/80 bg-surface shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  {isSysAdmin && employeeSubmitted.some((e) => e.status === "draft") ? (
                    <ShieldCheck className="size-5 text-amber-500" />
                  ) : (
                    <ClipboardCheck className="size-5 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-foreground break-words leading-tight">
                    Review &amp; Approve Timesheets
                  </h3>
                  <p className="text-xs text-muted break-words leading-tight mt-0.5">
                    {displayName(selectedEntry)} · {employeeSubmitted.length} record{employeeSubmitted.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-muted hover:text-foreground hover:bg-surface-muted/80 transition-colors cursor-pointer shadow-soft"
                aria-label="Close review modal"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body & Action Form */}
            <form action={approvalAction} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Select items to approve or reject:</span>
                  {employeeSubmitted.length > 1 ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAllApprovalSelection(true)}
                        className="text-primary hover:underline cursor-pointer font-bold"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllApprovalSelection(false)}
                        className="text-muted hover:text-foreground hover:underline cursor-pointer"
                      >
                        Deselect
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="divide-y divide-border rounded-2xl border border-border bg-background overflow-hidden shadow-soft">
                  {employeeSubmitted.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex cursor-pointer items-start gap-3 p-3.5 text-xs transition-colors hover:bg-surface-muted/60"
                    >
                      <input
                        type="checkbox"
                        name="time_entry_ids"
                        value={entry.id}
                        checked={selectedApprovalIds.has(entry.id)}
                        onChange={() => toggleApprovalId(entry.id)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-foreground">
                              {formatDate(entry.work_date)}
                            </span>
                            {entry.status === "draft" ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-600 uppercase">
                                Draft
                              </span>
                            ) : (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
                                Submitted
                              </span>
                            )}
                          </div>
                          <span className="font-extrabold text-foreground">
                            {formatHours(entry.paid_hours)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {formatTime(entry.clock_in)} &rarr; {formatTime(entry.clock_out)}
                          {Number(entry.overtime_hours ?? 0) > 0
                            ? ` + ${formatHours(entry.overtime_hours)} OT`
                            : ""}
                          {entry.missing_clocking || entry.late_arrival || entry.early_departure
                            ? " · Needs exception review"
                            : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Review note (optional)</label>
                  <textarea
                    name="approval_notes"
                    rows={2}
                    placeholder="Add a review note or rejection reason..."
                    className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted shadow-soft"
                  />
                </div>

                {approvalState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-xs font-semibold shadow-soft ${
                      approvalState.ok
                        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                        : "border-rose-300 bg-rose-50 text-rose-950"
                    }`}
                  >
                    {approvalState.message}
                  </div>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-muted/50 p-4">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="rounded-full border border-border bg-surface px-5 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-soft"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  disabled={approvalPending || selectedApprovalIds.size === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer shadow-soft"
                >
                  <XCircle className="size-4 shrink-0" />
                  {approvalPending ? "Working..." : "Reject Selected"}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  disabled={approvalPending || selectedApprovalIds.size === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer shadow-soft"
                >
                  <CheckCircle2 className="size-4 shrink-0 text-white" />
                  {approvalPending ? "Working..." : "Approve Selected"}
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
