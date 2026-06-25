"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Edit3,
  FileQuestion,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  createPastDraftTimeEntry,
  deleteDraftTimeEntry,
  saveDraftTimeEntry,
  submitSelectedTimesheets,
  submitTimesheetCorrection,
} from "@/lib/time-tracking/actions";
import type {
  CompanyPublicHoliday,
  TimeEntryRecord,
  TimesheetCorrectionRequest,
} from "@/lib/time-tracking/schema";

type EmployeeTimesheetCorrectionsProps = {
  correctionRequests: TimesheetCorrectionRequest[];
  currentWorkDate: string;
  entries: TimeEntryRecord[];
  publicHolidays: CompanyPublicHoliday[];
};

type CorrectionActionState = {
  ok: boolean;
  message: string;
};

const initialState: CorrectionActionState = {
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
  if (!value) return "Not recorded";

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

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not recorded";
  if (start && !end) return `${formatTime(start)} - active`;
  if (!start && end) return `Started before ${formatTime(end)}`;
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function inputTime(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function statusClass(status: TimesheetCorrectionRequest["status"]) {
  if (status === "submitted") return "bg-warning/10 text-warning";
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  return "bg-surface-muted text-foreground";
}

function timesheetCalendarClass(entry: TimeEntryRecord, isHoliday: boolean) {
  if (isHoliday) return "cw-calendar-holiday-booked";
  if (entry.status === "draft") return "cw-calendar-draft";
  if (entry.status === "approved") return "cw-calendar-approved";
  if (entry.status === "rejected") return "cw-calendar-rejected";
  if (entry.status === "locked") return "cw-calendar-locked";
  return "cw-calendar-submitted";
}

function weekStartDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatter = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function groupByWeek(entries: TimeEntryRecord[]) {
  const groups = new Map<string, { entries: TimeEntryRecord[]; label: string }>();

  entries.forEach((entry) => {
    const start = weekStartDate(entry.work_date);
    const key = dateKey(start);
    const existing = groups.get(key);

    if (existing) {
      existing.entries.push(entry);
      return;
    }

    groups.set(key, {
      entries: [entry],
      label: weekLabel(start),
    });
  });

  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    ...group,
  }));
}

