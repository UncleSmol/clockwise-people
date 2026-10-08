"use client";

import React, { useRef } from "react";
import { Printer, Download, X, Edit3, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { PayslipRecordData } from "@/lib/payroll/payslip-types";
import { formatRand, formatPlainCurrency } from "@/lib/payroll/payslip-engine";

type PayslipPrintDocumentProps = {
  payslip: PayslipRecordData;
  onClose?: () => void;
  onOpenAdjust?: () => void;
};

export default function PayslipPrintDocument({
  payslip,
  onClose,
  onOpenAdjust,
}: PayslipPrintDocumentProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  // Compile active earnings rows (exclude zero values for clean presentation, matching template)
  const earningsRows = [
    {
      description: "Basic Salary",
      hoursOrAmount: payslip.normalHours > 0 ? payslip.normalHours : 1,
      rate: payslip.hourlyRate > 0 ? payslip.hourlyRate : payslip.basicSalary,
      total: payslip.basicSalary,
    },
    ...(payslip.overtime15Hours > 0 || payslip.overtime15Total > 0
      ? [
          {
            description: "Overtime @ 1.5",
            hoursOrAmount: payslip.overtime15Hours,
            rate: payslip.overtime15Rate,
            total: payslip.overtime15Total,
          },
        ]
      : []),
    ...(payslip.overtime20Hours > 0 || payslip.overtime20Total > 0
      ? [
          {
            description: "Overtime @ 2.0 (Sunday / Holiday)",
            hoursOrAmount: payslip.overtime20Hours,
            rate: payslip.overtime20Rate,
            total: payslip.overtime20Total,
          },
        ]
      : []),
    ...(payslip.commissionTotal > 0
      ? [
          {
            description: payslip.commissionRate > 0 ? `Commission @ ${payslip.commissionRate}%` : "Commission",
            hoursOrAmount: payslip.commissionBase > 0 ? payslip.commissionBase : 1,
            rate: payslip.commissionRate > 0 ? payslip.commissionRate : payslip.commissionTotal,
            total: payslip.commissionTotal,
          },
        ]
      : []),
    ...(payslip.annualBonus > 0
      ? [
          {
            description: "Annual Bonus",
            hoursOrAmount: 1,
            rate: payslip.annualBonus,
            total: payslip.annualBonus,
          },
        ]
      : []),
    ...(payslip.performanceBonus > 0
      ? [
          {
            description: "Performance Bonus",
            hoursOrAmount: 1,
            rate: payslip.performanceBonus,
            total: payslip.performanceBonus,
          },
        ]
      : []),
    ...(payslip.travelAllowance > 0
      ? [
          {
            description: "Travel Allowance",
            hoursOrAmount: 1,
            rate: payslip.travelAllowance,
            total: payslip.travelAllowance,
          },
        ]
      : []),
    ...(payslip.otherAllowance > 0
      ? [
          {
            description: "Other Allowance",
            hoursOrAmount: 1,
            rate: payslip.otherAllowance,
            total: payslip.otherAllowance,
          },
        ]
      : []),
  ];

  // Compile active deductions rows
  const deductionsRows = [
    ...(payslip.payeTax > 0
      ? [
          {
            description: "PAYE (Income Tax)",
            total: payslip.payeTax,
          },
        ]
      : []),
    ...(payslip.uifAmount > 0
      ? [
          {
            description: "UIF (1% Statutory Contribution)",
            total: payslip.uifAmount,
          },
        ]
      : []),
    ...(payslip.medicalAid > 0
      ? [
          {
            description: "Medical Aid",
            total: payslip.medicalAid,
          },
        ]
      : []),
    ...(payslip.pensionFund > 0
      ? [
          {
            description: "Pension / Provident Fund",
            total: payslip.pensionFund,
          },
        ]
      : []),
    ...(payslip.staffLoan > 0
      ? [
          {
            description: "Staff Loan / Advance Repayment",
            total: payslip.staffLoan,
          },
        ]
      : []),
    ...(payslip.unpaidAbsence > 0
      ? [
          {
            description: "Unpaid Absence / Leave Deduction",
            total: payslip.unpaidAbsence,
          },
        ]
      : []),
    ...(payslip.otherDeductions > 0
      ? [
          {
            description: "Other Deductions / Net Adjustments",
            total: payslip.otherDeductions,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 overflow-y-auto backdrop-blur-xs print:static print:p-0 print:bg-white print:overflow-visible">
      {/* Print-specific style tags for clean A4 paper page formatting */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #payslip-print-sheet,
          #payslip-print-sheet * {
            visibility: visible;
          }
          #payslip-print-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 10mm 12mm;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
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
        {/* Top Controls Toolbar (Hidden during print) */}
        <div className="no-print flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">
              Super Admin Payslip Printout
            </span>
            {payslip.isAdjusted && (
              <span className="rounded bg-indigo-600/80 px-2 py-0.5 text-xs font-bold text-indigo-100">
                Adjusted
              </span>
            )}
            {!payslip.isApprovedForSimulation && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-600/90 px-2 py-0.5 text-xs font-bold text-amber-100">
                <ShieldAlert className="size-3" /> Unapproved Timesheets
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenAdjust && (
              <button
                type="button"
                onClick={onOpenAdjust}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
              >
                <Edit3 className="size-3.5 text-amber-400" />
                Adjust Payslip
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-500 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="size-3.5" />
              Print Payslip (A4)
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                title="Close"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Warning Banner if timesheets are pending approval */}
        {!payslip.isApprovedForSimulation && payslip.approvalGateMessage && (
          <div className="no-print border-b border-amber-500/30 bg-amber-950/40 px-4 py-2.5 text-xs font-medium text-amber-200 flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-amber-400" />
            <span>{payslip.approvalGateMessage}</span>
          </div>
        )}

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60 print:p-0 print:overflow-visible">
          {/* A4 Printable Sheet Container */}
          <div
            id="payslip-print-sheet"
            ref={printAreaRef}
            className="mx-auto w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-8 sm:p-10 shadow-lg border border-slate-200 text-xs font-sans print:shadow-none print:border-none print:p-0"
          >
            {/* Header: PAYSLIP, Company info & Logo */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div className="flex-1">
                <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">
                  PAYSLIP
                </h1>
                <h2 className="mt-1 text-base font-extrabold text-slate-800">
                  {payslip.companyName}
                </h2>
                {payslip.companyTradingName && payslip.companyTradingName !== payslip.companyName && (
                  <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                    {payslip.companyTradingName}
                  </p>
                )}
                {payslip.companyAddress && (
                  <p className="mt-1 text-[11px] text-slate-600 leading-tight">
                    {payslip.companyAddress}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10.5px] text-slate-500 font-medium">
                  {payslip.companyWebsite && <span>{payslip.companyWebsite}</span>}
                  {payslip.companyPhone && <span>Tel: {payslip.companyPhone}</span>}
                  {payslip.companyEmail && <span>{payslip.companyEmail}</span>}
                </div>
              </div>

              {payslip.companyLogoUrl ? (
                <div className="ml-4 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={payslip.companyLogoUrl}
                    alt={payslip.companyName}
                    className="max-h-16 max-w-36 object-contain"
                  />
                </div>
              ) : null}
            </div>

            {/* Employee Details Grid (High-fidelity boxed layout matching template) */}
            <div className="mt-4 grid grid-cols-4 border border-slate-900 divide-x divide-y divide-slate-900 text-[11px]">
              {/* Row 1 */}
              <div className="p-2 bg-slate-50">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  EMPLOYEE
                </span>
                <span className="mt-0.5 block font-extrabold text-slate-900 break-words">
                  {payslip.fullName}
                </span>
              </div>
              <div className="p-2 bg-slate-50">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  ID NUMBER
                </span>
                <span className="mt-0.5 block font-semibold text-slate-900">
                  {payslip.idNumber || "–"}
                </span>
              </div>
              <div className="p-2 bg-slate-50">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  TAX REFERENCE NUMBER
                </span>
                <span className="mt-0.5 block font-semibold text-slate-900">
                  {payslip.taxNumber || "–"}
                </span>
              </div>
              <div className="p-2 bg-slate-50">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  EMPLOYEE NUMBER
                </span>
                <span className="mt-0.5 block font-extrabold text-slate-900">
                  {payslip.employeeNumber}
                </span>
              </div>

              {/* Row 2 */}
              <div className="col-span-2 p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  ADDRESS
                </span>
                <span className="mt-0.5 block font-medium text-slate-800 break-words">
                  {payslip.address || "–"}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  PHONE
                </span>
                <span className="mt-0.5 block font-medium text-slate-800">
                  {payslip.phone || "–"}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  EMAIL
                </span>
                <span className="mt-0.5 block font-medium text-slate-800 break-words">
                  {payslip.email || "–"}
                </span>
              </div>

              {/* Row 3 */}
              <div className="col-span-2 p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  OCCUPATION / DESIGNATION
                </span>
                <span className="mt-0.5 block font-bold text-slate-900">
                  {payslip.occupation || "Team Member"}
                  {payslip.department ? ` (${payslip.department})` : ""}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  PAY DATE / PERIOD
                </span>
                <span className="mt-0.5 block font-bold text-slate-900">
                  {payslip.payPeriodLabel}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  FREQUENCY
                </span>
                <span className="mt-0.5 block font-bold text-slate-900 capitalize">
                  {payslip.paymentFrequency}
                </span>
              </div>
            </div>

            {/* Earnings Section */}
            <div className="mt-5">
              <table className="w-full border-collapse border border-slate-900 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-left font-bold text-slate-800">
                    <th className="p-2 border-r border-slate-900">EARNINGS</th>
                    <th className="p-2 border-r border-slate-900 text-right w-28">HOURS/AMOUNT</th>
                    <th className="p-2 border-r border-slate-900 text-right w-28">RATE</th>
                    <th className="p-2 text-right w-32">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {earningsRows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                      <td className="p-2 border-r border-slate-900 font-medium text-slate-900">
                        {row.description}
                      </td>
                      <td className="p-2 border-r border-slate-900 text-right font-mono text-slate-800">
                        {row.hoursOrAmount ? Number(row.hoursOrAmount).toFixed(2) : "–"}
                      </td>
                      <td className="p-2 border-r border-slate-900 text-right font-mono text-slate-800">
                        {row.rate ? formatPlainCurrency(row.rate) : "–"}
                      </td>
                      <td className="p-2 text-right font-bold font-mono text-slate-950">
                        {formatPlainCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-extrabold text-slate-900">
                    <td colSpan={3} className="p-2 text-right border-r border-slate-900 uppercase tracking-wider">
                      Total Payments
                    </td>
                    <td className="p-2 text-right font-mono text-xs">
                      {formatPlainCurrency(payslip.grossEarnings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Deductions Section */}
            <div className="mt-5">
              <table className="w-full border-collapse border border-slate-900 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-left font-bold text-slate-800">
                    <th className="p-2 border-r border-slate-900">DEDUCTIONS</th>
                    <th className="p-2 text-right w-32">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {deductionsRows.length === 0 ? (
                    <tr>
                      <td className="p-2 border-r border-slate-900 text-slate-500 italic">
                        No deductions recorded for this period
                      </td>
                      <td className="p-2 text-right font-mono text-slate-700">0.00</td>
                    </tr>
                  ) : (
                    deductionsRows.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                        <td className="p-2 border-r border-slate-900 font-medium text-slate-900">
                          {row.description}
                        </td>
                        <td className="p-2 text-right font-bold font-mono text-slate-950">
                          {formatPlainCurrency(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-extrabold text-slate-900">
                    <td className="p-2 text-right border-r border-slate-900 uppercase tracking-wider">
                      Total Deductions
                    </td>
                    <td className="p-2 text-right font-mono text-xs">
                      {formatPlainCurrency(payslip.totalDeductions)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Highlighted NET PAY Box */}
            <div className="mt-5 border-2 border-slate-900 bg-slate-50 p-3 flex items-center justify-between text-slate-950 font-black">
              <span className="text-sm uppercase tracking-wider">
                NET PAY AMOUNT
              </span>
              <span className="text-lg font-mono tracking-tight bg-white px-4 py-1.5 rounded border border-slate-300 shadow-2xs">
                {formatRand(payslip.netPay)}
              </span>
            </div>

            {/* Banking Details Grid */}
            <div className="mt-5 border border-slate-900 divide-y divide-slate-900 text-[11px]">
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <div className="p-2">
                  <span className="text-[9px] font-bold uppercase text-slate-500 block">Bank Name</span>
                  <span className="font-semibold text-slate-900">{payslip.bankName || "–"}</span>
                </div>
                <div className="p-2">
                  <span className="text-[9px] font-bold uppercase text-slate-500 block">Bank Account</span>
                  <span className="font-mono font-bold text-slate-900">{payslip.bankAccountNumber || "–"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <div className="p-2">
                  <span className="text-[9px] font-bold uppercase text-slate-500 block">Account Type</span>
                  <span className="font-medium text-slate-900">{payslip.bankAccountType || "–"}</span>
                </div>
                <div className="p-2">
                  <span className="text-[9px] font-bold uppercase text-slate-500 block">Payment Mode</span>
                  <span className="font-bold text-slate-900">{payslip.paymentMode || "EFT"}</span>
                </div>
              </div>
            </div>

            {/* Optional Notes */}
            {payslip.notes && (
              <div className="mt-4 p-2.5 rounded border border-slate-300 bg-slate-50/70 text-[10.5px]">
                <span className="font-bold uppercase tracking-wider text-slate-600 block mb-0.5">Notes:</span>
                <span className="text-slate-800">{payslip.notes}</span>
              </div>
            )}

            {/* BCEA / Query Office Footer Note matching template */}
            <div className="mt-8 pt-4 border-t border-slate-300 text-[9.5px] text-slate-500 text-center leading-relaxed italic">
              {payslip.queryOfficeText ||
                "Employee questions may be directed to business administration office : 49 Duncan Street, Witbank, 1039 | 010 824 9087 Or Managing Partner 0817657816"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
