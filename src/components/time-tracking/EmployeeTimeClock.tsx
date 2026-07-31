"use client";

import type { FormEvent } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import {
  clockIn,
  clockOut,
  endLunch,
  startLunch,
} from "@/lib/time-tracking/actions";
import type { TimeEntryRecord } from "@/lib/time-tracking/schema";

type EmployeeTimeClockProps = {
  todayEntry: TimeEntryRecord | null;
  variant?: "card" | "compact" | "strip";
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

function nextAction(entry: TimeEntryRecord | null) {
  if (!entry?.clock_in) {
    return { label: "Clock in", action: clockIn, tone: "primary" };
  }

  if (!entry.lunch_start && !entry.clock_out) {
    return { label: "Start lunch", action: startLunch, tone: "secondary" };
  }

  if (entry.lunch_start && !entry.lunch_end && !entry.clock_out) {
    return { label: "End lunch", action: endLunch, tone: "primary" };
  }

  if (!entry.clock_out) {
    return { label: "Clock out", action: clockOut, tone: "danger" };
  }

  return null;
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

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCoordinate(value: number) {
  return value.toFixed(5);
}

function formatLocationLabel(details: {
  accuracy: number;
  latitude: number;
  longitude: number;
}) {
  return `${formatCoordinate(details.latitude)}, ${formatCoordinate(details.longitude)} (+/-${Math.round(details.accuracy)}m)`;
}

function optimisticEntry(
  entry: TimeEntryRecord | null,
  eventLabel: string,
): TimeEntryRecord {
  const current = entry ?? {
    workstation_id: null,
    clock_in: null,
    clock_out: null,
    company_id: "",
    early_departure: false,
    employee_id: "",
    gross_hours: 0,
    id: "optimistic",
    late_arrival: false,
    lunch_end: null,
    lunch_hours: 0,
    lunch_start: null,
    missing_clocking: true,
    normal_hours: 0,
    notes: null,
    overtime_hours: 0,
    paid_hours: 0,
    status: "draft",
    warning_notes: null,
    work_date: localDateValue(),
  };
  const next = { ...current };
  const time = localTimeValue();

  if (eventLabel === "Clock in") next.clock_in = time;
  if (eventLabel === "Start lunch") next.lunch_start = time;
  if (eventLabel === "End lunch") next.lunch_end = time;
  if (eventLabel === "Clock out") next.clock_out = time;

  return next;
}

export default function EmployeeTimeClock({
  todayEntry,
  variant = "card",
}: EmployeeTimeClockProps) {
  const [optimistic, setOptimistic] = useState<TimeEntryRecord | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationDetails, setLocationDetails] = useState<{
    accuracy: number;
    capturedAt: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const accuracyRef = useRef<HTMLInputElement>(null);
  const capturedAtRef = useRef<HTMLInputElement>(null);
  const locationReadyRef = useRef(false);
  const hasLoadedInitialLocationRef = useRef(false);
  const [state, formAction, pending] = useActionState(
    async (previousState: ClockActionState, formData: FormData) => {
      const currentEntry = previousState.entry ?? optimistic ?? todayEntry;
      const currentAction = nextAction(currentEntry);

      if (!currentAction) {
        return { ok: false, message: "Today is already complete." };
      }

      setOptimistic(optimisticEntry(currentEntry, currentAction.label));
      const result = await currentAction.action(formData);
      setOptimistic(null);

      return result;
    },
    initialState,
  );
  const displayEntry = state.entry ?? optimistic ?? todayEntry;
  const actionConfig = nextAction(displayEntry);

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
  const buttonClass =
    actionConfig?.tone === "danger"
      ? "bg-danger text-white"
      : actionConfig?.tone === "secondary"
        ? "border border-border bg-surface text-foreground"
        : "bg-primary text-primary-foreground";
  const timeline = [
    { label: "Clock in", value: displayEntry?.clock_in },
    { label: "Lunch start", value: displayEntry?.lunch_start },
    { label: "Lunch end", value: displayEntry?.lunch_end },
    { label: "Clock out", value: displayEntry?.clock_out },
  ];
  const locationSummary = locationDetails
    ? `Current location: ${formatLocationLabel(locationDetails)}`
    : locationMessage ||
      (typeof navigator !== "undefined" && !navigator.geolocation
        ? "Location is unavailable on this device."
        : "Checking current location...");

  if (variant === "strip") {
    const statusDot =
      status === "Not clocked in" ? "bg-muted" :
      status === "Working" ? "bg-accent" :
      status === "On lunch" ? "bg-warning" :
      status === "Shift complete" ? "bg-success" :
      "bg-muted";

    return (
      <section className="card flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`inline-block size-2.5 rounded-full ${statusDot}`} />
          <div>
            <p className="text-sm font-semibold text-foreground">{status}</p>
            <p className="text-xs text-muted">
              {displayEntry?.work_date ?? "No time record started yet"}
            </p>
          </div>
        </div>

        <span className="ml-auto text-sm font-bold tabular-nums text-foreground">
          {formatHours(displayEntry?.paid_hours)}
        </span>

        {actionConfig ? (
          <form action={formAction} onSubmit={handleSubmit} ref={formRef}>
            <input name="latitude" ref={latitudeRef} type="hidden" />
            <input name="longitude" ref={longitudeRef} type="hidden" />
            <input name="accuracy" ref={accuracyRef} type="hidden" />
            <input name="captured_at" ref={capturedAtRef} type="hidden" />
            <button
              disabled={pending || locating}
              className={`btn ${actionConfig.tone === "danger" ? "btn-danger" : actionConfig.tone === "secondary" ? "btn-outline" : "btn-accent"}`}
            >
              {pending ? "Saving..." : locating ? "Locating..." : actionConfig.label}
            </button>
          </form>
        ) : (
          <span className="badge badge-success">Complete</span>
        )}

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
        {actionConfig ? (
          <form action={formAction} onSubmit={handleSubmit} ref={formRef}>
            <input name="latitude" ref={latitudeRef} type="hidden" />
            <input name="longitude" ref={longitudeRef} type="hidden" />
            <input name="accuracy" ref={accuracyRef} type="hidden" />
            <input name="captured_at" ref={capturedAtRef} type="hidden" />
            <button
              disabled={pending || locating}
              className={`w-full rounded-md px-4 py-2 text-sm font-semibold shadow-lg disabled:opacity-60 sm:w-auto ${buttonClass}`}
            >
              {pending ? "Saving..." : locating ? "Locating..." : actionConfig.label}
            </button>
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

        <div className="mb-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <p className="font-semibold text-foreground">Clocking location</p>
          <p className="mt-1 text-xs text-muted">
            Location is required for every clocking event and is used to validate workstation radius.
          </p>
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
