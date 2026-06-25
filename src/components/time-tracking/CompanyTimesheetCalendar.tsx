"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import { AlertTriangle, CalendarDays, Clock3 } from "lucide-react";
import { useMemo } from "react";
import type { CompanyTimesheetCalendarEntry } from "@/lib/time-tracking/schema";

type CompanyTimesheetCalendarProps = {
  entries: CompanyTimesheetCalendarEntry[];
};

function displayName(entry: CompanyTimesheetCalendarEntry) {
  return entry.knownAs ?? entry.fullName;
}

function statusClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "approved") return "border-success/40 bg-success/10 text-success";
  if (status === "submitted") return "border-warning/40 bg-warning/10 text-warning";
  if (status === "rejected") return "border-danger/40 bg-danger/10 text-danger";
  if (status === "locked") return "border-primary/40 bg-primary/10 text-primary";
  return "border-border bg-surface-muted text-foreground";
}

function renderEventContent(eventInfo: EventContentArg) {
  const entry = eventInfo.event.extendedProps.entry as CompanyTimesheetCalendarEntry;

  return (
    <div className="grid min-w-0 gap-0.5 text-[11px] leading-4">
      <span className="truncate font-semibold">{displayName(entry)}</span>
      <span className="truncate text-muted">
        {Number(entry.paid_hours ?? 0).toFixed(2)}h
        {Number(entry.overtime_hours ?? 0) > 0
          ? ` + ${Number(entry.overtime_hours).toFixed(2)}h OT`
          : ""}
      </span>
    </div>
  );
}

export default function CompanyTimesheetCalendar({
  entries,
}: CompanyTimesheetCalendarProps) {
  const events = useMemo<EventInput[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        title: displayName(entry),
        start: entry.work_date,
        allDay: true,
        classNames: [
          "cw-company-timesheet-event",
          entry.missing_clocking || entry.late_arrival || entry.early_departure
            ? "cw-company-timesheet-event-warning"
            : "",
        ],
        extendedProps: { entry },
      })),
    [entries],
  );

  const totals = useMemo(
    () => ({
      approved: entries.filter((entry) => entry.status === "approved").length,
      issues: entries.filter(
        (entry) => entry.missing_clocking || entry.late_arrival || entry.early_departure,
      ).length,
      submitted: entries.filter((entry) => entry.status === "submitted").length,
      total: entries.length,
    }),
    [entries],
  );

  return (
    <section className="premium-card rounded-md">
      <div className="grid gap-3 border-b border-border px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Company calendar
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Timesheet calendar</h2>
          <p className="mt-1 text-sm text-muted">
            Company clockings and timesheet status for the current year.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:w-[520px]">
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <CalendarDays className="size-4" />
              Total
            </div>
            <p className="mt-1 font-semibold text-foreground">{totals.total}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Clock3 className="size-4" />
              Submitted
            </div>
            <p className="mt-1 font-semibold text-foreground">{totals.submitted}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="text-xs text-muted">Approved</div>
            <p className="mt-1 font-semibold text-success">{totals.approved}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <AlertTriangle className="size-4" />
              Issues
            </div>
            <p className="mt-1 font-semibold text-danger">{totals.issues}</p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4">
        {entries.length > 0 ? (
          <div className="cw-timesheet-calendar">
            <FullCalendar
              dayMaxEvents={4}
              eventClassNames={(arg) =>
                statusClass(
                  (arg.event.extendedProps.entry as CompanyTimesheetCalendarEntry).status,
                )
              }
              eventContent={renderEventContent}
              events={events}
              firstDay={1}
              headerToolbar={{
                center: "title",
                left: "prev,next today",
                right: "dayGridMonth,dayGridWeek",
              }}
              height="auto"
              initialView="dayGridMonth"
              plugins={[dayGridPlugin]}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted">
            No company timesheets have been recorded for the current year yet.
          </div>
        )}
      </div>
    </section>
  );
}
