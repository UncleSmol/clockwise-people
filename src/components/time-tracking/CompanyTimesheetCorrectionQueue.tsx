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
    <section className="grid gap-4 min-w-0">
      {/* Header */}
      <div className="rounded-xl bg-primary text-primary-foreground p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/75">
              Management Review
            </p>
            <h2 className="mt-0.5 flex items-center gap-2 text-xl font-black text-primary-foreground sm:text-2xl">
              <ClipboardList className="size-5 text-amber-400" />
              Timesheet Correction Requests
            </h2>
            <p className="mt-0.5 text-xs text-primary-foreground/85">
              Review proposed employee clocking changes and bulk approve or reject them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {requests.length > 0 ? (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-white/20 shadow-2xs backdrop-blur-xs transition-all"
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

          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start">
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
                  className={`grid cursor-pointer gap-3 rounded-lg border-2 p-3.5 shadow-2xs transition-all min-w-0 ${
                    isSelected
                      ? "border-slate-900 bg-slate-900/5 ring-2 ring-slate-900"
                      : "border-amber-400 bg-amber-50/40 hover:bg-amber-50/70"
                  }`}
                >
                  {/* Top Bar: Checkbox, Avatar, Name & Status Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
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
                        <h3 className="truncate text-xs font-extrabold text-foreground">
                          {request.knownAs ?? request.fullName}
                        </h3>
                        <p className="truncate text-[11px] font-medium text-muted">
                          {request.workstationName ?? "Assigned workstation"} ·{" "}
                          <span className="font-semibold text-foreground">{formatDate(request.work_date)}</span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-2xs">
                      Correction Needed
                    </span>
                  </div>

                  {/* Side-by-Side Original vs Proposed High-Contrast Grid */}
                  <div className="grid gap-2 min-[500px]:grid-cols-2 min-w-0">
                    {/* Original Times Box */}
                    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-2 shadow-2xs">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 truncate whitespace-nowrap">
                        Original Recorded Log
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 min-[340px]:grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-border bg-background p-1 min-w-0">
                          <p className="text-[9px] font-bold text-muted uppercase truncate whitespace-nowrap">In</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground truncate whitespace-nowrap">{formatTime(request.original_clock_in)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1 min-w-0">
                          <p className="text-[9px] font-bold text-muted uppercase truncate whitespace-nowrap">L.In</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground truncate whitespace-nowrap">{formatTime(request.original_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1 min-w-0">
                          <p className="text-[9px] font-bold text-muted uppercase truncate whitespace-nowrap">L.Out</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground truncate whitespace-nowrap">{formatTime(request.original_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-border bg-background p-1 min-w-0">
                          <p className="text-[9px] font-bold text-muted uppercase truncate whitespace-nowrap">Out</p>
                          <p className="mt-0.5 text-xs font-semibold text-foreground truncate whitespace-nowrap">{formatTime(request.original_clock_out)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Proposed Times Box (High-Contrast Emerald Highlight) */}
                    <div className="min-w-0 rounded-md border border-emerald-300 bg-emerald-50/90 p-2 shadow-2xs">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-emerald-800 truncate whitespace-nowrap">
                        Proposed Correction
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 min-[340px]:grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-emerald-200 bg-white p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase truncate whitespace-nowrap">In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatTime(request.proposed_clock_in)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase truncate whitespace-nowrap">L.In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatTime(request.proposed_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase truncate whitespace-nowrap">L.Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatTime(request.proposed_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase truncate whitespace-nowrap">Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatTime(request.proposed_clock_out)}</p>
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
