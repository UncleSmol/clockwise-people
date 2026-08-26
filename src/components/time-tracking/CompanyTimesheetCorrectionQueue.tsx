"use client";

import {
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  FileText,
  Square,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useActionState, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [state, formAction, pending] = useActionState(
    async (prev: ReviewActionState, formData: FormData) => {
      const result = await reviewTimesheetCorrection(prev, formData);
      if (result.ok) {
        setSelectedIds(new Set());
      }
      return result;
    },
    initialState,
  );

  const allSelected = requests.length > 0 && selectedIds.size === requests.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map((r) => r.id)));
    }
  };

  return (
    <section className="card grid gap-3.5 p-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Management review</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-foreground">
            <ClipboardList className="size-5 text-accent" />
            Timesheet correction requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Review proposed employee clocking changes and bulk approve or reject them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {requests.length > 0 ? (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface shadow-2xs"
            >
              {allSelected ? (
                <>
                  <Square className="size-3.5" />
                  Deselect all
                </>
              ) : (
                <>
                  <CheckSquare className="size-3.5" />
                  Select all ({requests.length})
                </>
              )}
            </button>
          ) : null}
          <span className="w-max rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
            {requests.length} pending
          </span>
        </div>
      </div>

      {state.message && (
        <div
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          }`}
        >
          {state.message}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-4 text-center text-sm font-medium text-muted">
          No submitted correction requests need review.
        </p>
      ) : (
        <form action={formAction} className="grid gap-3.5">
          {Array.from(selectedIds).map((id) => (
            <input key={id} type="hidden" name="correction_ids" value={id} />
          ))}

          <div className="grid gap-3">
            {requests.map((request) => {
              const isSelected = selectedIds.has(request.id);

              return (
                <article
                  key={request.id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.tagName !== "BUTTON") {
                      toggleSelect(request.id);
                    }
                  }}
                  className={`grid cursor-pointer gap-3 rounded-lg border p-3.5 shadow-sm transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900/5 ring-2 ring-slate-900"
                      : "border-amber-300/80 bg-amber-50/40 hover:bg-amber-50/70"
                  }`}
                >
                  {/* Top Bar: Checkbox, Avatar, Name & Status Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <label
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-border bg-white shadow-xs hover:border-slate-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(request.id)}
                          aria-label={`Select correction request for ${request.knownAs ?? request.fullName} on ${formatDate(request.work_date)}`}
                          className="size-4 accent-slate-900"
                        />
                      </label>

                      <EmployeeAvatar
                        name={request.knownAs ?? request.fullName}
                        src={request.avatarUrl}
                        className="size-9 shrink-0 ring-1 ring-border shadow-2xs"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold text-foreground">
                          {request.knownAs ?? request.fullName}
                        </h3>
                        <p className="truncate text-xs font-medium text-muted">
                          {request.workstationName ?? "Assigned workstation"} ·{" "}
                          <span className="font-semibold text-foreground">{formatDate(request.work_date)}</span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white shadow-2xs">
                      Correction Needed
                    </span>
                  </div>

                  {/* Side-by-Side Original vs Proposed High-Contrast Grid */}
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {/* Original Times Box */}
                    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-2.5 shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Original Recorded Log
                      </p>
                      <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-border bg-background p-1.5">
                          <p className="text-[9px] font-bold text-muted uppercase">In</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground">{formatTime(request.original_clock_in)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1.5">
                          <p className="text-[9px] font-bold text-muted uppercase">Lunch In</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground">{formatTime(request.original_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1.5">
                          <p className="text-[9px] font-bold text-muted uppercase">Lunch Out</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground">{formatTime(request.original_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1.5">
                          <p className="text-[9px] font-bold text-muted uppercase">Out</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground">{formatTime(request.original_clock_out)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Proposed Times Box (High-Contrast Emerald Highlight) */}
                    <div className="min-w-0 rounded-md border border-emerald-300 bg-emerald-50/90 p-2.5 shadow-2xs">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-800">
                        Proposed Correction
                      </p>
                      <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-emerald-200 bg-white p-1.5">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase">In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950">{formatTime(request.proposed_clock_in)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1.5">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase">Lunch In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950">{formatTime(request.proposed_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1.5">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase">Lunch Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950">{formatTime(request.proposed_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1.5">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase">Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950">{formatTime(request.proposed_clock_out)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason Box */}
                  <div className="rounded-md border border-border bg-white p-2.5 text-xs shadow-2xs">
                    <span className="font-extrabold uppercase tracking-wider text-muted">Reason: </span>
                    <span className="font-semibold text-foreground">{request.reason}</span>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Action Box */}
          <div className="grid gap-3 rounded-lg border border-border bg-background p-3.5">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Review note</span>
              <span className="flex items-start gap-2 rounded-md border border-border bg-white px-3 pt-2">
                <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                <textarea
                  name="review_notes"
                  rows={2}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none resize-none"
                  placeholder="Optional review note or rejection reason applied to selected requests"
                />
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-muted">
                {selectedIds.size > 0
                  ? `${selectedIds.size} of ${requests.length} request${selectedIds.size === 1 ? "" : "s"} selected`
                  : "Tick the checkbox on one or more requests to approve or reject them."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  name="decision"
                  value="reject"
                  disabled={pending || selectedIds.size === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-rose-400/60 bg-rose-50 px-4 py-2 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                >
                  <ThumbsDown className="size-4 shrink-0" />
                  {pending ? "Working..." : selectedIds.size > 0 ? `Reject selected (${selectedIds.size})` : "Reject selected"}
                </button>
                <button
                  name="decision"
                  value="approve"
                  disabled={pending || selectedIds.size === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-40 shadow-xs"
                >
                  <ThumbsUp className="size-4 shrink-0" />
                  {pending ? "Working..." : selectedIds.size > 0 ? `Approve selected (${selectedIds.size})` : "Approve selected"}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
