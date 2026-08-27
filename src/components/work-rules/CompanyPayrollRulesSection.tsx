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
  const [customCycleDays, setCustomCycleDays] = useState(14);
  const [startDayOfMonth, setStartDayOfMonth] = useState(1);
  const [endDayOfMonth, setEndDayOfMonth] = useState(31);
  const [startDayOfWeek, setStartDayOfWeek] = useState(1);
  const [payDayOffsetDays, setPayDayOffsetDays] = useState(3);
  const [description, setDescription] = useState("");

  // Assignment selection form
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [targetRuleId, setTargetRuleId] = useState("company-default");

  // Selected rule for preview tab
  const [previewRuleId, setPreviewRuleId] = useState<string>("company-default");

  const startEditRule = (rule: CustomPayrollRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setFrequency(rule.frequency);
    setStartDate(rule.startDate || rule.anchorDate || "2026-01-01");
    setEndDate(
      rule.endDate ||
        calculatePeriodEndDate(rule.startDate || rule.anchorDate || "2026-01-01", rule.frequency, {
          startDayOfMonth: rule.startDayOfMonth,
          endDayOfMonth: rule.endDayOfMonth,
          customCycleDays: rule.customCycleDays,
        }),
    );
    setCustomCycleDays(rule.customCycleDays ?? 14);
    setStartDayOfMonth(rule.startDayOfMonth ?? 1);
    setEndDayOfMonth(rule.endDayOfMonth ?? (rule.startDayOfMonth === 1 ? 31 : (rule.startDayOfMonth ?? 1) - 1));
    setStartDayOfWeek(rule.startDayOfWeek ?? 1);
    setPayDayOffsetDays(rule.payDayOffsetDays);
    setDescription(rule.description ?? "");
    setActiveSubTab("rules");
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setRuleName("");
    setFrequency("monthly");
    setStartDate("2026-01-01");
    setEndDate("2026-01-31");
    setCustomCycleDays(14);
    setStartDayOfMonth(1);
    setEndDayOfMonth(31);
    setStartDayOfWeek(1);
    setPayDayOffsetDays(3);
    setDescription("");
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
    <div className="grid gap-4 rounded-xl border-2 border-slate-300 bg-surface p-4 sm:p-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start border-b border-border/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="size-5 text-emerald-600" />
            <h3 className="text-base font-extrabold text-foreground">
              Payroll Period Rules &amp; Employee Assignments
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Configure standard or custom payroll cycles for your company, then assign specific employees to each payroll period rule.
          </p>
        </div>

        {/* Sub-tab switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("rules")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSubTab === "rules"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Coins className="size-3.5" />
            Payroll Rules ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("assignments")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSubTab === "assignments"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <UserCheck className="size-3.5" />
            Assign Employees ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("preview")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-extrabold transition-colors ${
              activeSubTab === "preview"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Calendar className="size-3.5" />
            Live Previews
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs font-bold ${
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
        <div className="grid gap-4 lg:grid-cols-12 min-w-0">
          {/* Creator / Editor Form */}
          <div className="lg:col-span-5 rounded-xl border border-border bg-background p-3.5 shadow-2xs">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground mb-3">
              <Plus className="size-3.5 text-accent" />
              {editingRuleId ? "Edit Payroll Period Rule" : "Create Custom Payroll Rule"}
            </h4>

            <form onSubmit={handleSaveRule} className="grid gap-2.5">
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Rule Name</span>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Executive Monthly (26th-25th), Contractor Bi-Weekly"
                  className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Cycle Frequency</span>
                <select
                  value={frequency}
                  onChange={(e) => {
                    const newFreq = e.target.value as PayrollFrequency;
                    setFrequency(newFreq);
                    const newEnd = calculatePeriodEndDate(startDate, newFreq, {
                      startDayOfMonth,
                      endDayOfMonth,
                      customCycleDays,
                    });
                    setEndDate(newEnd);
                  }}
                  className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
                >
                  <option value="monthly">Monthly (e.g. 26th to 25th, or 1st to Month-End)</option>
                  <option value="semi_monthly">Semi-Monthly (1st-15th &amp; 16th-End)</option>
                  <option value="bi_weekly">Bi-Weekly (14-Day Cycle)</option>
                  <option value="weekly">Weekly (7-Day Cycle)</option>
                  <option value="custom">Custom Duration (e.g. 10, 15, 21, 30 Days)</option>
                </select>
              </label>

              {/* Two Date Values: Start Date & End Date of Payroll Period Rule */}
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Period Start Date
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setStartDate(newStart);
                      const newEnd = calculatePeriodEndDate(newStart, frequency, {
                        startDayOfMonth,
                        endDayOfMonth,
                        customCycleDays,
                      });
                      setEndDate(newEnd);
                    }}
                    className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-bold text-foreground outline-none"
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
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-bold text-foreground outline-none"
                    required
                  />
                </label>
              </div>

              {/* Monthly Day of Month Presets & Inputs */}
              {frequency === "monthly" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Start Day of Month
                    </span>
                    <select
                      value={startDayOfMonth}
                      onChange={(e) => {
                        const sDay = Number(e.target.value);
                        setStartDayOfMonth(sDay);
                        const eDay = sDay === 1 ? 31 : sDay - 1;
                        setEndDayOfMonth(eDay);
                        const sStr = `2026-01-${String(sDay).padStart(2, "0")}`;
                        setStartDate(sStr);
                        setEndDate(calculatePeriodEndDate(sStr, "monthly", { startDayOfMonth: sDay, endDayOfMonth: eDay }));
                      }}
                      className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-bold text-foreground outline-none"
                    >
                      <option value={1}>1st of Month</option>
                      <option value={16}>16th of Month</option>
                      <option value={20}>20th of Month</option>
                      <option value={25}>25th of Month</option>
                      <option value={26}>26th of Month</option>
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Cutoff / End Day
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={endDayOfMonth}
                      onChange={(e) => setEndDayOfMonth(Number(e.target.value))}
                      className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-bold text-foreground outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Period Restart Informational Banner */}
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-2.5 text-[11px] text-emerald-950">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Cycle: {formatPeriodDate(startDate)} &rarr; {formatPeriodDate(endDate)}
                  </span>
                </p>
                <p className="mt-1 text-[10px] text-emerald-800">
                  When this period reaches its end date, the rule automatically restarts for the next cycle on the following day.
                </p>
              </div>

              {frequency === "custom" && (
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Cycle Length (Days)</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={customCycleDays}
                    onChange={(e) => setCustomCycleDays(Number(e.target.value))}
                    className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
                  />
                </label>
              )}

              {frequency === "weekly" && (
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Start Day of Week</span>
                  <select
                    value={startDayOfWeek}
                    onChange={(e) => setStartDayOfWeek(Number(e.target.value))}
                    className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
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

              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Disbursement Offset (Days after period end)
                </span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={payDayOffsetDays}
                  onChange={(e) => setPayDayOffsetDays(Number(e.target.value))}
                  className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Description / Notes</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional context e.g. Executive team payroll schedule"
                  className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground outline-none resize-none"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {editingRuleId ? "Update Rule" : "Create Payroll Rule"}
                </button>
              </div>
            </form>
          </div>

          {/* Configured Rules List */}
          <div className="lg:col-span-7 grid gap-2.5">
            <h4 className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-foreground">
              <span>Configured Payroll Rules ({rules.length})</span>
              <span className="text-[10px] font-bold text-muted">Active across company</span>
            </h4>

            {rules.map((rule) => {
              const assignedCount = employees.filter(
                (emp) => (employeeAssignments[emp.id] ?? "company-default") === rule.id,
              ).length;
              const isDefault = rule.id === "company-default";

              return (
                <div
                  key={rule.id}
                  className={`grid gap-2 rounded-xl border-2 p-3 shadow-2xs transition-all ${
                    isDefault
                      ? "border-emerald-500 bg-emerald-50/30"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-foreground truncate text-sm">{rule.name}</p>
                        {isDefault && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-muted mt-0.5">
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
                        className="rounded border border-border bg-slate-50 px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-100 shadow-2xs"
                        title="Preview generated periods"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditRule(rule)}
                        className="rounded border border-border bg-slate-50 px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-100 shadow-2xs"
                        title="Edit rule"
                      >
                        <Edit3 className="size-3 inline mr-1" />
                        Edit
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-extrabold text-rose-700 hover:bg-rose-100 shadow-2xs"
                          title="Delete custom rule"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rule Details Strip */}
                  <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1 text-center text-xs">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-1">
                      <span className="text-[8.5px] font-bold uppercase text-muted block truncate">Frequency</span>
                      <span className="font-extrabold text-foreground capitalize truncate block text-[11px]">
                        {rule.frequency.replace("_", " ")}
                        {rule.frequency === "custom" ? ` (${rule.customCycleDays}d)` : ""}
                      </span>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-1">
                      <span className="text-[8.5px] font-bold uppercase text-muted block truncate">Cycle Range</span>
                      <span className="font-extrabold text-foreground truncate block text-[11px]">
                        {rule.startDate && rule.endDate
                          ? `${formatPeriodDate(rule.startDate)} → ${formatPeriodDate(rule.endDate)}`
                          : rule.frequency === "monthly"
                            ? `Day ${rule.startDayOfMonth ?? 1} → ${rule.endDayOfMonth ?? 31}`
                            : rule.startDate || rule.anchorDate}
                      </span>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-1">
                      <span className="text-[8.5px] font-bold uppercase text-muted block truncate">Disbursement</span>
                      <span className="font-extrabold text-foreground truncate block text-[11px]">
                        +{rule.payDayOffsetDays} days
                      </span>
                    </div>

                    <div className="rounded-md border border-indigo-200 bg-indigo-50 p-1">
                      <span className="text-[8.5px] font-bold uppercase text-indigo-800 block truncate">Assigned</span>
                      <span className="font-black text-indigo-950 truncate block text-[11px]">
                        {assignedCount} employee{assignedCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-tab 2: Assign Employees to Payroll Periods */}
      {activeSubTab === "assignments" && (
        <div className="grid gap-4 min-w-0">
          {/* Quick Assignment Bar */}
          <form
            onSubmit={handleAssignEmployee}
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-300 bg-background p-3 shadow-2xs"
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span>Assign:</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="rounded-md border border-border bg-white px-2 py-1 text-xs font-bold text-foreground outline-none"
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

              <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span>To Rule:</span>
                <select
                  value={targetRuleId}
                  onChange={(e) => setTargetRuleId(e.target.value)}
                  className="rounded-md border border-border bg-white px-2 py-1 text-xs font-bold text-foreground outline-none"
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
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserCheck className="size-3.5" />
              Save Assignment
            </button>
          </form>

          {/* Search Filter */}
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employees..."
                className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1 text-xs font-bold text-foreground outline-none"
              />
            </div>
            <p className="text-xs font-bold text-muted">
              Showing {filteredEmployees.length} of {employees.length} employees
            </p>
          </div>

          {/* Employee Assignments List */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEmployees.map((emp) => {
              const assignedRuleId = employeeAssignments[emp.id] ?? "company-default";
              const assignedRule = rules.find((r) => r.id === assignedRuleId) ?? initialDefaultRule;

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-foreground truncate">{emp.label}</p>
                    <p className="text-[10px] font-medium text-muted truncate">
                      {emp.department || "Standard Staff"}
                    </p>
                  </div>

                  {/* Reassign Dropdown */}
                  <select
                    value={assignedRuleId}
                    onChange={(e) => handleQuickReassign(emp.id, e.target.value)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-extrabold outline-none shrink-0 ${
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
        <div className="grid gap-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted">Previewing Rule:</span>
              <select
                value={previewRuleId}
                onChange={(e) => setPreviewRuleId(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground outline-none"
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

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {generatedPeriods.map((period) => (
              <div
                key={period.id}
                className={`grid gap-1.5 rounded-xl border p-3 text-xs shadow-2xs ${
                  period.isCurrent
                    ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      period.isCurrent
                        ? "bg-emerald-600 text-white"
                        : period.isClosed
                          ? "bg-slate-200 text-slate-800"
                          : "bg-amber-100 text-amber-950"
                    }`}
                  >
                    {period.isCurrent ? "Current Period" : period.isClosed ? "Closed" : "Upcoming"}
                  </span>
                  <span className="text-[10px] font-bold text-muted">{period.frequency}</span>
                </div>

                <p className="font-extrabold text-foreground truncate text-sm mt-1">{period.label}</p>
                <p className="text-[11px] font-semibold text-slate-600">
                  {period.startDate} &rarr; {period.endDate}
                </p>

                <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] font-bold text-slate-700 flex justify-between">
                  <span>Pay Disbursement:</span>
                  <span className="font-black text-emerald-800">{period.payDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
