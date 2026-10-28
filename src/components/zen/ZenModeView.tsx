"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  Clock,
  Coffee,
  CheckCircle2,
  FileCheck,
  Umbrella,
  Send,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  Edit3,
  Plus,
  ChevronRight,
  User,
  Sparkles,
} from "lucide-react";
import { useZenMode, type ZenTab, type ZenState, ZEN_STATE_COLORS } from "./ZenModeContext";
import { useToast } from "@/components/notifications/SlidingToastProvider";
import {
  clockIn,
  clockOut,
  startLunch,
  endLunch,
  submitSelectedTimesheets,
  saveDraftTimeEntry,
  createPastDraftTimeEntry,
} from "@/lib/time-tracking/actions";
import { submitLeaveRequest } from "@/lib/work-rules/actions";
import AnalogTimePicker from "@/components/time-tracking/AnalogTimePicker";
import type {
  CompanyPublicHoliday,
  EmployeeScheduleInfo,
  TimeEntryRecord,
} from "@/lib/time-tracking/schema";
import type { EmployeeLeaveState, LeaveBalance, LeaveRequest } from "@/lib/work-rules/schema";

interface ZenModeViewProps {
  companyName: string;
  logoUrl?: string | null;
  employeeName?: string | null;
  employeeAvatarUrl?: string | null;
  todayEntry: TimeEntryRecord | null;
  recentEntries?: TimeEntryRecord[];
  workSchedule?: EmployeeScheduleInfo | null;
  publicHolidays?: CompanyPublicHoliday[];
  currentWorkDate?: string;
  workstationId?: string | null;
  assignedWorkstationId?: string | null;
  workstations?: { id: string; name: string }[];
  leaveState?: EmployeeLeaveState | null;
  currentDateLabel?: string;
}

interface PastPendingDay {
  date: string;
  formattedDate: string;
  type: "draft" | "rejected" | "missing";
  hours?: number | string | null;
  entry?: TimeEntryRecord;
}

