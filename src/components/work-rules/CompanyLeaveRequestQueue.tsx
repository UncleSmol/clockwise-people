"use client";

import { CheckCircle2, FileText, ThumbsDown, ThumbsUp, Umbrella, XCircle } from "lucide-react";
import { useActionState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import { reviewLeaveRequest } from "@/lib/work-rules/actions";
import type { LeaveRequest } from "@/lib/work-rules/schema";

type CompanyLeaveRequestQueueProps = {
  requests: LeaveRequest[];
};

const initialState = {
  ok: true,
  message: "",
};

export default function CompanyLeaveRequestQueue({
  requests,
}: CompanyLeaveRequestQueueProps) {
  const [state, formAction, pending] = useActionState(
    reviewLeaveRequest,
    initialState,
  );

  return (
    <section className="card grid gap-3.5 p-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Management review</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-foreground">
            <Umbrella className="size-5 text-accent" />
            Leave requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve or reject leave requests from employees you manage.
          </p>
        </div>
        <span className="w-max rounded bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
          {requests.length} pending
        </span>
      </div>

      {state.message ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-4 text-center text-sm font-medium text-muted">
          No leave requests need review.
        </p>
      ) : (
        <div className="grid gap-3">
          {requests.map((request) => (
            <article
              key={request.id}
              className="grid gap-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3.5 shadow-sm transition-all hover:bg-indigo-50/70"
            >
              {/* Top Bar: Avatar, Name & Type Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <EmployeeAvatar
                    name={request.knownAs ?? request.fullName ?? "Employee"}
                    src={request.avatarUrl}
                    className="size-9 ring-1 ring-border shadow-2xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-foreground">
                      {request.knownAs ?? request.fullName}
                    </p>
                    <p className="truncate text-xs font-medium text-muted">
                      {request.leaveTypeName ?? "Leave"} ·{" "}
                      <span className="font-semibold text-foreground">
                        {request.start_date} to {request.end_date}
                      </span>
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white shadow-2xs">
                  {Number(request.total_hours).toFixed(2)}h Requested
                </span>
              </div>

              {/* High-Contrast White Request Details Box */}
              {request.reason ? (
                <div className="rounded-md border border-border bg-white p-2.5 text-xs shadow-2xs">
                  <span className="font-extrabold uppercase tracking-wider text-muted">Reason: </span>
                  <span className="font-semibold text-foreground">{request.reason}</span>
                </div>
              ) : null}

              {/* Action Form */}
              <form action={formAction} className="grid gap-3 rounded-md border border-border/80 bg-white/90 p-3">
                <input type="hidden" name="leave_request_id" value={request.id} />
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Review note</span>
                  <span className="flex items-start gap-2 rounded border border-border bg-background px-2.5 pt-2">
                    <FileText className="size-3.5 shrink-0 text-muted mt-0.5" />
                    <textarea
                      name="review_notes"
                      rows={2}
                      className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none resize-none"
                      placeholder="Optional manager note"
                    />
                  </span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    name="decision"
                    value="reject"
                    disabled={pending}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-rose-400/60 bg-rose-50 px-3 py-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    <ThumbsDown className="size-3.5" />
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60 shadow-xs"
                  >
                    <ThumbsUp className="size-3.5" />
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
