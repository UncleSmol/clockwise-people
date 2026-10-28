"use client";

import {
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  FileText,
  Square,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useActionState, useState, useMemo, useEffect, useCallback, useRef } from "react";
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
  const queueSectionRef = useRef<HTMLElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Pagination setup matching EmployeeTimesheetCorrections
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const totalRequests = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalRequests / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const paginatedRequests = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return requests.slice(startIndex, startIndex + pageSize);
  }, [requests, page, pageSize]);

  const startIndex = totalRequests > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(page * pageSize, totalRequests);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        queueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

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

  const toggleSelectCurrentPage = () => {
    const pageIds = paginatedRequests.map((r) => r.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <section ref={queueSectionRef} className="grid gap-4 min-w-0">
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
              <>
                <button
                  type="button"
                  onClick={toggleSelectCurrentPage}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-white/20 shadow-2xs backdrop-blur-xs transition-all cursor-pointer"
                >
                  <CheckSquare className="size-3.5" />
                  Select page ({paginatedRequests.length})
                </button>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-white/20 shadow-2xs backdrop-blur-xs transition-all cursor-pointer"
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
              </>
            ) : null}
            <span className="w-max rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
              {requests.length} pending
            </span>
            {selectedIds.size > 0 && (
              <span className="w-max rounded bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                {selectedIds.size} selected
              </span>
            )}
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
            {paginatedRequests.map((request) => {
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
                  className={`flex flex-col justify-between gap-2.5 rounded-xl p-3.5 shadow-sm transition-all min-w-0 ${
                    isSelected
                      ? "bg-amber-600 text-white ring-2 ring-white"
                      : "bg-amber-600 text-white ring-1 ring-amber-700/80"
                  }`}
                >
                  {/* Top Bar: Checkbox, Avatar, Name & Status Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <label
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-amber-400/50 bg-amber-700/80 shadow-xs hover:border-amber-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(request.id)}
                          aria-label={`Select correction request for ${request.knownAs ?? request.fullName} on ${formatDate(request.work_date)}`}
                          className="size-4 accent-amber-950 cursor-pointer"
                        />
                      </label>

                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={request.knownAs ?? request.fullName}
                          src={request.avatarUrl}
                          className="size-8.5 rounded-lg border border-amber-400/50 bg-amber-700/80 shadow-xs ring-1 ring-amber-400/50"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-amber-200 ring-2 ring-amber-600" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-extrabold text-white break-words leading-tight">
                          {request.knownAs ?? request.fullName}
                        </h3>
                        <p className="text-[11px] font-medium text-amber-100 break-words leading-tight mt-0.5">
                          {request.workstationName ?? "Assigned workstation"} ·{" "}
                          <span className="font-semibold text-white">{formatDate(request.work_date)}</span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-100 border border-amber-300/30 whitespace-nowrap">
                      Correction Needed
                    </span>
                  </div>

                  {/* Side-by-Side Original vs Proposed High-Contrast Grid */}
                  <div className="grid gap-2 min-[500px]:grid-cols-2 min-w-0">
                    {/* Original Times Box */}
                    <div className="min-w-0 rounded-md bg-white p-2 text-slate-900 shadow-xs">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 break-words leading-tight">
                        Original Recorded Log
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 min-[340px]:grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-slate-200 bg-slate-50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 uppercase break-words leading-tight">In</p>
                          <p className="mt-0.5 text-xs font-bold text-slate-900 break-words font-mono leading-tight">{formatTime(request.original_clock_in)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 uppercase break-words leading-tight">L.In</p>
                          <p className="mt-0.5 text-xs font-bold text-slate-900 break-words font-mono leading-tight">{formatTime(request.original_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 uppercase break-words leading-tight">L.Out</p>
                          <p className="mt-0.5 text-xs font-bold text-slate-900 break-words font-mono leading-tight">{formatTime(request.original_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 uppercase break-words leading-tight">Out</p>
                          <p className="mt-0.5 text-xs font-bold text-slate-900 break-words font-mono leading-tight">{formatTime(request.original_clock_out)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Proposed Times Box (High-Contrast Emerald Highlight) */}
                    <div className="min-w-0 rounded-md bg-white p-2 text-slate-900 shadow-xs">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-emerald-800 break-words leading-tight">
                        Proposed Correction
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 min-[340px]:grid-cols-4 gap-1 text-center">
                        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase break-words leading-tight">In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 break-words font-mono leading-tight">{formatTime(request.proposed_clock_in)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase break-words leading-tight">L.In</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 break-words font-mono leading-tight">{formatTime(request.proposed_lunch_start)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase break-words leading-tight">L.Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 break-words font-mono leading-tight">{formatTime(request.proposed_lunch_end)}</p>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-1 min-w-0">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase break-words leading-tight">Out</p>
                          <p className="mt-0.5 text-xs font-black text-emerald-950 break-words font-mono leading-tight">{formatTime(request.proposed_clock_out)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason Box */}
                  <div className="rounded-md bg-white p-2 text-xs text-slate-900 shadow-xs break-words" title={request.reason}>
                    <span className="font-extrabold uppercase tracking-wider text-slate-500">Reason: </span>
                    <span className="font-semibold text-slate-900">{request.reason}</span>
                  </div>

                  {/* Complementary Footer Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0 pt-0.5">
                    <span
                      className="inline-flex items-center rounded bg-amber-700/80 px-2 py-0.5 font-semibold text-amber-100 text-[10px] break-words"
                      title={request.workstationName ?? "Assigned workstation"}
                    >
                      <Clock className="mr-1 inline size-2.5 shrink-0 opacity-80" />
                      <span className="break-words leading-tight">{request.workstationName ?? "Workstation logged"}</span>
                    </span>

                    <span className="shrink-0 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-white border border-amber-300/20 whitespace-nowrap">
                      Pending Manager Review
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Correction Requests Pagination Controls */}
          {totalRequests > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md p-3 sm:p-3.5 text-xs shadow-soft">
              <div className="flex flex-wrap items-center gap-2 text-muted">
                <span>
                  Showing <strong className="font-bold text-foreground">{startIndex}</strong> to{" "}
                  <strong className="font-bold text-foreground">{endIndex}</strong> of{" "}
                  <strong className="font-bold text-foreground">{totalRequests}</strong> requests
                </span>

                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[11px] font-semibold text-muted">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2.5 py-1 text-xs rounded-full bg-background border border-border/80 text-foreground focus:outline-none focus:border-primary shadow-2xs font-semibold cursor-pointer"
                  >
                    {[6, 12, 24, 48].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedIds.size > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={page <= 1}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="First page"
                    aria-label="First page"
                  >
                    <ChevronsLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        return (
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - page) <= 1
                        );
                      })
                      .reduce<Array<number | string>>((acc, p, idx, arr) => {
                        if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) {
                          acc.push("...");
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) =>
                        typeof item === "string" ? (
                          <span key={`req-page-ellipsis-${idx}`} className="px-1 text-muted">
                            ...
                          </span>
                        ) : (
                          <button
                            key={`req-page-${item}`}
                            type="button"
                            onClick={() => handlePageChange(item)}
                            className={`grid size-7 place-items-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              item === page
                                ? "bg-amber-600 text-white shadow-2xs scale-105"
                                : "hover:bg-surface-muted text-muted hover:text-foreground"
                            }`}
                          >
                            {item}
                          </button>
                        )
                      )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={page >= totalPages}
                    className="grid size-8 place-items-center rounded-full border border-border/80 bg-surface hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs text-foreground cursor-pointer"
                    title="Last page"
                    aria-label="Last page"
                  >
                    <ChevronsRight className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

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
