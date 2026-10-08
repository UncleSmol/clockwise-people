"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  Printer,
  Edit3,
  Lock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  DollarSign,
  Search,
  FileText,
  Filter,
  Sparkles,
  Users,
  Building2,
  ChevronDown,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { CompanyTimesheetCalendarEntry } from "@/lib/time-tracking/schema";
import type { EmployeeRecord } from "@/lib/employees/schema";
import type {
  PayslipRecordData,
  CompanyPayslipContext,
} from "@/lib/payroll/payslip-types";
import {
  simulateEmployeePayslip,
  formatRand,
  formatPlainCurrency,
  type PeriodContext,
} from "@/lib/payroll/payslip-engine";
import {
  getSavedCompanyPayslipsAction,
} from "@/lib/payroll/payslip-actions";
import {
  generatePayrollPeriods,
  formatPeriodDate,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";
import PayslipPrintDocument from "./PayslipPrintDocument";
import PayslipAdjustmentModal from "./PayslipAdjustmentModal";

type CompanyPayslipsWorkspaceProps = {
  company: CompanyPayslipContext;
  employees: EmployeeRecord[];
  timesheetEntries: CompanyTimesheetCalendarEntry[];
  payrollConfig?: PayrollPeriodConfig;
  isSuperAdmin: boolean;
  onNavigateToApprovals?: () => void;
};

type FilterStatus = "all" | "approved" | "locked" | "adjusted";

export default function CompanyPayslipsWorkspace({
  company,
  employees,
  timesheetEntries,
  payrollConfig = defaultPayrollConfig,
  isSuperAdmin,
  onNavigateToApprovals,
}: CompanyPayslipsWorkspaceProps) {
  // If not super admin, strictly gate access
  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center">
        <ShieldAlert className="mx-auto size-12 text-rose-600 mb-3" />
        <h3 className="text-lg font-bold text-slate-900">Super Admin Access Required</h3>
        <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
          Payslip simulation, interactive adjustments, and compliance printing are restricted to authorized Super Administrators only.
        </p>
      </div>
    );
  }

  // 1. Periods Generation
  const availablePeriods = useMemo(() => {
    return generatePayrollPeriods(payrollConfig);
  }, [payrollConfig]);

  const defaultPeriod = useMemo(() => {
    return (
      availablePeriods.find((p) => p.isCurrent) ||
      availablePeriods[0] || {
        id: "default-period",
        label: "Current Month",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        payDate: "2026-08-31",
        isCurrent: true,
        isClosed: false,
        frequency: "monthly" as const,
      }
    );
  }, [availablePeriods]);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(defaultPeriod.id);
  const activePeriod = useMemo(() => {
    return availablePeriods.find((p) => p.id === selectedPeriodId) || defaultPeriod;
  }, [availablePeriods, selectedPeriodId, defaultPeriod]);

  // 2. Saved Adjustments from DB for Active Period
  const [savedAdjustmentsMap, setSavedAdjustmentsMap] = useState<Record<string, PayslipRecordData>>({});
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Active modals
  const [selectedPayslipForPrint, setSelectedPayslipForPrint] = useState<PayslipRecordData | null>(null);
  const [selectedPayslipForAdjust, setSelectedPayslipForAdjust] = useState<PayslipRecordData | null>(null);
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // Load adjustments when period changes
  useEffect(() => {
    let isCancelled = false;
    async function loadAdjustments() {
      if (!company?.id || !activePeriod?.startDate || !activePeriod?.endDate) return;
      setIsLoadingAdjustments(true);
      try {
        const saved = await getSavedCompanyPayslipsAction(
          company.id,
          activePeriod.startDate,
          activePeriod.endDate,
        );
        if (!isCancelled) {
          const map: Record<string, PayslipRecordData> = {};
          for (const item of saved) {
            map[item.employeeId] = item;
          }
          setSavedAdjustmentsMap(map);
        }
      } catch (err) {
        console.error("Failed to load saved payslips:", err);
      } finally {
        if (!isCancelled) {
          setIsLoadingAdjustments(false);
        }
      }
    }

    loadAdjustments();
    return () => {
      isCancelled = true;
    };
  }, [company?.id, activePeriod?.startDate, activePeriod?.endDate]);

  // 3. Simulate Payslips for All Active Employees
  const periodContext: PeriodContext = useMemo(() => {
    return {
      id: activePeriod.id,
      label: activePeriod.label,
      startDate: activePeriod.startDate,
      endDate: activePeriod.endDate,
      payDate: activePeriod.payDate || activePeriod.endDate,
      frequency: activePeriod.frequency || "monthly",
    };
  }, [activePeriod]);

  const simulatedPayslips = useMemo(() => {
    return employees.map((employee) => {
      const saved = savedAdjustmentsMap[employee.id] || null;
      return simulateEmployeePayslip({
        employee,
        company,
        period: periodContext,
        timesheets: timesheetEntries,
        savedAdjustment: saved,
      });
    });
  }, [employees, company, periodContext, timesheetEntries, savedAdjustmentsMap]);

  // 4. Summaries & KPIs
  const stats = useMemo(() => {
    let approvedCount = 0;
    let lockedCount = 0;
    let adjustedCount = 0;
    let totalGrossApproved = 0;
    let totalDeductionsApproved = 0;
    let totalNetApproved = 0;

    for (const payslip of simulatedPayslips) {
      if (payslip.isApprovedForSimulation) {
        approvedCount++;
        totalGrossApproved += payslip.grossEarnings;
        totalDeductionsApproved += payslip.totalDeductions;
        totalNetApproved += payslip.netPay;
      } else {
        lockedCount++;
      }
      if (payslip.isAdjusted) {
        adjustedCount++;
      }
    }

    return {
      totalEmployees: simulatedPayslips.length,
      approvedCount,
      lockedCount,
      adjustedCount,
      totalGrossApproved,
      totalDeductionsApproved,
      totalNetApproved,
    };
  }, [simulatedPayslips]);

  // 5. Filter & Search List
  const filteredPayslips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return simulatedPayslips.filter((item) => {
      // Status filter
      if (filterStatus === "approved" && !item.isApprovedForSimulation) return false;
      if (filterStatus === "locked" && item.isApprovedForSimulation) return false;
      if (filterStatus === "adjusted" && !item.isAdjusted) return false;

      // Search filter
      if (q) {
        const matchesName = item.fullName.toLowerCase().includes(q);
        const matchesKnownAs = item.knownAs ? item.knownAs.toLowerCase().includes(q) : false;
        const matchesNumber = item.employeeNumber.toLowerCase().includes(q);
        const matchesDept = item.department ? item.department.toLowerCase().includes(q) : false;
        return matchesName || matchesKnownAs || matchesNumber || matchesDept;
      }
      return true;
    });
  }, [simulatedPayslips, filterStatus, searchQuery]);

  // Handlers for adjust modal
  const handleAdjustmentSaved = (updated: PayslipRecordData) => {
    setSavedAdjustmentsMap((prev) => ({
      ...prev,
      [updated.employeeId]: updated,
    }));
    setSelectedPayslipForAdjust(null);
    setFeedbackMessage({
      text: `Payslip adjustments for ${updated.fullName} saved and locked for printing.`,
    });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const handleAdjustmentReset = (employeeId: string, fullName: string) => {
    setSavedAdjustmentsMap((prev) => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
    setSelectedPayslipForAdjust(null);
    setFeedbackMessage({
      text: `Payslip for ${fullName} reverted to baseline timesheet calculations.`,
    });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const approvedPayslipsForBatch = useMemo(() => {
    return simulatedPayslips.filter((p) => p.isApprovedForSimulation);
  }, [simulatedPayslips]);

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-xs font-semibold shadow-xs transition-all ${
            feedbackMessage.isError
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header and Pay Period Selector Bar */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
                Super Admin Only
              </span>
              <span className="text-xs font-bold text-muted uppercase tracking-wider">
                Payroll Compliance &amp; Printing
              </span>
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              Official Employee Payslip Generator
            </h2>
            <p className="text-xs text-muted">
              Strictly simulated after period timesheet sign-offs. Pre-adjust values anytime before standard A4 printout.
            </p>
          </div>

          {/* Pay Period Switcher Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Pay Period Cycle
              </label>
              <div className="relative mt-1">
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="appearance-none rounded-xl border border-border bg-surface px-3 py-2 pr-8 text-xs font-bold text-foreground shadow-xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                >
                  {availablePeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({formatPeriodDate(p.startDate)} - {formatPeriodDate(p.endDate)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Official Pay Date
              </label>
              <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-border bg-surface-muted/50 px-3 py-2 text-xs font-bold text-foreground">
                <Calendar className="size-3.5 text-emerald-600" />
                <span>{formatPeriodDate(activePeriod.payDate || activePeriod.endDate)}</span>
              </div>
            </div>

            {/* Batch Print All Approved Button */}
            <div className="flex flex-col justify-end">
              <button
                type="button"
                disabled={approvedPayslipsForBatch.length === 0}
                onClick={() => setIsBatchPrintModalOpen(true)}
                className={`mt-auto flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-colors ${
                  approvedPayslipsForBatch.length > 0
                    ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]"
                    : "bg-surface-muted text-muted cursor-not-allowed"
                }`}
                title={
                  approvedPayslipsForBatch.length === 0
                    ? "No approved timesheets found to print payslips"
                    : "Print all simulated payslips for this period in one batch"
                }
              >
                <Printer className="size-3.5 text-emerald-400" />
                <span>Print All Ready ({approvedPayslipsForBatch.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Gate Policy Banner */}
      {stats.lockedCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-700">
              <Lock className="size-5 shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-950">
                  Timesheet Approval Gate Enforced ({stats.lockedCount} Employees Pending)
                </h4>
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-black text-amber-900">
                  Compliance Rule
                </span>
              </div>
              <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
                Payslips only simulate and print once all timesheets in the active pay period have been officially approved. Employees with pending timesheets are locked from preview, adjustment, and printing.
              </p>
            </div>
          </div>

          {onNavigateToApprovals && (
            <button
              type="button"
              onClick={onNavigateToApprovals}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-[0.98] transition-colors"
            >
              <span>Review Timesheet Queue</span>
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-700">
            <CheckCircle2 className="size-5 shrink-0" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-950">
              All Period Timesheets Approved &amp; Verified
            </h4>
            <p className="text-xs text-emerald-800">
              100% of attendance records for this period are approved. All active employees are fully unlocked for live simulation, custom adjustments, and A4 printouts.
            </p>
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Employees */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Headcount</span>
            <Users className="size-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {stats.totalEmployees}
          </div>
          <div className="mt-0.5 text-[11px] text-muted font-medium">
            Active in workspace
          </div>
        </div>

        {/* Ready to Print */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ready to Print</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">
            {stats.approvedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-700 font-medium">
            Timesheets verified
          </div>
        </div>

        {/* Locked / Pending */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Simulation Locked</span>
            <Lock className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600">
            {stats.lockedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-700 font-medium">
            Pending timesheet sign-off
          </div>
        </div>

        {/* Total Net Payroll */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Approved Net Pay</span>
            <DollarSign className="size-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {formatRand(stats.totalNetApproved)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted font-medium">
            {stats.adjustedCount > 0 ? `${stats.adjustedCount} custom adjusted` : "Simulated net total"}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-muted hover:text-foreground hover:bg-surface-muted"
            }`}
          >
            All Employees ({simulatedPayslips.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("approved")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === "approved"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted hover:text-foreground hover:bg-surface-muted"
            }`}
          >
            <CheckCircle2 className="size-3" />
            <span>Ready ({stats.approvedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("locked")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === "locked"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-muted hover:text-foreground hover:bg-surface-muted"
            }`}
          >
            <Lock className="size-3" />
            <span>Locked ({stats.lockedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("adjusted")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === "adjusted"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-muted hover:text-foreground hover:bg-surface-muted"
            }`}
          >
            <Edit3 className="size-3" />
            <span>Adjusted ({stats.adjustedCount})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search employee name, #, dept..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {/* Main Table / Responsive Cards Display */}
      <div className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
        {/* Desktop View Table (Visible on md and above) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Timesheet Sign-Off</th>
                <th className="py-3 px-4 text-right">Normal Hours</th>
                <th className="py-3 px-4 text-right">Overtime</th>
                <th className="py-3 px-4 text-right">Gross Earnings</th>
                <th className="py-3 px-4 text-right">Deductions</th>
                <th className="py-3 px-4 text-right">Net Pay</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPayslips.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted font-medium">
                    No employee records match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredPayslips.map((payslip) => (
                  <tr
                    key={payslip.employeeId}
                    className="hover:bg-surface-muted/30 transition-colors"
                  >
                    {/* Employee info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                          {payslip.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">
                            {payslip.fullName}
                          </div>
                          <div className="text-[10px] text-muted">
                            #{payslip.employeeNumber} {payslip.department ? `• ${payslip.department}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Timesheet Approval Gate Status */}
                    <td className="py-3 px-4">
                      {payslip.isApprovedForSimulation ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="size-3 text-emerald-600" />
                          <span>
                            {payslip.timesheetsInPeriodCount > 0
                              ? `Approved (${payslip.approvedTimesheetsCount} ts)`
                              : "Contract Salary"}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200"
                          title={payslip.approvalGateMessage}
                        >
                          <Lock className="size-3 text-amber-600" />
                          <span>{payslip.unapprovedTimesheetsCount} Pending</span>
                        </div>
                      )}
                    </td>

                    {/* Normal Hours */}
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {payslip.isApprovedForSimulation
                        ? `${payslip.normalHours.toFixed(1)}h`
                        : "–"}
                    </td>

                    {/* Overtime */}
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {payslip.isApprovedForSimulation ? (
                        <span>
                          {(payslip.overtime15Hours + payslip.overtime20Hours).toFixed(1)}h
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>

                    {/* Gross */}
                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                      {payslip.isApprovedForSimulation
                        ? formatRand(payslip.grossEarnings)
                        : "–"}
                    </td>

                    {/* Deductions */}
                    <td className="py-3 px-4 text-right font-medium text-rose-700">
                      {payslip.isApprovedForSimulation
                        ? `– ${formatRand(payslip.totalDeductions)}`
                        : "–"}
                    </td>

                    {/* Net Pay */}
                    <td className="py-3 px-4 text-right font-black text-emerald-600">
                      {payslip.isApprovedForSimulation
                        ? formatRand(payslip.netPay)
                        : "–"}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 text-center">
                      {!payslip.isApprovedForSimulation ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Locked
                        </span>
                      ) : payslip.isAdjusted ? (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                          Adjusted
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Simulated
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Adjust Button */}
                        <button
                          type="button"
                          disabled={!payslip.isApprovedForSimulation}
                          onClick={() => setSelectedPayslipForAdjust(payslip)}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            payslip.isApprovedForSimulation
                              ? "bg-surface-muted text-slate-800 hover:bg-slate-200 active:scale-95"
                              : "bg-surface-muted/50 text-slate-400 cursor-not-allowed"
                          }`}
                          title={
                            payslip.isApprovedForSimulation
                              ? "Adjust salary, overtime, allowances, or deductions before print"
                              : "Locked: Timesheets must be approved before adjusting"
                          }
                        >
                          <Edit3 className="size-3" />
                          <span>Adjust</span>
                        </button>

                        {/* View & Print Button */}
                        <button
                          type="button"
                          disabled={!payslip.isApprovedForSimulation}
                          onClick={() => setSelectedPayslipForPrint(payslip)}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            payslip.isApprovedForSimulation
                              ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-95"
                              : "bg-surface-muted/50 text-slate-400 cursor-not-allowed"
                          }`}
                          title={
                            payslip.isApprovedForSimulation
                              ? "Preview and print single A4 payslip"
                              : "Locked: Timesheets must be approved before printing"
                          }
                        >
                          <Printer className="size-3 text-emerald-400" />
                          <span>Print</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards (Compact with distinct styling, NO horizontal scroll) */}
        <div className="md:hidden divide-y divide-border">
          {filteredPayslips.length === 0 ? (
            <div className="p-6 text-center text-muted font-medium text-xs">
              No employee records match the selected filter.
            </div>
          ) : (
            filteredPayslips.map((payslip) => (
              <div
                key={payslip.employeeId}
                className="p-4 space-y-3 bg-surface hover:bg-surface-muted/20 transition-colors"
              >
                {/* Employee Info Header & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {payslip.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {payslip.fullName}
                      </div>
                      <div className="text-[11px] text-muted">
                        #{payslip.employeeNumber} {payslip.department ? `• ${payslip.department}` : ""}
                      </div>
                    </div>
                  </div>

                  <div>
                    {payslip.isAdjusted && (
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                        Adjusted
                      </span>
                    )}
                  </div>
                </div>

                {/* Gate Badge */}
                <div>
                  {payslip.isApprovedForSimulation ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="size-3 text-emerald-600" />
                      <span>
                        {payslip.timesheetsInPeriodCount > 0
                          ? `All ${payslip.approvedTimesheetsCount} Timesheets Approved`
                          : "Contract Monthly Salary"}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200"
                      title={payslip.approvalGateMessage}
                    >
                      <Lock className="size-3 text-amber-600" />
                      <span>{payslip.unapprovedTimesheetsCount} Timesheets Pending Approval</span>
                    </div>
                  )}
                </div>

                {/* Financial Figures Grid */}
                {payslip.isApprovedForSimulation ? (
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-muted/60 p-2.5 text-center text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted block">Gross</span>
                      <span className="font-semibold text-foreground">
                        {formatRand(payslip.grossEarnings)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted block">Deductions</span>
                      <span className="font-medium text-rose-700">
                        –{formatRand(payslip.totalDeductions)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted block">Net Pay</span>
                      <span className="font-black text-emerald-600">
                        {formatRand(payslip.netPay)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 text-[11px] text-amber-800">
                    <p className="font-semibold">Calculations locked:</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed">
                      {payslip.approvalGateMessage || "All timesheets in this pay period must be approved first."}
                    </p>
                  </div>
                )}

                {/* Mobile Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!payslip.isApprovedForSimulation}
                    onClick={() => setSelectedPayslipForAdjust(payslip)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                      payslip.isApprovedForSimulation
                        ? "bg-surface-muted text-slate-800 border border-border hover:bg-slate-200 active:scale-95"
                        : "bg-surface-muted/50 text-slate-400 cursor-not-allowed border border-transparent"
                    }`}
                  >
                    <Edit3 className="size-3.5" />
                    <span>Adjust</span>
                  </button>

                  <button
                    type="button"
                    disabled={!payslip.isApprovedForSimulation}
                    onClick={() => setSelectedPayslipForPrint(payslip)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                      payslip.isApprovedForSimulation
                        ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-95"
                        : "bg-surface-muted/50 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <Printer className="size-3.5 text-emerald-400" />
                    <span>Print Payslip</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Single Employee Payslip Print Modal */}
      {selectedPayslipForPrint && (
        <PayslipPrintDocument
          payslip={selectedPayslipForPrint}
          onClose={() => setSelectedPayslipForPrint(null)}
          onOpenAdjust={() => {
            const current = selectedPayslipForPrint;
            setSelectedPayslipForPrint(null);
            setSelectedPayslipForAdjust(current);
          }}
        />
      )}

      {/* Single Employee Payslip Adjustment Modal */}
      {selectedPayslipForAdjust && (
        <PayslipAdjustmentModal
          payslip={selectedPayslipForAdjust}
          onClose={() => setSelectedPayslipForAdjust(null)}
          onSaved={handleAdjustmentSaved}
          onReset={() =>
            handleAdjustmentReset(
              selectedPayslipForAdjust.employeeId,
              selectedPayslipForAdjust.fullName,
            )
          }
        />
      )}

      {/* Batch Print Modal: Prints all approved payslips with clean page breaks */}
      {isBatchPrintModalOpen && approvedPayslipsForBatch.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 overflow-y-auto backdrop-blur-xs print:static print:p-0 print:bg-white print:overflow-visible">
          {/* Print Style for Multi-Page Document */}
          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #batch-payslip-print-container,
              #batch-payslip-print-container * {
                visibility: visible;
              }
              #batch-payslip-print-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
                background: white !important;
              }
              .payslip-batch-page {
                page-break-after: always;
                page-break-inside: avoid;
                padding: 10mm 12mm;
                box-sizing: border-box;
                height: 100%;
              }
              @page {
                size: A4 portrait;
                margin: 8mm 10mm;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div className="flex flex-col max-h-[96vh] w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none">
            {/* Top Batch Header */}
            <div className="no-print flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">
                  Batch Print Document
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {approvedPayslipsForBatch.length} Approved Payslips Ready
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition-colors"
                >
                  <Printer className="size-4" />
                  <span>Print All ({approvedPayslipsForBatch.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBatchPrintModalOpen(false)}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Scrollable multi-document preview */}
            <div className="overflow-y-auto p-4 sm:p-6 bg-slate-950/80 flex flex-col gap-6 print:p-0 print:bg-white print:overflow-visible">
              <div id="batch-payslip-print-container" className="space-y-6 print:space-y-0">
                {approvedPayslipsForBatch.map((p, idx) => (
                  <div
                    key={p.employeeId}
                    className="payslip-batch-page rounded-xl bg-white text-slate-900 p-6 sm:p-8 shadow-lg max-w-[210mm] mx-auto print:rounded-none print:shadow-none print:mx-0 print:max-w-none print:p-0"
                  >
                    {/* Header */}
                    <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
                      <div>
                        <h1 className="text-lg font-black uppercase tracking-tight text-slate-900">
                          {p.companyTradingName || p.companyName}
                        </h1>
                        <p className="text-[10px] text-slate-600 font-medium">
                          {p.companyAddress} | Tel: {p.companyPhone || "–"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-900 block">
                          PAYSLIP
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">
                          {p.payPeriodLabel}
                        </span>
                      </div>
                    </div>

                    {/* Employee & Bank Summary Box */}
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] border border-slate-300 p-2.5 rounded bg-slate-50/50">
                      <div>
                        <div><strong>Employee:</strong> {p.fullName}</div>
                        <div><strong>Employee #:</strong> {p.employeeNumber}</div>
                        <div><strong>ID Number:</strong> {p.idNumber || "–"}</div>
                        <div><strong>Department:</strong> {p.department || "–"}</div>
                      </div>
                      <div>
                        <div><strong>Pay Date:</strong> {p.payDate}</div>
                        <div><strong>Payment Mode:</strong> {p.paymentMode}</div>
                        <div><strong>Bank:</strong> {p.bankName || "–"} ({p.bankAccountNumber || "–"})</div>
                        <div><strong>Occupation:</strong> {p.occupation || "–"}</div>
                      </div>
                    </div>

                    {/* Earnings & Deductions Tables */}
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                      {/* Earnings */}
                      <div className="border border-slate-300 rounded p-2">
                        <div className="font-bold border-b border-slate-300 pb-1 mb-1 text-[10.5px] uppercase">
                          Earnings
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span>Basic Salary</span>
                          <span>{formatPlainCurrency(p.basicSalary)}</span>
                        </div>
                        {(p.overtime15Total > 0 || p.overtime15Hours > 0) && (
                          <div className="flex justify-between py-0.5">
                            <span>Overtime @ 1.5 ({p.overtime15Hours}h)</span>
                            <span>{formatPlainCurrency(p.overtime15Total)}</span>
                          </div>
                        )}
                        {(p.overtime20Total > 0 || p.overtime20Hours > 0) && (
                          <div className="flex justify-between py-0.5">
                            <span>Overtime @ 2.0 ({p.overtime20Hours}h)</span>
                            <span>{formatPlainCurrency(p.overtime20Total)}</span>
                          </div>
                        )}
                        {p.commissionTotal > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Commission</span>
                            <span>{formatPlainCurrency(p.commissionTotal)}</span>
                          </div>
                        )}
                        {p.annualBonus > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Annual Bonus</span>
                            <span>{formatPlainCurrency(p.annualBonus)}</span>
                          </div>
                        )}
                        {p.travelAllowance > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Travel Allowance</span>
                            <span>{formatPlainCurrency(p.travelAllowance)}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-900 mt-2 pt-1 font-bold flex justify-between">
                          <span>Gross Earnings:</span>
                          <span>{formatRand(p.grossEarnings)}</span>
                        </div>
                      </div>

                      {/* Deductions */}
                      <div className="border border-slate-300 rounded p-2">
                        <div className="font-bold border-b border-slate-300 pb-1 mb-1 text-[10.5px] uppercase">
                          Deductions
                        </div>
                        {p.payeTax > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>PAYE</span>
                            <span>{formatPlainCurrency(p.payeTax)}</span>
                          </div>
                        )}
                        {p.uifAmount > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>UIF (Statutory 1%)</span>
                            <span>{formatPlainCurrency(p.uifAmount)}</span>
                          </div>
                        )}
                        {p.medicalAid > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Medical Aid</span>
                            <span>{formatPlainCurrency(p.medicalAid)}</span>
                          </div>
                        )}
                        {p.pensionFund > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Pension Fund</span>
                            <span>{formatPlainCurrency(p.pensionFund)}</span>
                          </div>
                        )}
                        {p.staffLoan > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Staff Loan</span>
                            <span>{formatPlainCurrency(p.staffLoan)}</span>
                          </div>
                        )}
                        {p.otherDeductions > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span>Other Deductions</span>
                            <span>{formatPlainCurrency(p.otherDeductions)}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-900 mt-2 pt-1 font-bold flex justify-between text-rose-800">
                          <span>Total Deductions:</span>
                          <span>{formatRand(p.totalDeductions)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Net Pay Box */}
                    <div className="mt-3 border-2 border-slate-900 bg-slate-100 p-2 flex justify-between items-center text-sm font-black">
                      <span className="uppercase tracking-wider">NET PAY</span>
                      <span className="text-base text-emerald-700">{formatRand(p.netPay)}</span>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-2 border-t border-slate-200 text-[9px] text-slate-500 text-center italic">
                      {p.queryOfficeText || "Employee queries directed to business office."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
