"use client";

import { BriefcaseBusiness, CalendarDays, Plus, UserCheck } from "lucide-react";
import { useActionState } from "react";
import {
  assignLeaveBalance,
  createLeaveType,
  createWorkSchedule,
} from "@/lib/work-rules/actions";
import {
  leaveCategories,
  type CompanyWorkRulesData,
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

export default function CompanyWorkRulesPanel({ data }: CompanyWorkRulesPanelProps) {
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    createWorkSchedule,
    initialState,
  );
  const [leaveState, leaveAction, leavePending] = useActionState(
    createLeaveType,
    initialState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignLeaveBalance,
    initialState,
  );
  const message = scheduleState.message || leaveState.message || assignState.message;
  const messageOk = scheduleState.message
    ? scheduleState.ok
    : leaveState.message
      ? leaveState.ok
      : assignState.ok;

  return (
    <section className="premium-card grid gap-4 rounded-md p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="premium-eyebrow">Rules</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Work and time off rules
          </h2>
          <p className="mt-1 text-sm text-muted">
            Set working days, expected hours, and employee time off balances.
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

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={scheduleAction} className="grid gap-3 rounded-md border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarDays className="size-4 text-accent" />
            Working hours
          </h3>
          <input
            name="name"
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
            placeholder="Office weekdays"
          />
          <div className="grid grid-cols-2 gap-2">
            <input name="start_time" type="time" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
            <input name="end_time" type="time" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input name="lunch_minutes" type="number" min="0" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" placeholder="Lunch min" />
            <input name="daily_hours" type="number" min="0" step="0.25" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" placeholder="Paid hours" />
          </div>
          <div className="flex flex-wrap gap-2">
            {days.map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold">
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {schedulePending ? "Saving..." : "Add work rule"}
          </button>
        </form>

        <form action={leaveAction} className="grid gap-3 rounded-md border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <BriefcaseBusiness className="size-4 text-accent" />
            Time off rule
          </h3>
          <input
            name="name"
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
            placeholder="Annual leave"
          />
          <select name="category" className="h-10 rounded-md border border-border bg-surface px-3 text-sm capitalize">
            {leaveCategories.map((category) => (
              <option key={category} value={category}>
                {labelize(category)}
              </option>
            ))}
          </select>
          <input
            name="yearly_hours"
            type="number"
            min="0"
            step="0.25"
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
            placeholder="Yearly hours"
          />
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {leavePending ? "Saving..." : "Add time off rule"}
          </button>
        </form>

        <form action={assignAction} className="grid gap-3 rounded-md border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <UserCheck className="size-4 text-accent" />
            Assign balance
          </h3>
          <select name="employee_id" className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
            <option value="">Employee</option>
            {data.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
          <select name="leave_type_id" className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
            <option value="">Time off rule</option>
            {data.leaveTypes.map((leaveType) => (
              <option key={leaveType.id} value={leaveType.id}>
                {leaveType.name}
              </option>
            ))}
          </select>
          <input
            name="balance_hours"
            type="number"
            min="0"
            step="0.25"
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
            placeholder="Available hours"
          />
          <button
            disabled={assignPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {assignPending ? "Saving..." : "Assign"}
          </button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Work rules</p>
          <div className="mt-2 grid gap-2">
            {data.schedules.length === 0 ? (
              <p className="text-sm text-muted">No work rules yet.</p>
            ) : (
              data.schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md bg-surface px-3 py-2 text-sm">
                  <p className="font-semibold text-foreground">{schedule.name}</p>
                  <p className="text-xs text-muted">
                    {Number(schedule.standard_daily_hours ?? 0).toFixed(2)} paid hours
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Time off rules</p>
          <div className="mt-2 grid gap-2">
            {data.leaveTypes.length === 0 ? (
              <p className="text-sm text-muted">No time off rules yet.</p>
            ) : (
              data.leaveTypes.map((leaveType) => (
                <div key={leaveType.id} className="rounded-md bg-surface px-3 py-2 text-sm">
                  <p className="font-semibold text-foreground">{leaveType.name}</p>
                  <p className="text-xs capitalize text-muted">
                    {labelize(leaveType.category)} - {leaveType.is_paid ? "Paid" : "Unpaid"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
