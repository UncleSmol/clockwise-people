"use client";

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
    <section className="grid min-w-0 gap-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Management review</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">
            Leave requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve or reject leave requests from employees you manage.
          </p>
        </div>
        <span className="w-max rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs">
          {requests.length} pending
        </span>
      </div>

      {state.message ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            state.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-xl border border-border/80 bg-surface p-4 text-center text-sm font-medium text-muted shadow-2xs">
          No leave requests need review.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start">
          {requests.map((request) => (
            <article
              key={request.id}
              className="grid min-w-0 gap-3 rounded-xl border border-border/80 bg-surface p-4 shadow-2xs"
            >
              {/* Top Bar: Avatar, Name & Type Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <EmployeeAvatar
                    name={request.knownAs ?? request.fullName ?? "Employee"}
                    src={request.avatarUrl}
                    className="size-9 shrink-0 ring-1 ring-border shadow-2xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground break-words leading-tight">
                      {request.knownAs ?? request.fullName}
                    </p>
                    <p className="text-xs font-normal text-muted break-words leading-tight mt-0.5">
                      {request.leaveTypeName ?? "Leave"} ·{" "}
                      <span className="font-semibold text-foreground">
                        {request.start_date} to {request.end_date}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-surface-muted/60 px-2 py-0.5 text-xs font-semibold text-foreground shadow-2xs whitespace-nowrap">
                    {Number(request.total_hours).toFixed(2)}h Requested
                  </span>
                  {request.use_toil_first ? (
                    <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                      Load TOIL First
                    </span>
                  ) : null}
                </div>
              </div>

              {/* High-Contrast Request Details Box */}
              {request.reason ? (
                <div className="rounded-lg border border-border bg-surface-muted/40 p-2.5 text-xs">
                  <span className="font-semibold text-muted">Reason: </span>
                  <span className="text-foreground">{request.reason}</span>
                </div>
              ) : null}

              {/* Action Form */}
              <form action={formAction} className="grid gap-3 rounded-lg border border-border/80 bg-surface-muted/20 p-3">
                <input type="hidden" name="leave_request_id" value={request.id} />
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Review note</span>
                  <textarea
                    name="review_notes"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none"
                    placeholder="Optional manager note"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    name="decision"
                    value="reject"
                    disabled={pending}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-60 transition-colors shadow-2xs"
                  >
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-2xs"
                  >
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
