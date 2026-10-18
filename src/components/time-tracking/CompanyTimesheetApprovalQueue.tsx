"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Footprints,
  LocateFixed,
  LogOut,
  MapPin,
  Timer,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import { reviewSubmittedTimesheets } from "@/lib/time-tracking/actions";
import type { CompanySubmittedTimesheet } from "@/lib/time-tracking/schema";

const TimesheetRouteMap = dynamic(() => import("./TimesheetRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-slate-400">
      Loading shift route map...
    </div>
  ),
});

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
  const [activeMapEntryId, setActiveMapEntryId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    reviewSubmittedTimesheets,
    initialState,
  );

  return (
    <section className="grid gap-4 min-w-0">
      {/* Header */}
      <div className="card-hero-green rounded-2xl p-5 text-white shadow-soft sm:p-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
              Management Approval
            </p>
            <h2 className="mt-0.5 flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
              <ClipboardCheck className="size-5 text-white" />
              Submitted Timesheets
            </h2>
            <p className="mt-0.5 text-xs text-white/85">
              Approve ready timesheets or reject them with a clear note.
            </p>
          </div>
          <span className="w-max rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold text-white shadow-soft backdrop-blur-xs">
            {timesheets.length} ready
          </span>
        </div>
      </div>

      {state.message && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          }`}
        >
          {state.message}
        </div>
      )}

      {timesheets.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm font-medium text-muted shadow-soft">
          No submitted timesheets need approval.
        </p>
      ) : (
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
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
                  className={`flex flex-col justify-between gap-3 rounded-2xl p-4 shadow-soft transition-all w-full max-w-full overflow-hidden ${
                    isCompliant
                      ? "card-hero-green text-white"
                      : "bg-rose-600 text-white"
                  }`}
                >
                  {/* Top Bar: Checkbox, Avatar Monogram, Name & Status Badge */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0 max-w-full">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <label className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border border-white/30 bg-white/20 shadow-soft hover:bg-white/30 transition-colors">
                        <input
                          type="checkbox"
                          name="time_entry_ids"
                          value={timesheet.id}
                          aria-label={`Select ${timesheet.knownAs ?? timesheet.fullName} timesheet for ${timesheet.work_date}`}
                          className="size-4 accent-primary cursor-pointer"
                        />
                      </label>

                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={timesheet.knownAs ?? timesheet.fullName}
                          src={timesheet.avatarUrl}
                          className="size-9 rounded-full border border-white/30 bg-white/20 shadow-soft ring-2 ring-white/30"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full ring-2 ${
                            isCompliant
                              ? "bg-emerald-300 ring-emerald-600"
                              : "bg-rose-300 ring-rose-700"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-white break-words leading-tight">
                          {timesheet.knownAs ?? timesheet.fullName}
                        </p>
                        <p
                          className={`text-[11px] font-medium break-words leading-tight mt-0.5 ${
                            isCompliant ? "text-white/85" : "text-rose-100"
                          }`}
                        >
                          {timesheet.workstationName ?? "Assigned workstation"} ·{" "}
                          <span className="font-semibold text-white">{formatDate(timesheet.work_date)}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                        isCompliant
                          ? "bg-white/20 text-white border border-white/30"
                          : "bg-rose-950/50 text-rose-200 border border-rose-400/30"
                      }`}
                    >
                      {isCompliant ? (
                        <CheckCircle2 className="size-2.5 text-white" />
                      ) : (
                        <AlertTriangle className="size-2.5 text-rose-200" />
                      )}
                      {isCompliant ? "Ready" : "Exception"}
                    </span>
                  </div>

                  {/* High-Contrast White Metric Boxes (Smart Auto-Fit Grid) */}
                  <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1 rounded-xl bg-white p-2 text-center text-slate-900 shadow-xs min-w-0 w-full">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Clock In</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(timesheet.clock_in)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Lunch</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortLunch(timesheet.lunch_start, timesheet.lunch_end)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Clock Out</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{shortTime(timesheet.clock_out)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Total Paid</p>
                      <p className="font-extrabold text-emerald-700 text-xs break-words font-mono leading-tight">{formatHours(timesheet.paid_hours)}</p>
                    </div>
                  </div>

                  {/* Hours Breakdown Subgrid */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/95 p-1.5 text-center text-slate-900 shadow-xs min-w-0 w-full">
                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Normal</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{formatHours(timesheet.normal_hours)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-700 break-words leading-tight">Overtime</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{formatHours(timesheet.overtime_hours)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Lunch</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight">{formatHours(timesheet.lunch_hours)}</p>
                    </div>
                  </div>

                  {/* Complementary Footer Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] min-w-0 pt-0.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[10px] break-words ${
                        isCompliant ? "bg-white/20 text-white" : "bg-rose-800/80 text-rose-100"
                      }`}
                      title={timesheet.workstationName ?? "Assigned workstation"}
                    >
                      <MapPin className="mr-1 inline size-2.5 shrink-0 opacity-80" />
                      <span className="break-words leading-tight">{timesheet.workstationName ?? "Workstation logged"}</span>
                    </span>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap border ${
                        isCompliant
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-rose-950/50 text-rose-200 border border-rose-400/30"
                      }`}
                    >
                      {isCompliant ? "Fully Compliant" : "Review Required"}
                    </span>
                  </div>

                  {/* Location History Dropdown & Visual Route Map */}
                  <details className="rounded-2xl border border-border/80 bg-surface overflow-hidden shadow-soft text-foreground" open={activeMapEntryId === timesheet.id}>
                    <summary className="flex cursor-pointer items-center justify-between gap-1.5 px-3 py-2.5 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-primary" />
                        Location history ({timesheet.locationEvents.length})
                      </span>
                      {timesheet.locationEvents.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveMapEntryId((prev) => (prev === timesheet.id ? null : timesheet.id));
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-primary-hover shadow-soft transition-all"
                        >
                          <Footprints className="size-3 text-white" />
                          {activeMapEntryId === timesheet.id ? "Hide Map" : "View Route Map"}
                        </button>
                      )}
                    </summary>

                    {/* Interactive Leaflet Route Map */}
                    {activeMapEntryId === timesheet.id && (
                      <div className="p-2 border-t border-border bg-slate-950">
                        <TimesheetRouteMap
                          employeeName={timesheet.knownAs ?? timesheet.fullName}
                          workDate={timesheet.work_date}
                          locationEvents={timesheet.locationEvents}
                          onClose={() => setActiveMapEntryId(null)}
                        />
                      </div>
                    )}

                    <div className="divide-y divide-border border-t border-border bg-surface p-1">
                      {timesheet.locationEvents.length === 0 ? (
                        <p className="p-2.5 text-center text-xs text-muted">
                          No location events were captured for this shift.
                        </p>
                      ) : (
                        timesheet.locationEvents.map((event) => (
                          <div key={event.id} className="grid gap-1.5 p-2 sm:grid-cols-[120px_1fr_auto] sm:items-center text-xs">
                            <div>
                              <p className="font-bold capitalize text-foreground break-words leading-tight">
                                {event.event_type.replaceAll("_", " ")}
                              </p>
                              <p className="text-[11px] text-muted">
                                {formatTime(event.local_event_time)}
                              </p>
                            </div>
                            <div className="min-w-0 text-muted">
                              <p className="font-medium break-words leading-tight">
                                {event.workstationName ?? "No workstation"}
                                {event.distance_meters !== null
                                  ? ` · ${Math.round(event.distance_meters)}m away`
                                  : ""}
                              </p>
                            </div>
                            <span
                              className={`inline-flex w-max items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${geofenceClass(event.geofence_status)} shadow-soft`}
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
          <div className="grid gap-3 rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-soft">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Review note</span>
              <span className="flex items-start gap-2 rounded-2xl border border-border/80 bg-background px-3 pt-2 shadow-soft focus-within:border-primary">
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
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-6 py-2.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-all shadow-soft cursor-pointer"
              >
                <XCircle className="size-4 shrink-0" />
                {pending ? "Working..." : "Reject selected"}
              </button>
              <button
                name="decision"
                value="approve"
                disabled={pending}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover disabled:opacity-50 shadow-soft transition-all cursor-pointer"
              >
                <CheckCircle2 className="size-4 shrink-0 text-white" />
                {pending ? "Working..." : "Approve selected"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
