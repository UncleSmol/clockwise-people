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
    return { label: "Clock in", action: clockIn };
  }

  if (!entry.lunch_start && !entry.clock_out) {
    return { label: "Start lunch", action: startLunch };
  }

  if (entry.lunch_start && !entry.lunch_end && !entry.clock_out) {
    return { label: "End lunch", action: endLunch };
  }

  if (!entry.clock_out) {
    return { label: "Clock out", action: clockOut };
  }

  return null;
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

  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Today&apos;s time</h2>
          <p className="mt-1 text-sm text-muted">
            Clock events are saved through the backend and linked to your employee record.
          </p>
        </div>
        {actionConfig ? (
          <form action={formAction}>
            <button
              disabled={pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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

      {state.message && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm font-medium ${
            state.ok
              ? "border-accent/30 bg-accent/10 text-foreground"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </div>
      )}

      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Clock in", todayEntry?.clock_in],
          ["Lunch start", todayEntry?.lunch_start],
          ["Lunch end", todayEntry?.lunch_end],
          ["Clock out", todayEntry?.clock_out],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-background p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {label}
            </dt>
            <dd className="mt-2 text-lg font-semibold text-foreground">
              {value ?? "--:--"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
