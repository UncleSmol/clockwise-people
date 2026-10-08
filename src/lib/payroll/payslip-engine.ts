import type { CompanyTimesheetCalendarEntry } from "@/lib/time-tracking/schema";
import type { EmployeeRecord } from "@/lib/employees/schema";
import type {
  PayslipRecordData,
  PayslipAdjustmentInput,
  CompanyPayslipContext,
  PeriodContext,
} from "./payslip-types";

export type { CompanyPayslipContext, PeriodContext };

export const STATUTORY_UIF_RATE = 0.01;
export const STATUTORY_UIF_MONTHLY_CAP = 177.12;
export const DEFAULT_STANDARD_MONTHLY_HOURS = 195;

export function formatRand(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  return `R ${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPlainCurrency(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  return num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calculateStatutoryUif(grossEarnings: number): number {
  if (grossEarnings <= 0) return 0;
  const rawUif = grossEarnings * STATUTORY_UIF_RATE;
  return Number(Math.min(rawUif, STATUTORY_UIF_MONTHLY_CAP).toFixed(2));
}

export function simulateEmployeePayslip({
  employee,
  company,
  period,
  timesheets,
  savedAdjustment,
}: {
  employee: EmployeeRecord;
  company: CompanyPayslipContext;
  period: PeriodContext;
  timesheets: CompanyTimesheetCalendarEntry[];
  savedAdjustment?: PayslipRecordData | null;
}): PayslipRecordData {
  const standardMonthlyHours =
    company.standard_monthly_hours && company.standard_monthly_hours > 0
      ? company.standard_monthly_hours
      : DEFAULT_STANDARD_MONTHLY_HOURS;

  // Filter timesheets for this employee within this pay period
  const employeeTimesheets = timesheets.filter((entry) => {
    return (
      entry.employee_id === employee.id &&
      entry.work_date >= period.startDate &&
      entry.work_date <= period.endDate
    );
  });

  const timesheetsInPeriodCount = employeeTimesheets.length;
  const approvedTimesheets = employeeTimesheets.filter(
    (entry) => entry.status === "approved",
  );
  const approvedTimesheetsCount = approvedTimesheets.length;
  const unapprovedTimesheetsCount = timesheetsInPeriodCount - approvedTimesheetsCount;

  // STRICT REQUIREMENT: Payslips only simulate after timesheets in a pay period have been approved
  let isApprovedForSimulation = false;
  let approvalGateMessage = "";

  if (timesheetsInPeriodCount > 0 && unapprovedTimesheetsCount > 0) {
    isApprovedForSimulation = false;
    approvalGateMessage = `${unapprovedTimesheetsCount} of ${timesheetsInPeriodCount} timesheet${
      unapprovedTimesheetsCount === 1 ? "" : "s"
    } in this period pending approval. Review and approve all timesheets to unlock payslip simulation.`;
  } else if (timesheetsInPeriodCount > 0 && unapprovedTimesheetsCount === 0) {
    isApprovedForSimulation = true;
  } else {
    // Zero timesheets in period
    const hasFixedSalary = Number(employee.monthly_salary ?? 0) > 0;
    if (hasFixedSalary) {
      isApprovedForSimulation = true;
      approvalGateMessage = "No attendance timesheets logged for this pay period. Simulating basic contracted monthly salary.";
    } else {
      isApprovedForSimulation = false;
      approvalGateMessage = "No approved timesheets found in this pay period for hourly employee.";
    }
  }

  // Calculate hourly rate & base salary
  let hourlyRate = 0;
  if (employee.hourly_rate && Number(employee.hourly_rate) > 0) {
    hourlyRate = Number(employee.hourly_rate);
  } else if (employee.monthly_salary && Number(employee.monthly_salary) > 0) {
    hourlyRate = Number(
      (Number(employee.monthly_salary) / standardMonthlyHours).toFixed(4),
    );
  }

  // Tally approved hours from approved timesheets
  let normalHoursWorked = 0;
  let ot15Hours = 0;
  let ot20Hours = 0;

  for (const entry of approvedTimesheets) {
    normalHoursWorked += Number(entry.normal_hours ?? 0);

    const totalOt = Number(entry.overtime_hours ?? 0);
    if (totalOt > 0) {
      // Determine if Sunday / Holiday (2.0x) or standard day (1.5x)
      const dayOfWeek = new Date(`${entry.work_date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
      const isSundayOrHoliday = dayOfWeek === 0 || entry.notes?.toLowerCase().includes("holiday");

      if (isSundayOrHoliday) {
        ot20Hours += totalOt;
      } else {
        ot15Hours += totalOt;
      }
    }
  }

  normalHoursWorked = Number(normalHoursWorked.toFixed(2));
  ot15Hours = Number(ot15Hours.toFixed(2));
  ot20Hours = Number(ot20Hours.toFixed(2));

  // Base calculated basic salary
  let basicSalary = 0;
  if (employee.monthly_salary && Number(employee.monthly_salary) > 0) {
    basicSalary = Number(Number(employee.monthly_salary).toFixed(2));
  } else {
    basicSalary = Number((normalHoursWorked * hourlyRate).toFixed(2));
  }

  const overtime15Rate = Number((hourlyRate * 1.5).toFixed(4));
  const overtime15Total = Number((ot15Hours * overtime15Rate).toFixed(2));

  const overtime20Rate = Number((hourlyRate * 2.0).toFixed(4));
  const overtime20Total = Number((ot20Hours * overtime20Rate).toFixed(2));

  // Format company address string
  const addressParts = [
    company.address_line_1,
    company.address_line_2,
    company.city,
    company.postal_code,
  ].filter(Boolean);
  const companyAddress = addressParts.length > 0 ? addressParts.join(", ") : null;

  // Pay date default: period end date or configured payDate
  const payDate = period.payDate || period.endDate;

  // Build simulated baseline record
  const baseline: PayslipRecordData = {
    companyId: company.id,
    companyName: company.name,
    companyTradingName: company.trading_name || company.name,
    companyAddress,
    companyPhone: company.contact_phone || null,
    companyWebsite: company.website_url || null,
    companyEmail: company.contact_email || null,
    companyLogoUrl: company.logo_url || null,
    queryOfficeText:
      company.query_office_text ||
      `Employee questions may be directed to business administration office: ${
        companyAddress || "49 Duncan Street, Witbank, 1039"
      } ${company.contact_phone ? `| ${company.contact_phone}` : ""}`,

    employeeId: employee.id,
    employeeNumber: employee.employee_number,
    fullName: employee.full_name,
    knownAs: employee.known_as,
    idNumber: employee.id_number || null,
    taxNumber: employee.tax_number || null,
    occupation: employee.job_title || "Team Member",
    department: employee.department_name || null,
    address: employee.address || null,
    phone: employee.phone_number || null,
    email: employee.email || null,

    payPeriodLabel: period.label,
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    payDate,
    paymentFrequency: employee.payment_frequency || period.frequency || "monthly",

    timesheetsInPeriodCount,
    approvedTimesheetsCount,
    unapprovedTimesheetsCount,
    isApprovedForSimulation,
    approvalGateMessage,

    basicSalary,
    normalHours: normalHoursWorked || (basicSalary > 0 ? standardMonthlyHours : 0),
    hourlyRate,
    overtime15Hours: ot15Hours,
    overtime15Rate,
    overtime15Total,
    overtime20Hours: ot20Hours,
    overtime20Rate,
    overtime20Total,
    commissionBase: 0,
    commissionRate: 0,
    commissionTotal: 0,
    annualBonus: 0,
    performanceBonus: 0,
    travelAllowance: 0,
    otherAllowance: 0,

    payeTax: 0,
    uifAmount: 0, // calculated below
    medicalAid: 0,
    pensionFund: 0,
    staffLoan: 0,
    unpaidAbsence: 0,
    otherDeductions: 0,

    grossEarnings: 0, // calculated below
    totalDeductions: 0, // calculated below
    netPay: 0, // calculated below

    bankName: employee.bank_name || null,
    bankAccountNumber: employee.bank_account_number || null,
    bankAccountType: employee.bank_account_type || "Cheque / Current",
    paymentMode: employee.payment_mode || "EFT",

    notes: null,
    isAdjusted: false,
    status: "simulated",
  };

  // If a saved adjusted payslip exists in the database for this period, apply it
  if (savedAdjustment) {
    const merged: PayslipRecordData = {
      ...baseline,
      savedPayslipId: savedAdjustment.id,
      isAdjusted: savedAdjustment.isAdjusted ?? true,
      status: savedAdjustment.status || "simulated",
      basicSalary: Number(savedAdjustment.basicSalary ?? baseline.basicSalary),
      normalHours: Number(savedAdjustment.normalHours ?? baseline.normalHours),
      hourlyRate: Number(savedAdjustment.hourlyRate ?? baseline.hourlyRate),
      overtime15Hours: Number(savedAdjustment.overtime15Hours ?? baseline.overtime15Hours),
      overtime15Rate: Number(savedAdjustment.overtime15Rate ?? baseline.overtime15Rate),
      overtime15Total: Number(savedAdjustment.overtime15Total ?? baseline.overtime15Total),
      overtime20Hours: Number(savedAdjustment.overtime20Hours ?? baseline.overtime20Hours),
      overtime20Rate: Number(savedAdjustment.overtime20Rate ?? baseline.overtime20Rate),
      overtime20Total: Number(savedAdjustment.overtime20Total ?? baseline.overtime20Total),
      commissionBase: Number(savedAdjustment.commissionBase ?? 0),
      commissionRate: Number(savedAdjustment.commissionRate ?? 0),
      commissionTotal: Number(savedAdjustment.commissionTotal ?? 0),
      annualBonus: Number(savedAdjustment.annualBonus ?? 0),
      performanceBonus: Number(savedAdjustment.performanceBonus ?? 0),
      travelAllowance: Number(savedAdjustment.travelAllowance ?? 0),
      otherAllowance: Number(savedAdjustment.otherAllowance ?? 0),
      payeTax: Number(savedAdjustment.payeTax ?? 0),
      uifAmount: Number(savedAdjustment.uifAmount ?? 0),
      medicalAid: Number(savedAdjustment.medicalAid ?? 0),
      pensionFund: Number(savedAdjustment.pensionFund ?? 0),
      staffLoan: Number(savedAdjustment.staffLoan ?? 0),
      unpaidAbsence: Number(savedAdjustment.unpaidAbsence ?? 0),
      otherDeductions: Number(savedAdjustment.otherDeductions ?? 0),
      bankName: savedAdjustment.bankName ?? baseline.bankName,
      bankAccountNumber: savedAdjustment.bankAccountNumber ?? baseline.bankAccountNumber,
      bankAccountType: savedAdjustment.bankAccountType ?? baseline.bankAccountType,
      paymentMode: savedAdjustment.paymentMode ?? baseline.paymentMode,
      notes: savedAdjustment.notes ?? baseline.notes,
      payDate: savedAdjustment.payDate ?? baseline.payDate,
    };

    return recalculateTotals(merged);
  }

  // Calculate baseline gross, statutory UIF, and net
  baseline.grossEarnings = Number(
    (
      baseline.basicSalary +
      baseline.overtime15Total +
      baseline.overtime20Total
    ).toFixed(2),
  );
  baseline.uifAmount = calculateStatutoryUif(baseline.grossEarnings);
  baseline.totalDeductions = baseline.uifAmount;
  baseline.netPay = Number(
    (baseline.grossEarnings - baseline.totalDeductions).toFixed(2),
  );

  return baseline;
}

