"use client";

import { formatPlainCurrency } from "@/lib/payroll/payslip-engine";
import type { PayslipRecordData } from "@/lib/payroll/payslip-types";
import { Edit3, Printer, ShieldAlert, X } from "lucide-react";
import { useRef } from "react";

type PayslipPrintDocumentProps = {
  payslip: PayslipRecordData;
  onClose?: () => void;
  onOpenAdjust?: () => void;
};

// Column grids copied from the Excel template (B | C | D | E | F)
const G4 = "grid grid-cols-[41.4%_20%_14.9%_23.7%]";
const G5 = "grid grid-cols-[37.4%_4%_20%_14.9%_23.7%]";

const GREY_LINE = "#7f7f7f";
const BLUE = "#0070c0";
const RED = "#e32d2d";

const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : Number(n).toFixed(2);

function LabelBox({
  label,
  value,
  center = false,
}: {
  label: string;
  value?: string | null;
  center?: boolean;
}) {
  return (
    <div
      className="min-h-[42px] px-[7px] py-1"
      style={{ border: `1px solid ${GREY_LINE}` }}
    >
      <span className="block text-[11px] text-[#7f7f7f]">{label}</span>
      <span
        className={`mt-[3px] block break-words text-[12px] text-[#1f1f1f] ${
          center ? "text-center" : ""
        }`}
      >
        {value || "\u00A0"}
      </span>
    </div>
  );
}

