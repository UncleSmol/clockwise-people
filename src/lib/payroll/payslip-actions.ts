"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/lib/foundation/queries";
import type { PayslipRecordData } from "./payslip-types";

function requireSuperAdmin(access: { isSuperAdmin: boolean }) {
  if (!access.isSuperAdmin) {
    throw new Error("Access denied: Payslip simulation, adjustment, and printing are restricted to Super Admins only.");
  }
}

export async function getSavedCompanyPayslipsAction(
  companyId: string,
  startDate: string,
  endDate: string,
) {
  const access = await getCurrentUserAccess();
  requireSuperAdmin(access);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("company_payslips")
    .select("*")
    .eq("company_id", companyId)
    .eq("period_start_date", startDate)
    .eq("period_end_date", endDate);

  if (error) {
    if (
      error.message?.includes("does not exist") ||
      error.message?.includes("schema cache") ||
      error.message?.includes("Could not find")
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  const mapped: PayslipRecordData[] = (data ?? []).map((row: any) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: "",
    companyTradingName: null,
    companyAddress: null,
    companyPhone: null,
    companyWebsite: null,
    companyEmail: null,
    companyLogoUrl: null,
    queryOfficeText: null,

    employeeId: row.employee_id,
    employeeNumber: "",
    fullName: "",
    knownAs: null,
    idNumber: null,
    taxNumber: null,
    occupation: null,
    department: null,
    address: null,
    phone: null,
    email: null,

    payPeriodLabel: row.pay_period_label,
    periodStartDate: row.period_start_date,
    periodEndDate: row.period_end_date,
    payDate: row.pay_date || "",
    paymentFrequency: row.payment_frequency || "monthly",

    timesheetsInPeriodCount: 0,
    approvedTimesheetsCount: 0,
    unapprovedTimesheetsCount: 0,
    isApprovedForSimulation: true,

    basicSalary: Number(row.basic_salary ?? 0),
    normalHours: Number(row.normal_hours ?? 0),
    hourlyRate: Number(row.hourly_rate ?? 0),
    overtime15Hours: Number(row.overtime_15_hours ?? 0),
    overtime15Rate: Number(row.overtime_15_rate ?? 0),
    overtime15Total: Number(row.overtime_15_total ?? 0),
    overtime20Hours: Number(row.overtime_20_hours ?? 0),
    overtime20Rate: Number(row.overtime_20_rate ?? 0),
    overtime20Total: Number(row.overtime_20_total ?? 0),
    commissionBase: Number(row.commission_base ?? 0),
    commissionRate: Number(row.commission_rate ?? 0),
    commissionTotal: Number(row.commission_total ?? 0),
    annualBonus: Number(row.annual_bonus ?? 0),
    performanceBonus: Number(row.performance_bonus ?? 0),
    travelAllowance: Number(row.travel_allowance ?? 0),
    otherAllowance: Number(row.other_allowance ?? 0),

    payeTax: Number(row.paye_tax ?? 0),
    uifAmount: Number(row.uif_amount ?? 0),
    medicalAid: Number(row.medical_aid ?? 0),
    pensionFund: Number(row.pension_fund ?? 0),
    staffLoan: Number(row.staff_loan ?? 0),
    unpaidAbsence: Number(row.unpaid_absence ?? 0),
    otherDeductions: Number(row.other_deductions ?? 0),

    grossEarnings: Number(row.gross_earnings ?? 0),
    totalDeductions: Number(row.total_deductions ?? 0),
    netPay: Number(row.net_pay ?? 0),

    bankName: row.bank_name || null,
    bankAccountNumber: row.bank_account_number || null,
    bankAccountType: row.bank_account_type || null,
    paymentMode: row.payment_mode || "EFT",

    notes: row.notes || null,
    isAdjusted: Boolean(row.is_adjusted),
    status: row.status || "simulated",
    savedPayslipId: row.id,
  }));

  return mapped;
}

export async function savePayslipRecordAction(
  payslip: PayslipRecordData,
): Promise<{ ok: boolean; message: string; id?: string }> {
  const access = await getCurrentUserAccess();
  requireSuperAdmin(access);

  const supabase = await createSupabaseServerClient();

  const payload = {
    company_id: payslip.companyId,
    employee_id: payslip.employeeId,
    pay_period_label: payslip.payPeriodLabel,
    period_start_date: payslip.periodStartDate,
    period_end_date: payslip.periodEndDate,
    pay_date: payslip.payDate || null,
    payment_frequency: payslip.paymentFrequency || "monthly",
    basic_salary: payslip.basicSalary,
    normal_hours: payslip.normalHours,
    hourly_rate: payslip.hourlyRate,
    overtime_15_hours: payslip.overtime15Hours,
    overtime_15_rate: payslip.overtime15Rate,
    overtime_15_total: payslip.overtime15Total,
    overtime_20_hours: payslip.overtime20Hours,
    overtime_20_rate: payslip.overtime20Rate,
    overtime_20_total: payslip.overtime20Total,
    commission_base: payslip.commissionBase,
    commission_rate: payslip.commissionRate,
    commission_total: payslip.commissionTotal,
    annual_bonus: payslip.annualBonus,
    performance_bonus: payslip.performanceBonus,
    travel_allowance: payslip.travelAllowance,
    other_allowance: payslip.otherAllowance,
    paye_tax: payslip.payeTax,
    uif_amount: payslip.uifAmount,
    medical_aid: payslip.medicalAid,
    pension_fund: payslip.pensionFund,
    staff_loan: payslip.staffLoan,
    unpaid_absence: payslip.unpaidAbsence,
    other_deductions: payslip.otherDeductions,
    gross_earnings: payslip.grossEarnings,
    total_deductions: payslip.totalDeductions,
    net_pay: payslip.netPay,
    bank_name: payslip.bankName || null,
    bank_account_number: payslip.bankAccountNumber || null,
    bank_account_type: payslip.bankAccountType || "Cheque / Current",
    payment_mode: payslip.paymentMode || "EFT",
    notes: payslip.notes || null,
    is_adjusted: payslip.isAdjusted ?? true,
    status: payslip.status || "simulated",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("company_payslips")
    .upsert(payload, {
      onConflict: "company_id,employee_id,period_start_date,period_end_date",
    })
    .select("id")
    .single();

  if (error) {
    if (
      error.message?.includes("does not exist") ||
      error.message?.includes("schema cache") ||
      error.message?.includes("Could not find")
    ) {
      return {
        ok: false,
        message: "The company_payslips table has not been created yet in your Supabase database. Please run the migration script in your Supabase SQL Editor.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Payslip adjustments saved successfully.", id: data?.id };
}

export async function resetPayslipAdjustmentAction(
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; message: string }> {
  const access = await getCurrentUserAccess();
  requireSuperAdmin(access);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("company_payslips")
    .delete()
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .eq("period_start_date", startDate)
    .eq("period_end_date", endDate);

  if (error) {
    if (
      error.message?.includes("does not exist") ||
      error.message?.includes("schema cache") ||
      error.message?.includes("Could not find")
    ) {
      return { ok: true, message: "Reset to timesheet-calculated values." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Reset to timesheet-calculated values." };
}
