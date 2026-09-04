"use client";

import type { FormEvent } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, LocateFixed, MapPin } from "lucide-react";
import {
  clockIn,
  clockOut,
  endLunch,
  startLunch,
  switchWorkstation,
} from "@/lib/time-tracking/actions";
import type { TimeEntryRecord } from "@/lib/time-tracking/schema";
import { useRealtimeEvent } from "@/components/realtime/RealtimeSyncProvider";
import LiveLocationTracker from "./LiveLocationTracker";

type TodaySchedule = {
  start_time: string | null;
  end_time: string | null;
  lunch_minutes: number;
  is_working_day: boolean;
};

type EmployeeTimeClockProps = {
  todayEntry: TimeEntryRecord | null;
  variant?: "card" | "compact" | "strip";
  workstations?: { id: string; name: string }[];
  assignedWorkstationId?: string | null;
  todaySchedule?: TodaySchedule | null;
  autoEndLunchOnLapse?: boolean;
  autoClockoutAfterLunch?: boolean;
  defaultLunchMinutes?: number;
  autoClockoutBasedOnSchedule?: boolean;
  autoClockoutGraceMinutes?: number;
};

type ClockActionState = {
  entry?: TimeEntryRecord;
  ok: boolean;
  message: string;
};

const initialState: ClockActionState = {
  ok: true,
  message: "",
};

type ClockAction = {
  action: (formData?: FormData) => Promise<ClockActionState>;
  label: string;
  tone: "primary" | "secondary" | "danger";
};

function nextActions(entry: TimeEntryRecord | null, noLunchToday: boolean): ClockAction[] {
  if (!entry?.clock_in || entry.clock_out) {
    return [{ label: "Clock in", action: clockIn, tone: "primary" }];
  }

  const actions: ClockAction[] = [];

  if (!noLunchToday && !entry.lunch_start) {
    actions.push({ label: "Start lunch", action: startLunch, tone: "secondary" });
  } else if (entry.lunch_start && !entry.lunch_end) {
    actions.push({ label: "End lunch", action: endLunch, tone: "primary" });
  }

  actions.push({ label: "Clock out", action: clockOut, tone: "danger" });

  return actions;
}

function toneButtonClass(tone: ClockAction["tone"]) {
  if (tone === "danger") return "bg-danger text-white";
  if (tone === "secondary") return "border border-border bg-surface text-foreground";
  return "bg-primary text-primary-foreground";
}

