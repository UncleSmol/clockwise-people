"use client";

import {
  ChevronDown,
} from "lucide-react";
import { useState, useActionState, useTransition } from "react";
import {
  assignLeaveBalance,
  createLeaveType,
  createPublicHoliday,
  createWorkSchedule,
  provisionAllStandardLeaveTypesAction,
  updateAutoLunchClockoutPolicy,
  updateCompanyLeavePolicy,
  updateCompanyToilPolicy,
  updateLeaveType,
  updateWorkSchedule,
} from "@/lib/work-rules/actions";
import {
  leaveCategories,
  type CompanyWorkRulesData,
  type WorkSchedule,
} from "@/lib/work-rules/schema";
import CompanyPayrollRulesSection from "./CompanyPayrollRulesSection";
import AnalogTimePicker from "@/components/AnalogTimePicker";

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
  const [leavePolicyState, leavePolicyAction, leavePolicyPending] = useActionState(
    updateCompanyLeavePolicy,
    initialState,
  );
  const [toilState, toilAction, toilPending] = useActionState(
    updateCompanyToilPolicy,
    initialState,
  );

  const [toilEnabled, setToilEnabled] = useState(Boolean(data.toilEnabled));
  const [toilMultiplier, setToilMultiplier] = useState(
    data.toilMultiplier !== undefined && data.toilMultiplier !== null
      ? String(data.toilMultiplier)
      : "1.5",
  );

  const [useItOrLoseIt, setUseItOrLoseIt] = useState(Boolean(data.useItOrLoseItEnabled));
  const [carryCap, setCarryCap] = useState(
    data.carryOverCapHours !== null && data.carryOverCapHours !== undefined
      ? String(data.carryOverCapHours)
      : ""
  );
  const [lockBaselines, setLockBaselines] = useState(
    Boolean(data.lockImportedBaselines ?? true)
  );
  const [baselineDate, setBaselineDate] = useState(data.accrualBaselineDate || "");
  const [preventAdditive, setPreventAdditive] = useState(
    Boolean(data.preventAdditiveImportStacking ?? true)
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

  const [isPendingProvision, startProvisionTransition] = useTransition();
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);

  const handleProvisionAllLeaveTypes = () => {
    startProvisionTransition(async () => {
      const res = await provisionAllStandardLeaveTypesAction();
      setProvisionMessage(res.message);
    });
  };

  const message =
    scheduleState.message ||
    updateScheduleState.message ||
    leaveState.message ||
    updateLeaveState.message ||
    assignState.message ||
    holidayState.message ||
    lunchPolicyState.message ||
    leavePolicyState.message ||
    toilState.message;
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
              : lunchPolicyState.message
                ? lunchPolicyState.ok
                : leavePolicyState.ok;

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
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "all"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            All Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("work_schedules")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "work_schedules"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Work Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("leave_rules")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "leave_rules"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Leave Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("payroll_rules")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "payroll_rules"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Payroll Periods
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("holidays")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "holidays"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            Holidays
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("assignments")}
            className={`rounded-md px-2.5 py-1 font-extrabold transition-colors cursor-pointer ${
              activeSection === "assignments"
                ? "bg-primary text-primary-foreground shadow-2xs"
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
              ? Object.entries(data.payrollAssignments)
                  .filter(([empId]) => data.employees.some((e) => e.id === empId))
                  .map(([empId, rId]) => ({
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
            <form action={scheduleAction} className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <h3 className="font-bold text-foreground text-sm">
                Working hours
              </h3>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                <input
                  name="name"
                  placeholder="Office weekdays"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start</span>
                  <AnalogTimePicker
                    name="start_time"
                    placeholder="Start time"
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">End</span>
                  <AnalogTimePicker
                    name="end_time"
                    placeholder="End time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch (min)</span>
                  <input
                    name="lunch_minutes"
                    type="number"
                    min="0"
                    placeholder="30"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Paid hours</span>
                  <input
                    name="daily_hours"
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="8"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
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
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {schedulePending ? "Saving..." : "Add work rule"}
              </button>
            </form>
          )}

          {(activeSection === "all" || activeSection === "leave_rules") && (
            <form action={leaveAction} className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <h3 className="font-bold text-foreground text-sm">
                Configure Leave Rule Engine
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Rule Name</span>
                  <input
                    name="name"
                    placeholder="e.g. Statutory Annual Leave"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Category</span>
                  <select
                    name="category"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none capitalize focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {leaveCategories.map((category) => (
                      <option key={category} value={category}>
                        {labelize(category)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Entitlement & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Entitlement</span>
                  <input
                    name="entitlement_amount"
                    type="number"
                    min="0"
                    step="0.25"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-mono focus:border-primary"
                    placeholder="15"
                    defaultValue="15"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Entitlement Unit</span>
                  <select
                    name="entitlement_unit"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-semibold focus:border-primary"
                  >
                    <option value="days">Days (Schedule-Derived Hours)</option>
                    <option value="hours">Hours (Direct Entitlement)</option>
                  </select>
                </label>
              </div>

              {/* Accrual Method & Proration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Accrual Method</span>
                  <select
                    name="accrual_method"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-semibold focus:border-primary"
                  >
                    <option value="monthly">Method B: Monthly Accrual (1/12th per month)</option>
                    <option value="annual_upfront">Method A: Annual Upfront Entitlement</option>
                    <option value="service_prorated">Method C: Pro-Rata Based on Service Period</option>
                    <option value="hours_worked_divisor">Method D: Hours-Worked Divisor (Qualifying Hours / X)</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Proration Basis (Method C)</span>
                  <select
                    name="proration_mode"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="scheduled_working_hours">Scheduled Working Hours (Exact)</option>
                    <option value="scheduled_working_days">Scheduled Working Days</option>
                    <option value="calendar_days">Calendar Days</option>
                    <option value="completed_months">Completed Months</option>
                  </select>
                </label>
              </div>

              {/* Method D Divisor & Rounding */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Hours Divisor (Method D)</span>
                  <input
                    name="hours_divisor"
                    type="number"
                    min="1"
                    placeholder="e.g. 20 (1h per 20h worked)"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-mono focus:border-primary"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Rounding Precision</span>
                  <select
                    name="rounding_precision"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-mono focus:border-primary"
                  >
                    <option value="0.01">0.01 (Two Decimals)</option>
                    <option value="0.1">0.1 (One Decimal)</option>
                    <option value="0.25">0.25 (Quarter Unit)</option>
                    <option value="0.5">0.5 (Half Unit)</option>
                    <option value="1.0">1.0 (Whole Unit)</option>
                  </select>
                </label>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-semibold text-foreground">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="is_paid" defaultChecked className="size-4 rounded border-border text-primary focus:ring-primary" />
                  Paid Leave
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="requires_attachment" className="size-4 rounded border-border text-primary focus:ring-primary" />
                  Requires Attachment
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="use_it_or_lose_it" className="size-4 rounded border-border text-primary focus:ring-primary" />
                  &quot;Use It or Lose It&quot; Forfeiture
                </label>
              </div>

              <button
                disabled={leavePending}
                className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
              >
                {leavePending ? "Saving Leave Rule..." : "Save Configurable Leave Rule"}
              </button>
            </form>
          )}

          {(activeSection === "all" || activeSection === "assignments") && (
            <form action={assignAction} className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <h3 className="font-bold text-foreground text-sm">
                Assign balance
              </h3>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Employee</span>
                <select
                  name="employee_id"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Select employee</option>
                  {data.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Leave rule</span>
                <select
                  name="leave_type_id"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Select leave rule</option>
                  {data.leaveTypes.map((leaveType) => (
                    <option key={leaveType.id} value={leaveType.id}>
                      {leaveType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Balance (hours)</span>
                <input
                  name="balance_hours"
                  type="number"
                  min="0"
                  step="0.25"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="0"
                />
              </label>
              <button
                disabled={assignPending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {assignPending ? "Saving..." : "Assign"}
              </button>
            </form>
          )}

          {(activeSection === "all" || activeSection === "holidays") && (
            <form action={holidayAction} className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xs">
              <h3 className="font-bold text-foreground text-sm">
                Public holiday
              </h3>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                <input
                  name="name"
                  placeholder="Freedom Day"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Date</span>
                <input
                  name="holiday_date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" name="is_paid" defaultChecked className="size-4 rounded border-border text-primary focus:ring-primary" />
                Paid public holiday
              </label>
              <button
                disabled={holidayPending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {holidayPending ? "Saving..." : "Save holiday"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Leave Protection & Use-It-or-Lose-It Governance Card */}
      {(activeSection === "all" || activeSection === "leave_rules") && (
        <form
          action={leavePolicyAction}
          className="grid gap-4 rounded-xl border border-border/80 bg-surface p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                  Leave Safeguards &amp; &quot;Use It or Lose It&quot; Governance
                  <span className="inline-flex items-center text-[10px] font-semibold text-muted bg-surface-muted px-2 py-0.5 rounded-md border border-border">
                    Company Isolated
                  </span>
                </h3>
                <p className="text-xs text-muted">
                  Prevent accrual double-counting on balance imports, set forfeiture carry-over caps, and control leave rules.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleProvisionAllLeaveTypes}
                disabled={isPendingProvision}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3.5 text-xs font-semibold text-foreground shadow-2xs hover:bg-surface-muted disabled:opacity-60 transition-all cursor-pointer"
              >
                <span>{isPendingProvision ? "Provisioning..." : "Provision All App Leave Types & Balances"}</span>
              </button>

              <button
                type="submit"
                disabled={leavePolicyPending}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
              >
                <span>{leavePolicyPending ? "Saving Policy..." : "Save Leave Protection Settings"}</span>
              </button>
            </div>
          </div>

          {provisionMessage && (
            <p className="text-xs font-bold text-emerald-800 bg-emerald-500/15 p-2 rounded-lg border border-emerald-500/30">
              ✓ {provisionMessage}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Setting 1: Use It or Lose It Policy */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="use_it_or_lose_it_enabled"
                      checked={useItOrLoseIt}
                      onChange={(e) => setUseItOrLoseIt(e.target.checked)}
                      className="size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>&quot;Use It or Lose It&quot; Policy</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      useItOrLoseIt ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {useItOrLoseIt ? "Forfeiture ON" : "Rollover All"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  When enabled, accrued leave is forfeited at cycle end if not taken. Specify maximum carry-over hours allowed below.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Max Carry-Over Hours Cap (0 = Strict Forfeiture)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    name="carry_over_cap_hours"
                    value={carryCap}
                    onChange={(e) => setCarryCap(e.target.value)}
                    min="0"
                    step="0.5"
                    placeholder="e.g. 40"
                    className="h-8 w-28 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-hidden font-mono"
                  />
                  <span className="text-xs text-muted">
                    {carryCap ? `(${ (Number(carryCap) / (data.standardDailyHours || 8)).toFixed(1) } days)` : "No Cap"}
                  </span>
                </div>
              </div>
            </div>

            {/* Setting 2: Import Baseline Lock & Anti-Double-Counting */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="lock_imported_leave_baselines"
                      checked={lockBaselines}
                      onChange={(e) => setLockBaselines(e.target.checked)}
                      className="size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Lock Accruals to Import Baseline</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      lockBaselines ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {lockBaselines ? "Protected" : "Unlocked"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Prevents automated accruals from double-counting past work shifts prior to the imported balance date.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">Accrual Baseline Start Date</span>
                <input
                  type="date"
                  name="accrual_baseline_date"
                  value={baselineDate}
                  onChange={(e) => setBaselineDate(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-hidden"
                />
              </div>
            </div>

            {/* Setting 3: Direct Baseline Reset on Import */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="prevent_additive_import_stacking"
                      checked={preventAdditive}
                      onChange={(e) => setPreventAdditive(e.target.checked)}
                      className="size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Direct Baseline Reset on Import</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      preventAdditive ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {preventAdditive ? "Overwrite" : "Additive"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  When importing leave balances, replace existing balances with imported figures instead of adding on top.
                </p>
              </div>

              <div className="border-t border-border/60 pt-2.5 text-[11px] text-muted">
                <span>Isolates balance modifications strictly to this company.</span>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TOIL (Time Off In Lieu) Engine Card (Togglable setting on company setup, off by default) */}
      {(activeSection === "all" || activeSection === "leave_rules") && (
        <form
          action={toilAction}
          className="grid gap-4 rounded-xl border border-border/80 bg-surface p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 font-bold">
                ⚡
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2 flex-wrap">
                  <span>Time Off In Lieu (TOIL) Engine</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      toilEnabled
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {toilEnabled ? "Engine Enabled" : "Off by Default (Disabled)"}
                  </span>
                </h3>
                <p className="text-xs text-muted">
                  BCEA Section 10(3)(b) Overtime Compensation: Allow employees to convert approved overtime hours into banked TOIL leave.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={toilPending}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
            >
              <span>{toilPending ? "Saving..." : "Save TOIL Engine Settings"}</span>
            </button>
          </div>

          {toilState.message && (
            <p
              className={`text-xs font-bold p-2.5 rounded-lg border ${
                toilState.ok
                  ? "text-emerald-800 bg-emerald-500/15 border-emerald-500/30"
                  : "text-rose-800 bg-rose-500/15 border-rose-500/30"
              }`}
            >
              {toilState.ok ? "✓ " : "✕ "}
              {toilState.message}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Setting 1: Enable / Disable TOIL Engine Toggle */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="toil_enabled"
                      checked={toilEnabled}
                      onChange={(e) => setToilEnabled(e.target.checked)}
                      className="size-4 rounded border-border text-amber-600 focus:ring-amber-500"
                    />
                    <span>Enable TOIL Feature &amp; Calculations</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      toilEnabled ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {toilEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  When enabled, employees can convert overtime into TOIL leave, request time off against their TOIL bank, and view TOIL balances. When disabled (default), all TOIL options, cards, and conversion calculators are completely hidden across the entire application.
                </p>
              </div>

              <div className="border-t border-border/60 pt-2 text-[11px] text-muted font-medium">
                {toilEnabled
                  ? "✓ TOIL conversion forms, buttons, and leave type visible to staff"
                  : "🔒 All TOIL UI elements and database conversions locked & hidden"}
              </div>
            </div>

            {/* Setting 2: TOIL Accrual Multiplier */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-foreground">
                    TOIL Accrual Multiplier
                  </span>
                  <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700">
                    BCEA Standard: 1.5×
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Number of hours granted in lieu for every 1 hour of approved overtime. Under South African BCEA Section 10(3)(b), the standard rate is 1.5&times;.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Conversion Rate Multiplier
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    name="accrual_multiplier"
                    value={toilMultiplier}
                    onChange={(e) => setToilMultiplier(e.target.value)}
                    min="1"
                    max="3"
                    step="0.1"
                    placeholder="1.5"
                    disabled={!toilEnabled}
                    className="h-8 w-28 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-hidden font-mono disabled:opacity-50"
                  />
                  <span className="text-xs text-muted">
                    {toilMultiplier ? `(${Number(toilMultiplier).toFixed(2)}h TOIL per 1h Overtime)` : "1.5×"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Work Rule Clock-Out & Lunch Break Automation Card */}
      {(activeSection === "all" || activeSection === "work_schedules") && (
        <form
          action={lunchPolicyAction}
          className="grid gap-4 rounded-xl border border-border/80 bg-surface p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">
                Work Rule Automation &amp; Auto Clock-Out
              </h3>
              <p className="text-xs text-muted">
                Automate lunch break completion and shift clock-outs based on assigned work schedules.
              </p>
            </div>
            <button
              type="submit"
              disabled={lunchPolicyPending}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
            >
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
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-surface border border-border text-foreground hover:bg-surface-muted disabled:opacity-40"
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
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-foreground">
            <span>Work rules</span>
            <span className="text-muted">{data.schedules.length}</span>
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
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-foreground leading-tight">{schedule.name}</span>
                      </span>
                      <span className="shrink-0 text-muted">{Number(schedule.standard_daily_hours ?? 0).toFixed(2)}h</span>
                    </summary>
                    <form action={updateScheduleAction} className="grid gap-1.5 border-t border-border px-2 py-2">
                      <input type="hidden" name="work_schedule_id" value={schedule.id} />
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                        <input
                          name="name"
                          defaultValue={schedule.name}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start</span>
                          <AnalogTimePicker
                            name="start_time"
                            defaultValue={timeValue(firstWorkingDay(schedule)?.start_time)}
                            compact
                            className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 hover:border-primary/50"
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">End</span>
                          <AnalogTimePicker
                            name="end_time"
                            defaultValue={timeValue(firstWorkingDay(schedule)?.end_time)}
                            compact
                            className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 hover:border-primary/50"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lunch (min)</span>
                          <input
                            name="lunch_minutes"
                            type="number"
                            min="0"
                            defaultValue={String(firstWorkingDay(schedule)?.lunch_minutes ?? 0)}
                            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            placeholder="30"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Paid hours</span>
                          <input
                            name="daily_hours"
                            type="number"
                            min="0"
                            step="0.25"
                            defaultValue={String(schedule.standard_daily_hours ?? "")}
                            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            placeholder="8"
                          />
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
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 shadow-2xs transition-colors"
                      >
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
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-foreground">
            <span>Leave rules</span>
            <span className="text-muted">{data.leaveTypes.length}</span>
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
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-foreground leading-tight">{leaveType.name}</span>
                      </span>
                      <span className="shrink-0 text-xs capitalize text-muted">
                        {leaveType.is_paid ? "Paid" : "Unpaid"}
                      </span>
                    </summary>
                    <form action={updateLeaveAction} className="grid gap-1.5 border-t border-border px-2 py-2">
                      <input type="hidden" name="leave_type_id" value={leaveType.id} />
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
                        <input
                          name="name"
                          defaultValue={leaveType.name}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Category</span>
                        <select
                          name="category"
                          defaultValue={leaveType.category}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none capitalize focus:border-primary focus:ring-1 focus:ring-primary/20"
                        >
                          {leaveCategories.map((category) => (
                            <option key={category} value={category}>
                              {labelize(category)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Yearly hours</span>
                        <input
                          name="yearly_hours"
                          type="number"
                          min="0"
                          step="0.25"
                          defaultValue={String(leaveType.accrual_rules.yearly_hours ?? "")}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                          placeholder="160"
                        />
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
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 shadow-2xs transition-colors"
                      >
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
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-foreground">
            <span>Public holidays</span>
            <span className="text-muted">{data.publicHolidays.length}</span>
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
                    <span className="break-words font-semibold text-foreground leading-tight">{holiday.name}</span>
                    <span className="text-muted">
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
