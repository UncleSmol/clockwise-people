"use client";

import {
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock,
  Coins,
  List,
  Plus,
  Save,
  Tag,
  Timer,
  User,
  UserCheck,
  Utensils,
} from "lucide-react";
import { FaCalendarAlt, FaUmbrellaBeach, FaSun } from "react-icons/fa";
import { useState, useActionState } from "react";
import {
  assignLeaveBalance,
  createLeaveType,
  createPublicHoliday,
  createWorkSchedule,
  updateAutoLunchClockoutPolicy,
  updateLeaveType,
  updateWorkSchedule,
} from "@/lib/work-rules/actions";
import {
  leaveCategories,
  type CompanyWorkRulesData,
  type WorkSchedule,
} from "@/lib/work-rules/schema";
import CompanyPayrollRulesSection from "./CompanyPayrollRulesSection";

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
  const [activeSection, setActiveSection] = useState<
    "all" | "work_schedules" | "leave_rules" | "payroll_rules" | "holidays" | "assignments"
  >("all");
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
  const [lunchPolicyState, lunchPolicyAction, lunchPolicyPending] = useActionState(
    updateAutoLunchClockoutPolicy,
    initialState,
  );
  const [autoLunchEnabled, setAutoLunchEnabled] = useState(
    Boolean(data.autoEndLunchOnLapse || data.autoClockoutAfterLunch),
  );
  const [lunchDuration, setLunchDuration] = useState(
    Number(data.defaultLunchMinutes ?? 60),
  );
  const [autoClockoutEnabled, setAutoClockoutEnabled] = useState(
    Boolean(data.autoClockoutBasedOnSchedule),
  );
  const [autoClockoutGrace, setAutoClockoutGrace] = useState(
    Number(data.autoClockoutGraceMinutes ?? 0),
  );

  const message =
    scheduleState.message ||
    updateScheduleState.message ||
    leaveState.message ||
    updateLeaveState.message ||
    assignState.message ||
    holidayState.message ||
    lunchPolicyState.message;
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
            : holidayState.message
              ? holidayState.ok
              : lunchPolicyState.ok;

  return (
    <section className="grid min-w-0 gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start border-b border-border/70 pb-3.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Company Governance</p>
          <h2 className="mt-1 text-xl font-extrabold text-foreground">
            Work, Leave &amp; Payroll Rules
          </h2>
          <p className="mt-1 text-xs text-muted">
            Configure working schedules, leave policies, custom payroll periods, and employee assignments in one place.
          </p>
        </div>

        {/* Section Navigation Pills */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveSection("all")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "all"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            All Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("work_schedules")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "work_schedules"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Work Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("leave_rules")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "leave_rules"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Leave Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("payroll_rules")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "payroll_rules"
                ? "bg-emerald-700 text-white shadow-2xs"
                : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
            }`}
          >
            <Coins className="size-3.5" />
            Payroll Periods
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("holidays")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "holidays"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Holidays
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("assignments")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSection === "assignments"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Assignments
          </button>
        </div>
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

      {/* Payroll Period Rules & Employee Assignments Section */}
      {(activeSection === "all" || activeSection === "payroll_rules") && (
        <CompanyPayrollRulesSection
          employees={data.employees}
          initialCustomRules={data.payrollRules}
          initialAssignments={
            data.payrollAssignments
              ? Object.entries(data.payrollAssignments).map(([empId, rId]) => ({
                  employeeId: empId,
                  employeeName: data.employees.find((e) => e.id === empId)?.label ?? empId,
                  ruleId: rId,
                  ruleName: (data.payrollRules ?? []).find((r) => r.id === rId)?.name ?? rId,
                }))
              : undefined
          }
          initialConfig={data.payrollConfig}
        />
      )}

      {(activeSection === "all" ||
        activeSection === "work_schedules" ||
        activeSection === "leave_rules" ||
        activeSection === "holidays" ||
        activeSection === "assignments") && (
        <div className="grid gap-4 sm:grid-cols-2 min-w-0">
          {(activeSection === "all" || activeSection === "work_schedules") && (
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
                    <input name="lunch_minutes" type="number" min="0" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" placeholder="30" />
                  </span>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Paid hours</span>
                  <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                    <Clock className="size-4 shrink-0 text-muted" />
                    <input name="daily_hours" type="number" min="0" step="0.25" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" placeholder="8" />
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
          )}

          {(activeSection === "all" || activeSection === "leave_rules") && (
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
          )}

          {(activeSection === "all" || activeSection === "assignments") && (
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
          )}

          {(activeSection === "all" || activeSection === "holidays") && (
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
          )}
        </div>
      )}

      {/* Work Rule Clock-Out & Lunch Break Automation Card */}
      {(activeSection === "all" || activeSection === "work_schedules") && (
        <form
          action={lunchPolicyAction}
          className="grid gap-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-primary/20 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
                <Timer className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-foreground tracking-tight">
                  Work Rule Automation &amp; Auto Clock-Out
                </h3>
                <p className="text-xs text-muted">
                  Automate lunch break completion and shift clock-outs based on assigned work schedules.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={lunchPolicyPending}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
            >
              <Save className="size-3.5" />
              <span>{lunchPolicyPending ? "Saving..." : "Save Automation Settings"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Setting 1: Auto Lunch Clock-Out / Lapse */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="auto_end_lunch_on_lapse"
                      checked={autoLunchEnabled}
                      onChange={(e) => setAutoLunchEnabled(e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Auto Lunch Clock-Out &amp; Return</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      autoLunchEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {autoLunchEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  When employees start lunch, their break automatically ends and returns them to clocked-in status after their scheduled lunch duration lapses.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Fallback Lunch Duration (Minutes)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    name="default_lunch_minutes"
                    min="5"
                    max="180"
                    step="5"
                    value={lunchDuration}
                    onChange={(e) => setLunchDuration(Number(e.target.value))}
                    disabled={!autoLunchEnabled}
                    className="h-9.5 min-h-[38px] w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground outline-none disabled:opacity-50 leading-normal"
                  />
                  <span className="text-xs text-muted">mins (uses work schedule lunch if set)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {[30, 45, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      disabled={!autoLunchEnabled}
                      onClick={() => setLunchDuration(mins)}
                      className={`rounded px-2 py-0.5 text-[10px] font-extrabold transition-all cursor-pointer ${
                        lunchDuration === mins
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "bg-surface border border-border text-foreground hover:bg-slate-100 disabled:opacity-40"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Setting 2: Auto Clock-Out Based on Work Rules */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="auto_clockout_based_on_schedule"
                      checked={autoClockoutEnabled}
                      onChange={(e) => setAutoClockoutEnabled(e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Auto Shift Clock-Out on Schedule End</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      autoClockoutEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {autoClockoutEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Automatically clocks out employees when their scheduled work end time from their assigned work schedule rule has passed.
                </p>
              </div>

              <div className="grid gap-1 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Grace Period (Minutes after schedule end)
                </span>
                <div className="flex items-center gap-2">
                  <select
                    name="auto_clockout_grace_minutes"
                    value={autoClockoutGrace}
                    onChange={(e) => setAutoClockoutGrace(Number(e.target.value))}
                    disabled={!autoClockoutEnabled}
                    className="h-9.5 min-h-[38px] rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground outline-none disabled:opacity-50 leading-normal"
                  >
                    <option value="0">0 mins (Exact shift end time)</option>
                    <option value="15">15 mins grace period</option>
                    <option value="30">30 mins grace period</option>
                    <option value="45">45 mins grace period</option>
                    <option value="60">60 mins grace period</option>
                    <option value="120">2 hours grace period</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(activeSection === "all" || activeSection === "work_schedules") && (
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
                              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
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
                              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
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
        )}

        {(activeSection === "all" || activeSection === "leave_rules") && (
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
        )}

        {(activeSection === "all" || activeSection === "holidays") && (
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
        )}
      </div>
    </section>
  );
}