export default function EmployeeTimesheetCorrections({
  correctionRequests,
  currentWorkDate,
  entries,
  publicHolidays,
}: EmployeeTimesheetCorrectionsProps) {
  const [activeTab, setActiveTab] = useState<"timesheets" | "requests">("timesheets");
  const [selectedDate, setSelectedDate] = useState("");
  const [createState, createAction, createPending] = useActionState(
    createPastDraftTimeEntry,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDraftTimeEntry,
    initialState,
  );
  const [correctionState, correctionAction, correctionPending] = useActionState(
    submitTimesheetCorrection,
    initialState,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveDraftTimeEntry,
    initialState,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitSelectedTimesheets,
    initialState,
  );
  const latestRequestByEntry = useMemo(() => {
    const requests = new Map<string, TimesheetCorrectionRequest>();

    correctionRequests.forEach((request) => {
      if (!requests.has(request.time_entry_id)) {
        requests.set(request.time_entry_id, request);
      }
    });

    return requests;
  }, [correctionRequests]);
  const entriesByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.work_date, entry])),
    [entries],
  );
  const holidayDates = useMemo(
    () => new Set(publicHolidays.map((holiday) => holiday.holiday_date)),
    [publicHolidays],
  );
  const calendarEvents = useMemo<EventInput[]>(() => {
    const timesheetEvents = entries.map((entry) => {
      const isHoliday = Boolean(entry.notes?.startsWith("Public holiday:"));

      return {
        id: entry.id,
        title: isHoliday
          ? "Public holiday"
          : `${entry.status} - ${formatHours(entry.paid_hours)}`,
        start: entry.work_date,
        allDay: true,
        classNames: [timesheetCalendarClass(entry, isHoliday)],
      };
    });
    const entryDates = new Set(entries.map((entry) => entry.work_date));
    const holidayEvents = publicHolidays
      .filter((holiday) => !entryDates.has(holiday.holiday_date))
      .map((holiday) => ({
        id: `holiday-${holiday.id}`,
        title: holiday.name,
        start: holiday.holiday_date,
        allDay: true,
        classNames: ["cw-calendar-holiday"],
      }));

    return [...holidayEvents, ...timesheetEvents];
  }, [entries, publicHolidays]);
  const editableEntries = entries.filter((entry) => entry.status === "draft" || entry.status === "rejected");
  const submittedEntries = entries.filter((entry) => entry.status !== "draft" && entry.status !== "rejected");
  const message =
    createState.message ||
    deleteState.message ||
    correctionState.message ||
    saveState.message ||
    submitState.message;
  const messageOk = createState.message
    ? createState.ok
    : deleteState.message
      ? deleteState.ok
      : correctionState.message
        ? correctionState.ok
        : saveState.message
          ? saveState.ok
          : submitState.ok;
  const shouldGroupWeeks = entries.length >= 7;
  const weekGroups = useMemo(
    () => groupByWeek(entries),
    [entries],
  );
  const selectedEntry = selectedDate ? entriesByDate.get(selectedDate) : null;
  const selectedIsHoliday = selectedDate ? holidayDates.has(selectedDate) : false;
  const selectedCanAdd =
    Boolean(selectedDate) &&
    selectedDate < currentWorkDate &&
    !selectedEntry &&
    !selectedIsHoliday;
  const handleDateClick = (arg: DateClickArg) => {
    setSelectedDate(arg.dateStr);
  };

  const renderTimesheetEntry = (entry: TimeEntryRecord) => {
    const editable = entry.status === "draft" || entry.status === "rejected";
    const hasWarning = entry.missing_clocking || entry.late_arrival || entry.early_departure;

    return (
      <article
        key={entry.id}
        className={`grid gap-3 rounded-md border p-3 text-sm shadow-sm ${
          hasWarning
            ? "border-danger/30 bg-danger/10"
            : "border-success/30 bg-success/10"
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              {hasWarning ? (
                <AlertTriangle className="size-4 text-danger" />
              ) : (
                <CheckCircle2 className="size-4 text-success" />
              )}
              {formatDate(entry.work_date)}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
              {editable ? "Draft" : entry.status}
            </p>
          </div>
          <span className="inline-flex w-max items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground">
            <Clock3 className="size-3.5" />
            {formatHours(entry.paid_hours)}
          </span>
        </div>

        {editable ? (
          <form action={saveAction} className="grid gap-2">
            <input type="hidden" name="time_entry_id" value={entry.id} />
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">In</span>
                <input
                  type="time"
                  name="clock_in"
                  defaultValue={inputTime(entry.clock_in)}
                  className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Lunch start</span>
                <input
                  type="time"
                  name="lunch_start"
                  defaultValue={inputTime(entry.lunch_start)}
                  className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Lunch end</span>
                <input
                  type="time"
                  name="lunch_end"
                  defaultValue={inputTime(entry.lunch_end)}
                  className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Out</span>
                <input
                  type="time"
                  name="clock_out"
                  defaultValue={inputTime(entry.clock_out)}
                  className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-muted">Note</span>
              <textarea
                name="notes"
                rows={2}
                defaultValue={entry.notes ?? ""}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                placeholder="Optional"
              />
            </label>
            <div className="flex justify-end">
              <button
                formAction={deleteAction}
                disabled={deletePending}
                className="mr-auto inline-flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {deletePending ? "Deleting..." : "Delete"}
              </button>
              <button
                disabled={savePending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Save className="size-4" />
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-2 sm:grid-cols-4">
            <span>In: {formatTime(entry.clock_in)}</span>
            <span>Lunch: {formatTimeRange(entry.lunch_start, entry.lunch_end)}</span>
            <span>Out: {formatTime(entry.clock_out)}</span>
            <span className="font-semibold">Submitted</span>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="premium-card grid gap-3 rounded-md p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Timesheets</h2>
          <p className="mt-1 text-xs text-muted">
            Use the calendar to add past days, fix drafts, then submit when ready.
          </p>
        </div>
        <span className="w-max rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {entries.length} records
        </span>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-background p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <CalendarDays className="size-4 text-accent" />
              Calendar
            </p>
            <p className="mt-1 text-xs text-muted">
              Select a past work day to create a draft timesheet. Public holidays are booked automatically.
            </p>
          </div>
          {selectedDate ? (
            <form action={createAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="work_date" value={selectedDate} />
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                {formatDate(selectedDate)}
              </span>
              <button
                disabled={!selectedCanAdd || createPending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="size-4" />
                {createPending ? "Adding..." : "Add draft"}
              </button>
            </form>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
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
        {selectedDate && selectedEntry ? (
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
            This day already has a {selectedEntry.status} timesheet.
          </p>
        ) : selectedDate && selectedIsHoliday ? (
          <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
            This day is a company public holiday and is handled automatically.
          </p>
        ) : selectedDate && selectedDate >= currentWorkDate ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Employees can only add past timesheets from the calendar.
          </p>
        ) : null}
        <div className="cw-timesheet-calendar">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="auto"
            firstDay={1}
            events={calendarEvents}
            dateClick={handleDateClick}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1">
        <button
          type="button"
          onClick={() => setActiveTab("timesheets")}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${
            activeTab === "timesheets"
              ? "bg-primary text-primary-foreground"
              : "text-foreground"
          }`}
        >
          <ClipboardCheck className="size-4" />
          Timesheets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${
            activeTab === "requests"
              ? "bg-primary text-primary-foreground"
              : "text-foreground"
          }`}
        >
          <FileQuestion className="size-4" />
          Requests
        </button>
      </div>

      {message && (
        <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
            messageOk
              ? "border-accent/30 bg-accent/10 text-foreground"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {message}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
          No time entries yet.
        </p>
      ) : activeTab === "timesheets" ? (
        <div className="grid gap-3">
          {editableEntries.length > 0 ? (
            <form action={submitAction} className="rounded-md border border-border bg-surface p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">Submit ready timesheets</p>
                  <p className="mt-1 text-xs text-muted">Tick the days you want to send.</p>
                </div>
                <button
                  disabled={submitPending}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Send className="size-4" />
                  {submitPending ? "Submitting..." : "Submit selected"}
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {editableEntries.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground"
                  >
                    <input
                      type="checkbox"
                      name="time_entry_ids"
                      value={entry.id}
                      className="size-4 accent-current"
                    />
                    <span>{formatDate(entry.work_date)}</span>
                    <span
                      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        entry.missing_clocking || entry.late_arrival || entry.early_departure
                          ? "bg-danger/10 text-danger"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {entry.missing_clocking || entry.late_arrival || entry.early_departure ? (
                        <AlertTriangle className="size-3.5" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      {entry.missing_clocking || entry.late_arrival || entry.early_departure
                        ? "Check"
                        : "Good"}
                    </span>
                  </label>
                ))}
              </div>
            </form>
          ) : null}

          <div className="grid gap-2">
            {shouldGroupWeeks
              ? weekGroups.map((group) => (
                  <details
                    key={group.key}
                    className="rounded-md border border-border bg-background"
                    open={group.key === weekGroups[0]?.key}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                      <span>{group.label}</span>
                      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                        {group.entries.length} records
                      </span>
                    </summary>
                    <div className="grid gap-2 border-t border-border p-2">
                      {group.entries.map(renderTimesheetEntry)}
                    </div>
                  </details>
                ))
              : entries.map(renderTimesheetEntry)}
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {submittedEntries.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
              Submit a timesheet first. Then requests will appear here.
            </p>
          ) : null}
          {submittedEntries.map((entry) => {
            const correction = latestRequestByEntry.get(entry.id);
            const hasSubmittedCorrection = correction?.status === "submitted";
            const canRequestCorrection = entry.work_date < currentWorkDate;

            return (
              <article
                key={entry.id}
                className="grid gap-3 rounded-md border border-border bg-background p-3 text-sm shadow-sm"
              >
                <div className="grid gap-2 lg:grid-cols-[130px_1fr_auto] lg:items-center">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <Edit3 className="size-4 text-accent" />
                      {formatDate(entry.work_date)}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      {entry.status}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">In</p>
                      <p className="font-semibold text-foreground">
                        {formatTime(entry.clock_in)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Lunch</p>
                      <p className="font-semibold text-foreground">
                        {formatTimeRange(entry.lunch_start, entry.lunch_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Out</p>
                      <p className="font-semibold text-foreground">
                        {formatTime(entry.clock_out)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Warnings</p>
                      <p className="font-semibold text-foreground">
                        {entry.missing_clocking || entry.late_arrival || entry.early_departure
                          ? "Needs review"
                          : "Clear"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-surface-muted px-3 py-2 text-right">
                    <p className="text-xs text-muted">Paid</p>
                    <p className="font-semibold text-foreground">
                      {formatHours(entry.paid_hours)}
                    </p>
                  </div>
                </div>

                {correction ? (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          Correction request
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Submitted {new Date(correction.submitted_at).toLocaleString("en-ZA")}
                        </p>
                      </div>
                      <span
                        className={`w-max rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(correction.status)}`}
                      >
                        {correction.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{correction.reason}</p>
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                      <span>In: {formatTime(correction.proposed_clock_in)}</span>
                      <span>Lunch start: {formatTime(correction.proposed_lunch_start)}</span>
                      <span>Lunch end: {formatTime(correction.proposed_lunch_end)}</span>
                      <span>Out: {formatTime(correction.proposed_clock_out)}</span>
                    </div>
                    {correction.review_notes ? (
                      <p className="mt-2 text-sm font-medium text-foreground">
                        Review note: {correction.review_notes}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {canRequestCorrection && !hasSubmittedCorrection ? (
                  <details className="rounded-md border border-border bg-surface">
                    <summary className="cursor-pointer px-3 py-2 font-semibold text-foreground">
                      Request correction
                    </summary>
                    <form action={correctionAction} className="grid gap-3 border-t border-border p-3">
                      <input type="hidden" name="time_entry_id" value={entry.id} />

                      <div className="grid gap-2 sm:grid-cols-4">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-muted">Clock in</span>
                          <input
                            type="time"
                            name="proposed_clock_in"
                            defaultValue={inputTime(entry.clock_in)}
                            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-muted">Lunch start</span>
                          <input
                            type="time"
                            name="proposed_lunch_start"
                            defaultValue={inputTime(entry.lunch_start)}
                            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-muted">Lunch end</span>
                          <input
                            type="time"
                            name="proposed_lunch_end"
                            defaultValue={inputTime(entry.lunch_end)}
                            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-muted">Clock out</span>
                          <input
                            type="time"
                            name="proposed_clock_out"
                            defaultValue={inputTime(entry.clock_out)}
                            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-muted">Reason</span>
                        <textarea
                          name="reason"
                          required
                          rows={3}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none ring-ring focus:ring-2"
                          placeholder="Explain what happened and why these times are correct."
                        />
                      </label>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted">
                          Submitted correction requests cannot be edited by employees.
                        </p>
                        <button
                          disabled={correctionPending}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          <Send className="size-4" />
                          {correctionPending ? "Sending..." : "Send request"}
                        </button>
                      </div>
                    </form>
                  </details>
                ) : hasSubmittedCorrection ? (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                    A submitted correction is locked for this record until management reviews it.
                  </p>
                ) : (
                  <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-muted">
                    Corrections become available after the work date has passed.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
