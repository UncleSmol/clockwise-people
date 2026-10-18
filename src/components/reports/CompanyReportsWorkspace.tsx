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
import CompanyPayslipsWorkspace from "@/components/payroll/CompanyPayslipsWorkspace";
import type { CompanyPayslipContext } from "@/lib/payroll/payslip-types";
import type { EmployeeRecord } from "@/lib/employees/schema";
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
  company?: CompanyPayslipContext;
  fullEmployees?: EmployeeRecord[];
  isSuperAdmin?: boolean;
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
  | "settings"
  | "payslips";

function formatHours(val: number | string | null | undefined): string {
  return `${Number(val ?? 0).toFixed(2)}h`;
}

export default function CompanyReportsWorkspace({
  companyName,
  company,
  fullEmployees,
  isSuperAdmin = false,
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
  const [showInactive, setShowInactive] = useState<boolean>(false);

  const activeEmployeeStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const fe of fullEmployees ?? []) {
      map.set(fe.id, fe.employment_status);
    }
    return map;
  }, [fullEmployees]);

  // Exclude terminated and inactive employees by default
  const filteredEmployeesList = useMemo(() => {
    if (showInactive) return employees;
    return employees.filter((emp) => {
      const status = activeEmployeeStatusMap.get(emp.id) ?? (emp as { employment_status?: string }).employment_status;
      return status !== "terminated" && status !== "inactive";
    });
  }, [employees, showInactive, activeEmployeeStatusMap]);

  const activeEmployeeIdSet = useMemo(
    () => new Set(filteredEmployeesList.map((e) => e.id)),
    [filteredEmployeesList],
  );

  const filteredTimesheetEntriesInput = useMemo(
    () => timesheetEntries.filter((te) => activeEmployeeIdSet.has(te.employee_id)),
    [timesheetEntries, activeEmployeeIdSet],
  );

  const filteredLeaveRequestsInput = useMemo(
    () => leaveRequests.filter((lr) => activeEmployeeIdSet.has(lr.employee_id)),
    [leaveRequests, activeEmployeeIdSet],
  );

  const filteredLeaveAssignmentsInput = useMemo(
    () => leaveAssignments.filter((la) => activeEmployeeIdSet.has(la.employee_id)),
    [leaveAssignments, activeEmployeeIdSet],
  );

  // Build structured report datasets
  const aggregatorInput = useMemo(
    () => ({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      employees: filteredEmployeesList,
      timesheetEntries: filteredTimesheetEntriesInput,
      leaveRequests: filteredLeaveRequestsInput,
      leaveTypes,
      leaveAssignments: filteredLeaveAssignmentsInput,
      publicHolidays,
    }),
    [
      effectiveStartDate,
      effectiveEndDate,
      filteredEmployeesList,
      filteredTimesheetEntriesInput,
      filteredLeaveRequestsInput,
      leaveTypes,
      filteredLeaveAssignmentsInput,
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
      <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 text-foreground shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                Compliance &amp; Workforce Intelligence
              </span>
              <span className="text-xs font-semibold text-muted">
                · {companyName}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              Compliance, Payroll &amp; Attendance Reporting Center
            </h2>
            <p className="mt-1 text-xs text-muted">
              Audit attendance punctuality, overtime trends, statutory leave accruals, and pull executive compliance reports.
            </p>
          </div>

          {/* Top 1-Click Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCompleteAuditPack}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-white hover:brightness-105 shadow-soft transition-all cursor-pointer"
              title="Download full multi-sheet audit pack containing all reports"
            >
              Full Audit Pack (Excel)
            </button>

            <button
              type="button"
              onClick={handleExportActivePdf}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/80 bg-surface px-3.5 text-xs font-semibold text-foreground hover:bg-surface-muted shadow-xs transition-all cursor-pointer"
              title="Export formatted audit PDF"
            >
              PDF
            </button>

            <button
              type="button"
              onClick={handleExportActiveCsv}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/80 bg-surface px-3.5 text-xs font-semibold text-foreground hover:bg-surface-muted shadow-xs transition-all cursor-pointer"
              title="Export CSV for payroll system"
            >
              CSV
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/80 bg-surface px-3.5 text-xs font-semibold text-foreground hover:bg-surface-muted shadow-xs transition-all cursor-pointer"
              title="Print report"
            >
              Print
            </button>
          </div>
        </div>

        {/* Global Period & Query Filter Bar */}
        <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">
              Payroll Cycle:
            </span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="min-h-[44px] sm:min-h-9 px-3.5 py-1.5 text-base sm:text-xs font-semibold rounded-full bg-background border border-border/80 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs leading-normal"
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
            <div className="flex items-center gap-2 bg-background px-3.5 py-1.5 rounded-full border border-border/80 min-h-[44px] sm:min-h-9 shadow-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-base sm:text-xs text-foreground focus:outline-none"
              />
              <span className="text-muted text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-base sm:text-xs text-foreground focus:outline-none"
              />
            </div>
          )}

          {/* Employee Filter */}
          {filteredEmployeesList.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">
                Employee:
              </span>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="min-h-[44px] sm:min-h-9 px-3.5 py-1.5 text-base sm:text-xs font-semibold rounded-full bg-background border border-border/80 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs leading-normal"
              >
                <option value="all">Active Employees ({filteredEmployeesList.length})</option>
                {filteredEmployeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.known_as ?? emp.full_name}
                  </option>
                ))}

              </select>
            </div>
          )}

          {/* Hide Inactive / Terminated Toggle */}
          <label className="flex min-h-[44px] sm:min-h-9 items-center gap-2 cursor-pointer select-none text-xs font-semibold text-foreground bg-background border border-border/80 px-3.5 py-1.5 rounded-full hover:bg-surface-muted transition-colors shadow-xs">
            <input
              type="checkbox"
              checked={!showInactive}
              onChange={(e) => setShowInactive(!e.target.checked)}
              className="size-4 shrink-0 rounded-full border-border text-primary focus:ring-primary/20 accent-primary"
            />
            <span>Hide Inactive &amp; Terminated</span>
          </label>

          {/* Department Filter */}
          {departments.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">
                Department:
              </span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="min-h-[44px] sm:min-h-9 px-3.5 py-1.5 text-base sm:text-xs font-semibold rounded-full bg-background border border-border/80 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs leading-normal"
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
              <span className="text-xs font-semibold text-muted">
                Workstation:
              </span>
              <select
                value={workstationFilter}
                onChange={(e) => setWorkstationFilter(e.target.value)}
                className="min-h-[44px] sm:min-h-9 px-3.5 py-1.5 text-base sm:text-xs font-semibold rounded-full bg-background border border-border/80 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs leading-normal"
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

          <div className="ml-auto text-xs text-muted font-medium">
            Active Cycle: <span className="font-bold text-foreground">{periodLabel}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Strip */}
      <div className="flex items-center gap-1.5 p-1.5 bg-surface rounded-full border border-border/80 shadow-soft overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "analytics"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Analytics &amp; Statistics
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("employee-summary")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "employee-summary"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Employee Hours &amp; OT ({filteredEmployeeSummaryRows.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "attendance"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Attendance &amp; Punctuality ({filteredAttendance.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("timesheets")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "timesheets"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Timesheet Payroll Audit ({filteredTimesheets.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("accruals")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "accruals"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Leave Accruals ({filteredAccruals.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("absences")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === "absences"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Absence Log ({filteredAbsences.length})
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("payslips")}
            className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "payslips"
                ? "bg-primary text-white shadow-soft"
                : "text-primary hover:text-foreground hover:bg-surface-muted border border-border/80"
            }`}
          >
            Official Payslips (Super Admin)
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-colors ml-auto cursor-pointer ${
            activeTab === "settings"
              ? "bg-primary text-white shadow-soft"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          Payroll Cycle Rules
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "payslips" && isSuperAdmin && (
        <CompanyPayslipsWorkspace
          company={company || { id: "current-company", name: companyName }}
          employees={fullEmployees || []}
          timesheetEntries={timesheetEntries}
          payrollConfig={payrollConfig}
          isSuperAdmin={isSuperAdmin}
          onNavigateToApprovals={() => setActiveTab("timesheets")}
        />
      )}

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