export function recalculateTotals(payslip: PayslipRecordData): PayslipRecordData {
  const gross = Number(
    (
      Number(payslip.basicSalary || 0) +
      Number(payslip.overtime15Total || 0) +
      Number(payslip.overtime20Total || 0) +
      Number(payslip.commissionTotal || 0) +
      Number(payslip.annualBonus || 0) +
      Number(payslip.performanceBonus || 0) +
      Number(payslip.travelAllowance || 0) +
      Number(payslip.otherAllowance || 0)
    ).toFixed(2),
  );

  const deductions = Number(
    (
      Number(payslip.payeTax || 0) +
      Number(payslip.uifAmount || 0) +
      Number(payslip.medicalAid || 0) +
      Number(payslip.pensionFund || 0) +
      Number(payslip.staffLoan || 0) +
      Number(payslip.unpaidAbsence || 0) +
      Number(payslip.otherDeductions || 0)
    ).toFixed(2),
  );

  const net = Number((gross - deductions).toFixed(2));

  return {
    ...payslip,
    grossEarnings: gross,
    totalDeductions: deductions,
    netPay: net,
  };
}

export function applyPayslipAdjustment(
  base: PayslipRecordData,
  adj: PayslipAdjustmentInput,
): PayslipRecordData {
  const updated: PayslipRecordData = {
    ...base,
    isAdjusted: true,
    basicSalary: adj.basicSalary !== undefined ? Number(adj.basicSalary) : base.basicSalary,
    normalHours: adj.normalHours !== undefined ? Number(adj.normalHours) : base.normalHours,
    hourlyRate: adj.hourlyRate !== undefined ? Number(adj.hourlyRate) : base.hourlyRate,
    overtime15Hours: adj.overtime15Hours !== undefined ? Number(adj.overtime15Hours) : base.overtime15Hours,
    overtime15Rate: adj.overtime15Rate !== undefined ? Number(adj.overtime15Rate) : base.overtime15Rate,
    overtime15Total:
      adj.overtime15Total !== undefined
        ? Number(adj.overtime15Total)
        : Number(
            (
              (adj.overtime15Hours ?? base.overtime15Hours) *
              (adj.overtime15Rate ?? base.overtime15Rate)
            ).toFixed(2),
          ),
    overtime20Hours: adj.overtime20Hours !== undefined ? Number(adj.overtime20Hours) : base.overtime20Hours,
    overtime20Rate: adj.overtime20Rate !== undefined ? Number(adj.overtime20Rate) : base.overtime20Rate,
    overtime20Total:
      adj.overtime20Total !== undefined
        ? Number(adj.overtime20Total)
        : Number(
            (
              (adj.overtime20Hours ?? base.overtime20Hours) *
              (adj.overtime20Rate ?? base.overtime20Rate)
            ).toFixed(2),
          ),
    commissionBase: adj.commissionBase !== undefined ? Number(adj.commissionBase) : base.commissionBase,
    commissionRate: adj.commissionRate !== undefined ? Number(adj.commissionRate) : base.commissionRate,
    commissionTotal:
      adj.commissionTotal !== undefined
        ? Number(adj.commissionTotal)
        : adj.commissionBase && adj.commissionRate
          ? Number(((adj.commissionBase * adj.commissionRate) / 100).toFixed(2))
          : base.commissionTotal,
    annualBonus: adj.annualBonus !== undefined ? Number(adj.annualBonus) : base.annualBonus,
    performanceBonus: adj.performanceBonus !== undefined ? Number(adj.performanceBonus) : base.performanceBonus,
    travelAllowance: adj.travelAllowance !== undefined ? Number(adj.travelAllowance) : base.travelAllowance,
    otherAllowance: adj.otherAllowance !== undefined ? Number(adj.otherAllowance) : base.otherAllowance,
    payeTax: adj.payeTax !== undefined ? Number(adj.payeTax) : base.payeTax,
    uifAmount: adj.uifAmount !== undefined ? Number(adj.uifAmount) : base.uifAmount,
    medicalAid: adj.medicalAid !== undefined ? Number(adj.medicalAid) : base.medicalAid,
    pensionFund: adj.pensionFund !== undefined ? Number(adj.pensionFund) : base.pensionFund,
    staffLoan: adj.staffLoan !== undefined ? Number(adj.staffLoan) : base.staffLoan,
    unpaidAbsence: adj.unpaidAbsence !== undefined ? Number(adj.unpaidAbsence) : base.unpaidAbsence,
    otherDeductions: adj.otherDeductions !== undefined ? Number(adj.otherDeductions) : base.otherDeductions,
    bankName: adj.bankName !== undefined ? adj.bankName : base.bankName,
    bankAccountNumber: adj.bankAccountNumber !== undefined ? adj.bankAccountNumber : base.bankAccountNumber,
    bankAccountType: adj.bankAccountType !== undefined ? adj.bankAccountType : base.bankAccountType,
    paymentMode: adj.paymentMode !== undefined ? adj.paymentMode : base.paymentMode,
    notes: adj.notes !== undefined ? adj.notes : base.notes,
    payDate: adj.payDate !== undefined ? adj.payDate : base.payDate,
  };

  return recalculateTotals(updated);
}
