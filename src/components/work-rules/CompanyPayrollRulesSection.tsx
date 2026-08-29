"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Edit3,
  HelpCircle,
  ListFilter,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  calculatePeriodEndDate,
  defaultPayrollConfig,
  formatPeriodDate,
  generatePayrollPeriods,
  type CustomPayrollRule,
  type EmployeePayrollAssignment,
  type PayrollFrequency,
  type PayrollPeriodConfig,
} from "@/lib/reports/payroll-periods";

function addDaysToDateString(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calculateDiffDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = new Date(`${startStr}T00:00:00`).getTime();
  const end = new Date(`${endStr}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / (1000 * 3600 * 24)) + 1);
}

function generateSmartRuleDescription(params: {
  frequency: PayrollFrequency;
  startDate: string;
  endDate: string;
  cycleDays: number;
  disbursementDate: string;
  startDayOfMonth?: number;
  endDayOfMonth?: number;
}): string {
  const freqLabels: Record<PayrollFrequency, string> = {
    monthly: "Monthly payroll cycle",
    semi_monthly: "Semi-monthly payroll cycle (twice per month)",
    bi_weekly: "Bi-weekly 14-day payroll cycle",
    weekly: "Weekly 7-day payroll cycle",
    custom: `Custom ${params.cycleDays}-day payroll cycle`,
  };
  const freqText = freqLabels[params.frequency] || "Payroll cycle";
  const startFormatted = formatPeriodDate(params.startDate);
  const endFormatted = formatPeriodDate(params.endDate);
  const payFormatted = formatPeriodDate(params.disbursementDate);

  return `${freqText} running from ${startFormatted} to ${endFormatted} (${params.cycleDays} days), with salary disbursement on ${payFormatted}. The cycle automatically restarts on the following day.`;
}

type CompanyPayrollRulesSectionProps = {
  employees: Array<{ id: string; label: string; department?: string }>;
  initialConfig?: PayrollPeriodConfig;
  initialCustomRules?: CustomPayrollRule[];
  initialAssignments?: EmployeePayrollAssignment[];
};

const initialDefaultRule: CustomPayrollRule = {
  id: "company-default",
  name: "Company Default Monthly (1st - End)",
  frequency: "monthly",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  anchorDate: "2026-01-01",
  startDayOfMonth: 1,
  endDayOfMonth: 31,
  startDayOfWeek: 1,
  payDayOffsetDays: 3,
  description: "Standard monthly calendar payroll cycle running from 1st to month-end, restarting on the 1st of every month.",
  assignedEmployeeIds: [],
};

export default function CompanyPayrollRulesSection({
  employees,
  initialConfig,
  initialCustomRules,
  initialAssignments,
}: CompanyPayrollRulesSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [activeSubTab, setActiveSubTab] = useState<"rules" | "assignments" | "preview">("rules");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Stored Payroll Rules
  const [rules, setRules] = useState<CustomPayrollRule[]>(() => {
    if (initialCustomRules && initialCustomRules.length > 0) {
      return initialCustomRules;
    }
    return [
      initialDefaultRule,
      {
        id: "rule-biweekly-contractors",
        name: "Contractors Bi-Weekly (14-Day Cycle)",
        frequency: "bi_weekly",
        startDate: "2026-01-01",
        endDate: "2026-01-14",
        anchorDate: "2026-01-01",
        startDayOfWeek: 1,
        payDayOffsetDays: 2,
        description: "14-day rolling cycle running from start to end date, restarting automatically with the next 14-day period.",
        assignedEmployeeIds: [],
      },
    ];
  });

  // Employee Assignments Map: EmployeeId -> RuleId
  const [employeeAssignments, setEmployeeAssignments] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialAssignments) {
      for (const a of initialAssignments) {
        map[a.employeeId] = a.ruleId;
      }
    }
    return map;
  });

  // Form State for creating/editing a custom rule
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [frequency, setFrequency] = useState<PayrollFrequency>("monthly");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [customCycleDays, setCustomCycleDays] = useState(31);
  const [startDayOfMonth, setStartDayOfMonth] = useState(1);
  const [endDayOfMonth, setEndDayOfMonth] = useState(31);
  const [startDayOfWeek, setStartDayOfWeek] = useState(1);
  const [payDayOffsetDays, setPayDayOffsetDays] = useState(3);
  const [disbursementDate, setDisbursementDate] = useState("2026-02-03");
  const [isDescriptionCustomized, setIsDescriptionCustomized] = useState(false);
  const [description, setDescription] = useState(() =>
    generateSmartRuleDescription({
      frequency: "monthly",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      cycleDays: 31,
      disbursementDate: "2026-02-03",
      startDayOfMonth: 1,
      endDayOfMonth: 31,
    }),
  );

  // Live computed cycle length
  const cycleLengthDays = calculateDiffDays(startDate, endDate);

  // Smart updater for synced inputs
  const updateRuleFields = (updates: {
    freq?: PayrollFrequency;
    start?: string;
    end?: string;
    customDays?: number;
    sDayOfMonth?: number;
    eDayOfMonth?: number;
    sDayOfWeek?: number;
    disbDate?: string;
    offsetDays?: number;
  }) => {
    const nextFreq = updates.freq ?? frequency;
    const nextStart = updates.start ?? startDate;
    let nextEnd = updates.end ?? endDate;
    let nextCustomDays = updates.customDays ?? customCycleDays;
    const nextSDayOfMonth = updates.sDayOfMonth ?? startDayOfMonth;
    const nextEDayOfMonth = updates.eDayOfMonth ?? endDayOfMonth;
    const nextSDayOfWeek = updates.sDayOfWeek ?? startDayOfWeek;
    let nextOffset = updates.offsetDays ?? payDayOffsetDays;
    let nextDisbDate = updates.disbDate ?? disbursementDate;

    if (
      updates.freq !== undefined ||
      updates.start !== undefined ||
      updates.customDays !== undefined ||
      updates.sDayOfMonth !== undefined ||
      updates.eDayOfMonth !== undefined
    ) {
      if (nextFreq === "custom" && updates.customDays !== undefined) {
        nextEnd = addDaysToDateString(nextStart, nextCustomDays - 1);
      } else if (updates.end === undefined) {
        nextEnd = calculatePeriodEndDate(nextStart, nextFreq, {
          startDayOfMonth: nextSDayOfMonth,
          endDayOfMonth: nextEDayOfMonth,
          customCycleDays: nextCustomDays,
        });
      }
    }

    if (nextFreq === "custom" && updates.end !== undefined) {
      nextCustomDays = calculateDiffDays(nextStart, nextEnd);
    }

    // Recompute disbursement date or offset
    if (updates.disbDate !== undefined) {
      nextOffset = Math.max(
        0,
        Math.round(
          (new Date(`${updates.disbDate}T00:00:00`).getTime() - new Date(`${nextEnd}T00:00:00`).getTime()) /
            (1000 * 3600 * 24),
        ),
      );
    } else {
      nextDisbDate = addDaysToDateString(nextEnd, nextOffset);
    }

    const nextCycleDays = calculateDiffDays(nextStart, nextEnd);

    setFrequency(nextFreq);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setCustomCycleDays(nextCustomDays);
    setStartDayOfMonth(nextSDayOfMonth);
    setEndDayOfMonth(nextEDayOfMonth);
    setStartDayOfWeek(nextSDayOfWeek);
    setPayDayOffsetDays(nextOffset);
    setDisbursementDate(nextDisbDate);

    if (!isDescriptionCustomized) {
      setDescription(
        generateSmartRuleDescription({
          frequency: nextFreq,
          startDate: nextStart,
          endDate: nextEnd,
          cycleDays: nextCycleDays,
          disbursementDate: nextDisbDate,
          startDayOfMonth: nextSDayOfMonth,
          endDayOfMonth: nextEDayOfMonth,
        }),
      );
    }
  };

  // Assignment selection form
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [targetRuleId, setTargetRuleId] = useState("company-default");

  // Selected rule for preview tab
  const [previewRuleId, setPreviewRuleId] = useState<string>("company-default");

  const startEditRule = (rule: CustomPayrollRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    const start = rule.startDate || rule.anchorDate || "2026-01-01";
    const end =
      rule.endDate ||
      calculatePeriodEndDate(start, rule.frequency, {
        startDayOfMonth: rule.startDayOfMonth,
        endDayOfMonth: rule.endDayOfMonth,
        customCycleDays: rule.customCycleDays,
      });
    const offset = rule.payDayOffsetDays;
    const disb = addDaysToDateString(end, offset);
    const sDay = rule.startDayOfMonth ?? 1;
    const eDay = rule.endDayOfMonth ?? (rule.startDayOfMonth === 1 ? 31 : (rule.startDayOfMonth ?? 1) - 1);
    const customDays = rule.customCycleDays ?? calculateDiffDays(start, end);

    setFrequency(rule.frequency);
    setStartDate(start);
    setEndDate(end);
    setCustomCycleDays(customDays);
    setStartDayOfMonth(sDay);
    setEndDayOfMonth(eDay);
    setStartDayOfWeek(rule.startDayOfWeek ?? 1);
    setPayDayOffsetDays(offset);
    setDisbursementDate(disb);
    setDescription(
      rule.description ||
        generateSmartRuleDescription({
          frequency: rule.frequency,
          startDate: start,
          endDate: end,
          cycleDays: customDays,
          disbursementDate: disb,
          startDayOfMonth: sDay,
          endDayOfMonth: eDay,
        }),
    );
    setIsDescriptionCustomized(Boolean(rule.description));
    setActiveSubTab("rules");
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setRuleName("");
    const start = "2026-01-01";
    const end = "2026-01-31";
    const offset = 3;
    const disb = addDaysToDateString(end, offset);
    setFrequency("monthly");
    setStartDate(start);
    setEndDate(end);
    setCustomCycleDays(31);
    setStartDayOfMonth(1);
    setEndDayOfMonth(31);
    setStartDayOfWeek(1);
    setPayDayOffsetDays(offset);
    setDisbursementDate(disb);
    setIsDescriptionCustomized(false);
    setDescription(
      generateSmartRuleDescription({
        frequency: "monthly",
        startDate: start,
        endDate: end,
        cycleDays: 31,
        disbursementDate: disb,
        startDayOfMonth: 1,
        endDayOfMonth: 31,
      }),
    );
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      setStatusMessage({ text: "Please enter a payroll rule name.", ok: false });
      return;
    }

    startTransition(() => {
      if (editingRuleId) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === editingRuleId
              ? {
                  ...r,
                  name: ruleName.trim(),
                  frequency,
                  startDate,
                  endDate:
                    endDate ||
                    calculatePeriodEndDate(startDate, frequency, {
                      startDayOfMonth,
                      endDayOfMonth,
                      customCycleDays,
                    }),
                  anchorDate: startDate,
                  customCycleDays: frequency === "custom" ? customCycleDays : undefined,
                  startDayOfMonth: frequency === "monthly" ? startDayOfMonth : undefined,
                  endDayOfMonth: frequency === "monthly" ? endDayOfMonth : undefined,
                  startDayOfWeek:
                    frequency === "weekly" || frequency === "bi_weekly" ? startDayOfWeek : undefined,
                  payDayOffsetDays,
                  description: description.trim(),
                }
              : r,
          ),
        );
        setStatusMessage({ text: `Payroll rule "${ruleName}" updated successfully!`, ok: true });
      } else {
        const calculatedEnd =
          endDate ||
          calculatePeriodEndDate(startDate, frequency, {
            startDayOfMonth,
            endDayOfMonth,
            customCycleDays,
          });

        const newRule: CustomPayrollRule = {
          id: `custom-rule-${Date.now()}`,
          name: ruleName.trim(),
          frequency,
          startDate,
          endDate: calculatedEnd,
          anchorDate: startDate,
          customCycleDays: frequency === "custom" ? customCycleDays : undefined,
          startDayOfMonth: frequency === "monthly" ? startDayOfMonth : undefined,
          endDayOfMonth: frequency === "monthly" ? endDayOfMonth : undefined,
          startDayOfWeek:
            frequency === "weekly" || frequency === "bi_weekly" ? startDayOfWeek : undefined,
          payDayOffsetDays,
          description: description.trim(),
          assignedEmployeeIds: [],
        };
        setRules((prev) => [...prev, newRule]);
        setStatusMessage({ text: `Custom payroll rule "${ruleName}" created successfully!`, ok: true });
      }
      resetForm();
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (ruleId === "company-default") {
      setStatusMessage({ text: "Cannot delete the company default payroll rule.", ok: false });
      return;
    }
    startTransition(() => {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      // Reassign affected employees to company default
      setEmployeeAssignments((prev) => {
        const next = { ...prev };
        for (const [empId, rId] of Object.entries(next)) {
          if (rId === ruleId) {
            next[empId] = "company-default";
          }
        }
        return next;
      });
      setStatusMessage({ text: "Custom payroll rule removed.", ok: true });
    });
  };

  const handleAssignEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setStatusMessage({ text: "Please select an employee to assign.", ok: false });
      return;
    }

    startTransition(() => {
      if (selectedEmployeeId === "ALL_UNASSIGNED") {
        setEmployeeAssignments((prev) => {
          const next = { ...prev };
          for (const emp of employees) {
            if (!next[emp.id]) {
              next[emp.id] = targetRuleId;
            }
          }
          return next;
        });
        setStatusMessage({ text: "All unassigned employees assigned to payroll rule.", ok: true });
      } else {
        setEmployeeAssignments((prev) => ({
          ...prev,
          [selectedEmployeeId]: targetRuleId,
        }));
        const empName = employees.find((e) => e.id === selectedEmployeeId)?.label ?? "Employee";
        const ruleName = rules.find((r) => r.id === targetRuleId)?.name ?? "Payroll Rule";
        setStatusMessage({ text: `Assigned ${empName} to "${ruleName}".`, ok: true });
      }
      setSelectedEmployeeId("");
    });
  };

  const handleQuickReassign = (employeeId: string, ruleId: string) => {
    startTransition(() => {
      setEmployeeAssignments((prev) => ({
        ...prev,
        [employeeId]: ruleId,
      }));
      const empName = employees.find((e) => e.id === employeeId)?.label ?? "Employee";
      const rName = rules.find((r) => r.id === ruleId)?.name ?? "Payroll Rule";
      setStatusMessage({ text: `Updated ${empName} to "${rName}".`, ok: true });
    });
  };

  // Get active preview rule
  const currentPreviewRule = rules.find((r) => r.id === previewRuleId) ?? rules[0] ?? initialDefaultRule;
  const generatedPeriods = generatePayrollPeriods(
    {
      frequency: currentPreviewRule.frequency,
      anchorDate: currentPreviewRule.anchorDate,
      customCycleDays: currentPreviewRule.customCycleDays,
      startDayOfMonth: currentPreviewRule.startDayOfMonth,
      startDayOfWeek: currentPreviewRule.startDayOfWeek,
      payDayOffsetDays: currentPreviewRule.payDayOffsetDays,
      name: currentPreviewRule.name,
    },
    undefined,
    8,
  );

  const filteredEmployees = employees.filter((emp) =>
    emp.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="grid gap-5 rounded-2xl border border-border bg-background p-4 sm:p-6 shadow-xs">
      {/* Header & Sub-Tab Switcher */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shadow-2xs">
              <Coins className="size-4" />
            </span>
            <div>
              <h3 className="text-base font-black text-foreground tracking-tight">
                Payroll Period Rules &amp; Employee Assignments
              </h3>
              <p className="text-xs text-muted">
                Configure standard or custom payroll cycles, then assign specific employees to each payroll period rule.
              </p>
            </div>
          </div>
        </div>

        {/* Modern Segmented Sub-Tab Switcher */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("rules")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "rules"
                ? "bg-background text-foreground shadow-xs border border-border/80"
                : "text-muted hover:text-foreground hover:bg-background/50"
            }`}
          >
            <Coins className="size-3.5 text-emerald-600" />
            <span>Payroll Rules</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                activeSubTab === "rules"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-surface-muted text-muted"
              }`}
            >
              {rules.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("assignments")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "assignments"
                ? "bg-background text-foreground shadow-xs border border-border/80"
                : "text-muted hover:text-foreground hover:bg-background/50"
            }`}
          >
            <UserCheck className="size-3.5 text-blue-600" />
            <span>Assign Employees</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                activeSubTab === "assignments"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-surface-muted text-muted"
              }`}
            >
              {employees.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("preview")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "preview"
                ? "bg-background text-foreground shadow-xs border border-border/80"
                : "text-muted hover:text-foreground hover:bg-background/50"
            }`}
          >
            <Calendar className="size-3.5 text-purple-600" />
            <span>Live Previews</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider leading-none ${
                activeSubTab === "preview"
                  ? "bg-purple-100 text-purple-800"
                  : "bg-surface-muted text-muted"
              }`}
            >
              Live
            </span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${
            statusMessage.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          }`}
        >
          {statusMessage.ok ? (
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Sub-tab 1: Payroll Rules & Custom Creator */}
      {activeSubTab === "rules" && (
        <div className="grid gap-5 min-w-0">
          {/* Top Form: Creator / Editor Form Card */}
          <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-2xs">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground mb-3.5 pb-2.5 border-b border-border/60">
              <Plus className="size-3.5 text-accent" />
              {editingRuleId ? "Edit Payroll Period Rule" : "Create Custom Payroll Rule"}
            </h4>

            <form onSubmit={handleSaveRule} className="grid gap-3.5">
              {/* Row 1: Rule Name & Frequency */}
              <div className="grid sm:grid-cols-12 gap-3">
                <label className="sm:col-span-7 grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Rule Name</span>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. Executive Monthly (26th-25th), Contractor Bi-Weekly"
                    className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 shadow-2xs leading-normal"
                    required
                  />
                </label>

                <label className="sm:col-span-5 grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Cycle Frequency</span>
                  <select
                    value={frequency}
                    onChange={(e) => updateRuleFields({ freq: e.target.value as PayrollFrequency })}
                    className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 shadow-2xs cursor-pointer leading-normal"
                  >
                    <option value="monthly">Monthly (e.g. 26th to 25th, or 1st to Month-End)</option>
                    <option value="semi_monthly">Semi-Monthly (1st-15th &amp; 16th-End)</option>
                    <option value="bi_weekly">Bi-Weekly (14-Day Cycle)</option>
                    <option value="weekly">Weekly (7-Day Cycle)</option>
                    <option value="custom">Custom Duration (e.g. 10, 15, 21, 30 Days)</option>
                  </select>
                </label>
              </div>

              {/* Row 2: Period Dates & Cycle Duration & Disbursement */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {/* Date Pickers */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Period Start Date
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => updateRuleFields({ start: e.target.value })}
                      className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 shadow-2xs cursor-pointer leading-normal"
                      required
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Period End Date
                    </span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => updateRuleFields({ end: e.target.value })}
                      className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 shadow-2xs cursor-pointer leading-normal"
                      required
                    />
                  </label>
                </div>

                {/* Live Cycle Length Badge */}
                <div className="flex flex-col justify-between h-full min-h-[76px] rounded-xl border border-emerald-500/30 bg-emerald-50/40 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                      <Clock className="size-3.5 text-emerald-600 shrink-0" />
                      <span>Cycle Length:</span>
                    </div>
                    <span className="rounded-md bg-emerald-600 text-white px-2 py-0.5 font-black text-[11px] shadow-2xs">
                      {cycleLengthDays} Day{cycleLengthDays === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-900 mt-1">
                    <span className="text-emerald-800 font-semibold">
                      {Math.floor(cycleLengthDays / 7) > 0 ? `${Math.floor(cycleLengthDays / 7)}w ` : ""}
                      {cycleLengthDays % 7 > 0 ? `${cycleLengthDays % 7}d` : ""}
                    </span>
                    <span>
                      {formatPeriodDate(startDate)} &rarr; {formatPeriodDate(endDate)}
                    </span>
                  </div>
                </div>

                {/* Seamless Pay Disbursement Date Picker & Presets */}
                <div className="grid gap-1.5 rounded-xl border border-border bg-surface/40 p-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
                      <Coins className="size-3 text-emerald-600" />
                      Pay Disbursement Date
                    </span>
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      {payDayOffsetDays === 0 ? "Same day" : `+${payDayOffsetDays}d`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={disbursementDate}
                      onChange={(e) => updateRuleFields({ disbDate: e.target.value })}
                      className="h-10 min-h-[40px] flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 shadow-2xs cursor-pointer leading-normal"
                      required
                    />
                    <span className="text-[10px] font-bold text-muted truncate">
                      {formatPeriodDate(disbursementDate)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/50">
                    {[
                      { label: "0d", days: 0 },
                      { label: "+1d", days: 1 },
                      { label: "+2d", days: 2 },
                      { label: "+3d", days: 3 },
                      { label: "+5d", days: 5 },
                      { label: "+7d", days: 7 },
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => updateRuleFields({ offsetDays: preset.days })}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold transition-all cursor-pointer ${
                          payDayOffsetDays === preset.days
                            ? "bg-slate-900 text-white shadow-2xs"
                            : "bg-background border border-border text-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Frequency Specific Helpers (Monthly presets or Custom duration) */}
              {frequency === "custom" && (
                <div className="grid gap-1.5 rounded-xl border border-border bg-surface/50 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Custom Cycle Length (Days)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={customCycleDays}
                      onChange={(e) => updateRuleFields({ customDays: Number(e.target.value) })}
                      className="h-8.5 w-20 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground outline-none text-right leading-normal"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/40">
                    <span className="text-[9px] font-bold text-muted mr-1">Presets:</span>
                    {[7, 10, 14, 15, 21, 28, 30, 60].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => updateRuleFields({ customDays: days })}
                        className={`rounded px-2 py-0.5 text-[10px] font-extrabold transition-all cursor-pointer ${
                          customCycleDays === days
                            ? "bg-slate-900 text-white shadow-2xs"
                            : "bg-background border border-border text-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {frequency === "monthly" && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Start Day of Month Preset
                    </span>
                    <select
                      value={startDayOfMonth}
                      onChange={(e) => {
                        const sDay = Number(e.target.value);
                        const eDay = sDay === 1 ? 31 : sDay - 1;
                        const sStr = `2026-01-${String(sDay).padStart(2, "0")}`;
                        updateRuleFields({ sDayOfMonth: sDay, eDayOfMonth: eDay, start: sStr });
                      }}
                      className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none cursor-pointer leading-normal"
                    >
                      <option value={1}>1st of Month (1st &rarr; 31st)</option>
                      <option value={16}>16th of Month (16th &rarr; 15th)</option>
                      <option value={20}>20th of Month (20th &rarr; 19th)</option>
                      <option value={25}>25th of Month (25th &rarr; 24th)</option>
                      <option value={26}>26th of Month (26th &rarr; 25th)</option>
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Cutoff / End Day of Month
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={endDayOfMonth}
                      onChange={(e) => updateRuleFields({ eDayOfMonth: Number(e.target.value) })}
                      className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none leading-normal"
                    />
                  </label>
                </div>
              )}

              {frequency === "weekly" && (
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Start Day of Week</span>
                  <select
                    value={startDayOfWeek}
                    onChange={(e) => updateRuleFields({ sDayOfWeek: Number(e.target.value) })}
                    className="h-10 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none cursor-pointer leading-normal"
                  >
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </label>
              )}

              {/* Row 4: Description / Notes & Save */}
              <div className="grid gap-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Description / Schedule Summary
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDescriptionCustomized(false);
                      setDescription(
                        generateSmartRuleDescription({
                          frequency,
                          startDate,
                          endDate,
                          cycleDays: cycleLengthDays,
                          disbursementDate,
                          startDayOfMonth,
                          endDayOfMonth,
                        }),
                      );
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                    title="Reset to smart auto-generated summary"
                  >
                    <Sparkles className="size-3 text-emerald-600" />
                    Auto-Generate
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setIsDescriptionCustomized(true);
                  }}
                  placeholder="Summary of this payroll period schedule..."
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground outline-none resize-none focus:border-emerald-600 shadow-2xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-muted hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Save className="size-3.5" />
                  {editingRuleId ? "Update Rule" : "Create Payroll Rule"}
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Container: Configured Payroll Rules (Filling space in a compact responsive grid) */}
          <div className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 shadow-2xs grid gap-3.5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground">
                <Coins className="size-3.5 text-emerald-600" />
                <span>Configured Payroll Rules ({rules.length})</span>
              </h4>
              <span className="text-[10px] font-bold text-muted bg-background px-2.5 py-0.5 rounded-md border border-border shadow-2xs">
                Active across company
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rules.map((rule) => {
                const assignedCount = employees.filter(
                  (emp) => (employeeAssignments[emp.id] ?? "company-default") === rule.id,
                ).length;
                const isDefault = rule.id === "company-default";

                return (
                  <div
                    key={rule.id}
                    className={`grid gap-2.5 rounded-xl border p-3.5 shadow-2xs transition-all ${
                      isDefault
                        ? "border-emerald-500/40 bg-emerald-50/25"
                        : "border-border bg-surface/40 hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-extrabold text-foreground truncate text-sm">{rule.name}</p>
                          {isDefault && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-2xs">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-muted mt-0.5 line-clamp-2">
                          {rule.description || "Configured company payroll schedule"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewRuleId(rule.id);
                            setActiveSubTab("preview");
                          }}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-bold text-foreground hover:bg-surface-muted transition-all cursor-pointer shadow-2xs"
                          title="Preview generated periods"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditRule(rule)}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-bold text-foreground hover:bg-surface-muted transition-all cursor-pointer shadow-2xs"
                          title="Edit rule"
                        >
                          <Edit3 className="size-3 inline mr-0.5 text-muted" />
                          Edit
                        </button>
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition-all cursor-pointer shadow-2xs"
                            title="Delete custom rule"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Rule Details Strip */}
                    <div className="grid grid-cols-2 gap-1.5 text-center text-xs">
                      <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                        <span className="text-[9px] font-bold uppercase text-muted block truncate">Frequency</span>
                        <span className="font-extrabold text-foreground capitalize truncate block text-xs mt-0.5">
                          {rule.frequency.replace("_", " ")}
                          {rule.frequency === "custom" ? ` (${rule.customCycleDays}d)` : ""}
                        </span>
                      </div>

                      <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                        <span className="text-[9px] font-bold uppercase text-muted block truncate">Cycle Range</span>
                        <span className="font-extrabold text-foreground truncate block text-xs mt-0.5">
                          {rule.startDate && rule.endDate
                            ? `${formatPeriodDate(rule.startDate)} → ${formatPeriodDate(rule.endDate)}`
                            : rule.frequency === "monthly"
                              ? `Day ${rule.startDayOfMonth ?? 1} → ${rule.endDayOfMonth ?? 31}`
                              : rule.startDate || rule.anchorDate}
                        </span>
                      </div>

                      <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                        <span className="text-[9px] font-bold uppercase text-muted block truncate">Disbursement</span>
                        <span className="font-extrabold text-foreground truncate block text-xs mt-0.5">
                          +{rule.payDayOffsetDays} days
                        </span>
                      </div>

                      <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/70 p-1.5">
                        <span className="text-[9px] font-bold uppercase text-indigo-800 block truncate">Assigned</span>
                        <span className="font-black text-indigo-950 truncate block text-xs mt-0.5">
                          {assignedCount} employee{assignedCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Assign Employees to Payroll Periods */}
      {activeSubTab === "assignments" && (
        <div className="grid gap-4 min-w-0">
          {/* Quick Assignment Bar */}
          <form
            onSubmit={handleAssignEmployee}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-3.5 shadow-2xs"
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
              <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                <span className="text-muted font-medium">Assign:</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="h-10 min-h-[40px] rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none shadow-2xs leading-normal"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  <option value="ALL_UNASSIGNED">All Unassigned Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                <span className="text-muted font-medium">To Rule:</span>
                <select
                  value={targetRuleId}
                  onChange={(e) => setTargetRuleId(e.target.value)}
                  className="h-10 min-h-[40px] rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none shadow-2xs leading-normal"
                >
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              <UserCheck className="size-3.5" />
              <span>Save Assignment</span>
            </button>
          </form>

          {/* Search Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employees..."
                className="h-10 min-h-[40px] w-full rounded-lg border border-border bg-surface pl-10 pr-3 py-2 text-xs font-bold text-foreground outline-none focus:border-emerald-600 leading-normal"
              />
            </div>
            <p className="text-xs font-bold text-muted">
              Showing {filteredEmployees.length} of {employees.length} employees
            </p>
          </div>

          {/* Employee Assignments List */}
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEmployees.map((emp) => {
              const assignedRuleId = employeeAssignments[emp.id] ?? "company-default";
              const assignedRule = rules.find((r) => r.id === assignedRuleId) ?? initialDefaultRule;

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/40 hover:bg-surface p-3 shadow-2xs text-xs transition-all"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-foreground truncate">{emp.label}</p>
                    <p className="text-[10px] font-medium text-muted truncate mt-0.5">
                      {emp.department || "Standard Staff"}
                    </p>
                  </div>

                  {/* Reassign Dropdown */}
                  <select
                    value={assignedRuleId}
                    onChange={(e) => handleQuickReassign(emp.id, e.target.value)}
                    className={`h-9 min-h-[36px] rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold outline-none shrink-0 shadow-2xs cursor-pointer leading-normal ${
                      assignedRuleId === "company-default"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                        : "border-indigo-300 bg-indigo-50 text-indigo-950"
                    }`}
                  >
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-tab 3: Live Payroll Period Previews */}
      {activeSubTab === "preview" && (
        <div className="grid gap-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted">Previewing Rule:</span>
              <select
                value={previewRuleId}
                onChange={(e) => setPreviewRuleId(e.target.value)}
                className="h-10 min-h-[40px] rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none shadow-2xs cursor-pointer leading-normal"
              >
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.frequency})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted">
              Auto-generated periods for auditing and payroll disbursement scheduling.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {generatedPeriods.map((period) => (
              <div
                key={period.id}
                className={`grid gap-2 rounded-xl border p-3.5 text-xs shadow-2xs transition-all ${
                  period.isCurrent
                    ? "border-emerald-500/50 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                    : "border-border bg-surface/40 hover:bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      period.isCurrent
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : period.isClosed
                          ? "bg-surface-muted text-muted"
                          : "bg-amber-100 text-amber-950"
                    }`}
                  >
                    {period.isCurrent ? "Current Period" : period.isClosed ? "Closed" : "Upcoming"}
                  </span>
                  <span className="text-[10px] font-bold text-muted capitalize">{period.frequency}</span>
                </div>

                <div>
                  <p className="font-extrabold text-foreground truncate text-sm">{period.label}</p>
                  <p className="text-[11px] font-semibold text-muted mt-0.5">
                    {period.startDate} &rarr; {period.endDate}
                  </p>
                </div>

                <div className="mt-1 border-t border-border/60 pt-2 text-[10px] font-bold flex items-center justify-between">
                  <span className="text-muted">Pay Disbursement:</span>
                  <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {period.payDate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