export default function ZenModeView({
  companyName,
  logoUrl,
  employeeName,
  employeeAvatarUrl,
  todayEntry: initialTodayEntry,
  recentEntries = [],
  workSchedule,
  publicHolidays = [],
  currentWorkDate,
  workstationId,
  assignedWorkstationId,
  workstations = [],
  leaveState,
  currentDateLabel,
}: ZenModeViewProps) {
  const { zenTab, setZenTab, setActiveZenState, toggleZenMode } = useZenMode();
  const { showToast } = useToast();
  const [todayEntry, setTodayEntry] = useState<TimeEntryRecord | null>(initialTodayEntry);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [hasMounted, setHasMounted] = useState(false);
  const [actionCustomTime, setActionCustomTime] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Modals state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [activeModalEntry, setActiveModalEntry] = useState<{
    entry?: TimeEntryRecord;
    date: string;
    isNew?: boolean;
  } | null>(null);

  // Sync initial prop updates
  useEffect(() => {
    setTodayEntry(initialTodayEntry);
  }, [initialTodayEntry]);

  // Deep-link from notification clicks when in Zen Mode
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.highlightEntryId) {
        setZenTab("timesheets");
        const found = recentEntries.find((r) => r.id === detail.highlightEntryId);
        if (found && detail.mode === "edit") {
          setActiveModalEntry({ entry: found, date: found.work_date, isNew: false });
        }
      } else if (detail?.tab === "leave" || detail?.highlightLeaveId) {
        setZenTab("leave");
      }
    };
    window.addEventListener("clockwise:notification-nav", onNav);
    return () => window.removeEventListener("clockwise:notification-nav", onNav);
  }, [recentEntries, setZenTab]);

  // Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine Timesheet State
  const timesheetState = useMemo<ZenState>(() => {
    if (!todayEntry?.clock_in) return "not_clocked_in";
    if (todayEntry.clock_in && !todayEntry.clock_out) {
      if (todayEntry.lunch_start && !todayEntry.lunch_end) {
        return "on_lunch";
      }
      return "clocked_in";
    }
    // Shift ended
    if (todayEntry.status === "submitted" || todayEntry.status === "approved") {
      return "submitted";
    }
    return "draft";
  }, [todayEntry]);

  // Update activeZenState in Context
  useEffect(() => {
    if (zenTab === "leave") {
      setActiveZenState("leave");
    } else {
      setActiveZenState(timesheetState);
    }
  }, [zenTab, timesheetState, setActiveZenState]);

  // Color theme config for current state
  const currentStateKey: ZenState = zenTab === "leave" ? "leave" : timesheetState;
  const colorConfig = ZEN_STATE_COLORS[currentStateKey] || ZEN_STATE_COLORS.not_clocked_in;

  // Format greeting based on time of day, employee name, and work state
  const greetingData = useMemo(() => {
    const hours = currentTime.getHours();
    const cleanName = employeeName ? employeeName.split(" ")[0] : "Doc";

    let timeGreeting = "Good morning";
    if (hours >= 12 && hours < 17) {
      timeGreeting = "Good afternoon";
    } else if (hours >= 17) {
      timeGreeting = "Good evening";
    }

    if (zenTab === "leave") {
      const hasPendingLeave = leaveState?.requests?.some(
        (r) => r.status === "submitted" || r.status === "draft",
      );
      return {
        title: `${timeGreeting}, ${cleanName}`,
        subtitle: hasPendingLeave
          ? "You have leave requests currently under review. Balances update automatically."
          : "Your leave balance is up to date. Apply for time off or track past requests.",
      };
    }

    switch (timesheetState) {
      case "not_clocked_in": {
        let subtitle = "A fresh start to your workday. Clock in whenever your shift begins.";
        if (hours >= 12 && hours < 17) {
          subtitle = "Logging your hours for today? Clock in or load a past draft whenever you're ready.";
        } else if (hours >= 17 && hours < 22) {
          subtitle = "Review your timesheets or submit any pending records before tomorrow.";
        } else if (hours >= 22 || hours < 4) {
          subtitle = "Winding down for the day. You can review your records or manage drafts anytime.";
        }
        return {
          title: `${timeGreeting}, ${cleanName}`,
          subtitle,
        };
      }
      case "clocked_in": {
        let subtitle = "Your shift is actively being tracked. Lunch breaks are flexible — take one whenever you need.";
        if (hours >= 18 || hours < 4) {
          subtitle = "Shift still in progress. Remember to clock out or take a break when your work is finished.";
        }
        return {
          title: `${timeGreeting}, ${cleanName}`,
          subtitle,
        };
      }
      case "on_lunch":
        return {
          title: `${timeGreeting}, ${cleanName}`,
          subtitle: "Lunch break in progress. Take all the time you need — return whenever you are ready.",
        };
      case "draft":
        return {
          title: `${timeGreeting}, ${cleanName}`,
          subtitle: "Your shift has ended and is saved as a draft. Review your details and submit when ready.",
        };
      case "submitted":
      default:
        return {
          title: `${timeGreeting}, ${cleanName}`,
          subtitle: "Your timesheet has been submitted and is awaiting manager approval.",
        };
    }
  }, [currentTime, employeeName, timesheetState, zenTab, leaveState]);

  // Live time and date strings
  const formattedLiveTime = useMemo(() => {
    return new Intl.DateTimeFormat("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(currentTime);
  }, [currentTime]);

  const shortLiveDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(currentTime);
  }, [currentTime]);

  // Format individual time strings
  const formatDisplayTime = (timeStr?: string | null) => {
    if (!timeStr) return "";
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    }
    return timeStr;
  };

  // Shift timings summary line (shown when clocked in, on lunch, or clocked out)
  const shiftTimingInfo = useMemo(() => {
    if (!todayEntry) return null;
    const inTime = formatDisplayTime(todayEntry.clock_in);
    const outTime = formatDisplayTime(todayEntry.clock_out);
    const lunchIn = formatDisplayTime(todayEntry.lunch_start);
    const lunchOut = formatDisplayTime(todayEntry.lunch_end);

    if (timesheetState === "clocked_in") {
      if (lunchIn && lunchOut) {
        return `Clocked in at ${inTime} · Lunch: ${lunchIn} – ${lunchOut}`;
      }
      return inTime ? `Clocked in at ${inTime}` : null;
    }

    if (timesheetState === "on_lunch") {
      return lunchIn ? `Lunch started at ${lunchIn}${inTime ? ` · In at ${inTime}` : ""}` : null;
    }

    if (timesheetState === "draft" || timesheetState === "submitted") {
      if (!inTime && !outTime) return null;
      let text = `Shift: ${inTime || "--:--"} – ${outTime || "--:--"}`;
      if (lunchIn && lunchOut) {
        text += ` (Lunch: ${lunchIn} – ${lunchOut})`;
      }
      if (todayEntry.paid_hours) {
        text += ` · ${Number(todayEntry.paid_hours).toFixed(1)} hrs`;
      }
      return text;
    }

    return null;
  }, [todayEntry, timesheetState]);

  // Compute past pending days (ONLY drafts, rejected, and missing days based on work schedule)
  const pastPendingDays = useMemo<PastPendingDay[]>(() => {
    const todayIso = currentWorkDate || new Date().toISOString().slice(0, 10);
    const result: PastPendingDay[] = [];

    // Helper to check if a date is a scheduled working day
    const isWorkingDay = (dateStr: string): boolean => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sun, 1 = Mon ...
      if (workSchedule?.days && workSchedule.days.length > 0) {
        const rule = workSchedule.days.find((r) => r.day_of_week === dayOfWeek);
        if (rule !== undefined) return Boolean(rule.is_working_day);
      }
      return dayOfWeek >= 1 && dayOfWeek <= 5; // default Mon-Fri
    };

    // Helper to check public holidays
    const isHoliday = (dateStr: string): boolean => {
      return publicHolidays.some((h) => h.holiday_date === dateStr);
    };

    // Helper to check approved leave
    const isApprovedLeave = (dateStr: string): boolean => {
      return Boolean(
        leaveState?.requests?.some(
          (r) =>
            r.status === "approved" &&
            r.start_date <= dateStr &&
            r.end_date >= dateStr
        )
      );
    };

    // Check past 14 days
    const now = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const entry = recentEntries.find((e) => e.work_date === dateStr);

      const formattedDate = new Intl.DateTimeFormat("en-ZA", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(d);

      if (entry) {
        if (entry.status === "rejected") {
          result.push({
            date: dateStr,
            formattedDate,
            type: "rejected",
            hours: entry.paid_hours,
            entry,
          });
        } else if (entry.status === "draft" || (!entry.status && entry.clock_out)) {
          result.push({
            date: dateStr,
            formattedDate,
            type: "draft",
            hours: entry.paid_hours,
            entry,
          });
        }
        // Submitted & Approved days are purposefully ignored
      } else {
        // Missing day check
        if (isWorkingDay(dateStr) && !isHoliday(dateStr) && !isApprovedLeave(dateStr)) {
          result.push({
            date: dateStr,
            formattedDate,
            type: "missing",
          });
        }
      }
    }

    return result;
  }, [currentWorkDate, recentEntries, workSchedule, publicHolidays, leaveState]);

  // Max 3 past drafts & missing days for minimal display between content and circle
  const maxThreePending = useMemo(() => {
    return pastPendingDays.slice(0, 3);
  }, [pastPendingDays]);

  // Geolocation helper
  const effectiveWorkstationId =
    workstationId || assignedWorkstationId || workstations[0]?.id || "";

  const getGeoFormData = async (overrideTime?: string): Promise<FormData | null> => {
    const formData = new FormData();
    if (effectiveWorkstationId) {
      formData.set("workstation_id", effectiveWorkstationId);
    }
    const chosenTime = overrideTime || actionCustomTime;
    if (chosenTime) {
      formData.set("requested_at", chosenTime);
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      formData.set("latitude", "-26.2041");
      formData.set("longitude", "28.0473");
      formData.set("accuracy", "20");
      formData.set("captured_at", new Date().toISOString());
      return formData;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          formData.set("latitude", String(pos.coords.latitude));
          formData.set("longitude", String(pos.coords.longitude));
          formData.set("accuracy", String(pos.coords.accuracy));
          formData.set("captured_at", new Date(pos.timestamp).toISOString());
          resolve(formData);
        },
        () => {
          formData.set("latitude", "-26.2041");
          formData.set("longitude", "28.0473");
          formData.set("accuracy", "25");
          formData.set("captured_at", new Date().toISOString());
          resolve(formData);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  };

  // Clock Actions with Sliding Bottom Modal Notifications
  const handleClockIn = async () => {
    startTransition(async () => {
      try {
        const formData = await getGeoFormData();
        const res = await clockIn(formData ?? undefined);
        if (res.ok && res.entry) {
          setTodayEntry(res.entry);
          setActionCustomTime("");
          showToast({ type: "success", message: "Clocked in successfully!" });
        } else {
          showToast({ type: "error", message: res.message || "Failed to clock in" });
        }
      } catch (err: any) {
        showToast({ type: "error", message: err.message || "An error occurred" });
      }
    });
  };

  const handleClockOut = async () => {
    startTransition(async () => {
      try {
        const formData = await getGeoFormData();
        const res = await clockOut(formData ?? undefined);
        if (res.ok && res.entry) {
          setTodayEntry(res.entry);
          setActionCustomTime("");
          showToast({ type: "success", message: "Clocked out successfully!" });
        } else {
          showToast({ type: "error", message: res.message || "Failed to clock out" });
        }
      } catch (err: any) {
        showToast({ type: "error", message: err.message || "An error occurred" });
      }
    });
  };

  const handleStartLunch = async () => {
    if (todayEntry?.lunch_end) {
      showToast({
        type: "error",
        message: "You have already taken your allocated lunch for this shift.",
      });
      return;
    }
    startTransition(async () => {
      try {
        const formData = await getGeoFormData();
        const res = await startLunch(formData ?? undefined);
        if (res.ok && res.entry) {
          setTodayEntry(res.entry);
          setActionCustomTime("");
          showToast({ type: "success", message: "Lunch break started" });
        } else {
          showToast({ type: "error", message: res.message || "Failed to start lunch" });
        }
      } catch (err: any) {
        showToast({ type: "error", message: err.message || "An error occurred" });
      }
    });
  };

  const handleEndLunch = async () => {
    startTransition(async () => {
      try {
        const formData = await getGeoFormData();
        const res = await endLunch(formData ?? undefined);
        if (res.ok && res.entry) {
          setTodayEntry(res.entry);
          setActionCustomTime("");
          showToast({ type: "success", message: "Lunch break ended. Welcome back!" });
        } else {
          showToast({ type: "error", message: res.message || "Failed to end lunch" });
        }
      } catch (err: any) {
        showToast({ type: "error", message: err.message || "An error occurred" });
      }
    });
  };

  const handleSubmitDraft = async (targetId?: string) => {
    const idToSubmit = targetId || todayEntry?.id;
    if (!idToSubmit) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("time_entry_ids", idToSubmit);
        const res = await submitSelectedTimesheets({ ok: true, message: "" }, formData);
        if (res.ok) {
          if (todayEntry?.id === idToSubmit) {
            setTodayEntry((prev) => (prev ? { ...prev, status: "submitted" } : null));
          }
          showToast({ type: "success", message: "Timesheet submitted for approval!" });
        } else {
          showToast({ type: "error", message: res.message || "Failed to submit timesheet" });
        }
      } catch (err: any) {
        showToast({ type: "error", message: err.message || "An error occurred" });
      }
    });
  };

  // Dome primary button details
  const domeButtonConfig = useMemo(() => {
    if (zenTab === "leave") {
      return {
        icon: <Umbrella className="size-8 sm:size-10 lg:size-11 text-white" />,
        label: "Leave",
        sublabel: "View balance / Apply",
        onClick: () => setIsLeaveModalOpen(true),
      };
    }

    switch (timesheetState) {
      case "not_clocked_in":
        return {
          icon: <Clock className="size-8 sm:size-10 lg:size-11 text-white" />,
          label: "Clock In",
          sublabel: "Start your work day",
          onClick: handleClockIn,
        };
      case "clocked_in":
        return {
          icon: <Clock className="size-8 sm:size-10 lg:size-11 text-white" />,
          label: "Clock Out",
          sublabel: "End your work day",
          onClick: handleClockOut,
        };
      case "on_lunch":
        return {
          icon: <Coffee className="size-8 sm:size-10 lg:size-11 text-white" />,
          label: "End Lunch",
          sublabel: "Resume your day",
          onClick: handleEndLunch,
        };
      case "draft":
        return {
          icon: <Send className="size-8 sm:size-10 lg:size-11 text-white" />,
          label: "Submit Timesheet",
          sublabel: "Send for approval",
          onClick: () => handleSubmitDraft(),
        };
      case "submitted":
      default:
        return {
          icon: <CheckCircle2 className="size-8 sm:size-10 lg:size-11 text-white" />,
          label: "Submitted",
          sublabel: "Waiting for approval",
          onClick: () => {},
        };
    }
  }, [zenTab, timesheetState, todayEntry]);

  // Leave balances with fallback & statutory prioritization
  const leaveBalances = useMemo(() => {
    const raw = leaveState?.balances ?? [];
    let list: LeaveBalance[] = raw;
    if (list.length === 0 && leaveState?.leaveTypes && leaveState.leaveTypes.length > 0) {
      list = leaveState.leaveTypes.map((lt) => ({
        id: `fallback-${lt.id}`,
        company_id: "",
        employee_id: "",
        leave_type_id: lt.id,
        balance_hours: 0,
        accrued_hours: 0,
        taken_hours: 0,
        adjusted_hours: 0,
        as_of_date: new Date().toISOString().split("T")[0],
        leave_types: lt,
      } as unknown as LeaveBalance));
    }
    if (list.length === 0) {
      list = [
        {
          id: "def-annual",
          balance_hours: 0,
          leave_types: { id: "def-annual", name: "Annual Leave", category: "annual" },
        },
        {
          id: "def-sick",
          balance_hours: 0,
          leave_types: { id: "def-sick", name: "Sick Leave", category: "sick" },
        },
        {
          id: "def-family",
          balance_hours: 0,
          leave_types: { id: "def-family", name: "Family Leave", category: "family_responsibility" },
        },
      ] as unknown as LeaveBalance[];
    }
    return [...list].sort((a, b) => {
      const relA = Array.isArray(a.leave_types) ? a.leave_types[0] : a.leave_types;
      const relB = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
      const catA = (relA?.category ?? "").toLowerCase();
      const catB = (relB?.category ?? "").toLowerCase();
      const nameA = (relA?.name ?? "").toLowerCase();
      const nameB = (relB?.name ?? "").toLowerCase();
      const score = (cat: string, name: string) => {
        if (cat === "annual" || name.includes("annual")) return 1;
        if (cat === "sick" || name.includes("sick")) return 2;
        if (cat === "family_responsibility" || name.includes("family")) return 3;
        if (cat === "toil_taken" || name.includes("toil")) return 4;
        return 10;
      };
      return score(catA, nameA) - score(catB, nameB);
    });
  }, [leaveState]);

  // Clean brand name display
  const displayBrand = companyName ? `${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}.` : "clockwise.";

  return (
    <div className="fixed inset-0 h-dvh max-h-dvh w-full flex flex-col justify-between select-none transition-colors duration-500 overflow-hidden z-40 bg-transparent">
      {/* ========================================================
          1. FULL-WIDTH TOP HEADER (SPANS ENTIRE SCREEN ON DESKTOP)
          ======================================================== */}
      <header className="w-full px-5 sm:px-10 lg:px-14 py-3 sm:py-3.5 border-b border-white/20 flex items-center justify-between shrink-0">
        {/* Brand Mark */}
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="h-7 sm:h-9 w-auto rounded-md object-contain"
            />
          ) : (
            <span className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900 drop-shadow-xs">
              {displayBrand}
            </span>
          )}
        </div>

        {/* Exit Zen Mode Button & Profile Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 text-right">
          {/* Zen Mode Button in Zen Header (Mobile & Desktop) */}
          <button
            type="button"
            onClick={toggleZenMode}
            title="Exit Zen Mode"
            aria-label="Exit Zen Mode"
            className="relative flex size-8 sm:size-10 items-center justify-center rounded-full text-white font-black text-xs sm:text-sm shadow-md border border-white/60 transition-transform active:scale-95 cursor-pointer shrink-0"
            style={{
              backgroundColor: colorConfig.bgHex,
              boxShadow: `0 0 14px ${colorConfig.glowHex}`,
            }}
          >
            <span className="font-sans font-black select-none">Z</span>
          </button>

          {/* User Profile Avatar */}
          <div className="size-8 sm:size-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs ring-2 ring-white/60 shadow-sm overflow-hidden shrink-0">
            {employeeAvatarUrl ? (
              <img
                src={employeeAvatarUrl}
                alt={employeeName || "User"}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="size-4 text-slate-200" />
            )}
          </div>
        </div>
      </header>

      {/* ========================================================
          2. TAB SWITCHER (TIMESHEETS vs LEAVE)
          ======================================================== */}
      <div className="w-full flex justify-center pt-2 sm:pt-3 pb-1.5 sm:pb-2 shrink-0 px-4">
        <div className="inline-flex p-1 rounded-full bg-white/75 backdrop-blur-md border border-white/80 shadow-xs">
          <button
            type="button"
            onClick={() => setZenTab("timesheets")}
            className={`px-5 sm:px-7 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-black transition-all cursor-pointer ${
              zenTab === "timesheets"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Timesheets
          </button>
          <button
            type="button"
            onClick={() => setZenTab("leave")}
            className={`px-5 sm:px-7 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-black transition-all cursor-pointer ${
              zenTab === "leave"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Leave
          </button>
        </div>
      </div>


      {/* ========================================================
          3. UNIFIED ZEN CONTENT (CLEAN HEADLINE, TIMINGS, PAST DRAFTS)
          ======================================================== */}
      <section
        role="main"
        className="zen-content-viewport w-full max-w-2xl sm:max-w-3xl mx-auto flex-1 min-h-0 flex flex-col justify-between pt-2 sm:pt-4 pb-2 overflow-hidden"
      >
        {/* Top: Headline Greeting & Subtitle with Clean Shift Timings (NO BADGES) */}
        <div className="flex flex-col items-center justify-center text-center space-y-1 sm:space-y-1.5 shrink-0 px-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 leading-tight">
            {greetingData.title}
          </h1>
          <p className="text-xs sm:text-sm lg:text-base text-slate-600 font-semibold max-w-md leading-relaxed">
            {greetingData.subtitle}
          </p>

          {/* Clean Shift Timings Display (Clock In, Lunch, Clock Out) */}
          {shiftTimingInfo ? (
            <p className="text-xs sm:text-sm font-extrabold text-slate-800 tracking-tight flex items-center justify-center gap-1.5 pt-0.5">
              <Clock className="size-3.5 text-slate-500 shrink-0" />
              <span>{shiftTimingInfo}</span>
            </p>
          ) : null}
        </div>

        {/* Middle Space Between Content & Circle: Cards (Timesheets Tab: 2 cards; Leave Tab: 3 cards) */}
        {zenTab === "timesheets" ? (
          <div className="w-full max-w-md mx-auto my-auto py-2 shrink-0 space-y-2">
            {/* The 2 Cards on Timesheet Tab (Styled identically to the 3 boxes on Leave Tab) */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full">
              {/* Card 1: Time Definition & Status */}
              <div className="relative rounded-2xl border border-white/85 bg-white/80 hover:bg-white/95 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all">
                <div className="flex items-center justify-center">
                  <AnalogTimePicker
                    value={actionCustomTime || (hasMounted ? formattedLiveTime : "")}
                    onValueChange={(val) => setActionCustomTime(val)}
                    compact
                    className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight leading-none px-1.5 py-0.5 rounded-lg hover:bg-slate-900/5 transition-colors cursor-pointer"
                    placeholder="--:--"
                  />
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      timesheetState === "clocked_in"
                        ? "bg-emerald-500 animate-pulse"
                        : timesheetState === "on_lunch"
                        ? "bg-amber-500"
                        : timesheetState === "draft" || timesheetState === "submitted"
                        ? "bg-blue-500"
                        : "bg-slate-400"
                    }`}
                  />
                  <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider">
                    {timesheetState === "clocked_in"
                      ? "Working"
                      : timesheetState === "on_lunch"
                      ? "On Lunch"
                      : timesheetState === "draft" || timesheetState === "submitted"
                      ? "Shift Done"
                      : "Ready"}
                  </p>
                </div>
                <span
                  suppressHydrationWarning
                  className="text-[10px] text-slate-500 font-bold mt-0.5"
                >
                  {hasMounted ? shortLiveDate : (currentDateLabel || "")}
                </span>
              </div>

              {/* Card 2: Lunch & Shift Activity Card */}
              {timesheetState === "clocked_in" ? (
                todayEntry?.lunch_end ? (
                  <div className="relative rounded-2xl border border-white/85 bg-white/80 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-700">
                      <Coffee className="size-5 shrink-0 text-emerald-600" />
                      <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                        Done
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider mt-1">
                      Lunch Taken
                    </p>
                    <span className="text-[10px] text-slate-500 font-bold mt-0.5">
                      Full lunch allocated &amp; completed
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartLunch}
                    disabled={isPending}
                    className="relative rounded-2xl border border-white/85 bg-white/80 hover:bg-white/95 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all group active:scale-98 cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-amber-700">
                      <Coffee className="size-5 shrink-0 transition-transform group-hover:scale-110" />
                      <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                        Lunch
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider mt-1">
                      Take Break
                    </p>
                    <span className="text-[10px] text-amber-800 font-bold mt-0.5">
                      Tap to start lunch
                    </span>
                  </button>
                )
              ) : timesheetState === "on_lunch" ? (
                <button
                  type="button"
                  onClick={handleEndLunch}
                  disabled={isPending}
                  className="relative rounded-2xl border border-amber-300/80 bg-amber-50/90 hover:bg-amber-100/90 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all group active:scale-98 cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-1.5 text-amber-700">
                    <Coffee className="size-5 shrink-0 animate-bounce" />
                    <span className="text-xl sm:text-2xl font-black text-amber-950 tracking-tight leading-none">
                      Resume
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs font-black text-amber-800 uppercase tracking-wider mt-1">
                    On Break
                  </p>
                  <span className="text-[10px] text-amber-700 font-bold mt-0.5">
                    Tap to end lunch
                  </span>
                </button>
              ) : timesheetState === "draft" || timesheetState === "submitted" ? (
                <div className="relative rounded-2xl border border-white/85 bg-white/80 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all">
                  <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    {Number(todayEntry?.paid_hours ?? 8).toFixed(1)} hrs
                  </p>
                  <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider mt-1">
                    Shift Worked
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold mt-0.5">
                    {todayEntry?.status === "submitted" ? "Submitted for approval" : "Shift completed"}
                  </span>
                </div>
              ) : (
                <div className="relative rounded-2xl border border-white/85 bg-white/80 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all">
                  <div className="flex items-center justify-center gap-1.5 text-slate-700">
                    <Coffee className="size-4 shrink-0 text-slate-400" />
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                      1.0h
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider mt-1">
                    Lunch Allotted
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold mt-0.5">
                    Standard break
                  </span>
                </div>
              )}
            </div>

            {/* Past Drafts & Missing Days (Max 3) */}
            {maxThreePending.length > 0 ? (
              <div className="w-full pt-1">
                <div className="w-full flex items-center justify-between px-1 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Past Drafts &amp; Missing Days ({maxThreePending.length})
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    Max 3 past
                  </span>
                </div>
                <div className="w-full space-y-1">
                  {maxThreePending.map((item) => (
                    <div
                      key={item.date}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white/90 backdrop-blur-md border border-white/80 shadow-2xs transition-all text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`size-1.5 rounded-full shrink-0 ${
                            item.type === "rejected"
                              ? "bg-rose-500"
                              : item.type === "draft"
                              ? "bg-amber-500"
                              : "bg-slate-400"
                          }`}
                        />
                        <span className="font-extrabold text-slate-800 truncate">
                          {item.formattedDate}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500 capitalize">
                          {item.type === "draft" && item.hours
                            ? `Draft (${Number(item.hours).toFixed(1)}h)`
                            : item.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.type === "draft" && item.entry ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSubmitDraft(item.entry!.id)}
                              disabled={isPending}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Submit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveModalEntry({
                                  entry: item.entry,
                                  date: item.date,
                                  isNew: false,
                                })
                              }
                              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                              title="Edit Draft"
                            >
                              <Edit3 className="size-3" />
                            </button>
                          </>
                        ) : item.type === "rejected" && item.entry ? (
                          <button
                            type="button"
                            onClick={() =>
                              setActiveModalEntry({
                                entry: item.entry,
                                date: item.date,
                                isNew: false,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <Edit3 className="size-3" />
                            <span>Fix</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setActiveModalEntry({
                                date: item.date,
                                isNew: true,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="size-3" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          /* Leave Tab: 3 Accrual Balances Cards */
          <div className="w-full max-w-md mx-auto my-auto py-2 shrink-0">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
              {leaveBalances.slice(0, 3).map((balance) => {
                const typeName = Array.isArray(balance.leave_types)
                  ? balance.leave_types[0]?.name
                  : (balance.leave_types as any)?.name ?? "Leave";
                const totalHours = Number(balance.balance_hours ?? 0);
                const displayDays = (totalHours / 8).toFixed(1);

                return (
                  <div
                    key={balance.id || typeName}
                    className="relative rounded-2xl border border-white/85 bg-white/80 backdrop-blur-xl px-2 py-2 sm:px-3 sm:py-3 text-center shadow-xs flex flex-col items-center justify-center transition-all"
                  >
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                      {displayDays}
                    </p>
                    <p className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-wider mt-1">
                      {typeName}
                    </p>
                    <span className="text-[10px] text-slate-500 font-bold mt-0.5">
                      {totalHours.toFixed(0)} hrs
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================
          4. FULL-BLEED CIRCULAR DOME WITH CENTERED ACTION
          ======================================================== */}
      <div className="relative w-full overflow-hidden flex justify-center items-start mt-auto shrink-0 select-none h-[35dvh] min-h-[220px] max-h-[320px]">
        {/* Upright Circular Dome (Uniform circular arc matching true circle geometry) */}
        <div
          className="relative flex flex-col items-center justify-start cursor-pointer transition-all duration-500 group overflow-hidden w-[122vw] h-[122vw] sm:w-[135vw] sm:h-[135vw] lg:w-[160vw] lg:h-[160vw] rounded-full shrink-0"
          style={{
            backgroundColor: colorConfig.bgHex,
            paddingTop: "clamp(1.75rem, 4vw, 2.75rem)",
          }}
          onClick={domeButtonConfig.onClick}
        >
          {/* Animated Sheen Overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
            <div
              className="zen-wave-slide-1 absolute inset-x-0 h-[45%] rounded-full opacity-70 blur-xl pointer-events-none"
              style={{
                background: `linear-gradient(to top, transparent 0%, rgba(255, 255, 255, 0.08) 25%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0.08) 75%, transparent 100%)`,
              }}
            />
            <div
              className="zen-wave-slide-2 absolute inset-x-0 h-[40%] rounded-full opacity-60 blur-2xl pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 90% 50% at 50% 50%, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.15) 50%, transparent 80%)`,
              }}
            />
            <div
              className="absolute top-0 inset-x-0 h-48 opacity-40 blur-3xl pointer-events-none"
              style={{ backgroundColor: colorConfig.glowHex }}
            />
          </div>

          {/* Central Circular Button & Action Labels */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Central Circular Button */}
            <div className="zen-center-pulse relative size-15 sm:size-18 lg:size-20 rounded-full border-2 border-white/60 bg-white/15 group-hover:bg-white/25 group-hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-xl backdrop-blur-md">
              {isPending ? (
                <Loader2 className="size-7 sm:size-9 text-white animate-spin" />
              ) : (
                domeButtonConfig.icon
              )}
            </div>

            {/* Primary Action Label */}
            <h2 className="relative z-10 text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-1.5 sm:mt-2 tracking-tight drop-shadow-md">
              {domeButtonConfig.label}
            </h2>

            {/* Secondary Sublabel */}
            <p className="relative z-10 text-xs sm:text-sm lg:text-base text-white/95 font-bold mt-0.5 drop-shadow-xs">
              {domeButtonConfig.sublabel}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================
          7. ZEN-STYLED LEAVE APPLICATION MODAL
          ======================================================== */}
      {isLeaveModalOpen ? (
        <ZenLeaveModal
          leaveState={leaveState}
          onClose={() => setIsLeaveModalOpen(false)}
          onSuccess={() => {
            setIsLeaveModalOpen(false);
            showToast({ type: "success", message: "Leave application submitted!" });
          }}
        />
      ) : null}

      {/* ========================================================
          8. ZEN TIMESHEET EDIT / ADD PAST DAY MODAL
          ======================================================== */}
      {activeModalEntry ? (
        <ZenEditOrAddTimesheetModal
          target={activeModalEntry}
          onClose={() => setActiveModalEntry(null)}
          onSuccess={() => {
            setActiveModalEntry(null);
            showToast({ type: "success", message: "Timesheet updated successfully!" });
          }}
        />
      ) : null}
    </div>
  );
}

