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
  const [annualLeaveCap, setAnnualLeaveCap] = useState(
    data.annualLeaveCapHours !== null && data.annualLeaveCapHours !== undefined
      ? String(data.annualLeaveCapHours)
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

  const [addCategory, setAddCategory] = useState("annual");
  const [addEntitlementDays, setAddEntitlementDays] = useState(15);

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
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  Add Leave Rule
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Define annual entitlement. The engine automatically calculates dynamic accrual based on shifts &amp; hours worked (1.75 days per 17 days worked).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Rule Name</span>
                  <input
                    name="name"
                    placeholder="e.g. Annual Leave"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Category</span>
                  <select
                    name="category"
                    value={addCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setAddCategory(cat);
                      if (cat === "annual") setAddEntitlementDays(15);
                      else if (cat === "sick") setAddEntitlementDays(10);
                      else if (cat === "family_responsibility") setAddEntitlementDays(3);
                    }}
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

              {/* Simple Entitlement in Days with 15, 17, 21 BCEA Standard Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Annual Entitlement (Days)</span>
                  <input
                    name="entitlement_days"
                    type="number"
                    min="1"
                    max="365"
                    step="0.5"
                    value={addEntitlementDays}
                    onChange={(e) => setAddEntitlementDays(Number(e.target.value) || 0)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none font-mono focus:border-primary"
                    placeholder="15, 17, or 21"
                    required
                  />
                  {addCategory === "annual" && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-muted font-bold">Standard Presets:</span>
                      {[15, 17, 21].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAddEntitlementDays(preset)}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black transition-all cursor-pointer ${
                            addEntitlementDays === preset
                              ? "bg-primary text-white shadow-2xs"
                              : "bg-surface-muted text-foreground hover:bg-border border border-border"
                          }`}
                        >
                          {preset} Days {preset === 15 ? "(BCEA Min)" : preset === 21 ? "(4 Weeks)" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                <div className="flex flex-col justify-end pb-1 text-xs text-muted">
                  <span className="font-semibold text-foreground">Accrual Rate &amp; BCEA Conformity:</span>
                  {addCategory === "annual" ? (
                    <span className="mt-0.5 leading-relaxed text-[11px]">
                      Employees accumulate <strong>1 day of leave every {(260 / Math.max(1, addEntitlementDays)).toFixed(1)} shifts worked</strong> ({(addEntitlementDays / 12).toFixed(2)}d/month on a 5-day week), protected by BCEA Section 20 statutory minimum floor of 1h per 17h worked.
                    </span>
                  ) : addCategory === "sick" ? (
                    <span className="mt-0.5 leading-relaxed text-[11px]">
                      Accrues 1 day per 26 days worked under BCEA Section 22, capped at {addEntitlementDays} days/yr ({addEntitlementDays * 8}h).
                    </span>
                  ) : addCategory === "family_responsibility" ? (
                    <span className="mt-0.5 leading-relaxed text-[11px]">
                      3 days (24h) statutory entitlement for employees employed &ge; 4 months with &ge; 16 shifts worked (BCEA Section 27).
                    </span>
                  ) : (
                    <span className="mt-0.5 leading-relaxed text-[11px]">
                      Leave movements tracked per approved requests.
                    </span>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-semibold text-foreground">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="is_paid" defaultChecked className="size-4 rounded border-border text-primary focus:ring-primary" />
                  Paid Leave
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="requires_attachment" className="size-4 rounded border-border text-primary focus:ring-primary" />
                  Requires Attachment / Proof
                </label>
              </div>

              <button
                disabled={leavePending}
                className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
              >
                {leavePending ? "Saving Leave Rule..." : "Add Leave Rule"}
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
            {/* Setting 1: Carry Over vs Use It or Lose It Policy */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <span className="text-xs font-bold text-foreground block mb-2">Leave Rollover Policy</span>
                <div className="grid gap-2.5">
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border/60 bg-surface p-2.5 hover:border-primary/50 transition-colors">
                    <input
                      type="radio"
                      name="policy_type"
                      value="carry_over"
                      checked={!useItOrLoseIt}
                      onChange={() => setUseItOrLoseIt(false)}
                      className="mt-0.5 size-4 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Carry Over Policy</span>
                      <span className="text-[11px] text-muted block leading-relaxed">
                        Unused leave balances roll over into the next annual leave cycle.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border/60 bg-surface p-2.5 hover:border-primary/50 transition-colors">
                    <input
                      type="radio"
                      name="policy_type"
                      value="use_it_or_lose_it"
                      checked={useItOrLoseIt}
                      onChange={() => setUseItOrLoseIt(true)}
                      className="mt-0.5 size-4 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">&quot;Use It or Lose It&quot; Policy</span>
                      <span className="text-[11px] text-muted block leading-relaxed">
                        Unused leave from the expired cycle is forfeited at annual cycle renewal. Current cycle leave accumulates with shifts worked.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="border-t border-border/60 pt-2 text-[11px] text-muted font-medium">
                {useItOrLoseIt ? (
                  <span className="text-amber-800 dark:text-amber-300 font-semibold">
                    ⚠ Unused leave from the prior cycle expires at cycle renewal. Current accrued balance remains intact and available to use.
                  </span>
                ) : (
                  <span className="text-emerald-800 dark:text-emerald-300 font-semibold">
                    ✓ Full leave balance carries forward into the subsequent year.
                  </span>
                )}
              </div>
            </div>

            {/* Setting 2: Carry-Over Cap */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-foreground">
                    Max Carry-Over Cap
                  </span>
                  <span className="rounded bg-slate-100 dark:bg-slate-800 border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted">
                    {carryCap ? `${carryCap} Hours` : "Unlimited"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Maximum hours an employee is allowed to carry over into the new leave cycle. Leave empty or 0 for unlimited carry-over.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Max Carry-Over Hours
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
                    {carryCap ? `(${ (Number(carryCap) / (data.standardDailyHours || 8)).toFixed(1) } days)` : "No Cap (All hours carry over)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Setting 3: Annual Leave Cap (Formalize 144h cap, once depleted accrues based on hours worked) */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-foreground">
                    Annual Leave Cap
                  </span>
                  <span className="rounded bg-emerald-100 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-[10px] font-mono font-bold">
                    {annualLeaveCap ? `${annualLeaveCap} Hours` : "Uncapped"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Maximum annual leave balance cap. When depleted (e.g. leave is taken), accrual continues dynamically based on hours worked up to this cap.
                </p>
              </div>

              <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-semibold text-muted">
                  Max Annual Balance (Hours)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    name="annual_leave_cap_hours"
                    value={annualLeaveCap}
                    onChange={(e) => setAnnualLeaveCap(e.target.value)}
                    min="0"
                    step="1"
                    placeholder="e.g. 144"
                    className="h-8 w-28 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-hidden font-mono font-bold"
                  />
                  <span className="text-xs text-muted">
                    {annualLeaveCap
                      ? `(${ (Number(annualLeaveCap) / (data.standardDailyHours || 8)).toFixed(1) } days cap)`
                      : "No Cap (Standard BCEA)"}
                  </span>
                </div>
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
            {/* Setting 1: Flexible Lunch & Optional Auto Return */}
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
                    <span>Optional Auto Lunch Return</span>
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      autoLunchEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {autoLunchEnabled ? "Active" : "Disabled (Flexible)"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Employees can take lunch anytime and for as long as they want, or work through lunch without automatic deductions. Enabling this setting automatically completes breaks after the scheduled duration.
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
