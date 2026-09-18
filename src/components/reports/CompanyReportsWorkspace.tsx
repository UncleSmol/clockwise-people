"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cog,
  Download,
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Sparkles,
  Users,
} from "lucide-react";
import PayrollPeriodSettingsForm from "./PayrollPeriodSettingsForm";
import ReportsOverviewAnalytics from "./ReportsOverviewAnalytics";
import TimesheetPayrollReportTable from "./TimesheetPayrollReportTable";
import AttendanceReportTable from "./AttendanceReportTable";
import LeaveAccrualReportTable from "./LeaveAccrualReportTable";
import AbsenceReportTable from "./AbsenceReportTable";
import EmployeeHoursSummaryReportTable from "./EmployeeHoursSummaryReportTable";
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
  buildEmployeeHoursSummaryReport,
  calculateReportKPIs,
  buildDailyAttendanceStats,
  buildComplianceDistributionStats,
  buildLeaveCategoryStats,
  buildDepartmentWorkloadStats,
  buildWorkstationWorkloadStats,
} from "@/lib/reports/aggregators";
import {
  exportReportToCsv,
  exportReportToPdf,
  exportCompleteAuditPackExcel,
} from "@/lib/reports/exporters";
import type {
  CompanyTimesheetCalendarEntry,
  CompanyPublicHoliday,
  CompanyCalendarLeaveRequest,
} from "@/lib/time-tracking/schema";
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