/* =========================================================================
   Zen-Designed Leave Application Modal
   ========================================================================= */
function ZenLeaveModal({
  leaveState,
  onClose,
  onSuccess,
}: {
  leaveState?: EmployeeLeaveState | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isTimeOff, setIsTimeOff] = useState(false);
  const [timeOffHours, setTimeOffHours] = useState(2.0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [reason, setReason] = useState("");

  const leaveTypes = leaveState?.leaveTypes ?? [];
  const [selectedTypeId, setSelectedTypeId] = useState(leaveTypes[0]?.id ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTypeId) {
      setErrorMsg("Please select a leave category.");
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("leave_type_id", selectedTypeId);
      formData.set("start_date", startDate);
      formData.set("end_date", isTimeOff ? startDate : endDate);
      formData.set("reason", reason);
      if (isTimeOff) {
        formData.set("is_time_off", "true");
        formData.set("time_off_hours", String(timeOffHours));
      }

      const res = await submitLeaveRequest({ ok: true, message: "" }, formData);
      if (res.ok) {
        onSuccess();
      } else {
        setErrorMsg(res.message || "Failed to submit leave request.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-250">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="size-10 sm:size-11 rounded-full bg-purple-100 text-purple-700 grid place-items-center shrink-0">
              <Umbrella className="size-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Apply for Leave</h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500">Fast, streamlined request</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 grid place-items-center transition-colors cursor-pointer"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {errorMsg ? (
          <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-700 flex items-center gap-2">
            <AlertCircle className="size-4.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4.5 text-left">
          {/* Zen Toggle: Full Day vs Time Off */}
          <div className="flex items-center justify-between p-1.5 bg-slate-100 rounded-full">
            <button
              type="button"
              onClick={() => setIsTimeOff(false)}
              className={`flex-1 py-2.5 rounded-full text-xs sm:text-sm font-black transition-all cursor-pointer ${
                !isTimeOff ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Full Day(s)
            </button>
            <button
              type="button"
              onClick={() => setIsTimeOff(true)}
              className={`flex-1 py-2.5 rounded-full text-xs sm:text-sm font-black transition-all cursor-pointer ${
                isTimeOff ? "bg-white text-purple-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Time Off (Hours)
            </button>
          </div>

          {/* Leave Type Selector with Zen Circular Pills */}
          <div>
            <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-2">
              Leave Category
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {leaveTypes.slice(0, 4).map((t) => {
                const isSelected = t.id === selectedTypeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTypeId(t.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-purple-600 bg-purple-50 text-purple-900 shadow-xs ring-1 ring-purple-600"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`size-3 rounded-full shrink-0 ${
                        isSelected ? "bg-purple-600" : "bg-slate-300"
                      }`}
                    />
                    <span className="text-xs sm:text-sm font-extrabold truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
                {isTimeOff ? "Date" : "Start Date"}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs sm:text-sm font-bold rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>

            {!isTimeOff ? (
              <div>
                <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs sm:text-sm font-bold rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:border-purple-600 focus:bg-white"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
                  Hours Requested
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setTimeOffHours((prev) => Math.max(0.5, prev - 0.5))}
                    className="size-8 rounded-lg bg-white border border-slate-200 font-black text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-black text-sm sm:text-base text-purple-900">
                    {timeOffHours.toFixed(1)}h
                  </span>
                  <button
                    type="button"
                    onClick={() => setTimeOffHours((prev) => Math.min(8, prev + 0.5))}
                    className="size-8 rounded-lg bg-white border border-slate-200 font-black text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Reason / Notes
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief note for your manager..."
              className="w-full text-xs sm:text-sm font-medium rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:border-purple-600 focus:bg-white resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-full bg-purple-700 text-white font-black text-sm sm:text-base shadow-md hover:bg-purple-800 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Send className="size-4" />
                <span>Submit Request</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   Zen Timesheet Edit Or Add Past Day Modal
   ========================================================================= */
function ZenEditOrAddTimesheetModal({
  target,
  onClose,
  onSuccess,
}: {
  target: { entry?: TimeEntryRecord; date: string; isNew?: boolean };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { entry, date, isNew } = target;

  const [includeLunch, setIncludeLunch] = useState(() =>
    Boolean(entry?.lunch_start || entry?.lunch_end),
  );
  const [clockInTime, setClockInTime] = useState(
    entry?.clock_in ? entry.clock_in.slice(0, 5) : "08:00",
  );
  const [lunchStartTime, setLunchStartTime] = useState(
    entry?.lunch_start ? entry.lunch_start.slice(0, 5) : "12:00",
  );
  const [lunchEndTime, setLunchEndTime] = useState(
    entry?.lunch_end ? entry.lunch_end.slice(0, 5) : "13:00",
  );
  const [clockOutTime, setClockOutTime] = useState(
    entry?.clock_out ? entry.clock_out.slice(0, 5) : "17:00",
  );
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const isNoLunch = Boolean(clockInTime && clockOutTime && (!includeLunch || !lunchStartTime || !lunchEndTime));
    if (isNoLunch && !notes.trim()) {
      setErrorMsg("Please provide an explanatory note for shifts with no lunch before saving.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      if (clockInTime) formData.set("clock_in", clockInTime);
      formData.set("include_lunch", includeLunch ? "true" : "false");
      if (includeLunch && lunchStartTime) formData.set("lunch_start", lunchStartTime);
      if (includeLunch && lunchEndTime) formData.set("lunch_end", lunchEndTime);
      if (clockOutTime) formData.set("clock_out", clockOutTime);
      if (notes) formData.set("notes", notes);

      if (isNew) {
        formData.set("work_date", date);
        const res = await createPastDraftTimeEntry({ ok: true, message: "" }, formData);
        if (res.ok) {
          onSuccess();
        } else {
          setErrorMsg(res.message || "Failed to create timesheet.");
        }
      } else if (entry) {
        formData.set("time_entry_id", entry.id);
        const res = await saveDraftTimeEntry({ ok: true, message: "" }, formData);
        if (res.ok) {
          onSuccess();
        } else {
          setErrorMsg(res.message || "Failed to save timesheet.");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-white rounded-t-[36px] sm:rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-250">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="size-10 sm:size-11 rounded-full bg-blue-100 text-blue-700 grid place-items-center shrink-0">
              <Edit3 className="size-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {isNew ? "Add Past Day" : "Edit Timesheet"}
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500">{date}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 grid place-items-center transition-colors cursor-pointer"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {errorMsg ? (
          <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-700 flex items-center gap-2">
            <AlertCircle className="size-4.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
                Clock In
              </label>
              <AnalogTimePicker
                value={clockInTime}
                onValueChange={(val) => setClockInTime(val)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs sm:text-sm font-bold text-slate-900 outline-none hover:border-slate-400 focus:border-blue-600 focus:bg-white transition-all shadow-2xs"
                placeholder="--:--"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 mb-1.5">
                Clock Out
              </label>
              <AnalogTimePicker
                value={clockOutTime}
                onValueChange={(val) => setClockOutTime(val)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs sm:text-sm font-bold text-slate-900 outline-none hover:border-slate-400 focus:border-blue-600 focus:bg-white transition-all shadow-2xs"
                placeholder="--:--"
              />
            </div>
          </div>

          {/* Lunch Break Toggle */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLunch}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeLunch(checked);
                    if (checked && !lunchStartTime) {
                      setLunchStartTime("12:00");
                      setLunchEndTime("13:00");
                    }
                  }}
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  Include Lunch Break
                </span>
              </label>
              <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                includeLunch ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"
              }`}>
                {includeLunch ? "Lunch Taken" : "No Lunch"}
              </span>
            </div>

            {includeLunch ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Lunch In
                  </label>
                  <AnalogTimePicker
                    value={lunchStartTime}
                    onValueChange={(val) => setLunchStartTime(val)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-bold text-slate-900 outline-none hover:border-slate-400 focus:border-blue-600 transition-all shadow-2xs"
                    placeholder="--:--"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Lunch Out
                  </label>
                  <AnalogTimePicker
                    value={lunchEndTime}
                    onValueChange={(val) => setLunchEndTime(val)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-bold text-slate-900 outline-none hover:border-slate-400 focus:border-blue-600 transition-all shadow-2xs"
                    placeholder="--:--"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Timesheets can have no lunch break. An explanatory note below is required before submitting.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600">
                Notes
              </label>
              {!includeLunch ? (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Required (No lunch)
                </span>
              ) : null}
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={!includeLunch ? "Explain why no lunch was taken (required)..." : "Shift notes or adjustments..."}
              className={`w-full text-xs sm:text-sm font-medium rounded-xl border p-3 outline-none focus:bg-white resize-none ${
                !includeLunch && !notes.trim()
                  ? "border-amber-300 bg-amber-50/30 focus:border-amber-500"
                  : "border-slate-200 bg-slate-50 focus:border-blue-600"
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-full bg-blue-600 text-white font-black text-sm sm:text-base shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save &amp; Keep Ready</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
