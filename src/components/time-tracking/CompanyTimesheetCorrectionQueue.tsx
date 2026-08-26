"use client";

import {
  CheckCircle2,
  CheckSquare,
  ClipboardList,
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
    <section className="card grid gap-3 p-4">
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Management review</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <ClipboardList className="size-5 text-accent" />
            Timesheet requests
          </h2>
          <p className="mt-1 text-xs text-muted">
            Tick requests to bulk approve or reject them with a single review note.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {requests.length > 0 ? (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface"
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
          <span className="w-max rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
            {requests.length} pending
          </span>
        </div>
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
        <form action={formAction} className="grid gap-3">
          {Array.from(selectedIds).map((id) => (
            <input key={id} type="hidden" name="correction_ids" value={id} />
          ))}

          <div className="grid gap-2">
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
                  className={`grid cursor-pointer gap-3 rounded-md border p-3 text-sm shadow-sm transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/[0.06]"
                      : "border-border bg-background hover:border-border/80"
                  }`}
                >
                  <div className="grid gap-2 lg:grid-cols-[40px_1fr_auto] lg:items-center">
                    <label
                      className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md lg:mx-auto lg:size-6 lg:rounded-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(request.id)}
                        aria-label={`Select correction request for ${request.knownAs ?? request.fullName} on ${formatDate(request.work_date)}`}
                        className="size-5 accent-current lg:size-4"
                      />
                    </label>

                    <div className="flex min-w-0 items-center gap-2">
                      <EmployeeAvatar
                        name={request.knownAs ?? request.fullName}
                        src={request.avatarUrl}
                        className="size-9 shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-foreground">
                          {request.knownAs ?? request.fullName}
                        </h3>
                        <p className="mt-1 truncate text-xs text-muted">
                          {request.workstationName ?? "No workstation"} -{" "}
                          {formatDate(request.work_date)}
                        </p>
                      </div>
                    </div>

                    <span className="w-max rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                      Submitted
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <div className="min-w-0 rounded-md border border-border bg-surface p-2.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Original
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">In</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{formatTime(request.original_clock_in)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch start</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{formatTime(request.original_lunch_start)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch end</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{formatTime(request.original_lunch_end)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Out</p>
                          <span className="h-6 w-full bg-transparent text-xs text-foreground">{formatTime(request.original_clock_out)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-accent/30 bg-accent/10 p-2.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Proposed
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">In</p>
                          <span className="h-6 w-full bg-transparent text-xs font-semibold text-foreground">{formatTime(request.proposed_clock_in)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch start</p>
                          <span className="h-6 w-full bg-transparent text-xs font-semibold text-foreground">{formatTime(request.proposed_lunch_start)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Lunch end</p>
                          <span className="h-6 w-full bg-transparent text-xs font-semibold text-foreground">{formatTime(request.proposed_lunch_end)}</span>
                        </div>
                        <div className="min-w-0 rounded border border-border bg-background px-2 py-1.5">
                          <p className="text-[10px] text-muted leading-none">Out</p>
                          <span className="h-6 w-full bg-transparent text-xs font-semibold text-foreground">{formatTime(request.proposed_clock_out)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
                    <span className="font-semibold text-muted">Reason: </span>
                    {request.reason}
                  </p>
                </article>
              );
            })}
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Review note</span>
            <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
              <FileText className="size-4 shrink-0 text-muted mt-0.5" />
              <textarea
                name="review_notes"
                rows={2}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                placeholder="Optional review note or rejection reason applied to selected requests"
              />
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${requests.length} request${selectedIds.size === 1 ? "" : "s"} selected`
                : "Tick the checkbox on one or more requests to approve or reject them."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                name="decision"
                value="reject"
                disabled={pending || selectedIds.size === 0}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-40 sm:min-h-0"
              >
                <ThumbsDown className="size-4 shrink-0" />
                {pending ? "Working..." : selectedIds.size > 0 ? `Reject selected (${selectedIds.size})` : "Reject selected"}
              </button>
              <button
                name="decision"
                value="approve"
                disabled={pending || selectedIds.size === 0}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40 sm:min-h-0"
              >
                <ThumbsUp className="size-4 shrink-0" />
                {pending ? "Working..." : selectedIds.size > 0 ? `Approve selected (${selectedIds.size})` : "Approve selected"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