type ReportTab =
  | "analytics"
  | "employee-summary"
  | "attendance"
  | "timesheets"
  | "accruals"
  | "absences"
  | "settings";

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
  const [activeTab, setActiveTab] = useState<ReportTab>("analytics");

  // Periods calculation
  const generatedPeriods = useMemo(
    () =>
      generatePayrollPeriods(
        payrollConfig,
        new Date().toISOString().slice(0, 10),
        12,
      ),
    [payrollConfig],
  );

  const initialPeriodId =
    generatedPeriods.find((p) => p.isCurrent)?.id ??
    generatedPeriods[0]?.id ??
    "custom";
  const [selectedPeriodId, setSelectedPeriodId] =
    useState<string>(initialPeriodId);

  const currentPeriod = useMemo(
    () =>
      generatedPeriods.find((p) => p.id === selectedPeriodId) ??
      generatedPeriods[0],
    [generatedPeriods, selectedPeriodId],
  );

  // Custom date range
  const [customStart, setCustomStart] = useState<string>(
    currentPeriod?.startDate ?? "2026-08-01",
  );
  const [customEnd, setCustomEnd] = useState<string>(
    currentPeriod?.endDate ?? "2026-08-31",
  );

  const effectiveStartDate =
    selectedPeriodId === "custom"
      ? customStart
      : (currentPeriod?.startDate ?? "2026-08-01");
  const effectiveEndDate =
    selectedPeriodId === "custom"
      ? customEnd
      : (currentPeriod?.endDate ?? "2026-08-31");
  const periodLabel =
    selectedPeriodId === "custom"
      ? `${formatPeriodDate(effectiveStartDate)} - ${formatPeriodDate(effectiveEndDate)}`
      : (currentPeriod?.label ?? "Selected Period");

  // Filter states
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [workstationFilter, setWorkstationFilter] = useState<string>("all");

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
    [
      effectiveStartDate,
      effectiveEndDate,
      employees,
      timesheetEntries,
      leaveRequests,
      leaveTypes,
      leaveAssignments,
      publicHolidays,
    ],
  );

  const rawEmployeeSummaryRows = useMemo(
    () => buildEmployeeHoursSummaryReport(aggregatorInput),
    [aggregatorInput],
  );
  const rawTimesheetRows = useMemo(
    () => buildTimesheetPayrollReport(aggregatorInput),
    [aggregatorInput],
  );
  const rawAttendanceRows = useMemo(
    () => buildAttendanceReport(aggregatorInput),
    [aggregatorInput],
  );
  const rawAccrualRows = useMemo(
    () => buildAccrualReport(aggregatorInput),
    [aggregatorInput],
  );
  const rawAbsenceRows = useMemo(
    () => buildAbsenceReport(aggregatorInput),
    [aggregatorInput],
  );

  const kpis = useMemo(
    () =>
      calculateReportKPIs(
        rawTimesheetRows,
        rawAttendanceRows,
        rawAbsenceRows,
        rawAccrualRows,
      ),
    [rawTimesheetRows, rawAttendanceRows, rawAbsenceRows, rawAccrualRows],
  );

  // Filtered rows for active tables
  const filteredEmployeeSummaryRows = useMemo(() => {
    return rawEmployeeSummaryRows.filter((r) => {
      if (employeeFilter !== "all" && r.employeeId !== employeeFilter)
        return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter)
        return false;
      if (workstationFilter !== "all" && r.workstation !== workstationFilter)
        return false;
      return true;
    });
  }, [rawEmployeeSummaryRows, employeeFilter, departmentFilter, workstationFilter]);

  const filteredTimesheets = useMemo(() => {
    return rawTimesheetRows.filter((r) => {
      if (employeeFilter !== "all" && r.employeeId !== employeeFilter)
        return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter)
        return false;
      if (workstationFilter !== "all" && r.workstation !== workstationFilter)
        return false;
      return true;
    });
  }, [rawTimesheetRows, employeeFilter, departmentFilter, workstationFilter]);

  const filteredAttendance = useMemo(() => {
    return rawAttendanceRows.filter((r) => {
      if (employeeFilter !== "all" && r.employeeId !== employeeFilter)
        return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter)
        return false;
      if (workstationFilter !== "all" && r.workstation !== workstationFilter)
        return false;
      return true;
    });
  }, [rawAttendanceRows, employeeFilter, departmentFilter, workstationFilter]);

  const filteredAccruals = useMemo(() => {
    return rawAccrualRows.filter((r) => {
      if (employeeFilter !== "all" && r.employeeId !== employeeFilter)
        return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter)
        return false;
      return true;
    });
  }, [rawAccrualRows, employeeFilter, departmentFilter]);

  const filteredAbsences = useMemo(() => {
    return rawAbsenceRows.filter((r) => {
      if (employeeFilter !== "all" && r.employeeId !== employeeFilter)
        return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter)
        return false;
      return true;
    });
  }, [rawAbsenceRows, employeeFilter, departmentFilter]);

  // Visual Statistics Datasets for Recharts
  const dailyStats = useMemo(
    () => buildDailyAttendanceStats(filteredTimesheets),
    [filteredTimesheets],
  );
  const complianceStats = useMemo(
    () => buildComplianceDistributionStats(filteredAttendance),
    [filteredAttendance],
  );
  const leaveCategoryStats = useMemo(
    () => buildLeaveCategoryStats(filteredAbsences),
    [filteredAbsences],
  );
  const departmentStats = useMemo(
    () => buildDepartmentWorkloadStats(filteredTimesheets),
    [filteredTimesheets],
  );
  const workstationStats = useMemo(
    () =>
      buildWorkstationWorkloadStats(filteredTimesheets, filteredAttendance),
    [filteredTimesheets, filteredAttendance],
  );

  // Export Complete Audit Pack (All 5 Reports into 1 multi-sheet Excel workbook)
  const handleExportCompleteAuditPack = async () => {
    const ts = new Date().toISOString().slice(0, 10);
    await exportCompleteAuditPackExcel(
      {
        companyName,
        periodLabel,
        metadata: {
          "Total Employees": kpis.totalEmployees,
          "Total Payroll Hours": kpis.totalPayrollHours,
          "Regular Normal Hours": kpis.totalRegularHours,
          "Overtime Hours": kpis.totalOvertimeHours,
          "Attendance Rate": `${kpis.averageAttendanceRate}%`,
          "Punctuality Rate": `${kpis.averagePunctualityRate}%`,
          "Total Leave Hours": kpis.totalLeaveHours,
          "Total Absence Days": kpis.totalAbsenceDays,
          "Missing Clockings": kpis.missingClockingCount,
        },
        timesheets: {
          headers: [
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
            "Total Paid (h)",
            "Status",
            "Sign-Off",
            "Compliance Flag",
            "Notes",
          ],
          rows: filteredTimesheets.map((r) => [
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
          ]),
        },
        attendance: {
          headers: [
            "Employee Name",
            "Employee #",
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
            "Punctuality %",
            "Compliance Score",
          ],
          rows: filteredAttendance.map((r) => [
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
            r.complianceScore,
          ]),
        },
        accruals: {
          headers: [
            "Employee Name",
            "Employee #",
            "Department",
            "Leave Type",
            "Opening (h)",
            "Accrued (h)",
            "Taken (h)",
            "Closing (h)",
            "Closing (Days)",
            "Projected Year-End (h)",
          ],
          rows: filteredAccruals.map((r) => [
            r.employeeName,
            r.employeeNumber,
            r.department,
            r.leaveType,
            r.openingBalanceHours,
            r.accruedPeriodHours,
            r.takenPeriodHours,
            r.closingBalanceHours,
            r.closingBalanceDays,
            r.projectedYearEndHours,
          ]),
        },
        absences: {
          headers: [
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
            "Approval Sign-Off",
            "Status",
          ],
          rows: filteredAbsences.map((r) => [
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
            r.approvedBy ?? "Pending Review",
            r.status,
          ]),
        },
      },
      `Complete_Workforce_Audit_Pack_${companyName.replace(/\s+/g, "_")}_${ts}`,
    );
  };

  // Export active tab
  const handleExportActiveCsv = () => {
    const ts = new Date().toISOString().slice(0, 10);
    if (activeTab === "employee-summary") {
      const headers = [
        "Employee Name",
        "Employee Number",
        "Department",
        "Workstation",
        "Worked Hours",
        "OT 1.5x Hours",
        "OT 2.0x Hours",
        "Total OT Hours",
        "Leave Hours",
        "Leave Days",
        "Total Paid Hours",
        "Days Worked",
        "Missing Clockings",
      ];
      const rows = filteredEmployeeSummaryRows.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        r.workedHours,
        r.overtimeHours15,
        r.overtimeHours20,
        r.totalOvertimeHours,
        r.leaveHours,
        r.leaveDays,
        r.totalPaidHours,
        r.daysWorked,
        r.missingClockings,
      ]);
      exportReportToCsv(`Employee_Hours_OT_Leave_${ts}`, headers, rows);
    } else if (activeTab === "timesheets" || activeTab === "analytics") {
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
        "Total Paid (h)",
        "Status",
        "Sign-Off",
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
        "Employee #",
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
        "Punctuality %",
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
        r.complianceScore,
      ]);
      exportReportToCsv(`Attendance_Report_${ts}`, headers, rows);
    } else if (activeTab === "accruals") {
      const headers = [
        "Employee Name",
        "Employee #",
        "Department",
        "Leave Type",
        "Opening (h)",
        "Accrued (h)",
        "Taken (h)",
        "Closing (h)",
        "Closing (Days)",
        "Projected Year-End (h)",
      ];
      const rows = filteredAccruals.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.leaveType,
        r.openingBalanceHours,
        r.accruedPeriodHours,
        r.takenPeriodHours,
        r.closingBalanceHours,
        r.closingBalanceDays,
        r.projectedYearEndHours,
      ]);
      exportReportToCsv(`Leave_Accruals_${ts}`, headers, rows);
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
        "Sign-Off",
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
        r.approvedBy ?? "Pending Review",
        r.status,
      ]);
      exportReportToCsv(`Absences_${ts}`, headers, rows);
    }
  };

  const handleExportActivePdf = async () => {
    const ts = new Date().toISOString().slice(0, 10);
    const kpiSummary = [
      { label: "Payroll Hours", value: `${kpis.totalPayrollHours}h` },
      { label: "Regular Hours", value: `${kpis.totalRegularHours}h` },
      { label: "Overtime Hours", value: `${kpis.totalOvertimeHours}h` },
      { label: "Attendance Rate", value: `${kpis.averageAttendanceRate}%` },
      { label: "Punctuality Rate", value: `${kpis.averagePunctualityRate}%` },
      { label: "Missing Events", value: kpis.missingClockingCount },
    ];

    if (activeTab === "employee-summary") {
      const headers = [
        "Employee",
        "Emp #",
        "Department",
        "Station",
        "Worked (h)",
        "OT 1.5x",
        "OT 2.0x",
        "Total OT",
        "Leave (h)",
        "Total Paid",
        "Days Worked",
      ];
      const rows = filteredEmployeeSummaryRows.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        formatHours(r.workedHours),
        formatHours(r.overtimeHours15),
        formatHours(r.overtimeHours20),
        formatHours(r.totalOvertimeHours),
        formatHours(r.leaveHours),
        formatHours(r.totalPaidHours),
        `${r.daysWorked}d`,
      ]);
      await exportReportToPdf(
        "Employee Worked Hours, Overtime & Leave Report",
        `Employee_Hours_OT_Leave_${ts}`,
        companyName,
        periodLabel,
        headers,
        rows,
        kpiSummary,
      );
    } else if (activeTab === "timesheets" || activeTab === "analytics") {
      const headers = [
        "Employee",
        "Emp #",
        "Work Date",
        "Clock In",
        "Clock Out",
        "Normal (h)",
        "OT 1.5x",
        "OT 2.0x",
        "Total (h)",
        "Status",
      ];
      const rows = filteredTimesheets.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.workDate,
        r.clockIn ?? "--",
        r.clockOut ?? "--",
        formatHours(r.normalHours),
        formatHours(r.overtimeHours15),
        formatHours(r.overtimeHours20),
        formatHours(r.totalPaidHours),
        r.status.toUpperCase(),
      ]);
      await exportReportToPdf(
        "Timesheet Payroll Audit",
        `Timesheet_Report_${ts}`,
        companyName,
        periodLabel,
        headers,
        rows,
        kpiSummary,
      );
    } else if (activeTab === "attendance") {
      const headers = [
        "Employee",
        "Emp #",
        "Dept",
        "Station",
        "Worked / Sched",
        "Hours",
        "Punctuality %",
        "Late",
        "Early",
        "Score",
      ];
      const rows = filteredAttendance.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.department,
        r.workstation,
        `${r.daysWorked}/${r.scheduledDays}d`,
        formatHours(r.totalHoursWorked),
        `${r.punctualityRate}%`,
        r.lateArrivals,
        r.earlyDepartures,
        `${r.complianceScore}/100`,
      ]);
      await exportReportToPdf(
        "Attendance & Punctuality Report",
        `Attendance_Report_${ts}`,
        companyName,
        periodLabel,
        headers,
        rows,
        kpiSummary,
      );
    } else if (activeTab === "accruals") {
      const headers = [
        "Employee",
        "Emp #",
        "Leave Type",
        "Opening (h)",
        "Accrued (h)",
        "Taken (h)",
        "Closing (h)",
        "Closing (Days)",
      ];
      const rows = filteredAccruals.map((r) => [
        r.employeeName,
        r.employeeNumber,
        r.leaveType,
        formatHours(r.openingBalanceHours),
        formatHours(r.accruedPeriodHours),
        formatHours(r.takenPeriodHours),
        formatHours(r.closingBalanceHours),
        `${r.closingBalanceDays}d`,
      ]);
      await exportReportToPdf(
        "Leave Accrual & Balance Ledger",
        `Leave_Accruals_${ts}`,
        companyName,
        periodLabel,
        headers,
        rows,
        kpiSummary,
      );
    } else if (activeTab === "absences") {
      const headers = [
        "Employee",
        "Emp #",
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
        r.leaveType,
        r.startDate,
        r.endDate,
        `${r.totalDays}d`,
        formatHours(r.totalHours),
        r.isPaid ? "Paid" : "Unpaid",
        r.status.toUpperCase(),
      ]);
      await exportReportToPdf(
        "Absence & Leave Log",
        `Absences_${ts}`,
        companyName,
        periodLabel,
        headers,
        rows,
        kpiSummary,
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sticky Control Bar */}
      <div className="rounded-2xl border border-border bg-slate-950 p-5 sm:p-6 text-white shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 flex items-center gap-1">
                <Sparkles className="size-3" />
                Compliance &amp; Workforce Intelligence
              </span>
              <span className="text-xs font-bold text-slate-400">
                · {companyName}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">
              Compliance, Payroll &amp; Attendance Reporting Center
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Audit attendance punctuality, overtime trends, statutory leave
              accruals, and pull executive compliance reports.
            </p>
          </div>

          {/* Top 1-Click Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCompleteAuditPack}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all"
              title="Download full 5-sheet audit pack containing all reports"
            >
              <FileSpreadsheet className="size-3.5 text-white" />
              <span>Full Audit Pack (Excel)</span>
            </button>

            <button
              type="button"
              onClick={handleExportActivePdf}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition-all"
              title="Export formatted audit PDF"
            >
              <Download className="size-3.5" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportActiveCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition-all"
              title="Export CSV for payroll system"
            >
              <Download className="size-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition-all"
              title="Print report"
            >
              <Printer className="size-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Global Period & Query Filter Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">
              Payroll Cycle:
            </span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
            >
              {generatedPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Custom Date Pickers if selected */}
          {selectedPeriodId === "custom" && (
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-xl border border-slate-700">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
            </div>
          )}

          {/* Employee Filter */}
          {employees.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                Employee:
              </span>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 max-w-[200px] truncate"
              >
                <option value="all">All Employees ({employees.length})</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.known_as ?? emp.full_name} ({emp.employee_number || emp.id.slice(0, 6)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Department Filter */}
          {departments.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                Department:
              </span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name ?? d.label}>
                    {d.name ?? d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Workstation Filter */}
          {workstations.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                Workstation:
              </span>
              <select
                value={workstationFilter}
                onChange={(e) => setWorkstationFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Workstations</option>
                {workstations.map((w) => (
                  <option key={w.id} value={w.name ?? w.label}>
                    {w.name ?? w.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto text-xs text-slate-400 font-medium">
            Active Cycle: <span className="text-emerald-400 font-bold">{periodLabel}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Strip */}
      <div className="flex items-center gap-1.5 p-1.5 bg-surface rounded-2xl border border-border overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "analytics"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <BarChart3 className="size-4" />
          Analytics &amp; Statistics
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("employee-summary")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "employee-summary"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <Users className="size-4" />
          Employee Hours &amp; OT ({filteredEmployeeSummaryRows.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "attendance"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <CheckCircle2 className="size-4" />
          Attendance &amp; Punctuality ({filteredAttendance.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("timesheets")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "timesheets"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <Clock3 className="size-4" />
          Timesheet Payroll Audit ({filteredTimesheets.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("accruals")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "accruals"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <TrendingUp className="size-4" />
          Leave Accruals ({filteredAccruals.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("absences")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
            activeTab === "absences"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <CalendarDays className="size-4" />
          Absence Log ({filteredAbsences.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ml-auto ${
            activeTab === "settings"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted/50"
          }`}
        >
          <Cog className="size-4" />
          Payroll Cycle Rules
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "analytics" && (
        <ReportsOverviewAnalytics
          kpis={kpis}
          dailyStats={dailyStats}
          complianceStats={complianceStats}
          leaveCategoryStats={leaveCategoryStats}
          departmentStats={departmentStats}
          workstationStats={workstationStats}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "employee-summary" && (
        <EmployeeHoursSummaryReportTable
          data={filteredEmployeeSummaryRows}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "attendance" && (
        <AttendanceReportTable
          data={filteredAttendance}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "timesheets" && (
        <TimesheetPayrollReportTable
          data={filteredTimesheets}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "accruals" && (
        <LeaveAccrualReportTable
          data={filteredAccruals}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "absences" && (
        <AbsenceReportTable
          data={filteredAbsences}
          periodLabel={periodLabel}
        />
      )}

      {activeTab === "settings" && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-2xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Payroll Period &amp; Cycle Configuration
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Customize cycle frequencies (monthly, fortnightly, bi-monthly), cutoff dates, and grace periods for automated timesheet sign-offs.
            </p>
          </div>
          <PayrollPeriodSettingsForm initialConfig={payrollConfig} />
        </div>
      )}
    </div>
  );
}
