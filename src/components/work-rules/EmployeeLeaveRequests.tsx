"use client";

import { CalendarPlus, Send } from "lucide-react";
import { useActionState } from "react";
import { submitLeaveRequest } from "@/lib/work-rules/actions";
import type { EmployeeLeaveState, LeaveBalance } from "@/lib/work-rules/schema";

type EmployeeLeaveRequestsProps = {
  state: EmployeeLeaveState;
};

const initialState = {
  ok: true,
  message: "",
};

function leaveTypeName(balance: LeaveBalance) {
  const relation = Array.isArray(balance.leave_types)
    ? balance.leave_types[0]
    : balance.leave_types;
  return relation?.name ?? "Time off";
}

function statusClass(status: string) {
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  if (status === "submitted") return "bg-warning/10 text-warning";
  return "bg-surface-muted text-foreground";
}

export default function EmployeeLeaveRequests({ state }: EmployeeLeaveRequestsProps) {
  const [formState, formAction, pending] = useActionState(
    submitLeaveRequest,
    initialState,
  );

  return (
    <section className="premium-card grid gap-3 rounded-md p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarPlus className="size-5 text-accent" />
          Time off
        </h2>
        <p className="mt-1 text-xs text-muted">
          Request leave or check your recent requests.
        </p>
      </div>

      {formState.message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            formState.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {formState.message}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Available balances</p>
          <div className="mt-2 grid gap-2">
            {state.balances.length === 0 ? (
              <p className="text-sm text-muted">No balances assigned yet.</p>
            ) : (
              state.balances.map((balance) => (
                <div key={balance.id} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm">
                  <span className="font-semibold text-foreground">{leaveTypeName(balance)}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-semibold">
                    {Number(balance.balance_hours).toFixed(2)}h
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <form action={formAction} className="grid gap-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">New request</p>
          <select name="leave_type_id" className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
            <option value="">Time off type</option>
            {state.leaveTypes.map((leaveType) => (
              <option key={leaveType.id} value={leaveType.id}>
                {leaveType.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input name="start_date" type="date" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
            <input name="end_date" type="date" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
          </div>
          <input name="total_hours" type="number" min="0.25" step="0.25" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" placeholder="Hours requested" />
          <input name="attachment_url" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" placeholder="Attachment link, if needed" />
          <textarea name="reason" rows={2} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Reason" />
          <button
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Send className="size-4" />
            {pending ? "Sending..." : "Send request"}
          </button>
        </form>
      </div>

      <div className="grid gap-2">
        {state.requests.map((request) => (
          <div key={request.id} className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[1fr_auto]">
            <div>
              <p className="font-semibold text-foreground">{request.leaveTypeName ?? "Time off"}</p>
              <p className="mt-1 text-xs text-muted">
                {request.start_date} to {request.end_date} - {Number(request.total_hours).toFixed(2)}h
              </p>
              {request.rejection_reason ? (
                <p className="mt-1 text-xs font-medium text-danger">{request.rejection_reason}</p>
              ) : null}
            </div>
            <span className={`h-max w-max rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(request.status)}`}>
              {request.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
