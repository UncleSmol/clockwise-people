"use client";

import React, { useState, useTransition } from "react";
import {
  X,
  Save,
  RotateCcw,
  DollarSign,
  Clock,
  ShieldCheck,
  Building2,
  FileText,
  Sparkles,
} from "lucide-react";
import type { PayslipRecordData, PayslipAdjustmentInput } from "@/lib/payroll/payslip-types";
import {
  applyPayslipAdjustment,
  calculateStatutoryUif,
  formatRand,
  formatPlainCurrency,
} from "@/lib/payroll/payslip-engine";
import { savePayslipRecordAction, resetPayslipAdjustmentAction } from "@/lib/payroll/payslip-actions";

type PayslipAdjustmentModalProps = {
  payslip: PayslipRecordData;
  onClose: () => void;
  onSaved: (updatedPayslip: PayslipRecordData) => void;
  onReset: () => void;
};

export default function PayslipAdjustmentModal({
  payslip,
  onClose,
  onSaved,
  onReset,
}: PayslipAdjustmentModalProps) {
  const [formData, setFormData] = useState<PayslipRecordData>(payslip);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleFieldChange = (field: keyof PayslipAdjustmentInput, value: string | number) => {
    const num = typeof value === "string" ? (value === "" ? 0 : parseFloat(value)) : value;
    const patch: PayslipAdjustmentInput = {
      [field]: isNaN(num) ? value : num,
    };

    setFormData((prev) => applyPayslipAdjustment(prev, patch));
  };

  const handleAutoUif = () => {
    const uif = calculateStatutoryUif(formData.grossEarnings);
    setFormData((prev) => applyPayslipAdjustment(prev, { uifAmount: uif }));
  };

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await savePayslipRecordAction(formData);
      if (result.ok) {
        onSaved({ ...formData, isAdjusted: true });
        onClose();
      } else {
        setMessage({ text: result.message, isError: true });
      }
    });
  };

  const handleResetToBaseline = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await resetPayslipAdjustmentAction(
        payslip.companyId,
        payslip.employeeId,
        payslip.periodStartDate,
        payslip.periodEndDate,
      );
      if (result.ok) {
        onReset();
        onClose();
      } else {
        setMessage({ text: result.message, isError: true });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 overflow-y-auto backdrop-blur-xs">
      <div className="flex flex-col max-h-[92vh] w-full max-w-3xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface-muted px-5 py-4">
          <div>
            <h2 className="text-base font-black text-foreground flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-600" />
              Adjust Payslip: {payslip.fullName}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {payslip.payPeriodLabel} · Employee #{payslip.employeeNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold ${
              message.isError
                ? "bg-rose-50 text-rose-800 border-b border-rose-200"
                : "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Live Payroll Summary Bar */}
        <div className="grid grid-cols-3 gap-2 bg-slate-900 p-4 text-white text-center">
          <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Earnings</p>
            <p className="text-sm font-black font-mono mt-0.5 text-white">
              {formatRand(formData.grossEarnings)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Total Deductions</p>
            <p className="text-sm font-black font-mono mt-0.5 text-rose-300">
              {formatRand(formData.totalDeductions)}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-950/80 p-2 border border-emerald-500/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Net Pay</p>
            <p className="text-sm font-black font-mono mt-0.5 text-emerald-400">
              {formatRand(formData.netPay)}
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* Earnings Section */}
          <section className="space-y-3">
            <h3 className="font-extrabold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-border pb-1">
              <DollarSign className="size-3.5 text-emerald-600" />
              1. Earnings & Overtime Adjustments
            </h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Basic Salary (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.basicSalary || ""}
                  onChange={(e) => handleFieldChange("basicSalary", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Normal Hours (h)</label>
                <input
                  type="number"
                  step="0.25"
                  value={formData.normalHours || ""}
                  onChange={(e) => handleFieldChange("normalHours", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Hourly Rate (R/h)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.hourlyRate || ""}
                  onChange={(e) => handleFieldChange("hourlyRate", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Overtime Grids */}
            <div className="grid gap-3 sm:grid-cols-2 bg-surface-muted/50 p-3 rounded-xl border border-border">
              {/* Overtime 1.5x */}
              <div className="space-y-2">
                <p className="font-bold text-foreground text-xs">Overtime @ 1.5x (Standard / Saturday)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-muted font-bold">Hours</label>
                    <input
                      type="number"
                      step="0.25"
                      value={formData.overtime15Hours || ""}
                      onChange={(e) => handleFieldChange("overtime15Hours", e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 font-mono text-xs font-bold text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted font-bold">Total (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.overtime15Total || ""}
                      onChange={(e) => handleFieldChange("overtime15Total", e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 font-mono text-xs font-bold text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Overtime 2.0x */}
              <div className="space-y-2">
                <p className="font-bold text-foreground text-xs">Overtime @ 2.0x (Sunday / Holiday)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-muted font-bold">Hours</label>
                    <input
                      type="number"
                      step="0.25"
                      value={formData.overtime20Hours || ""}
                      onChange={(e) => handleFieldChange("overtime20Hours", e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 font-mono text-xs font-bold text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted font-bold">Total (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.overtime20Total || ""}
                      onChange={(e) => handleFieldChange("overtime20Total", e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 font-mono text-xs font-bold text-foreground"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Commissions & Bonuses */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Commission (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.commissionTotal || ""}
                  onChange={(e) => handleFieldChange("commissionTotal", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Annual Bonus (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.annualBonus || ""}
                  onChange={(e) => handleFieldChange("annualBonus", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Performance Bonus (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.performanceBonus || ""}
                  onChange={(e) => handleFieldChange("performanceBonus", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Travel Allowance (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.travelAllowance || ""}
                  onChange={(e) => handleFieldChange("travelAllowance", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>
            </div>
          </section>

          {/* Deductions Section */}
          <section className="space-y-3">
            <h3 className="font-extrabold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-border pb-1">
              <ShieldCheck className="size-3.5 text-rose-600" />
              2. Deductions Adjustments
            </h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">PAYE (Tax) (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.payeTax || ""}
                  onChange={(e) => handleFieldChange("payeTax", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-muted">UIF Amount (R)</label>
                  <button
                    type="button"
                    onClick={handleAutoUif}
                    className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                    title="Calculate statutory 1% capped at R177.12"
                  >
                    <Sparkles className="size-2.5" /> Auto 1%
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={formData.uifAmount || ""}
                  onChange={(e) => handleFieldChange("uifAmount", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Medical Aid (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.medicalAid || ""}
                  onChange={(e) => handleFieldChange("medicalAid", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Pension Fund (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.pensionFund || ""}
                  onChange={(e) => handleFieldChange("pensionFund", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Staff Loan Repayment (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.staffLoan || ""}
                  onChange={(e) => handleFieldChange("staffLoan", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Unpaid Absence (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unpaidAbsence || ""}
                  onChange={(e) => handleFieldChange("unpaidAbsence", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-muted mb-1">Other Deductions / Net Adjustments (R)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.otherDeductions || ""}
                  onChange={(e) => handleFieldChange("otherDeductions", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 font-mono font-bold text-foreground"
                />
              </div>
            </div>
          </section>

          {/* Notes Section */}
          <section className="space-y-2">
            <h3 className="font-extrabold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-border pb-1">
              <FileText className="size-3.5 text-slate-500" />
              3. Payslip Memo / Notes
            </h3>
            <textarea
              rows={2}
              value={formData.notes || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Add optional explanatory notes for this employee's payslip..."
              className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary"
            />
          </section>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-surface-muted px-5 py-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleResetToBaseline}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-muted hover:text-foreground hover:bg-surface transition-all cursor-pointer disabled:opacity-50"
            title="Reset back to approved timesheet calculations"
          >
            <RotateCcw className="size-3.5" />
            Reset to Timesheets
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-surface transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="size-3.5" />
              {isPending ? "Saving..." : "Save Adjustments"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
