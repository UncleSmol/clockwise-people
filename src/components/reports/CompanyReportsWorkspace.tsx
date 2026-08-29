"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cog,
  Download,
  FileSpreadsheet,
  Layers,
  Percent,
  Printer,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import PayrollPeriodSettingsForm from "./PayrollPeriodSettingsForm";
import {
  generatePayrollPeriods,
  formatPeriodDate,
  type PayrollPeriodConfig,
  defaultPayrollConfig,
} from "@/lib/reports/payroll-periods";
import {
  buildTimesheetPayrollReport,
  buildAttendanceReport,
  buildAccrualReport,
  buildAbsenceReport,
  calculateReportKPIs,
} from "@/lib/reports/aggregators";
import {
  exportReportToCsv,
  exportReportToExcel,
  exportReportToPdf,
} from "@/lib/reports/exporters";
import type { CompanyTimesheetCalendarEntry, CompanyPublicHoliday } from "@/lib/time-tracking/schema";
import type { CompanyCalendarLeaveRequest } from "@/lib/time-tracking/schema";
import type { LeaveType } from "@/lib/work-rules/schema";

type CompanyReportsWorkspaceProps = {
  companyName: string;
  employees: Array<{
    id: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    employee_number: string;
    department_name?: string | null;
    workstation_name?: string | null;
    job_title?: string | null;
    daily_hours?: number | null;
  }>;
  departments: Array<{ id: string; name?: string; label?: string }>;
  workstations: Array<{ id: string; name?: string; label?: string }>;
  timesheetEntries: CompanyTimesheetCalendarEntry[];
  leaveRequests: CompanyCalendarLeaveRequest[];
  leaveTypes: LeaveType[];
  leaveAssignments: Array<{
    employee_id: string;
    leave_type_id: string;
    balance_hours: number | string;
    allocated_hours?: number | string;
    taken_hours?: number | string;
  }>;
  publicHolidays: CompanyPublicHoliday[];
  payrollConfig?: PayrollPeriodConfig;
};

type ReportTab = "timesheets" | "attendance" | "accruals" | "absences" | "settings";

function formatHours(val: number | string | null | undefined): string {
  return `${Number(val ?? 0).toFixed(2)}h`;
}