export default function PayslipPrintDocument({
  payslip,
  onClose,
  onOpenAdjust,
}: PayslipPrintDocumentProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  // Earnings rows (zero values are hidden, same as the Excel "auto-fit")
  const earningsRows = [
    {
      description: "Basic Salary",
      qty: payslip.normalHours > 0 ? payslip.normalHours : 1,
      rate: payslip.hourlyRate > 0 ? payslip.hourlyRate : payslip.basicSalary,
      total: payslip.basicSalary,
    },
    ...(payslip.overtime15Hours > 0 || payslip.overtime15Total > 0
      ? [
          {
            description: "Overtime @ 1.5",
            qty: payslip.overtime15Hours,
            rate: payslip.overtime15Rate,
            total: payslip.overtime15Total,
          },
        ]
      : []),
    ...(payslip.overtime20Hours > 0 || payslip.overtime20Total > 0
      ? [
          {
            description: "Overtime @ 2.0 (Sunday / Holiday)",
            qty: payslip.overtime20Hours,
            rate: payslip.overtime20Rate,
            total: payslip.overtime20Total,
          },
        ]
      : []),
    ...(payslip.commissionTotal > 0
      ? [
          {
            description:
              payslip.commissionRate > 0
                ? `Commission @ ${payslip.commissionRate}%`
                : "Commission",
            qty: payslip.commissionBase > 0 ? payslip.commissionBase : 1,
            rate:
              payslip.commissionRate > 0
                ? payslip.commissionRate
                : payslip.commissionTotal,
            total: payslip.commissionTotal,
          },
        ]
      : []),
    ...(payslip.annualBonus > 0
      ? [
          {
            description: "Annual Bonus",
            qty: 1,
            rate: payslip.annualBonus,
            total: payslip.annualBonus,
          },
        ]
      : []),
    ...(payslip.performanceBonus > 0
      ? [
          {
            description: "Performance Bonus",
            qty: 1,
            rate: payslip.performanceBonus,
            total: payslip.performanceBonus,
          },
        ]
      : []),
    ...(payslip.travelAllowance > 0
      ? [
          {
            description: "Travel Allowance",
            qty: 1,
            rate: payslip.travelAllowance,
            total: payslip.travelAllowance,
          },
        ]
      : []),
    ...(payslip.otherAllowance > 0
      ? [
          {
            description: "Other Allowance",
            qty: 1,
            rate: payslip.otherAllowance,
            total: payslip.otherAllowance,
          },
        ]
      : []),
  ];

  const deductionsRows = [
    ...(payslip.payeTax > 0
      ? [{ description: "PAYE", total: payslip.payeTax }]
      : []),
    ...(payslip.uifAmount > 0
      ? [{ description: "UIF", total: payslip.uifAmount }]
      : []),
    ...(payslip.medicalAid > 0
      ? [{ description: "Medical Aid", total: payslip.medicalAid }]
      : []),
    ...(payslip.pensionFund > 0
      ? [{ description: "Pension Fund", total: payslip.pensionFund }]
      : []),
    ...(payslip.staffLoan > 0
      ? [{ description: "Staff Loan", total: payslip.staffLoan }]
      : []),
    ...(payslip.unpaidAbsence > 0
      ? [{ description: "Unpaid Absence", total: payslip.unpaidAbsence }]
      : []),
    ...(payslip.otherDeductions > 0
      ? [{ description: "Other Deductions", total: payslip.otherDeductions }]
      : []),
  ];

  const footerText =
    payslip.queryOfficeText ||
    "Employee questions may be directed to business administration office : 49 Duncan Street, Witbank, 1039   010 824 9087 Or Managing Partner 0817657816";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 overflow-y-auto backdrop-blur-xs print:static print:p-0 print:bg-white print:overflow-visible">
      {/* Print-specific styles for clean A4 output */}
      <style jsx global>{`
        #payslip-print-sheet {
          font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
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
        {/* Toolbar (hidden when printing) */}
        <div className="no-print flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">
              Super Admin Payslip Printout
            </span>
            {payslip.isAdjusted && (
              <span className="rounded bg-amber-600 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                Adjusted
              </span>
            )}
            {!payslip.isApprovedForSimulation && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                <ShieldAlert className="size-3 text-white" /> Unapproved
                Timesheets
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
                <Edit3 className="size-3.5 text-amber-300" />
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

        {/* Approval warning (hidden when printing) */}
        {!payslip.isApprovedForSimulation && payslip.approvalGateMessage && (
          <div className="no-print border-b border-amber-500/30 bg-amber-950 px-4 py-2.5 text-xs font-medium text-white flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-amber-300" />
            <span>{payslip.approvalGateMessage}</span>
          </div>
        )}

        {/* Scrollable preview area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60 print:p-0 print:overflow-visible">
          {/* ===== A4 SHEET ===== */}
          <div
            id="payslip-print-sheet"
            ref={printAreaRef}
            className="mx-auto flex w-full max-w-[210mm] min-h-[297mm] flex-col bg-white px-8 pb-5 pt-8 text-[13px] leading-[1.3] text-[#1f1f1f] shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-0"
          >
            {/* Header: title, company, address, logo */}
            <div
              className="grid grid-cols-[41.4%_35.1%_23.5%] items-end pb-[6px]"
              style={{ borderBottom: `3px double ${GREY_LINE}` }}
            >
              <div>
                <div
                  className="text-[38px] leading-[1.1]"
                  style={{ color: BLUE }}
                >
                  PAYSLIP
                </div>
                <div className="mt-[10px] text-[18px]">
                  {payslip.companyName}
                </div>
                {payslip.companyWebsite && (
                  <div className="mt-[14px] text-[12px] text-[#0563c1] underline">
                    {payslip.companyWebsite}
                  </div>
                )}
              </div>

              <div className="text-[11px] leading-[1.35] text-[#595959]">
                {payslip.companyAddress && (
                  <div className="whitespace-pre-line">
                    {payslip.companyAddress}
                  </div>
                )}
                {payslip.companyPhone && (
                  <div>[Phone: {payslip.companyPhone}]</div>
                )}
                {payslip.companyEmail && <div>{payslip.companyEmail}</div>}
              </div>

              <div className="flex items-start justify-end self-start">
                {payslip.companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={payslip.companyLogoUrl}
                    alt={payslip.companyName}
                    className="max-h-[80px] max-w-full object-contain"
                  />
                ) : null}
              </div>
            </div>

            {/* Employee box (heavy black border) */}
            <div className="mt-[14px]" style={{ border: "2px solid #000" }}>
              <div className={G5}>
                <div className="col-span-2 px-2 py-1">
                  <span className="block text-[11px] text-[#7f7f7f]">
                    EMPLOYEE
                  </span>
                  <span className="mt-[3px] block break-words text-[12px] font-medium">
                    {payslip.fullName}
                  </span>
                </div>
                <div
                  className="px-2 py-1"
                  style={{ borderLeft: `1px solid ${GREY_LINE}` }}
                >
                  <span className="block text-[11px] text-[#7f7f7f]">
                    ID NUMBER
                  </span>
                  <span className="mt-[3px] block text-[12px]">
                    {payslip.idNumber || "\u00A0"}
                  </span>
                </div>
                <div
                  className="px-2 py-1"
                  style={{ borderLeft: `1px solid ${GREY_LINE}` }}
                >
                  <span className="block text-[11px] text-[#7f7f7f]">
                    TAX REFERENCE NUMBER
                  </span>
                  <span className="mt-[3px] block text-center text-[12px]">
                    {payslip.taxNumber || "\u00A0"}
                  </span>
                </div>
                <div
                  className="px-2 py-1"
                  style={{ borderLeft: `1px solid ${GREY_LINE}` }}
                >
                  <span className="block text-[11px] text-[#7f7f7f]">
                    EMPLOYEE NUMBER
                  </span>
                  <span className="mt-[3px] block text-center text-[12px]">
                    {payslip.employeeNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Address / Phone / Email */}
            <div className={`${G5} mt-3`}>
              <LabelBox label="ADDRESS" value={payslip.address} />
              <div />
              <LabelBox label="PHONE" value={payslip.phone} />
              <div />
              <LabelBox label="EMAIL" value={payslip.email} center />
            </div>

            {/* Occupation / Pay date / Frequency */}
            <div className={`${G5} mt-3`}>
              <LabelBox
                label="Occupation"
                value={`${payslip.occupation || "Team Member"}${
                  payslip.department ? ` (${payslip.department})` : ""
                }`}
              />
              <div />
              <LabelBox
                label="PAY DATE"
                value={payslip.payPeriodLabel}
                center
              />
              <div />
              <LabelBox
                label="FREQUENCY"
                value={
                  payslip.paymentFrequency
                    ? payslip.paymentFrequency.charAt(0).toUpperCase() +
                      payslip.paymentFrequency.slice(1)
                    : ""
                }
                center
              />
            </div>

            {/* Earnings */}
            <div className="mt-4" style={{ border: `1px solid ${GREY_LINE}` }}>
              <div
                className={`${G4} bg-[#f2f2f2] text-[13px]`}
                style={{ color: BLUE, borderBottom: "3px double #000" }}
              >
                <div className="px-2 py-[3px]">EARNINGS</div>
                <div className="px-2 py-[3px] text-center">HOURS/AMOUNT</div>
                <div className="px-2 py-[3px] text-center">RATE</div>
                <div className="px-2 py-[3px] text-center">TOTAL</div>
              </div>

              <div className="text-[12px] text-[#595959]">
                {earningsRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`${G4} ${idx % 2 === 1 ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <div className="px-2 py-[3px]">{row.description}</div>
                    <div className="px-2 py-[3px] text-center">
                      {row.qty ? fmtQty(Number(row.qty)) : "–"}
                    </div>
                    <div className="px-2 py-[3px] text-center">
                      {row.rate ? formatPlainCurrency(row.rate) : "–"}
                    </div>
                    <div className="px-2 py-[3px] text-center">
                      {formatPlainCurrency(row.total)}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`${G4} mt-[6px] text-[13px] font-medium text-[#595959]`}
                style={{ borderTop: `0.5px solid ${GREY_LINE}` }}
              >
                <div className="col-span-3 px-2 py-[3px] text-right">
                  Total Payments
                </div>
                <div className="px-2 py-[3px] text-center">
                  {formatPlainCurrency(payslip.grossEarnings)}
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="mt-4" style={{ border: `1px solid ${GREY_LINE}` }}>
              <div
                className={`${G4} bg-[#f2f2f2] text-[12px]`}
                style={{ color: RED, borderBottom: "3px double #000" }}
              >
                <div className="px-2 py-[3px]">DEDUCTIONS</div>
                <div />
                <div />
                <div className="px-2 py-[3px] text-center">TOTAL</div>
              </div>

              <div className="text-[12px] text-[#595959]">
                {deductionsRows.length === 0 ? (
                  <div className={G4}>
                    <div className="col-span-3 px-2 py-[3px] italic">
                      No deductions recorded for this period
                    </div>
                    <div className="px-2 py-[3px] text-center">0.00</div>
                  </div>
                ) : (
                  deductionsRows.map((row, idx) => (
                    <div
                      key={idx}
                      className={`${G4} ${idx % 2 === 1 ? "bg-[#f2f2f2]" : ""}`}
                    >
                      <div className="col-span-3 px-2 py-[3px]">
                        {row.description}
                      </div>
                      <div className="px-2 py-[3px] text-center">
                        {formatPlainCurrency(row.total)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                className={`${G4} mt-[6px] text-[13px] font-medium text-[#595959]`}
                style={{ borderTop: `0.5px solid ${GREY_LINE}` }}
              >
                <div className="col-span-3 px-2 py-[3px] text-right">
                  Total Deductions
                </div>
                <div className="px-2 py-[3px] text-center">
                  {formatPlainCurrency(payslip.totalDeductions)}
                </div>
              </div>
            </div>

            {/* NET PAY bar */}
            <div className={`${G4} mt-[14px]`}>
              <div />
              <div className="col-span-2 bg-[#f2f2f2] px-2 py-[6px] text-right text-[17px] font-medium">
                NET PAY
              </div>
              <div className="bg-[#f2f2f2] px-2 py-[6px] text-center text-[17px] font-medium">
                {formatPlainCurrency(payslip.netPay)}
              </div>
            </div>

            {/* Banking details */}
            <div className="mt-4 grid grid-cols-[41.4%_1fr] gap-y-[2px] text-[12px]">
              <div className="italic text-[#595959]">Bank Name</div>
              <div>{payslip.bankName || "–"}</div>
              <div className="italic text-[#595959]">Bank Account</div>
              <div>{payslip.bankAccountNumber || "–"}</div>
              <div className="italic text-[#595959]">Account Type</div>
              <div>{payslip.bankAccountType || "–"}</div>
              <div className="italic text-[#595959]">Payment Mode</div>
              <div>{payslip.paymentMode || "EFT"}</div>
            </div>

            {/* Optional notes */}
            {payslip.notes && (
              <div
                className="mt-4 px-2.5 py-2 text-[11px]"
                style={{ border: `1px solid ${GREY_LINE}` }}
              >
                <span className="mb-0.5 block text-[11px] text-[#7f7f7f]">
                  Notes
                </span>
                <span className="text-[#1f1f1f]">{payslip.notes}</span>
              </div>
            )}

            {/* Footer pinned to the bottom of the A4 page */}
            <div
              className="mt-auto pt-8 pb-[6px] text-center text-[11px] italic leading-[1.4] text-[#a6a6a6]"
              style={{ borderBottom: `0.5px solid ${GREY_LINE}` }}
            >
              {footerText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