function formatTime(value: string | null | undefined) {
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

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

function currentStatus(entry: TimeEntryRecord | null) {
  if (!entry?.clock_in) return "Not clocked in";
  if (entry.clock_out) return "Shift complete";
  if (entry.lunch_start && !entry.lunch_end) return "On lunch";
  return "Working";
}

function localTimeValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function localTimeInputValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function optimisticEntry(
  entry: TimeEntryRecord | null,
  eventLabel: string,
  workstationId: string,
  requestedAt?: string | null,
): TimeEntryRecord {
  const fresh: TimeEntryRecord = {
    workstation_id: workstationId || null,
    clock_in: null,
    clock_out: null,
    company_id: entry?.company_id ?? "",
    early_departure: false,
    employee_id: entry?.employee_id ?? "",
    gross_hours: 0,
    id: "optimistic",
    late_arrival: false,
    leave_type_id: null,
    lunch_end: null,
    lunch_hours: 0,
    lunch_start: null,
    missing_clocking: false,
    normal_hours: 0,
    notes: null,
    overtime_hours: 0,
    paid_hours: 0,
    status: "draft",
    warning_notes: null,
    work_date: localDateValue(),
  };

  const isNewShift = eventLabel === "Clock in" && (entry === null || Boolean(entry.clock_out));
  const current = isNewShift ? fresh : { ...(entry ?? fresh) };
  const next: TimeEntryRecord = {
    ...current,
    workstation_id: workstationId || current.workstation_id,
  };
  const time = eventLabel === "Clock in" && requestedAt ? requestedAt : localTimeValue();

  if (eventLabel === "Clock in") next.clock_in = time;
  if (eventLabel === "Start lunch") next.lunch_start = time;
  if (eventLabel === "End lunch") next.lunch_end = time;
  if (eventLabel === "Clock out") next.clock_out = time;
  if (eventLabel === "Switch workstation") next.workstation_id = workstationId || null;

  return next;
}

export default function EmployeeTimeClock({
  todayEntry,
  variant = "card",
  workstations = [],
  assignedWorkstationId = null,
  todaySchedule = null,
  autoEndLunchOnLapse = false,
  autoClockoutAfterLunch = false,
  defaultLunchMinutes = 60,
  autoClockoutBasedOnSchedule = false,
  autoClockoutGraceMinutes = 0,
}: EmployeeTimeClockProps) {
  const isAutoEndLunchActive = autoEndLunchOnLapse || autoClockoutAfterLunch;
  const [optimistic, setOptimistic] = useState<TimeEntryRecord | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationDetails, setLocationDetails] = useState<{
    accuracy: number;
    capturedAt: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [workstationId, setWorkstationId] = useState(() => {
    if (assignedWorkstationId) return assignedWorkstationId;
    return workstations[0]?.id ?? "";
  });
  const formRef = useRef<HTMLFormElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const accuracyRef = useRef<HTMLInputElement>(null);
  const capturedAtRef = useRef<HTMLInputElement>(null);
  const locationReadyRef = useRef(false);
  const hasLoadedInitialLocationRef = useRef(false);
  const switchPendingRef = useRef(false);
  const pendingActionRef = useRef<string | null>(null);
  const noLunchToday = Boolean(todaySchedule && todaySchedule.lunch_minutes <= 0);

  const [liveTodayEntry, setLiveTodayEntry] = useState<TimeEntryRecord | null>(todayEntry);
  const isInitialMount = useRef(true);

  const allottedLunchMinutes =
    todaySchedule?.lunch_minutes && todaySchedule.lunch_minutes > 0
      ? todaySchedule.lunch_minutes
      : defaultLunchMinutes > 0
        ? defaultLunchMinutes
        : 60;

  const [lunchRemainingSeconds, setLunchRemainingSeconds] = useState<number | null>(null);
  const autoLunchEndTriggeredRef = useRef(false);

  const [shiftRemainingSeconds, setShiftRemainingSeconds] = useState<number | null>(null);
  const autoShiftEndTriggeredRef = useRef(false);

  useEffect(() => {
    const entry = liveTodayEntry ?? todayEntry;
    if (!entry?.lunch_start || entry.lunch_end || entry.clock_out) {
      setLunchRemainingSeconds(null);
      autoLunchEndTriggeredRef.current = false;
      return;
    }

    const [h = "0", m = "0", s = "0"] = entry.lunch_start.split(":");
    const now = new Date();
    const startSec = Number(h) * 3600 + Number(m) * 60 + Number(s);
    const currSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const totalAllottedSec = allottedLunchMinutes * 60;
    const remaining = totalAllottedSec - (currSec - startSec);

    setLunchRemainingSeconds(Math.max(0, remaining));

    const interval = setInterval(() => {
      const currentNow = new Date();
      const currentCurrSec =
        currentNow.getHours() * 3600 + currentNow.getMinutes() * 60 + currentNow.getSeconds();
      const currentRemaining = totalAllottedSec - (currentCurrSec - startSec);
      setLunchRemainingSeconds(Math.max(0, currentRemaining));

      if (isAutoEndLunchActive && currentRemaining <= 0 && !autoLunchEndTriggeredRef.current) {
        autoLunchEndTriggeredRef.current = true;
        if (formRef.current) {
          pendingActionRef.current = "End lunch";
          formRef.current.requestSubmit();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [liveTodayEntry, todayEntry, allottedLunchMinutes, isAutoEndLunchActive]);

  useEffect(() => {
    const entry = liveTodayEntry ?? todayEntry;
    if (
      !autoClockoutBasedOnSchedule ||
      !todaySchedule?.end_time ||
      !entry?.clock_in ||
      entry.clock_out
    ) {
      setShiftRemainingSeconds(null);
      autoShiftEndTriggeredRef.current = false;
      return;
    }

    const [h = "0", m = "0", s = "0"] = todaySchedule.end_time.split(":");
    const endSec =
      Number(h) * 3600 +
      Number(m) * 60 +
      Number(s) +
      Math.max(0, autoClockoutGraceMinutes) * 60;

    const checkShiftEnd = () => {
      const now = new Date();
      const currSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const remaining = endSec - currSec;
      setShiftRemainingSeconds(remaining);

      if (remaining <= 0 && !autoShiftEndTriggeredRef.current) {
        autoShiftEndTriggeredRef.current = true;
        if (formRef.current) {
          pendingActionRef.current = "Clock out";
          formRef.current.requestSubmit();
        }
      }
    };

    checkShiftEnd();
    const interval = setInterval(checkShiftEnd, 1000);
    return () => clearInterval(interval);
  }, [liveTodayEntry, todayEntry, todaySchedule, autoClockoutBasedOnSchedule, autoClockoutGraceMinutes]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLiveTodayEntry(todayEntry);
  }, [todayEntry]);

  useRealtimeEvent<TimeEntryRecord>("time_entries", (event) => {
    if (event.new) {
      if (
        (liveTodayEntry && event.new.id === liveTodayEntry.id) ||
        (todayEntry && event.new.id === todayEntry.id) ||
        (event.new.employee_id && (liveTodayEntry?.employee_id === event.new.employee_id || todayEntry?.employee_id === event.new.employee_id))
      ) {
        setLiveTodayEntry((prev) => ({ ...(prev ?? ({} as TimeEntryRecord)), ...event.new }));
        setOptimistic(null);
      }
    }
  });

  const [state, formAction, pending] = useActionState(
    async (previousState: ClockActionState, formData: FormData) => {
      const currentEntry = previousState.entry ?? optimistic ?? liveTodayEntry ?? todayEntry;
      const requestedAt = String(formData.get("requested_at") ?? "").trim() || null;
      const overrideLabel = switchPendingRef.current ? "Switch workstation" : null;
      switchPendingRef.current = false;
      let currentAction: ClockAction | null = null;

      if (overrideLabel) {
        currentAction = { label: overrideLabel, action: switchWorkstation, tone: "secondary" };
      } else {
        const pendingLabel = pendingActionRef.current;
        pendingActionRef.current = null;
        const available = nextActions(currentEntry, noLunchToday);
        currentAction =
          available.find((item) => item.label === pendingLabel) ?? available[0] ?? null;
      }

      if (!currentAction) {
        return { ok: false, message: "Today is already complete." };
      }

      setOptimistic(
        optimisticEntry(currentEntry, currentAction.label, workstationId, requestedAt),
      );
      const result = await currentAction.action(formData);
      setOptimistic(null);

      if (result.entry) {
        setLiveTodayEntry(result.entry);
      }

      return result;
    },
    initialState,
  );
  const displayEntry = state.entry ?? optimistic ?? liveTodayEntry ?? todayEntry;
  const availableActions = nextActions(displayEntry, noLunchToday);
  const canClockIn = availableActions.some((action) => action.label === "Clock in");
  const canSwitch =
    Boolean(displayEntry?.clock_in) && !displayEntry?.clock_out && workstations.length > 0;
  const latestGeofenceStatus = displayEntry?.locationEvents?.at(-1)?.geofence_status ?? null;

  useEffect(() => {
    if (hasLoadedInitialLocationRef.current || typeof navigator === "undefined") {
      return;
    }

    hasLoadedInitialLocationRef.current = true;

    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDetails({
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationMessage("");
      },
      () => {
        setLocationMessage("Allow location access to view your current position before clocking.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      },
    );
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (locationReadyRef.current) {
      locationReadyRef.current = false;
      return;
    }

    event.preventDefault();
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("Location is required for clocking, but this device or browser does not provide location access.");
      return;
    }

    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 12000,
        });
      });

      if (latitudeRef.current) {
        latitudeRef.current.value = String(position.coords.latitude);
      }
      if (longitudeRef.current) {
        longitudeRef.current.value = String(position.coords.longitude);
      }
      if (accuracyRef.current) {
        accuracyRef.current.value = String(position.coords.accuracy);
      }
      if (capturedAtRef.current) {
        capturedAtRef.current.value = new Date(position.timestamp).toISOString();
      }
      setLocationDetails({
        accuracy: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationMessage("Location is required for clocking. Enable location permission and try again.");
      if (latitudeRef.current) latitudeRef.current.value = "";
      if (longitudeRef.current) longitudeRef.current.value = "";
      if (accuracyRef.current) accuracyRef.current.value = "";
      if (capturedAtRef.current) capturedAtRef.current.value = "";
      setLocating(false);
      return;
    } finally {
      setLocating(false);
    }

    locationReadyRef.current = true;
    formRef.current?.requestSubmit();
  };

  const status = currentStatus(displayEntry);
  const timeline = [
    { label: "Clock in", value: displayEntry?.clock_in },
    { label: "Lunch start", value: displayEntry?.lunch_start },
    { label: "Lunch end", value: displayEntry?.lunch_end },
    { label: "Clock out", value: displayEntry?.clock_out },
  ];

  if (variant === "strip") {
    const statusDot =
      status === "Not clocked in" ? "bg-muted" :
      status === "Working" ? "bg-accent" :
      status === "On lunch" ? "bg-warning" :
      status === "Shift complete" ? "bg-success" :
      "bg-muted";

    const isClockedIn = Boolean(displayEntry?.clock_in) && !displayEntry?.clock_out;
    const isOnLunch = Boolean(displayEntry?.lunch_start) && !displayEntry?.lunch_end;
    const hasLunchEnded = Boolean(displayEntry?.lunch_end);
    const isShiftComplete = Boolean(displayEntry?.clock_out);
    const canClockInAction = !displayEntry?.clock_in || isShiftComplete;

    const clockInDisabled = !canClockInAction || pending || locating;
    const isClockInBusy = pendingActionRef.current === "Clock in" && (pending || locating);
    const clockInLabel = isClockInBusy ? (locating ? "Locating..." : "Saving...") : "Clock in";

    const canLunchAction = isClockedIn && !noLunchToday && (!displayEntry?.lunch_start || isOnLunch);
    const lunchActionValue = isOnLunch ? "End lunch" : "Start lunch";
    const lunchDisabled = !canLunchAction || pending || locating;
    const isLunchBusy =
      (pendingActionRef.current === "Start lunch" || pendingActionRef.current === "End lunch") &&
      (pending || locating);
    const lunchDisplayLabel = isLunchBusy
      ? locating
        ? "Locating..."
        : "Saving..."
      : isOnLunch
        ? "End lunch"
        : isClockedIn && !displayEntry?.lunch_start
          ? "Start lunch"
          : hasLunchEnded
            ? "Lunch ended"
            : noLunchToday
              ? "No lunch"
              : "Lunch";

    const canClockOutAction = isClockedIn;
    const clockOutDisabled = !canClockOutAction || pending || locating;
    const isClockOutBusy = pendingActionRef.current === "Clock out" && (pending || locating);
    const clockOutLabel = isClockOutBusy ? (locating ? "Locating..." : "Saving...") : "Clock out";

    return (
      <section className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <div className="flex items-center gap-3">
            <span className={`inline-block size-2.5 shrink-0 rounded-full ${statusDot}`} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{status}</p>
                {status === "On lunch" && lunchRemainingSeconds !== null ? (
                  <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-extrabold text-amber-900">
                    {Math.floor(lunchRemainingSeconds / 60)}m {lunchRemainingSeconds % 60}s left
                    {isAutoEndLunchActive ? " (Auto-ends lunch)" : ""}
                  </span>
                ) : null}
                {displayEntry?.warning_notes?.includes("Auto lunch break ended") ? (
                  <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Auto Lunch Ended (Resumed Shift)
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                {displayEntry?.work_date ?? "No time record started yet"}
              </p>
            </div>
          </div>

          <span className="text-sm font-bold tabular-nums text-foreground sm:hidden">
            {formatHours(displayEntry?.paid_hours)}
          </span>
        </div>

        <span className="hidden text-sm font-bold tabular-nums text-foreground sm:block sm:ml-auto">
          {formatHours(displayEntry?.paid_hours)}
        </span>

        <form
          action={formAction}
          onSubmit={handleSubmit}
          ref={formRef}
          className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
        >
          <input name="latitude" ref={latitudeRef} type="hidden" />
          <input name="longitude" ref={longitudeRef} type="hidden" />
          <input name="accuracy" ref={accuracyRef} type="hidden" />
          <input name="captured_at" ref={capturedAtRef} type="hidden" />
          <input name="workstation_id" type="hidden" value={workstationId} />

          {canClockIn || workstations.length > 0 ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {canClockIn ? (
                <label className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:w-auto sm:px-2 sm:py-1.5">
                  <Clock className="size-3.5 shrink-0 text-muted" />
                  <input
                    name="requested_at"
                    type="time"
                    defaultValue={localTimeInputValue()}
                    className="w-full min-w-0 bg-transparent text-xs font-semibold text-foreground outline-none sm:max-w-[7.5rem]"
                  />
                </label>
              ) : null}
              {workstations.length > 0 ? (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <label className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:flex-initial sm:px-2 sm:py-1.5">
                    <MapPin className="size-3.5 shrink-0 text-muted" />
                    <select
                      value={workstationId}
                      onChange={(event) => setWorkstationId(event.target.value)}
                      disabled={pending || locating}
                      className="w-full min-w-0 cursor-pointer bg-transparent text-xs font-semibold text-foreground outline-none sm:max-w-[9rem] truncate"
                    >
                      {workstations.map((workstation) => (
                        <option key={workstation.id} value={workstation.id}>
                          {workstation.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canSwitch ? (
                    <button
                      type="submit"
                      onClick={() => {
                        switchPendingRef.current = true;
                      }}
                      disabled={pending || locating || !workstationId}
                      className="btn btn-outline shrink-0 px-2.5 py-1.5 text-xs font-medium"
                    >
                      {switchPendingRef.current && pending
                        ? "Saving..."
                        : switchPendingRef.current && locating
                          ? "Locating..."
                          : "Switch"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center">
            <button
              type="submit"
              name="clock_action"
              value="Clock in"
              onClick={() => {
                pendingActionRef.current = "Clock in";
              }}
              disabled={clockInDisabled}
              className={`btn px-2 py-2 text-xs font-semibold whitespace-nowrap justify-center text-center sm:px-4 sm:text-sm ${
                canClockInAction
                  ? "btn-accent shadow-xs"
                  : "border border-border bg-surface-muted text-muted opacity-40 cursor-not-allowed"
              }`}
            >
              {clockInLabel}
            </button>

            <button
              type="submit"
              name="clock_action"
              value={lunchActionValue}
              onClick={() => {
                pendingActionRef.current = lunchActionValue;
              }}
              disabled={lunchDisabled}
              className={`btn px-2 py-2 text-xs font-semibold whitespace-nowrap justify-center text-center sm:px-4 sm:text-sm ${
                isOnLunch
                  ? "btn-accent shadow-xs ring-2 ring-warning/50"
                  : canLunchAction
                    ? "border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 shadow-xs"
                    : "border border-border bg-surface-muted text-muted opacity-40 cursor-not-allowed"
              }`}
            >
              {lunchDisplayLabel}
            </button>

            <button
              type="submit"
              name="clock_action"
              value="Clock out"
              onClick={() => {
                pendingActionRef.current = "Clock out";
              }}
              disabled={clockOutDisabled}
              className={`btn px-2 py-2 text-xs font-semibold whitespace-nowrap justify-center text-center sm:px-4 sm:text-sm ${
                canClockOutAction
                  ? "btn-danger shadow-xs"
                  : "border border-border bg-surface-muted text-muted opacity-40 cursor-not-allowed"
              }`}
            >
              {clockOutLabel}
            </button>
          </div>
        </form>

        {latestGeofenceStatus === "out_of_range" ? (
          <p className="w-full text-xs font-semibold text-danger">
            You are outside your selected workstation radius. This event will be flagged.
          </p>
        ) : null}

        {locationMessage ? (
          <p className="text-xs text-danger">{locationMessage}</p>
        ) : null}

        {state.message ? (
          <p className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-primary text-primary-foreground grid gap-3 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
            Today&apos;s shift
          </p>
          <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">{status}</h2>
          <p className="mt-1 text-xs opacity-80">
            {displayEntry?.work_date ?? "No time record started yet"}
          </p>
        </div>
        {availableActions.length > 0 || canSwitch ? (
          <form
            action={formAction}
            onSubmit={handleSubmit}
            ref={formRef}
            className="grid w-full gap-2 sm:w-auto"
          >
            <input name="latitude" ref={latitudeRef} type="hidden" />
            <input name="longitude" ref={longitudeRef} type="hidden" />
            <input name="accuracy" ref={accuracyRef} type="hidden" />
            <input name="captured_at" ref={capturedAtRef} type="hidden" />
            <input name="workstation_id" type="hidden" value={workstationId} />
            {canClockIn ? (
              <label className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2">
                <Clock className="size-4 shrink-0 opacity-80" />
                <input
                  name="requested_at"
                  type="time"
                  defaultValue={localTimeInputValue()}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold text-primary-foreground outline-none"
                />
              </label>
            ) : null}
            {workstations.length > 0 ? (
              <label className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2">
                <MapPin className="size-4 shrink-0 opacity-80" />
                <select
                  value={workstationId}
                  onChange={(event) => setWorkstationId(event.target.value)}
                  disabled={pending || locating}
                  className="h-9 min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-semibold text-primary-foreground outline-none"
                >
                  {workstations.map((workstation) => (
                    <option key={workstation.id} value={workstation.id}>
                      {workstation.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {canSwitch ? (
                <button
                  type="submit"
                  onClick={() => {
                    switchPendingRef.current = true;
                  }}
                  disabled={pending || locating || !workstationId}
                  className="rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {pending ? "Saving..." : locating ? "Locating..." : "Switch workstation"}
                </button>
              ) : null}
              {availableActions.map((action) => (
                <button
                  key={action.label}
                  type="submit"
                  name="clock_action"
                  value={action.label}
                  onClick={() => {
                    pendingActionRef.current = action.label;
                  }}
                  disabled={pending || locating}
                  className={`w-full rounded-md px-4 py-2 text-sm font-semibold shadow-lg disabled:opacity-60 sm:w-auto ${toneButtonClass(action.tone)}`}
                >
                  {pending ? "Saving..." : locating ? "Locating..." : action.label}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <span className="rounded-full bg-success/10 px-3 py-1 text-sm font-semibold text-success">
            Complete
          </span>
        )}
      </div>

      <div className="p-4">
        {state.message && (
          <div
            className={`mb-4 rounded-md border px-3 py-2 text-sm font-medium ${
              state.ok
                ? "border-accent/30 bg-accent/10 text-foreground"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {state.message}
          </div>
        )}

        {locationMessage ? (
          <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            {locationMessage}
          </div>
        ) : null}

        {latestGeofenceStatus === "out_of_range" ? (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            You are outside your selected workstation radius. This event will be flagged for
            review.
          </div>
        ) : null}

        {isAutoEndLunchActive && displayEntry?.lunch_start && !displayEntry?.lunch_end && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
            <div className="flex items-center gap-2 font-medium">
              <Clock className="size-4 shrink-0 text-warning" />
              <span>Lunch Break ({allottedLunchMinutes}m allotted):</span>
            </div>
            {lunchRemainingSeconds !== null && (
              <span className="font-bold whitespace-nowrap">
                {lunchRemainingSeconds > 0
                  ? `Auto resume in ${formatRemainingTime(lunchRemainingSeconds)}`
                  : "Auto resuming..."}
              </span>
            )}
          </div>
        )}

        {autoClockoutBasedOnSchedule && todaySchedule?.end_time && displayEntry?.clock_in && !displayEntry?.clock_out && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs text-foreground">
            <div className="flex items-center gap-2 font-medium">
              <Clock className="size-4 shrink-0 text-accent" />
              <span>
                Work Rule: Scheduled shift ends at <strong>{todaySchedule.end_time.slice(0, 5)}</strong>
                {autoClockoutGraceMinutes > 0 ? ` (+${autoClockoutGraceMinutes}m grace)` : ""}
              </span>
            </div>
            {shiftRemainingSeconds !== null && (
              <span className="font-bold text-accent whitespace-nowrap">
                {shiftRemainingSeconds > 0
                  ? `Auto clock-out in ${formatRemainingTime(shiftRemainingSeconds)}`
                  : "Auto clock-out pending..."}
              </span>
            )}
          </div>
        )}

        <div className="mb-4">
          <LiveLocationTracker
            timeEntryId={displayEntry?.id ?? null}
            isClockedIn={Boolean(displayEntry?.clock_in && !displayEntry?.clock_out)}
            isOnLunch={Boolean(displayEntry?.lunch_start && !displayEntry?.lunch_end)}
          />
        </div>

        <div className="mb-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <p className="font-semibold text-foreground">Clocking location</p>
          <p className="mt-1 text-xs text-muted">
            Location is required for every clocking event and is used to validate workstation radius.
          </p>
          {workstations.length > 0 ? (
            <p className="mt-2 text-xs font-semibold text-foreground">
              Selected workstation:{" "}
              {workstations.find((workstation) => workstation.id === workstationId)?.name ??
                "Default"}
            </p>
          ) : null}
          {locationDetails ? (
            <p className="mt-2 text-xs font-semibold text-foreground">
              {locationDetails.latitude.toFixed(6)}, {locationDetails.longitude.toFixed(6)}
              {" · "}±{Math.round(locationDetails.accuracy)}m
            </p>
          ) : (
            <p className="mt-2 text-xs font-semibold text-warning">
              Location will be requested when you clock.
            </p>
          )}
        </div>

        {displayEntry?.locationEvents?.length ? (
          <div className="mb-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <MapPin className="size-4 text-accent" />
              Recorded locations
            </p>
            <div className="mt-2 grid gap-2">
              {displayEntry.locationEvents.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs sm:grid-cols-[120px_1fr_auto] sm:items-center"
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

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Paid time
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatHours(displayEntry?.paid_hours)}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Lunch
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatHours(displayEntry?.lunch_hours)}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Overtime
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatHours(displayEntry?.overtime_hours)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          {timeline.map((item, index) => {
            const complete = Boolean(item.value);

            return (
              <div
                key={item.label}
                className={`rounded-md border p-3 shadow-sm ${
                  complete
                    ? "border-accent/30 bg-accent/10"
                    : "border-border bg-background/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                      complete
                        ? "bg-accent text-white"
                        : "bg-surface-muted text-muted"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      {item.label}
                    </p>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {formatTime(item.value)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(displayEntry?.missing_clocking ||
          displayEntry?.late_arrival ||
          displayEntry?.early_departure) && (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            {displayEntry.missing_clocking && "Missing clocking detected. "}
            {displayEntry.late_arrival && "Late arrival flagged. "}
            {displayEntry.early_departure && "Early departure flagged."}
          </div>
        )}
      </div>
    </div>
  );
}
