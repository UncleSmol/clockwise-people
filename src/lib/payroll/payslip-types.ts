export type CompanyPayslipContext = {
  id: string;
  name: string;
  trading_name?: string | null;
  registration_number?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  logo_url?: string | null;
  query_office_text?: string | null;
  standard_monthly_hours?: number;
};

export type PeriodContext = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  payDate?: string;
  frequency?: string;
};

export type PayslipEarningsLine = {
  id: string;
  description: string;
  hoursOrAmount: number;
  rate: number;
  total: number;
  isRemovable?: boolean;
};

export type PayslipDeductionsLine = {
  id: string;
  description: string;
  total: number;
  isRemovable?: boolean;
};

export type PayslipRecordData = {
  id?: string;
  companyId: string;
  companyName: string;
  companyTradingName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyWebsite: string | null;
  companyEmail: string | null;
  companyLogoUrl: string | null;
  queryOfficeText: string | null;

  // Employee details
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  idNumber: string | null;
  taxNumber: string | null;
  occupation: string | null;
  department: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;

  // Period & Payment details
  payPeriodLabel: string;
  periodStartDate: string;
  periodEndDate: string;
  payDate: string;
  paymentFrequency: string;

  // Timesheet approval gate
  timesheetsInPeriodCount: number;
  approvedTimesheetsCount: number;
  unapprovedTimesheetsCount: number;
  isApprovedForSimulation: boolean;
  approvalGateMessage?: string;

  // Earnings
  basicSalary: number;
  normalHours: number;
  hourlyRate: number;
  overtime15Hours: number;
  overtime15Rate: number;
  overtime15Total: number;
  overtime20Hours: number;
  overtime20Rate: number;
  overtime20Total: number;
  commissionBase: number;
  commissionRate: number;
  commissionTotal: number;
  annualBonus: number;
  performanceBonus: number;
  travelAllowance: number;
  otherAllowance: number;

  // Deductions
  payeTax: number;
  uifAmount: number;
  medicalAid: number;
  pensionFund: number;
  staffLoan: number;
  unpaidAbsence: number;
  otherDeductions: number;

  // Totals
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;

  // Banking
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountType: string | null;
  paymentMode: string;

  // Metadata
  notes: string | null;
  isAdjusted: boolean;
  status: "simulated" | "finalized";
  savedPayslipId?: string | null;
};

export type PayslipAdjustmentInput = {
  basicSalary?: number;
  normalHours?: number;
  hourlyRate?: number;
  overtime15Hours?: number;
  overtime15Rate?: number;
  overtime15Total?: number;
  overtime20Hours?: number;
  overtime20Rate?: number;
  overtime20Total?: number;
  commissionBase?: number;
  commissionRate?: number;
  commissionTotal?: number;
  annualBonus?: number;
  performanceBonus?: number;
  travelAllowance?: number;
  otherAllowance?: number;
  payeTax?: number;
  uifAmount?: number;
  medicalAid?: number;
  pensionFund?: number;
  staffLoan?: number;
  unpaidAbsence?: number;
  otherDeductions?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountType?: string;
  paymentMode?: string;
  notes?: string;
  payDate?: string;
};
