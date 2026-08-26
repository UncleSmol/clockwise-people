"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  LocateFixed,
  LogOut,
  MapPin,
  Timer,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useActionState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import { reviewSubmittedTimesheets } from "@/lib/time-tracking/actions";
import type { CompanySubmittedTimesheet } from "@/lib/time-tracking/schema";

type CompanyTimesheetApprovalQueueProps = {
  timesheets: CompanySubmittedTimesheet[];
};

type ApprovalState = {
  ok: boolean;
  message: string;
};

const initialState: ApprovalState = {
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

function formatHours(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}h`;
}

function shortTime(value: string | null) {
  return value ? formatTime(value) : "–";
}

function shortLunch(start: string | null, end: string | null) {
  if (!start && !end) return "–";
  if (start && !end) return formatTime(start);
  if (!start && end) return formatTime(end);
  return `${shortTime(start)}-${shortTime(end)}`;
}

function geofenceLabel(status: string | null) {
  if (status === "in_range") return "In range";
  if (status === "out_of_range") return "Out of range";
  if (status === "no_location") return "No location";
  if (status === "no_workstation") return "No workstation";
  return "Unknown";
}

function geofenceClass(status: string | null) {
  if (status === "in_range") return "border-emerald-300 bg-emerald-100/70 text-emerald-800";
  if (status === "out_of_range") return "border-rose-300 bg-rose-100/70 text-rose-800";
  if (status === "no_location") return "border-amber-300 bg-amber-100/70 text-amber-800";
  return "border-border bg-surface-muted text-muted";
}

export default function CompanyTimesheetApprovalQueue({
  timesheets,
}: CompanyTimesheetApprovalQueueProps) {
  const [state, formAction, pending] = useActionState(
    reviewSubmittedTimesheets,
    initialState,
  );

  return (
    <section className="card grid gap-3.5 p-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Management approval</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-foreground">
            <ClipboardCheck className="size-5 text-accent" />
            Submitted timesheets
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve ready timesheets or reject them with a clear note.
          </p>
        </div>
        <span className="w-max rounded bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
          {timesheets.length} ready
        </span>
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

      {timesheets.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-4 text-center text-sm font-medium text-muted">
          No submitted timesheets need approval.
        </p>
      ) : (
        <form action={formAction} className="grid gap-3.5">
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start">
            {timesheets.map((timesheet) => {
              const hasWarning =
                timesheet.missing_clocking ||
                timesheet.late_arrival ||
                timesheet.early_departure;
              const validation = timesheet.scheduleValidation;
              const isCompliant = validation?.isCompliant ?? !hasWarning;

              return (
                <article
                  key={timesheet.id}
                  className={`grid gap-3 rounded-lg border-2 p-3.5 shadow-2xs transition-all min-w-0 ${
                    isCompliant
                      ? "border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70"
                      : "border-rose-500 bg-rose-50/50 hover:bg-rose-50/70"
                  }`}
                >
                  {/* Top Bar: Checkbox, Avatar, Name & Status Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <label className="grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-border bg-white shadow-xs hover:border-slate-400">
                        <input
                          type="checkbox"
                          name="time_entry_ids"
                          value={timesheet.id}
                          aria-label={`Select ${timesheet.knownAs ?? timesheet.fullName} timesheet for ${timesheet.work_date}`}
                          className="size-4 accent-slate-900"
                        />
                      </label>
                      <EmployeeAvatar
                        name={timesheet.knownAs ?? timesheet.fullName}
                        src={timesheet.avatarUrl}
                        className="size-9 shrink-0 ring-1 ring-border shadow-2xs"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-foreground">
                          {timesheet.knownAs ?? timesheet.fullName}
                        </p>
                        <p className="truncate text-[11px] font-medium text-muted">
                          {timesheet.workstationName ?? "Assigned workstation"} ·{" "}
                          <span className="font-semibold text-foreground">{formatDate(timesheet.work_date)}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        isCompliant
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : "bg-rose-600 text-white shadow-2xs"
                      }`}
                    >
                      {isCompliant ? (
                        <CheckCircle2 className="size-3 text-white" />
                      ) : (
                        <AlertTriangle className="size-3 text-white" />
                      )}
                      {isCompliant ? "Ready" : "Exception"}
                    </span>
                  </div>

                  {/* High-Contrast White Metric Boxes (Smart Auto-Fit Grid) */}
                  <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1.5 min-w-0">
                    <div className="rounded-md border border-border bg-white p-1.5 text-center shadow-2xs min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Clock In</p>
                      <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortTime(timesheet.clock_in)}</p>
                    </div>

                    <div className="rounded-md border border-border bg-white p-1.5 text-center shadow-2xs min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Lunch</p>
                      <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortLunch(timesheet.lunch_start, timesheet.lunch_end)}</p>
                    </div>

                    <div className="rounded-md border border-border bg-white p-1.5 text-center shadow-2xs min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted truncate whitespace-nowrap">Clock Out</p>
                      <p className="mt-0.5 text-xs font-extrabold text-foreground truncate whitespace-nowrap">{shortTime(timesheet.clock_out)}</p>
                    </div>

                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-center shadow-2xs min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 truncate whitespace-nowrap">Total Paid</p>
                      <p className="mt-0.5 text-xs font-black text-emerald-950 truncate whitespace-nowrap">{formatHours(timesheet.paid_hours)}</p>
                    </div>
                  </div>

                  {/* Hours Breakdown Subgrid */}
                  <div className="grid grid-cols-3 gap-1.5 min-w-0">
                    <div className="rounded-md border border-border bg-white/90 p-1.5 text-center min-w-0">
                      <p className="text-[9px] font-bold uppercase text-muted truncate whitespace-nowrap">Normal (NT)</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground truncate whitespace-nowrap">{formatHours(timesheet.normal_hours)}</p>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-100/80 p-1.5 text-center min-w-0">
                      <p className="text-[9px] font-bold uppercase text-slate-700 truncate whitespace-nowrap">Overtime (OT)</p>
                      <p className="mt-0.5 text-xs font-extrabold text-slate-900 truncate whitespace-nowrap">{formatHours(timesheet.overtime_hours)}</p>
                    </div>

                    <div className="rounded-md border border-border bg-white/90 p-1.5 text-center min-w-0">
                      <p className="text-[9px] font-bold uppercase text-muted truncate whitespace-nowrap">Lunch Break</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground truncate whitespace-nowrap">{formatHours(timesheet.lunch_hours)}</p>
                    </div>
                  </div>

                  {/* Location History Dropdown */}
                  <details className="rounded-md border border-border/80 bg-white/80">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-bold text-foreground hover:bg-slate-50">
                      <MapPin className="size-3.5 text-accent" />
                      Location history ({timesheet.locationEvents.length})
                    </summary>
                    <div className="divide-y divide-border border-t border-border bg-surface p-1">
                      {timesheet.locationEvents.length === 0 ? (
                        <p className="p-2.5 text-center text-xs text-muted">
                          No location events were captured for this shift.
                        </p>
                      ) : (
                        timesheet.locationEvents.map((event) => (
                          <div key={event.id} className="grid gap-1.5 p-2 sm:grid-cols-[120px_1fr_auto] sm:items-center text-xs">
                            <div>
                              <p className="font-bold capitalize text-foreground">
                                {event.event_type.replaceAll("_", " ")}
                              </p>
                              <p className="text-[11px] text-muted">
                                {formatTime(event.local_event_time)}
                              </p>
                            </div>
                            <div className="min-w-0 text-muted">
                              <p className="truncate font-medium">
                                {event.workstationName ?? "No workstation"}
                                {event.distance_meters !== null
                                  ? ` · ${Math.round(event.distance_meters)}m away`
                                  : ""}
                              </p>
                            </div>
                            <span
                              className={`inline-flex w-max items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${geofenceClass(event.geofence_status)}`}
                            >
                              <LocateFixed className="size-3" />
                              {geofenceLabel(event.geofence_status)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>

          {/* Action Note Box & Decision Buttons */}
          <div className="grid gap-3 rounded-lg border border-border bg-background p-3.5">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Review note</span>
              <span className="flex items-start gap-2 rounded-md border border-border bg-white px-3 pt-2">
                <FileText className="size-4 shrink-0 text-muted mt-0.5" />
                <textarea
                  name="approval_notes"
                  rows={2}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none resize-none"
                  placeholder="Optional review note or rejection reason applied to selected timesheets"
                />
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                name="decision"
                value="reject"
                disabled={pending}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-rose-400/60 bg-rose-50 px-4 py-2 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <XCircle className="size-4 shrink-0" />
                {pending ? "Working..." : "Reject selected"}
              </button>
              <button
                name="decision"
                value="approve"
                disabled={pending}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs"
              >
                <CheckCircle2 className="size-4 shrink-0" />
                {pending ? "Working..." : "Approve selected"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
