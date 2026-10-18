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
        <span className="w-max rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-foreground shadow-soft">
          {requests.length} pending
        </span>
      </div>

      {state.message ? (
        <div
          className={`rounded-2xl border px-3.5 py-2.5 text-sm font-semibold shadow-soft ${
            state.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/80 bg-surface p-8 text-center text-sm font-medium text-muted shadow-soft">
          No leave requests need review.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-col justify-between gap-3 rounded-2xl bg-amber-700 p-4 text-white shadow-soft ring-1 ring-amber-800/80 min-w-0"
            >
              {/* Top Bar: Avatar, Name & Type Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative shrink-0">
                    <EmployeeAvatar
                      name={request.knownAs ?? request.fullName ?? "Employee"}
                      src={request.avatarUrl}
                      className="size-9 rounded-full border border-amber-300/50 bg-amber-800/90 shadow-soft ring-1 ring-amber-300/50"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-amber-300 ring-2 ring-amber-700" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-white break-words leading-tight">
                      {request.knownAs ?? request.fullName}
                    </p>
                    <p className="text-[11px] font-medium text-white/85 break-words leading-tight mt-0.5">
                      {request.leaveTypeName ?? "Leave"} ·{" "}
                      <span className="font-semibold text-white">
                        {request.start_date} to {request.end_date}
                      </span>
                    </p>
                  </div>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-white/20 whitespace-nowrap">
                  Pending Approval
                </span>
              </div>

              {/* High-Contrast White Metric Boxes */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-2 text-center text-slate-900 shadow-soft min-w-0">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Type</p>
                  <p className="font-extrabold text-slate-900 text-xs break-words leading-tight truncate">{request.leaveTypeName ?? "Leave"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Hours</p>
                  <p className="font-extrabold text-amber-950 text-xs break-words font-mono leading-tight">{Number(request.total_hours).toFixed(2)}h</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Benefit</p>
                  <p className="font-extrabold text-slate-900 text-xs break-words leading-tight">{request.use_toil_first ? "TOIL First" : "Standard"}</p>
                </div>
              </div>

              {/* High-Contrast Request Details Box */}
              {request.reason ? (
                <div className="rounded-xl bg-white p-2.5 text-xs text-slate-900 shadow-soft break-words">
                  <span className="font-extrabold uppercase tracking-wider text-slate-500">Reason: </span>
                  <span className="font-semibold text-slate-900">{request.reason}</span>
                </div>
              ) : null}

              {/* Action Form */}
              <form action={formAction} className="grid gap-2.5 rounded-xl bg-amber-800/60 p-3 border border-amber-600/40 shadow-soft">
                <input type="hidden" name="leave_request_id" value={request.id} />
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">Review note</span>
                  <textarea
                    name="review_notes"
                    rows={2}
                    className="w-full rounded-xl border border-amber-400/40 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-white/40 resize-none shadow-soft"
                    placeholder="Optional manager note"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    name="decision"
                    value="reject"
                    disabled={pending}
                    className="inline-flex min-h-[38px] items-center justify-center rounded-full bg-rose-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-60 transition-colors shadow-soft cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="inline-flex min-h-[38px] items-center justify-center rounded-full bg-emerald-600 px-5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-soft cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              </form>

              {/* Complementary Footer Pills */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0 pt-0.5">
                <span className="rounded-full bg-black/20 px-2.5 py-0.5 font-semibold text-white text-[10px]">
                  Period: {request.start_date} to {request.end_date}
                </span>
                <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[10px] font-bold text-white border border-white/20 whitespace-nowrap">
                  {request.use_toil_first ? "⚡ TOIL Applied" : "Standard Leave"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

    </section>
  );
}
