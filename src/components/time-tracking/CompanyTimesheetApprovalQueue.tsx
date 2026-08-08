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
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "no_location") return "border-warning/30 bg-warning/10 text-warning";
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
    <section className="card grid gap-3 p-4">
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Management approval</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <ClipboardCheck className="size-5 text-accent" />
            Submitted timesheets
          </h2>
          <p className="mt-1 text-xs text-muted">
            Approve ready timesheets or reject them with a clear note.
          </p>
        </div>
        <span className="w-max rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          {timesheets.length} ready
        </span>
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

      {timesheets.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No submitted timesheets need approval.
        </p>
      ) : (
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-2">
            {timesheets.map((timesheet) => {
              const hasWarning =
                timesheet.missing_clocking ||
                timesheet.late_arrival ||
                timesheet.early_departure;

              return (
                <article
                  key={timesheet.id}
                  className={`grid gap-3 rounded-md border p-3 text-sm shadow-sm ${
                    hasWarning
                      ? "border-warning/40 bg-warning/10"
                      : "border-success/30 bg-success/10"
                  }`}
                >
                  <div className="grid gap-2 lg:grid-cols-[40px_1fr_1.2fr] lg:items-center">
                    <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md lg:mx-auto lg:size-6 lg:rounded-none">
                      <input
                        type="checkbox"
                        name="time_entry_ids"
                        value={timesheet.id}
                        aria-label={`Select ${timesheet.knownAs ?? timesheet.fullName} timesheet for ${timesheet.work_date}`}
                        className="size-5 accent-current lg:size-4"
                      />
                    </label>
                    <div className="flex min-w-0 items-center gap-2">
                      <EmployeeAvatar
                        name={timesheet.knownAs ?? timesheet.fullName}
                        src={timesheet.avatarUrl}
                        className="size-9 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {timesheet.knownAs ?? timesheet.fullName}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {timesheet.workstationName ?? "No workstation"} -{" "}
                          {formatDate(timesheet.work_date)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-start gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
                      <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <Clock className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`In ${shortTime(timesheet.clock_in)}`}>
                          {shortTime(timesheet.clock_in)}
                        </span>
                      </span>
                      <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <UtensilsCrossed className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`Lunch ${shortLunch(timesheet.lunch_start, timesheet.lunch_end)}`}>
                          {shortLunch(timesheet.lunch_start, timesheet.lunch_end)}
                        </span>
                      </span>
                      <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        <LogOut className="size-3.5 text-accent" />
                        <span className="truncate text-xs font-semibold text-foreground" title={`Out ${shortTime(timesheet.clock_out)}`}>
                          {shortTime(timesheet.clock_out)}
                        </span>
                      </span>
                      <span className="grid min-w-0 justify-items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
                        {hasWarning ? (
                          <AlertTriangle className="size-3.5 text-warning" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-success" />
                        )}
                        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
                          {hasWarning ? "Check" : "Good"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="min-w-0 rounded-md border border-border/70 bg-surface/80 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <Timer className="size-3.5 shrink-0" />
                        NT
                      </p>
                      <p className="mt-1 truncate font-semibold text-foreground">
                        {formatHours(timesheet.normal_hours)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border/70 bg-surface/80 px-3 py-2">
                      <p className="text-xs text-muted">OT</p>
                      <p className="mt-1 truncate font-semibold text-warning">
                        {formatHours(timesheet.overtime_hours)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border/70 bg-surface/80 px-3 py-2">
                      <p className="text-xs text-muted">Paid leave</p>
                      <p className="mt-1 truncate font-semibold text-accent">
                        {formatHours(timesheet.paidTimeOffHours)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border/70 bg-surface/80 px-3 py-2">
                      <p className="text-xs text-muted">Lunch break</p>
                      <p className="mt-1 truncate font-semibold text-foreground">
                        {formatHours(timesheet.lunch_hours)}
                      </p>
                    </div>
                  </div>

                  <details className="rounded-md border border-border/70 bg-surface/80">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                      <MapPin className="size-4 text-accent" />
                      Location history ({timesheet.locationEvents.length})
                    </summary>
                    <div className="divide-y divide-border border-t border-border">
                      {timesheet.locationEvents.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-muted">
                          No location events were captured for this shift.
                        </p>
                      ) : (
                        timesheet.locationEvents.map((event) => (
                          <div key={event.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[130px_1fr_auto] sm:items-center">
                            <div>
                              <p className="font-semibold capitalize text-foreground">
                                {event.event_type.replaceAll("_", " ")}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {formatTime(event.local_event_time)}
                              </p>
                            </div>
                            <div className="min-w-0 text-xs text-muted">
                              <p className="truncate">
                                {event.workstationName ?? "No workstation"}
                                {event.distance_meters !== null
                                  ? ` - ${Math.round(event.distance_meters)}m away`
                                  : ""}
                              </p>
                              <p className="mt-1 truncate">
                                {event.latitude !== null && event.longitude !== null
                                  ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`
                                  : "No coordinates"}
                                {event.accuracy_meters !== null
                                  ? ` - +/-${Math.round(event.accuracy_meters)}m`
                                  : ""}
                              </p>
                            </div>
                            <span
                              className={`inline-flex w-max items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${geofenceClass(event.geofence_status)}`}
                            >
                              <LocateFixed className="size-3.5" />
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

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Approval note</span>
            <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
              <FileText className="size-4 shrink-0 text-muted mt-0.5" />
              <textarea name="approval_notes" rows={2} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none" placeholder="Approval note or rejection reason" />
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              name="decision"
              value="reject"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger/40 bg-surface px-3 py-2 text-sm font-semibold text-danger disabled:opacity-60 sm:min-h-0"
            >
              <XCircle className="size-4 shrink-0" />
              {pending ? "Working..." : "Reject selected"}
            </button>
            <button
              name="decision"
              value="approve"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:min-h-0"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              {pending ? "Working..." : "Approve selected"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