export default function CompanyReportsWorkspace({
  companyName,
  employees,
  departments,
  workstations,
  timesheetEntries,
  leaveRequests,
  leaveTypes,
  leaveAssignments,
  publicHolidays,
  payrollConfig = defaultPayrollConfig,
}: CompanyReportsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("timesheets");

  // Periods calculation
  const generatedPeriods = useMemo(
    () => generatePayrollPeriods(payrollConfig, new Date().toISOString().slice(0, 10), 12),
    [payrollConfig],
  );

  const initialPeriodId = generatedPeriods.find((p) => p.isCurrent)?.id ?? generatedPeriods[0]?.id ?? "custom";
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(initialPeriodId);

  const currentPeriod = useMemo(
    () => generatedPeriods.find((p) => p.id === selectedPeriodId) ?? generatedPeriods[0],
    [generatedPeriods, selectedPeriodId],
  );

  // Custom date range state if selectedPeriodId === 'custom'
  const [customStart, setCustomStart] = useState<string>(currentPeriod?.startDate ?? "2026-08-01");
  const [customEnd, setCustomEnd] = useState<string>(currentPeriod?.endDate ?? "2026-08-31");

  const effectiveStartDate = selectedPeriodId === "custom" ? customStart : (currentPeriod?.startDate ?? "2026-08-01");
  const effectiveEndDate = selectedPeriodId === "custom" ? customEnd : (currentPeriod?.endDate ?? "2026-08-31");
  const periodLabel =
    selectedPeriodId === "custom"
      ? `${formatPeriodDate(effectiveStartDate)} - ${formatPeriodDate(effectiveEndDate)}`
      : (currentPeriod?.label ?? "Selected Period");

  // Filter states
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [workstationFilter, setWorkstationFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedMobileRows, setExpandedMobileRows] = useState<Set<string>>(new Set());

  const toggleMobileRow = (id: string) => {
    setExpandedMobileRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build structured report datasets
  const aggregatorInput = useMemo(
    () => ({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      employees,
      timesheetEntries,
      leaveRequests,
      leaveTypes,
      leaveAssignments,
      publicHolidays,
    }),
    [effectiveStartDate, effectiveEndDate, employees, timesheetEntries, leaveRequests, leaveTypes, leaveAssignments, publicHolidays],
  );

  const rawTimesheetRows = useMemo(() => buildTimesheetPayrollReport(aggregatorInput), [aggregatorInput]);
  const rawAttendanceRows = useMemo(() => buildAttendanceReport(aggregatorInput), [aggregatorInput]);
  const rawAccrualRows = useMemo(() => buildAccrualReport(aggregatorInput), [aggregatorInput]);
  const rawAbsenceRows = useMemo(() => buildAbsenceReport(aggregatorInput), [aggregatorInput]);

  const kpis = useMemo(
    () => calculateReportKPIs(rawTimesheetRows, rawAttendanceRows, rawAbsenceRows, rawAccrualRows),
    [rawTimesheetRows, rawAttendanceRows, rawAbsenceRows, rawAccrualRows],
  );

  // Apply filters
  const filteredTimesheets = useMemo(() => {
    return rawTimesheetRows.filter((r) => {
      if (departmentFilter !== "all" && r.department !== departmentFilter) return false;
      if (workstationFilter !== "all" && r.workstation !== workstationFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        searchQuery &&
        !r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rawTimesheetRows, departmentFilter, workstationFilter, statusFilter, searchQuery]);

  const filteredAttendance = useMemo(() => {
    return rawAttendanceRows.filter((r) => {
      if (departmentFilter !== "all" && r.department !== departmentFilter) return false;
      if (workstationFilter !== "all" && r.workstation !== workstationFilter) return false;
      if (
        searchQuery &&
        !r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rawAttendanceRows, departmentFilter, workstationFilter, searchQuery]);

  const filteredAccruals = useMemo(() => {
    return rawAccrualRows.filter((r) => {
      if (departmentFilter !== "all" && r.department !== departmentFilter) return false;
      if (
        searchQuery &&
        !r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.leaveType.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rawAccrualRows, departmentFilter, searchQuery]);

  const filteredAbsences = useMemo(() => {
    return rawAbsenceRows.filter((r) => {
      if (departmentFilter !== "all" && r.department !== departmentFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        searchQuery &&
        !r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.leaveType.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rawAbsenceRows, departmentFilter, statusFilter, searchQuery]);

  // Export handlers
  const handleExportCsv = () => {
    const ts = new Date().toISOString().slice(0, 10);

    if (activeTab === "timesheets") {
      const headers = [
        "Employee Name",
        "Employee Number",
        "Department",
        "Workstation",
        "Work Date",
        "Clock In",
        "Lunch Start",
        "Lunch End",
        "Clock Out",
        "Normal Hours",
        "OT 1.5x Hours",
        "OT 2.0x Hours",
        "Holiday Hours",
        "Total Paid Hours",
        "Status",
        "Manager Sign-Off",
        "Compliance Flag",
        "Notes",
      ];
      const rows = filteredTimesheets.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.workDate,
        r.clockIn ?? "--",
        r.lunchStart ?? "--",
        r.lunchEnd ?? "--",
        r.clockOut ?? "--",
        r.normalHours,
        r.overtimeHours15,
        r.overtimeHours20,
        r.holidayHours,
        r.totalPaidHours,
        r.status,
        r.managerSignOff ?? "--",
        r.hasComplianceFlag ? "FLAGGED" : "OK",
        r.complianceNotes ?? "--",
      ]);
      exportReportToCsv(`Timesheet_Payroll_Report_${ts}`, headers, rows);
    } else if (activeTab === "attendance") {
      const headers = [
        "Employee Name",
        "Employee Number",
        "Department",
        "Workstation",
        "Job Title",
        "Scheduled Days",
        "Days Worked",
        "Total Hours",
        "Normal Hours",
        "Overtime Hours",
        "On-Time Days",
        "Late Arrivals",
        "Early Departures",
        "Missing Clockings",
        "Punctuality Rate %",
        "Geofence Rate %",
        "Compliance Score",
      ];
      const rows = filteredAttendance.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.jobTitle,
        r.scheduledDays,
        r.daysWorked,
        r.totalHoursWorked,
        r.normalHours,
        r.overtimeHours,
        r.onTimeArrivals,
        r.lateArrivals,
        r.earlyDepartures,
        r.missingClockings,
        `${r.punctualityRate}%`,
        `${r.geofenceComplianceRate}%`,
        r.complianceScore,
      ]);
      exportReportToCsv(`Attendance_Punctuality_Report_${ts}`, headers, rows);
    } else if (activeTab === "accruals") {
      const headers = [
        "Employee Name",
        "Employee Number",
        "Department",
        "Leave Type",
        "Opening Balance (Hrs)",
        "Accrued (Hrs)",
        "Taken (Hrs)",
        "Adjustments (Hrs)",
        "Closing Balance (Hrs)",
        "Closing Balance (Days)",
        "Projected Year-End (Hrs)",
      ];
      const rows = filteredAccruals.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.openingBalanceHours,
        r.accruedPeriodHours,
        r.takenPeriodHours,
        r.adjustmentHours,
        r.closingBalanceHours,
        r.closingBalanceDays,
        r.projectedYearEndHours,
      ]);
      exportReportToCsv(`Leave_Accrual_Report_${ts}`, headers, rows);
    } else if (activeTab === "absences") {
      const headers = [
        "Employee Name",
        "Employee Number",
        "Department",
        "Leave Type",
        "Category",
        "Start Date",
        "End Date",
        "Total Days",
        "Total Hours",
        "Paid",
        "Reason",
        "Approved By",
        "Status",
      ];
      const rows = filteredAbsences.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.leaveCategory,
        r.startDate,
        r.endDate,
        r.totalDays,
        r.totalHours,
        r.isPaid ? "Paid" : "Unpaid",
        r.reason ?? "--",
        r.approvedBy ?? "--",
        r.status,
      ]);
      exportReportToCsv(`Absence_Leave_Report_${ts}`, headers, rows);
    }
  };

  const handleExportExcel = async () => {
    const ts = new Date().toISOString().slice(0, 10);
    const metadata = {
      Company: companyName,
      "Payroll Period": periodLabel,
      "Generated On": new Date().toLocaleString("en-ZA"),
      "Total Payroll Hours": kpis.totalPayrollHours,
      "Total Regular Hours": kpis.totalRegularHours,
      "Total Overtime Hours": kpis.totalOvertimeHours,
    };

    if (activeTab === "timesheets") {
      const headers = [
        "Employee Name",
        "Employee #",
        "Department",
        "Workstation",
        "Work Date",
        "Clock In",
        "Lunch In",
        "Lunch Out",
        "Clock Out",
        "Normal (h)",
        "OT 1.5x (h)",
        "OT 2.0x (h)",
        "Holiday (h)",
        "Gross Paid (h)",
        "Status",
        "Sign-off",
        "Compliance",
      ];
      const rows = filteredTimesheets.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.workDate,
        r.clockIn ?? "--",
        r.lunchStart ?? "--",
        r.lunchEnd ?? "--",
        r.clockOut ?? "--",
        r.normalHours,
        r.overtimeHours15,
        r.overtimeHours20,
        r.holidayHours,
        r.totalPaidHours,
        r.status.toUpperCase(),
        r.managerSignOff ?? "--",
        r.complianceNotes ?? "Compliant",
      ]);
      await exportReportToExcel("Timesheet & Payroll Period Report", `Timesheet_Payroll_${ts}`, headers, rows, metadata);
    } else if (activeTab === "attendance") {
      const headers = [
        "Employee Name",
        "Employee #",
        "Department",
        "Workstation",
        "Job Title",
        "Scheduled Days",
        "Days Worked",
        "Total Hours (h)",
        "Normal (h)",
        "OT (h)",
        "On-Time Days",
        "Late",
        "Early Exit",
        "Missing Clock",
        "Punctuality %",
        "Geofence %",
        "Score",
      ];
      const rows = filteredAttendance.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.jobTitle,
        r.scheduledDays,
        r.daysWorked,
        r.totalHoursWorked,
        r.normalHours,
        r.overtimeHours,
        r.onTimeArrivals,
        r.lateArrivals,
        r.earlyDepartures,
        r.missingClockings,
        r.punctualityRate,
        r.geofenceComplianceRate,
        r.complianceScore,
      ]);
      await exportReportToExcel("Attendance & Punctuality Compliance Report", `Attendance_Report_${ts}`, headers, rows, metadata);
    } else if (activeTab === "accruals") {
      const headers = [
        "Employee Name",
        "Employee #",
        "Department",
        "Leave Type",
        "Opening Balance (h)",
        "Period Accrued (h)",
        "Period Taken (h)",
        "Adjustments (h)",
        "Closing Balance (h)",
        "Closing Balance (Days)",
        "Year-End Projection (h)",
      ];
      const rows = filteredAccruals.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.openingBalanceHours,
        r.accruedPeriodHours,
        r.takenPeriodHours,
        r.adjustmentHours,
        r.closingBalanceHours,
        r.closingBalanceDays,
        r.projectedYearEndHours,
      ]);
      await exportReportToExcel("Leave & Accrual Balance Summary", `Leave_Accrual_Report_${ts}`, headers, rows, metadata);
    } else if (activeTab === "absences") {
      const headers = [
        "Employee Name",
        "Employee #",
        "Department",
        "Leave Type",
        "Category",
        "Start Date",
        "End Date",
        "Days",
        "Hours",
        "Pay Type",
        "Reason",
        "Approved By",
        "Status",
      ];
      const rows = filteredAbsences.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.leaveCategory,
        r.startDate,
        r.endDate,
        r.totalDays,
        r.totalHours,
        r.isPaid ? "Paid" : "Unpaid",
        r.reason ?? "--",
        r.approvedBy ?? "--",
        r.status.toUpperCase(),
      ]);
      await exportReportToExcel("Absence & Leave Log", `Absence_Report_${ts}`, headers, rows, metadata);
    }
  };

  const handleExportPdf = async () => {
    const ts = new Date().toISOString().slice(0, 10);
    const kpiSummary = [
      { label: "Payroll Hours", value: `${kpis.totalPayrollHours}h` },
      { label: "Regular Hours", value: `${kpis.totalRegularHours}h` },
      { label: "Overtime Hours", value: `${kpis.totalOvertimeHours}h` },
      { label: "Punctuality", value: `${kpis.averagePunctualityRate}%` },
      { label: "Attendance", value: `${kpis.averageAttendanceRate}%` },
      { label: "Leave Hours", value: `${kpis.totalLeaveHours}h` },
    ];

    if (activeTab === "timesheets") {
      const headers = [
        "Employee",
        "Emp #",
        "Dept",
        "Work Date",
        "In",
        "Lunch",
        "Out",
        "Normal",
        "OT 1.5x",
        "OT 2.0x",
        "Total Paid",
        "Status",
      ];
      const rows = filteredTimesheets.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workDate,
        r.clockIn ?? "--",
        r.lunchStart && r.lunchEnd ? `${r.lunchStart}-${r.lunchEnd}` : "--",
        r.clockOut ?? "--",
        formatHours(r.normalHours),
        formatHours(r.overtimeHours15),
        formatHours(r.overtimeHours20),
        formatHours(r.totalPaidHours),
        r.status.toUpperCase(),
      ]);
      await exportReportToPdf("Timesheet & Payroll Period Report", `Timesheet_Payroll_${ts}`, companyName, periodLabel, headers, rows, kpiSummary);
    } else if (activeTab === "attendance") {
      const headers = [
        "Employee",
        "Emp #",
        "Dept",
        "Workstation",
        "Days Sched",
        "Days Worked",
        "Total (h)",
        "OT (h)",
        "Late",
        "Missing",
        "Punctual %",
        "Score",
      ];
      const rows = filteredAttendance.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.scheduledDays,
        r.daysWorked,
        formatHours(r.totalHoursWorked),
        formatHours(r.overtimeHours),
        r.lateArrivals,
        r.missingClockings,
        `${r.punctualityRate}%`,
        `${r.complianceScore}/100`,
      ]);
      await exportReportToPdf("Attendance & Compliance Report", `Attendance_Report_${ts}`, companyName, periodLabel, headers, rows, kpiSummary);
    } else if (activeTab === "accruals") {
      const headers = [
        "Employee",
        "Emp #",
        "Dept",
        "Leave Type",
        "Opening (h)",
        "Accrued (h)",
        "Taken (h)",
        "Closing (h)",
        "Closing (Days)",
        "Year-End (h)",
      ];
      const rows = filteredAccruals.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        formatHours(r.openingBalanceHours),
        formatHours(r.accruedPeriodHours),
        formatHours(r.takenPeriodHours),
        formatHours(r.closingBalanceHours),
        `${r.closingBalanceDays}d`,
        formatHours(r.projectedYearEndHours),
      ]);
      await exportReportToPdf("Leave & Accrual Balance Summary", `Leave_Accruals_${ts}`, companyName, periodLabel, headers, rows, kpiSummary);
    } else if (activeTab === "absences") {
      const headers = [
        "Employee",
        "Emp #",
        "Dept",
        "Leave Type",
        "Start Date",
        "End Date",
        "Days",
        "Hours",
        "Pay Type",
        "Status",
      ];
      const rows = filteredAbsences.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.startDate,
        r.endDate,
        `${r.totalDays}d`,
        formatHours(r.totalHours),
        r.isPaid ? "Paid" : "Unpaid",
        r.status.toUpperCase(),
      ]);
      await exportReportToPdf("Absence & Leave Log", `Absence_Report_${ts}`, companyName, periodLabel, headers, rows, kpiSummary);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Timesheet Totals Calculation
  const timesheetTotals = useMemo(() => {
    let normal = 0;
    let ot15 = 0;
    let ot20 = 0;
    let holiday = 0;
    let totalPaid = 0;

    for (const r of filteredTimesheets) {
      normal += r.normalHours;
      ot15 += r.overtimeHours15;
      ot20 += r.overtimeHours20;
      holiday += r.holidayHours;
      totalPaid += r.totalPaidHours;
    }

    return {
      normal: Number(normal.toFixed(2)),
      ot15: Number(ot15.toFixed(2)),
      ot20: Number(ot20.toFixed(2)),
      holiday: Number(holiday.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
    };
  }, [filteredTimesheets]);

  return (
    <div className="grid min-w-0 gap-5">
      {/* Top Header & Sticky Control Bar */}
      <div className="rounded-xl border-2 border-slate-900 bg-slate-950 p-4 sm:p-5 text-white shadow-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                Compliance &amp; Payroll Intelligence
              </span>
              <span className="text-xs font-bold text-slate-400">· {companyName}</span>
            </div>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">
              Compliance &amp; Payroll Reporting Center
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Audit timesheets by payroll period, analyze attendance punctuality, track leave accruals, and pull compliance exports.
            </p>
          </div>

          {/* 1-Click Export Actions Bar */}
          {activeTab !== "settings" && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold text-white shadow-xs hover:bg-rose-700 transition-all"
                title="Download formatted audit PDF"
              >
                <Download className="size-3 sm:size-3.5" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 transition-all"
                title="Download formatted Excel workbook"
              >
                <FileSpreadsheet className="size-3 sm:size-3.5" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold text-slate-200 hover:bg-slate-800 transition-all"
                title="Download CSV for payroll software import"
              >
                <ArrowDownToLine className="size-3 sm:size-3.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold text-slate-200 hover:bg-slate-800 transition-all"
                title="Print report"
              >
                <Printer className="size-3 sm:size-3.5" />
                <span>Print</span>
              </button>
            </div>
          )}
        </div>

        {/* Global Period & Query Filter Bar */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 lg:grid-cols-4">
          {/* Payroll Period Dropdown */}
          <div className="grid gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Payroll Period
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-extrabold text-white outline-none focus:border-emerald-500"
            >
              {generatedPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isCurrent ? `(Current) ${p.label}` : p.label}
                </option>
              ))}
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="grid gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
            >
              <option value="all">All Departments ({departments.length})</option>
              {departments.map((d) => {
                const name = d.name ?? d.label ?? "General";
                return (
                  <option key={d.id} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Workstation Filter */}
          <div className="grid gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Workstation / Site
            </label>
            <select
              value={workstationFilter}
              onChange={(e) => setWorkstationFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
            >
              <option value="all">All Workstations ({workstations.length})</option>
              {workstations.map((w) => {
                const name = w.name ?? w.label ?? "Workstation";
                return (
                  <option key={w.id} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Search Query */}
          <div className="grid gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Search Employee
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or employee #..."
                className="h-10 min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-900 pl-10 pr-3.5 py-2 text-xs font-bold text-white placeholder:text-slate-500 outline-none focus:border-emerald-500 leading-normal"
              />
            </div>
          </div>
        </div>

        {/* Custom Date Range Pickers (if custom selected) */}
        {selectedPeriodId === "custom" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 text-xs">
            <span className="font-extrabold text-slate-300">Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 min-h-[36px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white outline-none leading-normal"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 min-h-[36px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white outline-none leading-normal"
              />
            </div>
          </div>
        )}
      </div>

      {/* Visual Analytics KPI Highlights Strip */}
      {/* Mobile: Ultra-Minimal 3-Metric Executive Snapshot */}
      <div className="grid grid-cols-3 gap-1.5 md:hidden min-w-0">
        <div className="rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-white shadow-2xs">
          <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-300 block truncate">
            Gross Paid
          </span>
          <p className="text-sm font-black text-emerald-400 truncate">{kpis.totalPayrollHours}h</p>
        </div>

        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-950 shadow-2xs">
          <span className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-800 block truncate">
            Punctual
          </span>
          <p className="text-sm font-black text-emerald-900 truncate">{kpis.averagePunctualityRate}%</p>
        </div>

        <div
          className={`rounded-lg border px-2.5 py-1.5 shadow-2xs ${
            kpis.missingClockingCount > 0
              ? "border-rose-300 bg-rose-50 text-rose-950"
              : "border-slate-200 bg-white text-foreground"
          }`}
        >
          <span
            className={`text-[8.5px] font-bold uppercase tracking-wider block truncate ${
              kpis.missingClockingCount > 0 ? "text-rose-800" : "text-muted"
            }`}
          >
            Exceptions
          </span>
          <p
            className={`text-sm font-black truncate ${
              kpis.missingClockingCount > 0 ? "text-rose-900" : "text-foreground"
            }`}
          >
            {kpis.missingClockingCount}
          </p>
        </div>
      </div>

      {/* Desktop: Full 6-Card Visual Analytics KPI Highlights Strip */}
      <div className="hidden md:grid grid-cols-2 gap-2 min-[540px]:grid-cols-3 lg:grid-cols-6 min-w-0">
        {/* Total Payroll Hours */}
        <div className="rounded-xl border-2 border-slate-900 bg-slate-900 p-3 text-white shadow-2xs min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 truncate whitespace-nowrap">
              Gross Payroll
            </p>
            <Clock3 className="size-3.5 text-emerald-400 shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-black truncate">{kpis.totalPayrollHours}h</p>
          <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-300 truncate">
            <span>Reg: {kpis.totalRegularHours}h</span>
            <span>OT: {kpis.totalOvertimeHours}h</span>
          </div>
        </div>

        {/* Overtime Hours */}
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50/90 p-3 text-amber-950 shadow-2xs min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 truncate whitespace-nowrap">
              Overtime
            </p>
            <TrendingUp className="size-3.5 text-amber-700 shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-black text-amber-950 truncate">{kpis.totalOvertimeHours}h</p>
          <p className="mt-1 text-[10px] font-bold text-amber-800 truncate">
            1.5x &amp; 2.0x Rate
          </p>
        </div>

        {/* Average Punctuality Rate */}
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/90 p-3 text-emerald-950 shadow-2xs min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 truncate whitespace-nowrap">
              Punctuality
            </p>
            <Percent className="size-3.5 text-emerald-700 shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-black text-emerald-950 truncate">{kpis.averagePunctualityRate}%</p>
          <p className="mt-1 text-[10px] font-bold text-emerald-800 truncate">
            On-Time Arrival Rate
          </p>
        </div>

        {/* Attendance Rate */}
        <div className="rounded-xl border-2 border-indigo-400 bg-indigo-50/90 p-3 text-indigo-950 shadow-2xs min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 truncate whitespace-nowrap">
              Attendance
            </p>
            <Users className="size-3.5 text-indigo-700 shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-black text-indigo-950 truncate">{kpis.averageAttendanceRate}%</p>
          <p className="mt-1 text-[10px] font-bold text-indigo-800 truncate">
            {kpis.totalEmployees} Active Colleagues
          </p>
        </div>

        {/* Leave & Accruals */}
        <div className="rounded-xl border-2 border-purple-400 bg-purple-50/90 p-3 text-purple-950 shadow-2xs min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800 truncate whitespace-nowrap">
              Leave Taken
            </p>
            <CalendarDays className="size-3.5 text-purple-700 shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-black text-purple-950 truncate">{kpis.totalLeaveHours}h</p>
          <p className="mt-1 text-[10px] font-bold text-purple-800 truncate">
            {kpis.totalAbsenceDays} Absence Days
          </p>
        </div>

        {/* Missing Clockings */}
        <div className={`rounded-xl border-2 p-3 shadow-2xs min-w-0 ${
          kpis.missingClockingCount > 0
            ? "border-rose-500 bg-rose-50/90 text-rose-950"
            : "border-border bg-surface text-foreground"
        }`}>
          <div className="flex items-center justify-between">
            <p className={`text-[10px] font-bold uppercase tracking-wider truncate whitespace-nowrap ${
              kpis.missingClockingCount > 0 ? "text-rose-800" : "text-muted"
            }`}>
              Exceptions
            </p>
            <AlertTriangle className={`size-3.5 shrink-0 ${
              kpis.missingClockingCount > 0 ? "text-rose-600" : "text-muted"
            }`} />
          </div>
          <p className={`mt-1 text-2xl font-black truncate ${
            kpis.missingClockingCount > 0 ? "text-rose-950" : "text-foreground"
          }`}>
            {kpis.missingClockingCount}
          </p>
          <p className={`mt-1 text-[10px] font-bold truncate ${
            kpis.missingClockingCount > 0 ? "text-rose-800" : "text-muted"
          }`}>
            Missing Clock Events
          </p>
        </div>
      </div>

      {/* Segmented Navigation Tab Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 shadow-2xs scrollbar-none">
        {(
          [
            ["timesheets", "Timesheets & Payroll", FileSpreadsheet],
            ["attendance", "Attendance & Punctuality", BarChart3],
            ["accruals", "Leave & TOIL Accruals", Layers],
            ["absences", "Absence Log", CalendarDays],
            ["settings", "Payroll Period Setup", Cog],
          ] as const
        ).map(([tab, label, Icon]) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                isActive
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content 1: Timesheets & Payroll Report */}
      {activeTab === "timesheets" && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-foreground">
                Timesheet &amp; Payroll Hours ({filteredTimesheets.length} logs)
              </h3>
              <p className="text-xs text-muted">
                Audit daily time logs, overtime breakdowns (1.5x &amp; 2.0x), holiday hours, and manager approval sign-offs for {periodLabel}.
              </p>
            </div>

            {/* Quick Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-muted">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9.5 min-h-[38px] rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground outline-none leading-normal"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved Only</option>
                <option value="submitted">Submitted Only</option>
                <option value="draft">Draft Only</option>
                <option value="rejected">Rejected Only</option>
              </select>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border-2 border-slate-300 bg-surface shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b-2 border-slate-900 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-3.5 py-2.5">Employee</th>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5">Work Date</th>
                    <th className="px-2.5 py-2.5 text-center">Clock In</th>
                    <th className="px-2.5 py-2.5 text-center">Lunch</th>
                    <th className="px-2.5 py-2.5 text-center">Clock Out</th>
                    <th className="px-2.5 py-2.5 text-right">Normal</th>
                    <th className="px-2.5 py-2.5 text-right">OT 1.5x</th>
                    <th className="px-2.5 py-2.5 text-right">OT 2.0x</th>
                    <th className="px-2.5 py-2.5 text-right">Holiday</th>
                    <th className="px-3 py-2.5 text-right">Total Paid</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTimesheets.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-sm font-semibold text-muted">
                        No timesheet records match the selected period and filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTimesheets.map((row) => {
                      const isApproved = row.status === "approved";
                      const isRejected = row.status === "rejected";
                      const isSubmitted = row.status === "submitted";

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-2 font-extrabold text-foreground">
                            <div>
                              <p className="truncate text-xs font-black">{row.employeeName}</p>
                              <p className="text-[10px] font-medium text-muted">#{row.employeeNumber}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-semibold text-muted truncate max-w-[120px]">
                            {row.department}
                          </td>
                          <td className="px-3 py-2 font-extrabold text-foreground whitespace-nowrap">
                            {formatPeriodDate(row.workDate)}
                          </td>
                          <td className="px-2.5 py-2 text-center font-bold text-foreground whitespace-nowrap">
                            {row.clockIn ?? "--"}
                          </td>
                          <td className="px-2.5 py-2 text-center font-bold text-muted whitespace-nowrap">
                            {row.lunchStart && row.lunchEnd ? `${row.lunchStart}-${row.lunchEnd}` : "--"}
                          </td>
                          <td className="px-2.5 py-2 text-center font-bold text-foreground whitespace-nowrap">
                            {row.clockOut ?? "--"}
                          </td>
                          <td className="px-2.5 py-2 text-right font-bold text-slate-800">
                            {formatHours(row.normalHours)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-bold text-amber-700">
                            {row.overtimeHours15 > 0 ? formatHours(row.overtimeHours15) : "–"}
                          </td>
                          <td className="px-2.5 py-2 text-right font-bold text-amber-800">
                            {row.overtimeHours20 > 0 ? formatHours(row.overtimeHours20) : "–"}
                          </td>
                          <td className="px-2.5 py-2 text-right font-bold text-purple-700">
                            {row.holidayHours > 0 ? formatHours(row.holidayHours) : "–"}
                          </td>
                          <td className="px-3 py-2 text-right font-black text-emerald-950 bg-emerald-50/50">
                            {formatHours(row.totalPaidHours)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-2xs whitespace-nowrap ${
                                isApproved
                                  ? "bg-emerald-600"
                                  : isRejected
                                    ? "bg-rose-600"
                                    : isSubmitted
                                      ? "bg-slate-900"
                                      : "bg-amber-500"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {row.hasComplianceFlag ? (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900 border border-rose-300">
                                <AlertTriangle className="size-3 text-rose-600" />
                                {row.complianceNotes || "Needs Review"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 className="size-3 text-emerald-600" />
                                Compliant
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {/* Summary Table Footer */}
                {filteredTimesheets.length > 0 && (
                  <tfoot className="border-t-2 border-slate-900 bg-slate-100 font-black text-slate-900">
                    <tr>
                      <td colSpan={6} className="px-3.5 py-2.5 text-right uppercase tracking-wider text-[11px]">
                        Period Summary Totals ({filteredTimesheets.length} entries):
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black text-slate-900">
                        {formatHours(timesheetTotals.normal)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black text-amber-800">
                        {formatHours(timesheetTotals.ot15)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black text-amber-900">
                        {formatHours(timesheetTotals.ot20)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black text-purple-900">
                        {formatHours(timesheetTotals.holiday)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-black text-emerald-950 bg-emerald-100/80 text-sm">
                        {formatHours(timesheetTotals.totalPaid)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Mobile Consolidated Minimal List */}
          <div className="grid gap-1.5 md:hidden min-w-0">
            {filteredTimesheets.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-surface p-6 text-center text-xs font-semibold text-muted">
                No timesheet records match the selected period and filters.
              </div>
            ) : (
              filteredTimesheets.map((row) => {
                const isExpanded = expandedMobileRows.has(row.id);
                const isApproved = row.status === "approved";
                const isRejected = row.status === "rejected";
                const isSubmitted = row.status === "submitted";

                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMobileRow(row.id)}
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown
                          className={`size-3.5 text-slate-400 shrink-0 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-extrabold text-foreground truncate">{row.employeeName}</p>
                          <p className="text-[10px] font-medium text-muted truncate">
                            {formatPeriodDate(row.workDate)} · #{row.employeeNumber}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white ${
                            isApproved
                              ? "bg-emerald-600"
                              : isRejected
                                ? "bg-rose-600"
                                : isSubmitted
                                  ? "bg-slate-900"
                                  : "bg-amber-500"
                          }`}
                        >
                          {row.status}
                        </span>
                        <span className="font-black text-slate-900 text-xs bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                          {formatHours(row.totalPaidHours)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 grid gap-1.5 text-[11px]">
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Clock In</span>
                            <span className="font-extrabold text-foreground">{row.clockIn ?? "--"}</span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Lunch</span>
                            <span className="font-extrabold text-foreground">
                              {row.lunchStart && row.lunchEnd ? `${row.lunchStart}-${row.lunchEnd}` : "--"}
                            </span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Clock Out</span>
                            <span className="font-extrabold text-foreground">{row.clockOut ?? "--"}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-slate-200/60">
                          <span className="text-muted">Regular: {formatHours(row.normalHours)} · OT: {formatHours(row.overtimeHours15 + row.overtimeHours20)}</span>
                          {row.hasComplianceFlag ? (
                            <span className="text-rose-700 font-extrabold flex items-center gap-1">
                              <AlertTriangle className="size-2.5" />
                              {row.complianceNotes || "Needs Review"}
                            </span>
                          ) : (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="size-2.5" />
                              Compliant
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab Content 2: Attendance & Punctuality Report */}
      {activeTab === "attendance" && (
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-extrabold text-foreground">
              Attendance &amp; Punctuality Compliance ({filteredAttendance.length} employees)
            </h3>
            <p className="text-xs text-muted">
              Evaluates shifts scheduled vs worked, on-time arrivals, late arrivals, missing clockings, and geofence compliance scores.
            </p>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border-2 border-slate-300 bg-surface shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b-2 border-slate-900 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-3.5 py-2.5">Employee</th>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5">Workstation</th>
                    <th className="px-2.5 py-2.5 text-center">Days Sched</th>
                    <th className="px-2.5 py-2.5 text-center">Days Worked</th>
                    <th className="px-2.5 py-2.5 text-right">Worked (h)</th>
                    <th className="px-2.5 py-2.5 text-right">OT (h)</th>
                    <th className="px-2.5 py-2.5 text-center">Late</th>
                    <th className="px-2.5 py-2.5 text-center">Missing</th>
                    <th className="px-3 py-2.5 text-center">Punctuality %</th>
                    <th className="px-3 py-2.5 text-center">Geofence %</th>
                    <th className="px-3.5 py-2.5 text-right">Compliance Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-sm font-semibold text-muted">
                        No employee attendance data available for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendance.map((row) => (
                      <tr key={row.employeeId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2 font-extrabold text-foreground">
                          <div>
                            <p className="truncate text-xs font-black">{row.employeeName}</p>
                            <p className="text-[10px] font-medium text-muted">#{row.employeeNumber} · {row.jobTitle}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-muted">{row.department}</td>
                        <td className="px-3 py-2 font-semibold text-muted">{row.workstation}</td>
                        <td className="px-2.5 py-2 text-center font-bold text-muted">{row.scheduledDays}d</td>
                        <td className="px-2.5 py-2 text-center font-extrabold text-foreground">{row.daysWorked}d</td>
                        <td className="px-2.5 py-2 text-right font-black text-foreground">{formatHours(row.totalHoursWorked)}</td>
                        <td className="px-2.5 py-2 text-right font-bold text-amber-700">{formatHours(row.overtimeHours)}</td>
                        <td className="px-2.5 py-2 text-center font-bold text-rose-700">
                          {row.lateArrivals > 0 ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-900 font-extrabold">
                              {row.lateArrivals}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-center font-bold text-amber-700">
                          {row.missingClockings > 0 ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 font-extrabold">
                              {row.missingClockings}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-black">
                          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-black ${
                            row.punctualityRate >= 90
                              ? "bg-emerald-100 text-emerald-950"
                              : row.punctualityRate >= 75
                                ? "bg-amber-100 text-amber-950"
                                : "bg-rose-100 text-rose-950"
                          }`}>
                            {row.punctualityRate}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold">
                          <span className="text-slate-800">{row.geofenceComplianceRate}%</span>
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full ${
                                  row.complianceScore >= 85
                                    ? "bg-emerald-600"
                                    : row.complianceScore >= 70
                                      ? "bg-amber-500"
                                      : "bg-rose-600"
                                }`}
                                style={{ width: `${row.complianceScore}%` }}
                              />
                            </div>
                            <span className="font-black text-foreground">{row.complianceScore}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Consolidated Minimal List */}
          <div className="grid gap-1.5 md:hidden min-w-0">
            {filteredAttendance.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-surface p-6 text-center text-xs font-semibold text-muted">
                No employee attendance data available for this filter.
              </div>
            ) : (
              filteredAttendance.map((row) => {
                const isExpanded = expandedMobileRows.has(row.employeeId);

                return (
                  <div
                    key={row.employeeId}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMobileRow(row.employeeId)}
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown
                          className={`size-3.5 text-slate-400 shrink-0 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-extrabold text-foreground truncate">{row.employeeName}</p>
                          <p className="text-[10px] font-medium text-muted truncate">
                            {row.department} · {row.daysWorked}/{row.scheduledDays}d
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black ${
                            row.complianceScore >= 85
                              ? "bg-emerald-100 text-emerald-950"
                              : row.complianceScore >= 70
                                ? "bg-amber-100 text-amber-950"
                                : "bg-rose-100 text-rose-950"
                          }`}
                        >
                          {row.complianceScore}/100
                        </span>
                        <span className="font-black text-slate-900 text-xs bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                          {formatHours(row.totalHoursWorked)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 grid gap-1.5 text-[11px]">
                        <div className="grid grid-cols-4 gap-1 text-center">
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">On-Time</span>
                            <span className={`font-extrabold ${row.punctualityRate >= 90 ? "text-emerald-700" : "text-amber-700"}`}>
                              {row.punctualityRate}%
                            </span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Geofence</span>
                            <span className="font-extrabold text-slate-800">{row.geofenceComplianceRate}%</span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Late</span>
                            <span className={`font-extrabold ${row.lateArrivals > 0 ? "text-rose-700" : "text-slate-600"}`}>
                              {row.lateArrivals}
                            </span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Missing</span>
                            <span className={`font-extrabold ${row.missingClockings > 0 ? "text-amber-700" : "text-slate-600"}`}>
                              {row.missingClockings}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-slate-200/60 text-muted">
                          <span>Overtime: {formatHours(row.overtimeHours)}</span>
                          <span>Workstation: {row.workstation}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab Content 3: Leave & TOIL Accruals Report */}
      {activeTab === "accruals" && (
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-extrabold text-foreground">
              Leave &amp; TOIL Accruals Summary ({filteredAccruals.length} balances)
            </h3>
            <p className="text-xs text-muted">
              Opening balance, period earned, taken hours, and projected closing balances across all leave categories.
            </p>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border-2 border-slate-300 bg-surface shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b-2 border-slate-900 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-3.5 py-2.5">Employee</th>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5">Leave Type</th>
                    <th className="px-3 py-2.5 text-right">Opening (h)</th>
                    <th className="px-3 py-2.5 text-right">Accrued (h)</th>
                    <th className="px-3 py-2.5 text-right">Taken (h)</th>
                    <th className="px-3 py-2.5 text-right">Closing (h)</th>
                    <th className="px-3 py-2.5 text-right">Closing (Days)</th>
                    <th className="px-3.5 py-2.5 text-right">Projected Year-End (h)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAccruals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-sm font-semibold text-muted">
                        No leave accrual records found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAccruals.map((row, idx) => (
                      <tr key={`${row.employeeId}-${row.leaveType}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2 font-extrabold text-foreground">
                          <div>
                            <p className="truncate text-xs font-black">{row.employeeName}</p>
                            <p className="text-[10px] font-medium text-muted">#{row.employeeNumber}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-muted">{row.department}</td>
                        <td className="px-3 py-2 font-extrabold text-foreground">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-900 border border-slate-200">
                            {row.leaveType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-muted">{formatHours(row.openingBalanceHours)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700">+{formatHours(row.accruedPeriodHours)}</td>
                        <td className="px-3 py-2 text-right font-bold text-rose-700">-{formatHours(row.takenPeriodHours)}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-950 bg-slate-100/60 text-xs">
                          {formatHours(row.closingBalanceHours)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-indigo-950">
                          {row.closingBalanceDays}d
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-emerald-800">
                          {formatHours(row.projectedYearEndHours)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Consolidated Minimal List */}
          <div className="grid gap-1.5 md:hidden min-w-0">
            {filteredAccruals.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-surface p-6 text-center text-xs font-semibold text-muted">
                No leave accrual records found for this filter.
              </div>
            ) : (
              filteredAccruals.map((row, idx) => {
                const rowKey = `${row.employeeId}-${row.leaveType}-${idx}`;
                const isExpanded = expandedMobileRows.has(rowKey);

                return (
                  <div
                    key={rowKey}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMobileRow(rowKey)}
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown
                          className={`size-3.5 text-slate-400 shrink-0 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-extrabold text-foreground truncate">{row.employeeName}</p>
                          <p className="text-[10px] font-medium text-muted truncate">
                            {row.leaveType} · #{row.employeeNumber}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-900 border border-indigo-200">
                          {row.closingBalanceDays}d
                        </span>
                        <span className="font-black text-slate-900 text-xs bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                          {formatHours(row.closingBalanceHours)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 grid gap-1.5 text-[11px]">
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Opening</span>
                            <span className="font-bold text-muted">{formatHours(row.openingBalanceHours)}</span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Earned</span>
                            <span className="font-extrabold text-emerald-700">+{formatHours(row.accruedPeriodHours)}</span>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-1">
                            <span className="text-[8.5px] font-bold text-muted block uppercase">Taken</span>
                            <span className="font-extrabold text-rose-700">-{formatHours(row.takenPeriodHours)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-slate-200/60 text-muted">
                          <span>Department: {row.department}</span>
                          <span>Year-End Est: <strong className="text-emerald-800">{formatHours(row.projectedYearEndHours)}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab Content 4: Absence & Leave Log */}
      {activeTab === "absences" && (
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-extrabold text-foreground">
              Absence &amp; Leave Log ({filteredAbsences.length} requests)
            </h3>
            <p className="text-xs text-muted">
              Historical record of all approved, submitted, and rejected leave requests and reasons for {periodLabel}.
            </p>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border-2 border-slate-300 bg-surface shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b-2 border-slate-900 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-3.5 py-2.5">Employee</th>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5">Leave Type</th>
                    <th className="px-3 py-2.5">Start Date</th>
                    <th className="px-3 py-2.5">End Date</th>
                    <th className="px-2.5 py-2.5 text-center">Days</th>
                    <th className="px-2.5 py-2.5 text-right">Hours</th>
                    <th className="px-2.5 py-2.5 text-center">Pay Type</th>
                    <th className="px-3.5 py-2.5">Reason &amp; Manager Sign-off</th>
                    <th className="px-3.5 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAbsences.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-sm font-semibold text-muted">
                        No absence or leave records for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredAbsences.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2 font-extrabold text-foreground">
                          <div>
                            <p className="truncate text-xs font-black">{row.employeeName}</p>
                            <p className="text-[10px] font-medium text-muted">#{row.employeeNumber}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-muted">{row.department}</td>
                        <td className="px-3 py-2 font-extrabold text-foreground">
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-900 border border-indigo-200">
                            {row.leaveType}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{formatPeriodDate(row.startDate)}</td>
                        <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{formatPeriodDate(row.endDate)}</td>
                        <td className="px-2.5 py-2 text-center font-extrabold text-foreground">{row.totalDays}d</td>
                        <td className="px-2.5 py-2 text-right font-black text-foreground">{formatHours(row.totalHours)}</td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            row.isPaid ? "bg-emerald-100 text-emerald-950" : "bg-slate-100 text-slate-800"
                          }`}>
                            {row.isPaid ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-xs text-muted max-w-[200px] truncate">
                          {row.reason ? `"${row.reason}"` : "--"}
                          {row.approvedBy ? <span className="block text-[10px] font-bold text-emerald-700">✓ {row.approvedBy}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-2xs ${
                            row.status === "approved"
                              ? "bg-emerald-600"
                              : row.status === "rejected"
                                ? "bg-rose-600"
                                : "bg-amber-500"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Consolidated Minimal List */}
          <div className="grid gap-1.5 md:hidden min-w-0">
            {filteredAbsences.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-surface p-6 text-center text-xs font-semibold text-muted">
                No absence or leave records for this period.
              </div>
            ) : (
              filteredAbsences.map((row) => {
                const isExpanded = expandedMobileRows.has(row.id);
                const isApproved = row.status === "approved";
                const isRejected = row.status === "rejected";

                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMobileRow(row.id)}
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown
                          className={`size-3.5 text-slate-400 shrink-0 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-extrabold text-foreground truncate">{row.employeeName}</p>
                          <p className="text-[10px] font-medium text-muted truncate">
                            {formatPeriodDate(row.startDate)} → {formatPeriodDate(row.endDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white ${
                            isApproved
                              ? "bg-emerald-600"
                              : isRejected
                                ? "bg-rose-600"
                                : "bg-amber-500"
                          }`}
                        >
                          {row.status}
                        </span>
                        <span className="font-black text-slate-900 text-xs bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                          {row.totalDays}d
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 grid gap-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-indigo-950">{row.leaveType}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            row.isPaid ? "bg-emerald-100 text-emerald-950" : "bg-slate-200 text-slate-800"
                          }`}>
                            {row.isPaid ? "Paid Leave" : "Unpaid Leave"} ({formatHours(row.totalHours)})
                          </span>
                        </div>

                        {(row.reason || row.approvedBy) && (
                          <div className="border-t border-slate-200/60 pt-1 text-[10px] text-muted">
                            {row.reason && <p className="italic">&ldquo;{row.reason}&rdquo;</p>}
                            {row.approvedBy && <p className="font-bold text-emerald-700 mt-0.5">✓ {row.approvedBy}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab Content 5: Payroll Period Setup */}
      {activeTab === "settings" && (
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-extrabold text-foreground">
              Company Payroll Period Rules &amp; Schedule
            </h3>
            <p className="text-xs text-muted">
              Configure how payroll batches and reporting cycles are generated across the platform.
            </p>
          </div>
          <PayrollPeriodSettingsForm initialConfig={payrollConfig} />
        </div>
      )}
    </div>
  );
}
