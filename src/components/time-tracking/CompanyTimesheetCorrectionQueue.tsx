"use client";

import {
  ClipboardList,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useActionState } from "react";
import { reviewTimesheetCorrection } from "@/lib/time-tracking/actions";
import type { CompanyTimesheetCorrectionRequest } from "@/lib/time-tracking/schema";

type CompanyTimesheetCorrectionQueueProps = {
  requests: CompanyTimesheetCorrectionRequest[];
};

type ReviewActionState = {
  ok: boolean;
  message: string;
};

const initialState: ReviewActionState = {
  ok: true,
  message: "",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
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

export default function CompanyTimesheetCorrectionQueue({
  requests,
}: CompanyTimesheetCorrectionQueueProps) {
  const [state, formAction, pending] = useActionState(
    reviewTimesheetCorrection,
    initialState,
  );

  return (
    <section className="premium-card grid gap-3 rounded-md p-4">
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="premium-eyebrow">Management review</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <ClipboardList className="size-5 text-accent" />
            Timesheet requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve or reject requests from employees you manage.
          </p>
        </div>
        <span className="w-max rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          {requests.length} pending
        </span>
      </div>

      {state.message && (
        <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
            state.ok
              ? "border-accent/30 bg-accent/10 text-foreground"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No submitted correction requests need review.
        </p>
      ) : (
        <div className="grid gap-2">
          {requests.map((request) => (
            <article
              key={request.id}
              className="grid gap-3 rounded-md border border-border bg-background p-3 shadow-sm"
            >
              <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {request.knownAs ?? request.fullName}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {request.employeeNumber} - {request.branchName ?? "No branch"} -{" "}
                    {formatDate(request.work_date)}
                  </p>
                </div>
                <span className="w-max rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                  Submitted
                </span>
              </div>

              <div className="grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded-md border border-border bg-surface p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Original
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <span>In: {formatTime(request.original_clock_in)}</span>
                    <span>Out: {formatTime(request.original_clock_out)}</span>
                    <span>Lunch start: {formatTime(request.original_lunch_start)}</span>
                    <span>Lunch end: {formatTime(request.original_lunch_end)}</span>
                  </div>
                </div>
                <div className="rounded-md border border-accent/30 bg-accent/10 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Proposed
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-foreground">
                    <span>In: {formatTime(request.proposed_clock_in)}</span>
                    <span>Out: {formatTime(request.proposed_clock_out)}</span>
                    <span>Lunch start: {formatTime(request.proposed_lunch_start)}</span>
                    <span>Lunch end: {formatTime(request.proposed_lunch_end)}</span>
                  </div>
                </div>
              </div>

              <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
                {request.reason}
              </p>

              <form action={formAction} className="grid gap-2">
                <input type="hidden" name="correction_id" value={request.id} />
                <textarea
                  name="review_notes"
                  rows={2}
                  className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                  placeholder="Optional review note"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    name="decision"
                    value="reject"
                    disabled={pending}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60"
                  >
                    <ThumbsDown className="size-4" />
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    <ThumbsUp className="size-4" />
                    Approve
                  </button>
                </div>
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
