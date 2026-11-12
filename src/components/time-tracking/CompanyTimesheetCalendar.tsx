"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import type { DayCellMountArg } from "@fullcalendar/core";
import {
  AlertTriangle,
  Calendar,
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
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import RecordStatusBadge from "./RecordStatusBadge";
import {
  adminDeleteCalendarLeave,
  adminUpdateCalendarLeave,
  createManagedDraftTimeEntry,
  deleteManagedDraftTimeEntry,
  deleteTimeEntry,
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
import type { LeaveType } from "@/lib/work-rules/schema";
import AnalogTimePicker from "@/components/time-tracking/AnalogTimePicker";

type CompanyTimesheetCalendarProps = {
  employees: CompanyCalendarEmployeeOption[];
  entries: CompanyTimesheetCalendarEntry[];
  leaveRequests: CompanyCalendarLeaveRequest[];
  publicHolidays: CompanyPublicHoliday[];
  liveOverview?: CompanyLiveTimeOverview | null;
  canViewLiveWorkforce?: boolean;
  isSysAdmin?: boolean;
  isSuperAdmin?: boolean;
  leaveTypes?: LeaveType[];
  workstations?: Array<{ id: string; name: string; address?: string | null }>;
  currentEmployeeId?: string | null;
  isBranchManager?: boolean;
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
  if (status === "out_of_range") return "Deviance · Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null) {
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-rose-400 bg-rose-100/90 text-rose-800 font-bold";
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
    entry.notes?.startsWith("Leave (Pending):") ||
    entry.notes?.startsWith("TOIL / Leave:") ||
    entry.notes?.startsWith("Approved leave:")
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

function canEdit(
  status: CompanyTimesheetCalendarEntry["status"],
  isRootSuperAdmin: boolean = false,
) {
  if (isRootSuperAdmin) {
    return status !== "locked";
  }
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
  canViewLiveWorkforce = false,
  isSysAdmin = false,
  isSuperAdmin = false,
  leaveTypes = [],
  workstations = [],
  currentEmployeeId = null,
  isBranchManager = false,
}: CompanyTimesheetCalendarProps) {
  const isRootSuperAdmin = Boolean(isSuperAdmin || isSysAdmin);

  const availableLeaveTypes = useMemo(() => {
    if (leaveTypes && leaveTypes.length > 0) return leaveTypes;
    return [
      { id: "562e93a9-bc0c-4b0d-aa09-dd1b2f37ea92", name: "Annual Leave", category: "annual" },
      { id: "5f0b1611-e0d7-41f6-a1a4-8f31bee9d1f7", name: "Sick Leave", category: "sick" },
      { id: "4918b7a1-5645-4f9d-9afa-76272ad69809", name: "Family Responsibility Leave", category: "family_responsibility" },
      { id: "93582eed-fec0-47ea-80d1-db20b2ef50fc", name: "Study Leave", category: "other" },
      { id: "1ba91471-12c6-413f-a116-f865730fc467", name: "Time Off In Lieu (TOIL)", category: "toil_taken" },
      { id: "333a6417-7b27-4f70-9a4a-71444bc1de8f", name: "Maternity Leave", category: "maternity" },
      { id: "c111dabc-62c7-4052-9ed9-7dff38471d69", name: "Parental Leave", category: "family_responsibility" },
      { id: "9ea16c6d-0267-45cd-a39b-7c7f497eab00", name: "Unpaid Leave", category: "unpaid" },
    ] as unknown as LeaveType[];
  }, [leaveTypes]);

  const [editedLeave, setEditedLeave] = useState<{
    leaveTypeId: string;
    hours: number;
    notes: string;
  }>({
    leaveTypeId: "",
    hours: 8,
    notes: "",
  });

  const activeColleagues = useMemo(() => {
    if (!canViewLiveWorkforce || !liveOverview?.entries) return [];
    return liveOverview.entries.filter(
      (c) => c.status === "working" || c.status === "on_lunch",
    );
  }, [liveOverview, canViewLiveWorkforce]);

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
  const [dayRosterDate, setDayRosterDate] = useState<string | null>(null);
  const [dayRosterFilter, setDayRosterFilter] = useState<"all" | "in" | "completed" | "leave" | "exception">("all");
  const [dayRosterSearch, setDayRosterSearch] = useState("");
  const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>("month");

  useEffect(() => {
    if (window.innerWidth < 640) setCalendarWindow("day");
    else if (window.innerWidth < 768) setCalendarWindow("week");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dayRosterDate) setDayRosterDate(null);
        if (isReviewModalOpen) setIsReviewModalOpen(false);
        if (showDateActions) setShowDateActions(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dayRosterDate, isReviewModalOpen, showDateActions]);

  const [showLegend, setShowLegend] = useState(false);

  const [calendarFocusDate, setCalendarFocusDate] = useState(() => {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
  });
  const workstationAddressMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ws of workstations ?? []) {
      if (ws.address) {
        map.set(ws.id, ws.address);
        map.set(ws.name.toLowerCase().trim(), ws.address);
      }
    }
    return map;
  }, [workstations]);

  const resolveMapAddress = (entry?: Partial<CompanyTimesheetCalendarEntry> | null, isLeave?: boolean) => {
    if (isLeave) return "On Leave (Off Premises)";
    if (!entry) return "Location not recorded";
    if (entry.workstation_id && workstationAddressMap.has(entry.workstation_id)) {
      return workstationAddressMap.get(entry.workstation_id)!;
    }
    if (entry.workstationName && workstationAddressMap.has(entry.workstationName.toLowerCase().trim())) {
      return workstationAddressMap.get(entry.workstationName.toLowerCase().trim())!;
    }
    if (entry.workstationName) {
      return entry.workstationName;
    }
    return "Standard Workstation";
  };

  const [richTooltip, setRichTooltip] = useState<{
    name: string;
    status: string;
    timeRange?: string;
    paidHours?: string;
    mapAddress: string;
    notes?: string;
    x: number;
    y: number;
  } | null>(null);

  const clampTooltip = (rect: DOMRect) => {
    const cardWidth = 260;
    const cardHeight = 110;
    const padding = 12;
    let x = rect.left + rect.width / 2 - cardWidth / 2;
    if (typeof window !== "undefined") {
      x = Math.max(padding, Math.min(x, window.innerWidth - cardWidth - padding));
    }
    let y = rect.bottom + 8;
    if (typeof window !== "undefined" && y + cardHeight > window.innerHeight - padding) {
      y = rect.top - cardHeight - 8;
    }
    return { x, y: Math.max(padding, y) };
  };

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
      if (lr.status !== "approved" && lr.status !== "submitted") continue;
      const isPending = lr.status === "submitted";
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
            status: isPending ? "submitted" : "approved",
            notes: isPending ? `Leave (Pending): ${lr.leaveTypeName}` : `Leave: ${lr.leaveTypeName}`,
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

  const dayRosterItems = useMemo(() => {
    if (!dayRosterDate) return [];
    const dateEntries = entries.filter((e) => e.work_date === dayRosterDate && !holidayDates.has(e.work_date) && !e.notes?.startsWith("Public holiday:"));
    const existingEmployeeIds = new Set(dateEntries.map((e) => e.employee_id));

    const rosterLeave: CompanyTimesheetCalendarEntry[] = [];
    for (const lr of leaveRequests ?? []) {
      if (lr.status !== "approved" && lr.status !== "submitted") continue;
      if (dayRosterDate >= lr.start_date && dayRosterDate <= lr.end_date) {
        if (!existingEmployeeIds.has(lr.employee_id) && !holidayDates.has(dayRosterDate)) {
          rosterLeave.push({
            id: `roster-leave-${lr.id}-${dayRosterDate}`,
            company_id: "",
            employee_id: lr.employee_id,
            work_date: dayRosterDate,
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
            status: lr.status === "submitted" ? "submitted" : "approved",
            notes: lr.status === "submitted" ? `Leave (Pending): ${lr.leaveTypeName}` : `Leave: ${lr.leaveTypeName}`,
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

    return [...dateEntries, ...rosterLeave];
  }, [dayRosterDate, entries, leaveRequests, holidayDates]);

  const filteredDayRoster = useMemo(() => {
    let list = dayRosterItems;

    if (dayRosterFilter === "in") {
      list = list.filter((e) => e.clock_in && !e.clock_out && !isLeaveEntry(e));
    } else if (dayRosterFilter === "completed") {
      list = list.filter((e) => e.clock_in && e.clock_out && !isLeaveEntry(e));
    } else if (dayRosterFilter === "leave") {
      list = list.filter((e) => isLeaveEntry(e));
    } else if (dayRosterFilter === "exception") {
      list = list.filter((e) => e.missing_clocking || e.late_arrival || e.early_departure || e.status === "draft" || (!e.clock_in && !isLeaveEntry(e)));
    }

    if (dayRosterSearch.trim()) {
      const q = dayRosterSearch.toLowerCase().trim();
      list = list.filter((e) =>
        displayName(e).toLowerCase().includes(q) ||
        (e.workstationName && e.workstationName.toLowerCase().includes(q)) ||
        (resolveMapAddress(e, isLeaveEntry(e)).toLowerCase().includes(q))
      );
    }

    return list;
  }, [dayRosterItems, dayRosterFilter, dayRosterSearch, resolveMapAddress]);

  const [createState, createAction, createPending] = useActionState(
    createManagedDraftTimeEntry,
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
  const [deleteLeaveState, deleteLeaveAction, deleteLeavePending] = useActionState(
    adminDeleteCalendarLeave,
    initialActionState,
  );
  const [updateLeaveState, updateLeaveAction, updateLeavePending] = useActionState(
    adminUpdateCalendarLeave,
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
        if (lr.status !== "approved" && lr.status !== "submitted") continue;
        const isPending = lr.status === "submitted";
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
              title: isPending
                ? `${lr.employeeName} · ${lr.leaveTypeName || "Leave"} (Pending)`
                : `${lr.employeeName} · On Leave`,
              start: dateStr,
              allDay: true,
              classNames: [
                "cw-company-timesheet-event",
                isPending ? "cw-calendar-leave-pending" : "cw-calendar-leave",
              ],
              extendedProps: {
                isLeave: true,
                isPending,
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
    setEditedLeave({ leaveTypeId: "", hours: 8, notes: "" });
    setSelectedApprovalIds(new Set());
    setIsReviewModalOpen(false);
  };

  const startEditing = () => {
    if (!selectedEntry) return;
    setEditing(true);
    if (isLeaveEntry(selectedEntry)) {
      const currentTypeId =
        selectedEntry.leave_type_id && selectedEntry.leave_type_id !== "leave"
          ? selectedEntry.leave_type_id
          : availableLeaveTypes.find((lt) =>
              selectedEntry.notes?.toLowerCase().includes(lt.name.toLowerCase()),
            )?.id ||
            availableLeaveTypes[0]?.id ||
            "";

      setEditedLeave({
        leaveTypeId: currentTypeId,
        hours: Number(selectedEntry.paid_hours || selectedEntry.normal_hours || 8),
        notes:
          selectedEntry.notes
            ?.replace(/^Approved leave:\s*/i, "")
            ?.replace(/^Leave:\s*/i, "")
            ?.replace(/^Leave \(Pending\):\s*/i, "")
            ?.replace(/^TOIL \/ Leave:\s*/i, "") || "",
      });
    } else {
      setEditedTimes({
        clock_in: selectedEntry.clock_in ?? "",
        lunch_start: selectedEntry.lunch_start ?? "",
        lunch_end: selectedEntry.lunch_end ?? "",
        clock_out: selectedEntry.clock_out ?? "",
        notes: selectedEntry.notes ?? "",
      });
    }
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

  const globalMessage =
    createState.message ||
    updateState.message ||
    deleteState.message ||
    forceDeleteState.message;
  const globalOk = updateState.message
    ? updateState.ok
    : deleteState.message
      ? deleteState.ok
      : forceDeleteState.message
        ? forceDeleteState.ok
        : createState.ok;

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
              Click any date cell to view or create shifts. Click any employee avatar to view details.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:w-[23rem]">
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
                Exceptions
              </div>
              <p className="mt-1 text-lg font-black text-white">{totals.issues}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-4">
        {canViewLiveWorkforce && activeColleagues.length > 0 && (
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
                  const isLeave = Boolean(info.event.extendedProps.isLeave);
                  const entry = info.event.extendedProps.entry as CompanyTimesheetCalendarEntry | undefined;
                  const pos = clampTooltip(rect);

                  if (isLeave) {
                    const employeeName =
                      (info.event.extendedProps.employeeName as string) ||
                      (entry ? displayName(entry) : "Employee");
                    const leaveTypeName =
                      (info.event.extendedProps.leaveTypeName as string) ||
                      entry?.notes?.replace("Leave: ", "") ||
                      "Approved Leave";

                    setRichTooltip({
                      name: employeeName,
                      status: `On Leave · ${leaveTypeName}`,
                      timeRange: "On Leave (All Day)",
                      paidHours: "8.00h paid",
                      mapAddress: "On Leave (Off Premises)",
                      notes: entry?.notes || undefined,
                      x: pos.x,
                      y: pos.y,
                    });
                  } else if (entry) {
                    const timeRange = entry.clock_in || entry.clock_out
                      ? `${formatTime(entry.clock_in)} \u2192 ${formatTime(entry.clock_out)}`
                      : "No clocking recorded";
                    const paidHours = `${formatHours(entry.paid_hours)}${entry.overtime_hours > 0 ? ` + ${formatHours(entry.overtime_hours)} OT` : ""}`;
                    const mapAddress = resolveMapAddress(entry, false);

                    setRichTooltip({
                      name: displayName(entry),
                      status: entry.status,
                      timeRange,
                      paidHours,
                      mapAddress,
                      notes: entry.warning_notes || entry.notes || undefined,
                      x: pos.x,
                      y: pos.y,
                    });
                  } else {
                    setTooltip({ content: info.event.title, x: pos.x, y: pos.y });
                  }
                }}
                eventMouseLeave={() => {
                  setTooltip(null);
                  setRichTooltip(null);
                }}
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
                moreLinkClick={(arg) => {
                  const d = arg.date;
                  const dateStr = [
                    d.getFullYear(),
                    String(d.getMonth() + 1).padStart(2, "0"),
                    String(d.getDate()).padStart(2, "0"),
                  ].join("-");
                  setDayRosterDate(dateStr);
                  return "none";
                }}
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

            {richTooltip ? createPortal(
              <div
                className="pointer-events-none fixed z-[9999] w-64 rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-md p-3 text-xs text-foreground shadow-2xl transition-opacity animate-in fade-in duration-100"
                style={{ left: richTooltip.x, top: richTooltip.y }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-foreground truncate text-xs">{richTooltip.name}</p>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    {richTooltip.status}
                  </span>
                </div>
                {richTooltip.timeRange ? (
                  <p className="mt-1 font-mono text-[11px] font-semibold text-slate-700">
                    {richTooltip.timeRange} {richTooltip.paidHours ? `· ${richTooltip.paidHours}` : ""}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-surface-muted/60 px-2 py-1 text-[11px] text-muted">
                  <MapPin className="size-3 shrink-0 text-primary" />
                  <span className="truncate font-medium">{richTooltip.mapAddress}</span>
                </div>
                {richTooltip.notes ? (
                  <p className="mt-1.5 text-[10px] text-amber-700 italic truncate" title={richTooltip.notes}>
                    {richTooltip.notes}
                  </p>
                ) : null}
              </div>,
              document.body,
            ) : (tooltip ?? dayTooltip) ? createPortal(
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
          selectedEntry && canEdit(selectedEntry.status, isRootSuperAdmin) && !editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="grid size-8 place-items-center rounded border border-border bg-surface text-foreground hover:bg-surface-muted"
              aria-label={isLeaveEntry(selectedEntry) ? "Edit leave record" : selectedEntry.status === "approved" ? "Root Super Admin: Edit approved timesheet" : "Edit timesheet"}
              title={isLeaveEntry(selectedEntry) ? "Edit leave record" : selectedEntry.status === "approved" ? "Root Super Admin: Edit approved timesheet" : "Edit timesheet"}
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

            {editing && selectedEntry.status === "approved" ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800">
                <span className="font-bold">Root Super Admin override:</span> Editing approved timesheet. Normal and overtime hours will recalculate automatically upon saving.
              </div>
            ) : null}

            {!editing && selectedEntry.status === "draft" && !isSysAdmin ? (
              <div className="rounded-lg border border-border bg-surface-muted p-2.5 text-xs font-medium text-muted">
                Draft timesheet — pending employee submission before manager approval.
              </div>
            ) : null}

            {editing ? (
              isLeaveEntry(selectedEntry) ? (
                <div className="rounded-2xl border border-violet-400/40 bg-violet-950/10 dark:bg-violet-950/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-300">
                        <Pencil className="size-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-foreground">Edit Leave Record</h4>
                        <p className="text-xs text-muted">Update category, allocated hours or reason</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                      Admin Override
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted">Leave Type</label>
                    <select
                      value={editedLeave.leaveTypeId}
                      onChange={(e) => setEditedLeave((prev) => ({ ...prev, leaveTypeId: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-violet-500"
                    >
                      <option value="">Select leave type</option>
                      {availableLeaveTypes.map((lt) => (
                        <option key={lt.id} value={lt.id}>{lt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted">Allocated Paid Hours</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Full Day (8h)", val: 8 },
                        { label: "Half Day (4h)", val: 4 },
                        { label: "Custom", val: null },
                      ].map((btn) => {
                        const isSelected = btn.val === null
                          ? (editedLeave.hours !== 8 && editedLeave.hours !== 4)
                          : editedLeave.hours === btn.val;
                        return (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => {
                              if (btn.val !== null) {
                                setEditedLeave((prev) => ({ ...prev, hours: btn.val }));
                              }
                            }}
                            className={`rounded-xl border px-2.5 py-2 text-xs font-black transition-all cursor-pointer ${
                              isSelected
                                ? "border-violet-600 bg-violet-600 text-white shadow-soft"
                                : "border-border bg-surface text-muted hover:border-violet-400"
                            }`}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                    {editedLeave.hours !== 8 && editedLeave.hours !== 4 && (
                      <div className="pt-1">
                        <input
                          type="number"
                          min="0.5"
                          max="24"
                          step="0.5"
                          value={editedLeave.hours}
                          onChange={(e) => setEditedLeave((prev) => ({ ...prev, hours: Number(e.target.value) || 0 }))}
                          className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-mono font-bold text-foreground outline-none focus:border-violet-500"
                          placeholder="Custom hours (e.g. 6.5)"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted">Reason / Notes</label>
                    <input
                      type="text"
                      value={editedLeave.notes}
                      onChange={(e) => setEditedLeave((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="e.g. Approved leave reason"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              ) : (
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
              )
            ) : isLeaveEntry(selectedEntry) ? (
              <div className="rounded-2xl border border-violet-400/30 bg-violet-950/20 dark:bg-violet-950/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-400/30">
                      <Calendar className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-foreground truncate">
                        {selectedEntry.notes?.replace(/^Leave:\s*|^Approved leave:\s*/, "") || "Approved Leave"}
                      </p>
                      <p className="text-xs text-muted">
                        Statutory Leave &middot; Authorized Time Off
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {canEdit(selectedEntry.status, isRootSuperAdmin) && (
                      <button
                        type="button"
                        onClick={startEditing}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-surface px-2.5 py-1 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 shadow-xs cursor-pointer"
                      >
                        <Pencil className="size-3" />
                        <span>Edit</span>
                      </button>
                    )}
                    <span className="rounded-full bg-violet-500/20 border border-violet-400/30 px-2.5 py-0.5 text-xs font-black uppercase text-violet-700 dark:text-violet-300">
                      Approved
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface-muted p-3 text-xs">
                  <span className="font-bold text-muted">Allocated Paid Hours</span>
                  <span className="font-mono font-black text-sm text-foreground">{formatHours(selectedEntry.paid_hours)}</span>
                </div>
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

            {!editing && !isLeaveEntry(selectedEntry) && (
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
                  {selectedEntry.locationEvents.map((event) => {
                    const isOutOfRange = event.geofence_status === "out_of_range";
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded-md text-xs transition-colors ${
                          isOutOfRange ? "bg-rose-50/70" : ""
                        }`}
                      >
                        <span className="shrink-0 capitalize font-bold text-foreground">
                          {event.event_type === "clock_in"
                            ? "Clock In"
                            : event.event_type === "lunch_start"
                            ? "Take Lunch"
                            : event.event_type === "lunch_end"
                            ? "Return from Lunch"
                            : event.event_type === "clock_out"
                            ? "Clock Out"
                            : event.event_type === "app_interaction"
                            ? "App Interaction"
                            : event.event_type.replaceAll("_", " ")}
                        </span>
                        <span className="shrink-0 text-muted font-mono">{formatTime(event.local_event_time)}</span>
                        <span className="min-w-0 break-words leading-tight text-muted">
                          {event.workstationName ?? "No workstation"}
                          {event.distance_meters !== null ? ` · ${Math.round(event.distance_meters)}m` : ""}
                          {isOutOfRange ? " (Location hidden)" : ""}
                        </span>
                        <span
                          className={`ml-auto shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${geofenceClass(event.geofence_status)}`}
                        >
                          {geofenceLabel(event.geofence_status)}
                        </span>
                      </div>
                    );
                  })}
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
                {isBranchManager && currentEmployeeId && selectedEntry.employee_id === currentEmployeeId ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-soft">
                    Branch managers cannot approve their own timesheets.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-soft hover:bg-primary-hover transition-all cursor-pointer"
                  >
                    <ClipboardCheck className="size-3.5 text-white" />
                    <span>Review &amp; Approve ({employeeSubmitted.length})</span>
                  </button>
                )}
              </div>
            ) : null}

            {!editing && isLeaveEntry(selectedEntry) && (isSysAdmin || isRootSuperAdmin) ? (
              <div className="border-t border-border pt-3">
                <form
                  action={deleteLeaveAction}
                  onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                  className="flex items-center justify-between"
                >
                  <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                  <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                  <input type="hidden" name="work_date" value={selectedEntry.work_date} />
                  <button
                    disabled={deleteLeavePending}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft cursor-pointer hover:bg-danger/20"
                  >
                    <Trash2 className="size-3 shrink-0" />
                    {deleteLeavePending ? "Deleting..." : "Delete Leave"}
                  </button>
                  {deleteLeaveState.message ? (
                    <span className={`text-[11px] ${deleteLeaveState.ok ? "text-success" : "text-danger"}`}>
                      {deleteLeaveState.message}
                    </span>
                  ) : null}
                </form>
              </div>
            ) : null}

            {!editing && !isLeaveEntry(selectedEntry) ? (
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

            {editing && canEdit(selectedEntry.status, isRootSuperAdmin) ? (
              isLeaveEntry(selectedEntry) ? (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-background p-2.5 shadow-soft">
                  <form
                    action={deleteLeaveAction}
                    onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                  >
                    <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                    <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                    <input type="hidden" name="work_date" value={selectedEntry.work_date} />
                    <button
                      disabled={deleteLeavePending}
                      className="inline-flex min-h-10 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft cursor-pointer hover:bg-danger/20"
                    >
                      <Trash2 className="size-3 shrink-0" />
                      {deleteLeavePending ? "..." : "Delete Leave"}
                    </button>
                  </form>
                  <form
                    action={updateLeaveAction}
                    onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                    <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                    <input type="hidden" name="work_date" value={selectedEntry.work_date} />
                    <input type="hidden" name="leave_type_id" value={editedLeave.leaveTypeId} />
                    <input type="hidden" name="hours" value={editedLeave.hours} />
                    <input type="hidden" name="notes" value={editedLeave.notes} />
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setEditedLeave({ leaveTypeId: "", hours: 8, notes: "" }); }}
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={updateLeavePending}
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft hover:bg-violet-700 cursor-pointer"
                    >
                      {updateLeavePending ? "Saving..." : "Save Leave"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-background p-2.5 shadow-soft">
                  <form
                    action={selectedEntry.status === "approved" || isRootSuperAdmin ? forceDeleteAction : deleteAction}
                    onSubmit={() => { setTimeout(closeEntryModal, 100); }}
                  >
                    <input type="hidden" name="time_entry_id" value={selectedEntry.id} />
                    <input type="hidden" name="employee_id" value={selectedEntry.employee_id} />
                    <button
                      disabled={(isRootSuperAdmin || selectedEntry.status === "approved") ? forceDeletePending : deletePending}
                      className="inline-flex min-h-10 items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px] shadow-soft"
                    >
                      <Trash2 className="size-3 shrink-0" />
                      {((isRootSuperAdmin || selectedEntry.status === "approved") ? forceDeletePending : deletePending) ? "..." : "Delete"}
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
              )
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

                {isBranchManager && currentEmployeeId && selectedEntry.employee_id === currentEmployeeId ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-soft">
                    Branch managers cannot approve or reject their own timesheets. Another manager or administrator must review this record.
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
                  disabled={approvalPending || selectedApprovalIds.size === 0 || (isBranchManager && currentEmployeeId === selectedEntry.employee_id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer shadow-soft"
                >
                  <XCircle className="size-4 shrink-0" />
                  {approvalPending ? "Working..." : "Reject Selected"}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  disabled={approvalPending || selectedApprovalIds.size === 0 || (isBranchManager && currentEmployeeId === selectedEntry.employee_id)}
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

      {dayRosterDate && createPortal(
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDayRosterDate(null);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-3xl border border-border/80 bg-surface shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-surface px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary shadow-soft">
                  <CalendarDays className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-foreground truncate">
                    {formatDate(dayRosterDate)}
                  </h3>
                  <p className="text-xs text-muted truncate mt-0.5">
                    Daily Workforce Roster · {dayRosterItems.length} total recorded
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDayRosterDate(null)}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-muted hover:text-foreground hover:bg-surface-muted/80 transition-colors cursor-pointer shadow-soft"
                aria-label="Close roster"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="shrink-0 border-b border-border/60 bg-surface-muted/30 px-5 py-3 space-y-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDayRosterFilter("all")}
                  className={`rounded-full px-3 py-1 transition-all ${dayRosterFilter === "all" ? "bg-primary text-white shadow-soft" : "bg-surface border border-border text-foreground hover:bg-surface-muted"}`}
                >
                  All ({dayRosterItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDayRosterFilter("in")}
                  className={`rounded-full px-3 py-1 transition-all flex items-center gap-1.5 ${dayRosterFilter === "in" ? "bg-emerald-600 text-white shadow-soft" : "bg-surface border border-border text-foreground hover:bg-surface-muted"}`}
                >
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  Working Now ({dayRosterItems.filter((e) => e.clock_in && !e.clock_out && !isLeaveEntry(e)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDayRosterFilter("completed")}
                  className={`rounded-full px-3 py-1 transition-all ${dayRosterFilter === "completed" ? "bg-slate-800 text-white shadow-soft" : "bg-surface border border-border text-foreground hover:bg-surface-muted"}`}
                >
                  Completed ({dayRosterItems.filter((e) => e.clock_in && e.clock_out && !isLeaveEntry(e)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDayRosterFilter("leave")}
                  className={`rounded-full px-3 py-1 transition-all ${dayRosterFilter === "leave" ? "bg-violet-600 text-white shadow-soft" : "bg-surface border border-border text-foreground hover:bg-surface-muted"}`}
                >
                  On Leave ({dayRosterItems.filter((e) => isLeaveEntry(e)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDayRosterFilter("exception")}
                  className={`rounded-full px-3 py-1 transition-all ${dayRosterFilter === "exception" ? "bg-amber-600 text-white shadow-soft" : "bg-surface border border-border text-foreground hover:bg-surface-muted"}`}
                >
                  Exceptions ({dayRosterItems.filter((e) => e.missing_clocking || e.late_arrival || e.early_departure || e.status === "draft" || (!e.clock_in && !isLeaveEntry(e))).length})
                </button>
              </div>

              <input
                type="text"
                value={dayRosterSearch}
                onChange={(e) => setDayRosterSearch(e.target.value)}
                placeholder="Filter roster by employee name or address..."
                className="w-full rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-foreground placeholder:text-muted outline-none focus:border-primary shadow-2xs"
              />
            </div>

            {/* Roster Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              {filteredDayRoster.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted">
                  No employees match the current roster filter for this date.
                </div>
              ) : (
                filteredDayRoster.map((entry) => {
                  const isLeave = isLeaveEntry(entry);
                  const isWorkingNow = Boolean(entry.clock_in && !entry.clock_out && !isLeave);
                  const mapAddress = resolveMapAddress(entry, isLeave);
                  const isSelf = Boolean(isBranchManager && currentEmployeeId && entry.employee_id === currentEmployeeId);

                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background p-3.5 shadow-2xs transition-all hover:border-primary/40 hover:bg-surface-muted/30"
                    >
                      {/* Employee details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <EmployeeAvatar
                            name={displayName(entry)}
                            src={entry.avatarUrl}
                            className="size-10 border border-border/80"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface ${
                              isWorkingNow
                                ? "bg-emerald-500 animate-pulse"
                                : isLeave
                                  ? "bg-violet-500"
                                  : entry.status === "approved"
                                    ? "bg-emerald-600"
                                    : "bg-amber-500"
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground truncate">
                              {displayName(entry)}
                            </p>
                            {isSelf ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                You
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted truncate">
                            <MapPin className="size-3 shrink-0 text-primary" />
                            <span className="truncate font-medium text-slate-700" title={mapAddress}>
                              {mapAddress}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                            {isLeave ? (
                              <span className="font-semibold text-violet-700">
                                {entry.notes || "Approved Leave"} · {formatHours(entry.paid_hours)}
                              </span>
                            ) : (
                              <span className="font-mono">
                                {entry.clock_in || entry.clock_out
                                  ? `${formatTime(entry.clock_in)} \u2192 ${formatTime(entry.clock_out)}`
                                  : "No clocking recorded"}
                                {entry.paid_hours ? ` · ${formatHours(entry.paid_hours)} paid` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Actions / Status */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <RecordStatusBadge status={entry.status} size={32} />
                        <button
                          type="button"
                          onClick={() => {
                            setDayRosterDate(null);
                            setCalendarFocusDate(entry.work_date);
                            setSelectedEntry(entry);
                            setEditing(false);
                            setEditedTimes({});
                          }}
                          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors shadow-2xs"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-border/80 bg-surface px-5 py-3 text-xs text-muted">
              <span>Showing {filteredDayRoster.length} of {dayRosterItems.length} records</span>
              <button
                type="button"
                onClick={() => setDayRosterDate(null)}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors shadow-soft"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
