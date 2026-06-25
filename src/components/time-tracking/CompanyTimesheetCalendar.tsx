"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import { AlertTriangle, CalendarDays, Clock3 } from "lucide-react";
import { useMemo } from "react";
import type {
  CompanyPublicHoliday,
  CompanyTimesheetCalendarEntry,
} from "@/lib/time-tracking/schema";

type CompanyTimesheetCalendarProps = {
  entries: CompanyTimesheetCalendarEntry[];
  publicHolidays: CompanyPublicHoliday[];
};

function displayName(entry: CompanyTimesheetCalendarEntry) {
  return entry.knownAs ?? entry.fullName;
}

function statusClass(status: CompanyTimesheetCalendarEntry["status"]) {
  if (status === "draft") return ["cw-company-timesheet-event", "cw-calendar-draft"];
  if (status === "approved") return ["cw-company-timesheet-event", "cw-calendar-approved"];
  if (status === "rejected") return ["cw-company-timesheet-event", "cw-calendar-rejected"];
  if (status === "locked") return ["cw-company-timesheet-event", "cw-calendar-locked"];
  return ["cw-company-timesheet-event", "cw-calendar-submitted"];
}

function renderEventContent(eventInfo: EventContentArg) {
  const entry = eventInfo.event.extendedProps.entry as
    | CompanyTimesheetCalendarEntry
    | undefined;

  if (!entry) {
    return (
      <div className="truncate text-[11px] font-semibold leading-4">
        {eventInfo.event.title}
      </div>
    );
  }

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
  publicHolidays,
}: CompanyTimesheetCalendarProps) {
  const events = useMemo<EventInput[]>(
    () => {
      const holidayEvents = publicHolidays.map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));
      const timesheetEvents = entries.map((entry) => ({
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
      }));

      return [...holidayEvents, ...timesheetEvents];
    },
    [entries, publicHolidays],
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
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">
            <span className="size-2 rounded-full bg-accent" />
            Public holiday
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-warning">
            <span className="size-2 rounded-full bg-warning" />
            Draft
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
            <span className="size-2 rounded-full bg-primary" />
            Submitted
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
            <span className="size-2 rounded-full bg-success" />
            Approved
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-danger">
            <span className="size-2 rounded-full bg-danger" />
            Rejected
          </span>
        </div>
        {events.length > 0 ? (
          <div className="cw-timesheet-calendar">
            <FullCalendar
              dayMaxEvents={4}
              eventClassNames={(arg) => {
                const entry = arg.event.extendedProps.entry as
                  | CompanyTimesheetCalendarEntry
                  | undefined;

                return entry ? statusClass(entry.status) : ["cw-calendar-holiday"];
              }}
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
