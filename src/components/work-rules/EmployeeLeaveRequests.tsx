"use client";

import { Calendar, CalendarPlus, FileText, Link, List, Send, Sparkles, Timer } from "lucide-react";
import { useActionState, useState } from "react";
import {
  calculateLeaveAdvisor,
  convertOvertimeToToil,
  submitLeaveRequest,
} from "@/lib/work-rules/actions";
import type {
  EmployeeLeaveState,
  LeaveAdvisor,
  LeaveBalance,
} from "@/lib/work-rules/schema";

type EmployeeLeaveRequestsProps = {
  state: EmployeeLeaveState;
};

type LeaveRequestActionState = {
  advisor?: LeaveAdvisor;
  ok: boolean;
  message: string;
};

const initialState: LeaveRequestActionState = {
  ok: true,
  message: "",
};

function leaveTypeName(balance: LeaveBalance) {
  const relation = Array.isArray(balance.leave_types)
    ? balance.leave_types[0]
    : balance.leave_types;
  return relation?.name ?? "Leave";
}

function statusClass(status: string) {
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  if (status === "submitted") return "bg-warning/10 text-warning";
  return "bg-surface-muted text-foreground";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

export default function EmployeeLeaveRequests({ state }: EmployeeLeaveRequestsProps) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [reason, setReason] = useState("");
  const [formState, formAction, pending] = useActionState(
    async (previousState: LeaveRequestActionState, formData: FormData) => {
      const result = await submitLeaveRequest(previousState, formData);

      if (result.ok && result.message === "Leave request sent.") {
        setLeaveTypeId("");
        setStartDate("");
        setEndDate("");
        setAttachmentUrl("");
        setReason("");
      }

      return result;
    },
    initialState,
  );
  const [calculationState, calculationAction, calculationPending] = useActionState(
    calculateLeaveAdvisor,
    initialState,
  );
  const [toilState, toilAction, toilPending] = useActionState(convertOvertimeToToil, initialState);
  const calculation = calculationState.advisor;
  const holidayDays =
    calculation?.days.filter((day) => day.reason === "public_holiday") ?? [];
  const visibleMessage = formState.message || calculationState.message;
  const visibleOk = formState.message ? formState.ok : calculationState.ok;

  function formatFullDate(value: string | undefined) {
    if (!value) return "—";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }

  return (
    <section className="card grid min-w-0 grid-cols-1 gap-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarPlus className="size-5 text-accent" />
          Leave
        </h2>
        <p className="mt-1 text-xs text-muted">
          Request leave or check your recent requests.
        </p>
      </div>

      {visibleMessage ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            visibleOk
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {visibleMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr]">
        <div className="min-w-0 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Available balances</p>
          <div className="mt-2 grid gap-2">
            {state.balances.length === 0 ? (
              <p className="text-sm text-muted">No balances assigned yet.</p>
            ) : (
              state.balances.map((balance) => (
                <div key={balance.id} className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-foreground">{leaveTypeName(balance)}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-semibold">
                    {Number(balance.balance_hours).toFixed(2)}h
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <form action={formAction} className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">New request</p>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Leave Type</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <List className="size-4 shrink-0 text-muted" />
              <select
                name="leave_type_id"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Leave type</option>
                {state.leaveTypes.map((leaveType) => (
                  <option key={leaveType.id} value={leaveType.id}>
                    {leaveType.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start Date</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="start_date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">End Date</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="end_date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
          </div>
          {calculation ? (
            <div
              className={`grid gap-2 rounded-md border p-3 text-sm ${
                calculation.exceeds_balance
                  ? "border-danger/30 bg-danger/10"
                  : "border-accent/30 bg-accent/10"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Sparkles className="size-4 text-accent" />
                Leave advisor
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Hours to take</span>
                  <span className="font-semibold text-foreground">
                    {Number(calculation.total_hours).toFixed(2)}h
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Working days</span>
                  <span className="font-semibold text-foreground">
                    {calculation.working_days} day{calculation.working_days === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">As days (approx)</span>
                  <span className="font-semibold text-foreground">
                    {Number(calculation.days_equivalent).toFixed(2)}d
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Leave begins</span>
                  <span className="font-semibold text-foreground">
                    {formatFullDate(startDate || calculation.days[0]?.date)}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Return to work</span>
                  <span className="font-semibold text-foreground">
                    {formatFullDate(calculation.expected_return_date)}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Supporting docs</span>
                  <span
                    className={`font-semibold ${
                      calculation.requires_attachment ? "text-warning" : "text-success"
                    }`}
                  >
                    {calculation.requires_attachment ? "Required" : "Not required"}
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-md bg-surface px-2 py-1 font-semibold text-foreground">
                  Available: {Number(calculation.available_hours).toFixed(2)}h
                </span>
                <span
                  className={`rounded-md bg-surface px-2 py-1 font-semibold ${
                    calculation.exceeds_balance ? "text-danger" : "text-success"
                  }`}
                >
                  Remaining: {Number(calculation.remaining_hours).toFixed(2)}h
                </span>
              </div>
              {calculation.exceeds_balance ? (
                <p className="text-xs font-semibold text-danger">
                  You do not have enough hours for this request.
                </p>
              ) : null}
              {holidayDays.length > 0 ? (
                <div className="rounded-md bg-surface px-2 py-1.5">
                  <p className="text-xs font-semibold text-foreground">
                    Public holidays in this request
                  </p>
                  <ul className="mt-1 grid gap-1 text-xs text-muted">
                    {holidayDays.map((day) => (
                      <li key={day.date}>
                        {formatDate(day.date)} - {day.label ?? "Public holiday"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <span className="font-semibold text-foreground">Hours requested</span>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                0.00h
              </span>
            </div>
          )}
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Attachment Link</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Link className="size-4 shrink-0 text-muted" />
              <input
                name="attachment_url"
                value={attachmentUrl}
                onChange={(event) => setAttachmentUrl(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                placeholder="Attachment link, if needed"
              />
            </span>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Reason</span>
            <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
              <FileText className="size-4 shrink-0 text-muted" />
              <textarea
                name="reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                placeholder="Reason"
              />
            </span>
          </label>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <button
              formAction={calculationAction}
              disabled={calculationPending}
              className="min-w-0 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {calculationPending ? "Preparing..." : "Get advice"}
            </button>
            <button
              disabled={pending || Boolean(calculation?.exceeds_balance)}
              className="min-w-0 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Send className="size-4" />
              {pending ? "Sending..." : "Send request"}
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-2">
        {state.requests.map((request) => (
          <div key={request.id} className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{request.leaveTypeName ?? "Leave"}</p>
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

      <form action={toilAction} className="grid gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Timer className="size-4 text-accent" />
              Convert overtime to TOIL
            </h3>
            <p className="mt-1 text-xs text-muted">
              Accrue the current open payroll period&apos;s overtime as time off in lieu.
            </p>
          </div>
          <button
            disabled={toilPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {toilPending ? "Converting..." : "Convert to TOIL"}
          </button>
        </div>
        {toilState.message ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              toilState.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {toilState.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
