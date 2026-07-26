"use client";

import { BriefcaseBusiness, Calendar, CalendarDays, ChevronDown, Clock, List, Plus, Save, Tag, Timer, User, UserCheck } from "lucide-react";
import { FaCalendarAlt, FaUmbrellaBeach, FaSun } from "react-icons/fa";
import { useActionState } from "react";
import {
  assignLeaveBalance,
  createLeaveType,
  createPublicHoliday,
  createWorkSchedule,
  updateLeaveType,
  updateWorkSchedule,
} from "@/lib/work-rules/actions";
import {
  leaveCategories,
  type CompanyWorkRulesData,
  type WorkSchedule,
} from "@/lib/work-rules/schema";

type CompanyWorkRulesPanelProps = {
  data: CompanyWorkRulesData;
};

const initialState = {
  ok: true,
  message: "",
};

const days = [
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
  ["0", "Sun"],
];

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function scheduleDay(schedule: WorkSchedule, day: number) {
  return schedule.schedule_days?.find((item) => item.day_of_week === day) ?? null;
}

function firstWorkingDay(schedule: WorkSchedule) {
  return schedule.schedule_days?.find((item) => item.is_working_day) ?? null;
}

function timeValue(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

export default function CompanyWorkRulesPanel({ data }: CompanyWorkRulesPanelProps) {
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    createWorkSchedule,
    initialState,
  );
  const [updateScheduleState, updateScheduleAction, updateSchedulePending] =
    useActionState(updateWorkSchedule, initialState);
  const [leaveState, leaveAction, leavePending] = useActionState(
    createLeaveType,
    initialState,
  );
  const [updateLeaveState, updateLeaveAction, updateLeavePending] = useActionState(
    updateLeaveType,
    initialState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignLeaveBalance,
    initialState,
  );
  const [holidayState, holidayAction, holidayPending] = useActionState(
    createPublicHoliday,
    initialState,
  );
  const message =
    scheduleState.message ||
    updateScheduleState.message ||
    leaveState.message ||
    updateLeaveState.message ||
    assignState.message ||
    holidayState.message;
  const messageOk = scheduleState.message
    ? scheduleState.ok
    : updateScheduleState.message
      ? updateScheduleState.ok
      : leaveState.message
        ? leaveState.ok
        : updateLeaveState.message
          ? updateLeaveState.ok
          : assignState.message
            ? assignState.ok
            : holidayState.ok;

  return (
    <section className="card grid gap-4 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Rules</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Work and leave rules
          </h2>
          <p className="mt-1 text-sm text-muted">
            Set working days, expected hours, and employee leave balances.
          </p>
        </div>
        <span className="w-max rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {data.schedules.length} work rules
        </span>
      </div>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            messageOk
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={scheduleAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarDays className="size-4 text-accent" />
            Working hours
          </h3>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Tag className="size-4 shrink-0 text-muted" />
              <input
                name="name"
                placeholder="Office weekdays"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Clock className="size-4 shrink-0 text-muted" />
                <input name="start_time" type="time" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
              </span>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">End</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Clock className="size-4 shrink-0 text-muted" />
                <input name="end_time" type="time" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch (min)</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Timer className="size-4 shrink-0 text-muted" />
                <input name="lunch_minutes" type="number" min="0" className="h-10 w-20 bg-transparent text-sm text-foreground outline-none" placeholder="30" />
              </span>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Paid hours</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Clock className="size-4 shrink-0 text-muted" />
                <input name="daily_hours" type="number" min="0" step="0.25" className="h-10 w-20 bg-transparent text-sm text-foreground outline-none" placeholder="8" />
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {days.map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold">
                <input
                  type="checkbox"
                  name="working_days"
                  value={value}
                  defaultChecked={Number(value) >= 1 && Number(value) <= 5}
                />
                {label}
              </label>
            ))}
          </div>
          <button
            disabled={schedulePending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {schedulePending ? "Saving..." : "Add work rule"}
          </button>
        </form>

        <form action={leaveAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <BriefcaseBusiness className="size-4 text-accent" />
            Leave rule
          </h3>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Tag className="size-4 shrink-0 text-muted" />
              <input
                name="name"
                placeholder="Annual leave"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Category</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <List className="size-4 shrink-0 text-muted" />
              <select name="category" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none capitalize">
                {leaveCategories.map((category) => (
                  <option key={category} value={category}>
                    {labelize(category)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Yearly hours</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Clock className="size-4 shrink-0 text-muted" />
              <input
                name="yearly_hours"
                type="number"
                min="0"
                step="0.25"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                placeholder="160"
              />
            </span>
          </label>
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_paid" defaultChecked />
              Paid leave
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requires_attachment" />
              Needs attachment
            </label>
          </div>
          <button
            disabled={leavePending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {leavePending ? "Saving..." : "Add leave rule"}
          </button>
        </form>

        <form action={assignAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <UserCheck className="size-4 text-accent" />
            Assign balance
          </h3>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Employee</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <User className="size-4 shrink-0 text-muted" />
              <select name="employee_id" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none">
                <option value="">Select employee</option>
                {data.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Leave rule</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <BriefcaseBusiness className="size-4 shrink-0 text-muted" />
              <select name="leave_type_id" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none">
                <option value="">Select leave rule</option>
                {data.leaveTypes.map((leaveType) => (
                  <option key={leaveType.id} value={leaveType.id}>
                    {leaveType.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Balance (hours)</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Clock className="size-4 shrink-0 text-muted" />
              <input
                name="balance_hours"
                type="number"
                min="0"
                step="0.25"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                placeholder="0"
              />
            </span>
          </label>
          <button
            disabled={assignPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {assignPending ? "Saving..." : "Assign"}
          </button>
        </form>

        <form action={holidayAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarDays className="size-4 text-accent" />
            Public holiday
          </h3>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Tag className="size-4 shrink-0 text-muted" />
              <input
                name="name"
                placeholder="Freedom Day"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Date</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Calendar className="size-4 shrink-0 text-muted" />
              <input
                name="holiday_date"
                type="date"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_paid" defaultChecked />
            Paid public holiday
          </label>
          <button
            disabled={holidayPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {holidayPending ? "Saving..." : "Save holiday"}
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
            <FaCalendarAlt className="size-3 sm:inline" />
            <span className="hidden sm:inline">Work rules</span>
            <span className="ml-auto text-muted">{data.schedules.length}</span>
          </p>
          {data.schedules.length === 0 ? (
            <p className="px-1 text-xs text-muted">No work rules yet.</p>
          ) : (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 text-xs font-semibold text-muted hover:text-foreground">
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                {data.schedules.length} work rule{data.schedules.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-1 grid gap-1">
                {data.schedules.map((schedule) => (
                  <details key={schedule.id} className="rounded-lg bg-surface text-xs">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FaCalendarAlt className="shrink-0 text-muted" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{schedule.name}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-muted">{Number(schedule.standard_daily_hours ?? 0).toFixed(2)}h</span>
                    </summary>
                    <form action={updateScheduleAction} className="grid gap-1.5 border-t border-border px-2 py-2">
                      <input type="hidden" name="work_schedule_id" value={schedule.id} />
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                        <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                          <Tag className="size-3.5 shrink-0 text-muted" />
                          <input
                            name="name"
                            defaultValue={schedule.name}
                            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                          />
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-3.5 shrink-0 text-muted" />
                            <input
                              name="start_time"
                              type="time"
                              defaultValue={timeValue(firstWorkingDay(schedule)?.start_time)}
                              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                            />
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">End</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-3.5 shrink-0 text-muted" />
                            <input
                              name="end_time"
                              type="time"
                              defaultValue={timeValue(firstWorkingDay(schedule)?.end_time)}
                              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                            />
                          </span>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch (min)</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Timer className="size-3.5 shrink-0 text-muted" />
                            <input
                              name="lunch_minutes"
                              type="number"
                              min="0"
                              defaultValue={String(firstWorkingDay(schedule)?.lunch_minutes ?? 0)}
                              className="h-8 w-16 bg-transparent text-xs text-foreground outline-none"
                              placeholder="30"
                            />
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Paid hours</span>
                          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                            <Clock className="size-3.5 shrink-0 text-muted" />
                            <input
                              name="daily_hours"
                              type="number"
                              min="0"
                              step="0.25"
                              defaultValue={String(schedule.standard_daily_hours ?? "")}
                              className="h-8 w-16 bg-transparent text-xs text-foreground outline-none"
                              placeholder="8"
                            />
                          </span>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {days.map(([value, label]) => (
                          <label key={value} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-0.5 text-xs font-semibold">
                            <input
                              type="checkbox"
                              name="working_days"
                              value={value}
                              defaultChecked={Boolean(scheduleDay(schedule, Number(value))?.is_working_day)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-foreground">
                        <input type="checkbox" name="is_active" defaultChecked />
                        Active
                      </label>
                      <button
                        disabled={updateSchedulePending}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        <Save className="size-3.5" />
                        {updateSchedulePending ? "Saving..." : "Save rule"}
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
            <FaUmbrellaBeach className="size-3 sm:inline" />
            <span className="hidden sm:inline">Leave rules</span>
            <span className="ml-auto text-muted">{data.leaveTypes.length}</span>
          </p>
          {data.leaveTypes.length === 0 ? (
            <p className="px-1 text-xs text-muted">No leave rules yet.</p>
          ) : (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 text-xs font-semibold text-muted hover:text-foreground">
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                {data.leaveTypes.length} leave rule{data.leaveTypes.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-1 grid gap-1">
                {data.leaveTypes.map((leaveType) => (
                  <details key={leaveType.id} className="rounded-lg bg-surface text-xs">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FaUmbrellaBeach className="shrink-0 text-muted" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{leaveType.name}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs capitalize text-muted">
                        {leaveType.is_paid ? "Paid" : "Unpaid"}
                      </span>
                    </summary>
                    <form action={updateLeaveAction} className="grid gap-1.5 border-t border-border px-2 py-2">
                      <input type="hidden" name="leave_type_id" value={leaveType.id} />
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                        <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                          <Tag className="size-3.5 shrink-0 text-muted" />
                          <input
                            name="name"
                            defaultValue={leaveType.name}
                            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                          />
                        </span>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Category</span>
                        <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                          <List className="size-3.5 shrink-0 text-muted" />
                          <select
                            name="category"
                            defaultValue={leaveType.category}
                            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none capitalize"
                          >
                            {leaveCategories.map((category) => (
                              <option key={category} value={category}>
                                {labelize(category)}
                              </option>
                            ))}
                          </select>
                        </span>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Yearly hours</span>
                        <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                          <Clock className="size-3.5 shrink-0 text-muted" />
                          <input
                            name="yearly_hours"
                            type="number"
                            min="0"
                            step="0.25"
                            defaultValue={String(leaveType.accrual_rules.yearly_hours ?? "")}
                            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                            placeholder="160"
                          />
                        </span>
                      </label>
                      <div className="grid gap-1 text-xs text-foreground">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" name="is_paid" defaultChecked={leaveType.is_paid} />
                          Paid leave
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            name="requires_attachment"
                            defaultChecked={leaveType.requires_attachment}
                          />
                          Needs attachment
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" name="is_active" defaultChecked />
                          Active
                        </label>
                      </div>
                      <button
                        disabled={updateLeavePending}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        <Save className="size-3.5" />
                        {updateLeavePending ? "Saving..." : "Save rule"}
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
            <FaSun className="size-3 sm:inline" />
            <span className="hidden sm:inline">Public holidays</span>
            <span className="ml-auto text-muted">{data.publicHolidays.length}</span>
          </p>
          {data.publicHolidays.length === 0 ? (
            <p className="px-1 text-xs text-muted">No public holidays saved yet.</p>
          ) : (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 text-xs font-semibold text-muted hover:text-foreground">
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                {data.publicHolidays.length} public holiday{data.publicHolidays.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-1 grid gap-1">
                {data.publicHolidays.map((holiday) => (
                  <div key={holiday.id} className="grid gap-0.5 rounded-lg bg-surface px-2 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      <FaSun className="shrink-0 text-muted" />
                      <span className="truncate font-semibold text-foreground">{holiday.name}</span>
                    </span>
                    <span className="ml-5 text-muted">
                      {holiday.holiday_date}{holiday.is_paid ? "" : " - Unpaid"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
