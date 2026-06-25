"use client";

import { ThumbsDown, ThumbsUp, Umbrella } from "lucide-react";
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
    <section className="premium-card grid gap-3 rounded-md p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="premium-eyebrow">Management review</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <Umbrella className="size-5 text-accent" />
            Leave requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve or reject leave requests from employees you manage.
          </p>
        </div>
        <span className="w-max rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
          {requests.length} pending
        </span>
      </div>

      {state.message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            state.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No leave requests need review.
        </p>
      ) : (
        <div className="grid gap-2">
          {requests.map((request) => (
            <article key={request.id} className="grid gap-3 rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <EmployeeAvatar
                  name={request.knownAs ?? request.fullName ?? "Employee"}
                  src={request.avatarUrl}
                  className="size-9"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {request.knownAs ?? request.fullName}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {request.employeeNumber} - {request.leaveTypeName ?? "Leave"} -{" "}
                    {request.start_date} to {request.end_date}
                  </p>
                </div>
              </div>
              <p className="rounded-md bg-surface px-3 py-2 text-foreground">
                {Number(request.total_hours).toFixed(2)} hours requested
                {request.reason ? ` - ${request.reason}` : ""}
              </p>
              <form action={formAction} className="grid gap-2">
                <input type="hidden" name="leave_request_id" value={request.id} />
                <textarea
                  name="review_notes"
                  rows={2}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Optional note"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    name="decision"
                    value="reject"
                    disabled={pending}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-danger/40 bg-surface px-3 py-2 text-sm font-semibold text-danger disabled:opacity-60"
                  >
                    <ThumbsDown className="size-4" />
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
