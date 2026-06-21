"use client";

import { useActionState } from "react";
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

export default function EmployeeTimeClock({ todayEntry }: EmployeeTimeClockProps) {
  const actionConfig = nextAction(todayEntry);
  const [state, formAction, pending] = useActionState(
    async () => {
      if (!actionConfig) {
        return { ok: false, message: "Today is already complete." };
      }

      return actionConfig.action();
    },
    initialState,
  );

  const status = currentStatus(todayEntry);
  const buttonClass =
    actionConfig?.tone === "danger"
      ? "bg-danger text-white"
      : actionConfig?.tone === "secondary"
        ? "border border-border bg-surface text-foreground"
        : "bg-primary text-primary-foreground";
  const timeline = [
    { label: "Clock in", value: todayEntry?.clock_in },
    { label: "Lunch start", value: todayEntry?.lunch_start },
    { label: "Lunch end", value: todayEntry?.lunch_end },
    { label: "Clock out", value: todayEntry?.clock_out },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="grid gap-5 bg-primary p-5 text-primary-foreground sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
            Today&apos;s shift
          </p>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{status}</h2>
          <p className="mt-2 text-sm opacity-80">
            {todayEntry?.work_date ?? "No time record started yet"}
          </p>
        </div>
        {actionConfig ? (
          <form action={formAction}>
            <button
              disabled={pending}
              className={`w-full rounded-md px-5 py-3 text-sm font-semibold shadow-sm disabled:opacity-60 sm:w-auto ${buttonClass}`}
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

      <div className="p-4 sm:p-6">
        {state.message && (
          <div
            className={`mb-5 rounded-md border px-4 py-3 text-sm font-medium ${
              state.ok
                ? "border-accent/30 bg-accent/10 text-foreground"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {state.message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Paid time
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatHours(todayEntry?.paid_hours)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Lunch
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatHours(todayEntry?.lunch_hours)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Overtime
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatHours(todayEntry?.overtime_hours)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {timeline.map((item, index) => {
            const complete = Boolean(item.value);

            return (
              <div
                key={item.label}
                className={`rounded-md border p-4 ${
                  complete
                    ? "border-accent/30 bg-accent/10"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-8 place-items-center rounded-full text-xs font-semibold ${
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
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {formatTime(item.value)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(todayEntry?.missing_clocking ||
          todayEntry?.late_arrival ||
          todayEntry?.early_departure) && (
          <div className="mt-5 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
            {todayEntry.missing_clocking && "Missing clocking detected. "}
            {todayEntry.late_arrival && "Late arrival flagged. "}
            {todayEntry.early_departure && "Early departure flagged."}
          </div>
        )}
      </div>
    </div>
  );
}
