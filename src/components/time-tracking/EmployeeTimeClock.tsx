"use client";

import { useActionState, useState } from "react";
import {
  clockIn,
  clockOut,
  endLunch,
  startLunch,
} from "@/lib/time-tracking/actions";
import type { TimeEntryRecord } from "@/lib/time-tracking/schema";

type EmployeeTimeClockProps = {
  todayEntry: TimeEntryRecord | null;
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

function optimisticEntry(
  entry: TimeEntryRecord | null,
  eventLabel: string,
): TimeEntryRecord {
  const current = entry ?? {
    branch_id: "",
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

export default function EmployeeTimeClock({ todayEntry }: EmployeeTimeClockProps) {
  const [optimistic, setOptimistic] = useState<TimeEntryRecord | null>(null);
  const [state, formAction, pending] = useActionState(
    async (previousState: ClockActionState) => {
      const currentEntry = previousState.entry ?? optimistic ?? todayEntry;
      const currentAction = nextAction(currentEntry);

      if (!currentAction) {
        return { ok: false, message: "Today is already complete." };
      }

      setOptimistic(optimisticEntry(currentEntry, currentAction.label));
      const result = await currentAction.action();
      setOptimistic(null);

      return result;
    },
    initialState,
  );
  const displayEntry = state.entry ?? optimistic ?? todayEntry;
  const actionConfig = nextAction(displayEntry);

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

  return (
    <div className="premium-card overflow-hidden rounded-md">
      <div className="premium-hero grid gap-3 p-4 text-white sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
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
          <form action={formAction}>
            <button
              disabled={pending}
              className={`w-full rounded-md px-4 py-2 text-sm font-semibold shadow-lg disabled:opacity-60 sm:w-auto ${buttonClass}`}
            >
              {pending ? "Saving..." : actionConfig.label}
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

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="premium-panel rounded-md p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Paid time
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatHours(displayEntry?.paid_hours)}
            </p>
          </div>
          <div className="premium-panel rounded-md p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Lunch
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatHours(displayEntry?.lunch_hours)}
            </p>
          </div>
          <div className="premium-panel rounded-md p-3">
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
