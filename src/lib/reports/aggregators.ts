import type {
  TimesheetPayrollRow,
  AttendanceReportRow,
  AccrualReportRow,
  AbsenceReportRow,
  ReportKPIs,
} from "./types";
import type { CompanyTimesheetCalendarEntry, CompanyPublicHoliday } from "@/lib/time-tracking/schema";
import type { CompanyCalendarLeaveRequest } from "@/lib/time-tracking/schema";
import type { LeaveType } from "@/lib/work-rules/schema";

type AggregatorInput = {
  startDate: string;
  endDate: string;
  employees: Array<{
    id: string;
    full_name: string;
    known_as: string | null;
    employee_number: string;
    department_name?: string | null;
    workstation_name?: string | null;
    job_title?: string | null;
    daily_hours?: number | null;
  }>;
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
};

export function buildTimesheetPayrollReport(input: AggregatorInput): TimesheetPayrollRow[] {
  const { startDate, endDate, employees, timesheetEntries, publicHolidays } = input;
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const holidayDateSet = new Set(publicHolidays.map((h) => h.holiday_date));

  // Filter timesheets within selected date range
  const rows: TimesheetPayrollRow[] = [];

  for (const entry of timesheetEntries) {
    if (entry.work_date < startDate || entry.work_date > endDate) continue;
    const emp = employeeMap.get(entry.employee_id);
    const isHoliday = holidayDateSet.has(entry.work_date);

    // Calculate normal vs 1.5x vs 2.0x overtime
    const paid = Number(entry.paid_hours ?? 0);
    const ot = Number(entry.overtime_hours ?? 0);
    const dayOfWeek = new Date(entry.work_date).getDay(); // 0 = Sunday
    const isSunday = dayOfWeek === 0;

    const normalHours = Math.max(0, paid - ot);
    let ot15 = 0;
    let ot20 = 0;
    let holidayHours = 0;

    if (isHoliday) {
      holidayHours = paid;
      ot20 = ot;
    } else if (isSunday) {
      ot20 = ot;
    } else {
      ot15 = ot;
    }

    const hasFlag = Boolean(
      entry.missing_clocking || entry.late_arrival || entry.early_departure || entry.status === "rejected",
    );

    const complianceNotes = [
      entry.missing_clocking ? "Missing clocking" : null,
      entry.late_arrival ? "Late arrival" : null,
      entry.early_departure ? "Early departure" : null,
      entry.warning_notes ? entry.warning_notes : null,
      entry.notes ? entry.notes : null,
    ]
      .filter(Boolean)
      .join(" · ");

    rows.push({
      id: entry.id,
      employeeId: entry.employee_id,
      employeeName: emp?.known_as ?? emp?.full_name ?? entry.fullName,
      employeeNumber: emp?.employee_number ?? entry.employee_id.slice(0, 8),
      department: emp?.department_name ?? "General",
      workstation: emp?.workstation_name ?? entry.workstationName ?? "Assigned",
      workDate: entry.work_date,
      clockIn: entry.clock_in,
      lunchStart: entry.lunch_start,
      lunchEnd: entry.lunch_end,
      clockOut: entry.clock_out,
      normalHours: Number(normalHours.toFixed(2)),
      overtimeHours15: Number(ot15.toFixed(2)),
      overtimeHours20: Number(ot20.toFixed(2)),
      holidayHours: Number(holidayHours.toFixed(2)),
      leaveHours: 0,
      totalPaidHours: Number(paid.toFixed(2)),
      status: entry.status,
      managerSignOff: entry.status === "approved" ? "Manager Approved" : null,
      hasComplianceFlag: hasFlag,
      complianceNotes: complianceNotes || null,
    });
  }

  // Sort by work_date desc, employeeName asc
  rows.sort((a, b) => b.workDate.localeCompare(a.workDate) || a.employeeName.localeCompare(b.employeeName));

  return rows;
}

export function buildAttendanceReport(input: AggregatorInput): AttendanceReportRow[] {
  const { startDate, endDate, employees, timesheetEntries } = input;

  // Group timesheets by employee within date range
  const empEntries = new Map<string, CompanyTimesheetCalendarEntry[]>();

  for (const entry of timesheetEntries) {
    if (entry.work_date < startDate || entry.work_date > endDate) continue;
    const list = empEntries.get(entry.employee_id) ?? [];
    list.push(entry);
    empEntries.set(entry.employee_id, list);
  }

  // Calculate days in period
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const approxWorkDays = Math.round((diffDays / 7) * 5);

  const rows: AttendanceReportRow[] = [];

  for (const emp of employees) {
    const list = empEntries.get(emp.id) ?? [];
    let totalHours = 0;
    let otHours = 0;
    let lateCount = 0;
    let earlyCount = 0;
    let missingCount = 0;
    let inRangeCount = 0;
    let locationTrackedCount = 0;

    for (const e of list) {
      totalHours += Number(e.paid_hours ?? 0);
      otHours += Number(e.overtime_hours ?? 0);
      if (e.late_arrival) lateCount++;
      if (e.early_departure) earlyCount++;
      if (e.missing_clocking) missingCount++;
      for (const loc of e.locationEvents ?? []) {
        if (loc.geofence_status) {
          locationTrackedCount++;
          if (loc.geofence_status === "in_range") inRangeCount++;
        }
      }
    }

    const daysWorked = list.length;
    const normalHours = Math.max(0, totalHours - otHours);
    const onTimeArrivals = Math.max(0, daysWorked - lateCount);
    const punctualityRate = daysWorked > 0 ? Math.round((onTimeArrivals / daysWorked) * 100) : 100;
    const geofenceRate = locationTrackedCount > 0 ? Math.round((inRangeCount / locationTrackedCount) * 100) : 100;
    const complianceScore = Math.round(
      punctualityRate * 0.5 + geofenceRate * 0.3 + (missingCount === 0 ? 20 : Math.max(0, 20 - missingCount * 5)),
    );

    rows.push({
      employeeId: emp.id,
      employeeName: emp.known_as ?? emp.full_name,
      employeeNumber: emp.employee_number ?? emp.id.slice(0, 8),
      department: emp.department_name ?? "General",
      workstation: emp.workstation_name ?? "Assigned",
      jobTitle: emp.job_title ?? "Team Member",
      scheduledDays: approxWorkDays,
      daysWorked,
      totalHoursWorked: Number(totalHours.toFixed(2)),
      normalHours: Number(normalHours.toFixed(2)),
      overtimeHours: Number(otHours.toFixed(2)),
      onTimeArrivals,
      lateArrivals: lateCount,
      earlyDepartures: earlyCount,
      missingClockings: missingCount,
      punctualityRate,
      geofenceComplianceRate: geofenceRate,
      complianceScore: Math.min(100, complianceScore),
    });
  }

  // Sort by employeeName asc
  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return rows;
}

export function buildAccrualReport(input: AggregatorInput): AccrualReportRow[] {
  const { startDate, endDate, employees, leaveTypes, leaveAssignments, leaveRequests } = input;
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const leaveTypeMap = new Map(leaveTypes.map((t) => [t.id, t]));

  // Sum taken leave within the period per (employee_id, leave_type_name)
  const takenInPeriodMap = new Map<string, number>();

  for (const req of leaveRequests) {
    if (req.status !== "approved") continue;
    // Check if overlap with period
    if (req.end_date < startDate || req.start_date > endDate) continue;
    const key = `${req.employee_id}-${req.leaveTypeName.toLowerCase()}`;
    const prev = takenInPeriodMap.get(key) ?? 0;
    takenInPeriodMap.set(key, prev + Number(req.total_hours ?? 0));
  }

  const rows: AccrualReportRow[] = [];

  for (const assign of leaveAssignments) {
    const emp = employeeMap.get(assign.employee_id);
    const lt = leaveTypeMap.get(assign.leave_type_id);
    if (!emp || !lt) continue;

    const currentBalance = Number(assign.balance_hours ?? 0);
    const key = `${assign.employee_id}-${lt.name.toLowerCase()}`;
    const takenPeriod = takenInPeriodMap.get(key) ?? 0;

    // Yearly accrual calculation
    const yearly = (lt.accrual_rules?.yearly_hours as number | undefined) ?? 120;
    const monthlyAccrual = yearly > 0 ? Number((yearly / 12).toFixed(2)) : 0;
    const openingBalance = Number((currentBalance + takenPeriod - monthlyAccrual).toFixed(2));
    const closingBalance = Number(currentBalance.toFixed(2));
    const closingDays = Number((closingBalance / (emp.daily_hours ?? 8)).toFixed(1));
    const projectedYearEnd = Number((closingBalance + monthlyAccrual * 4).toFixed(2));

    rows.push({
      employeeId: emp.id,
      employeeName: emp.known_as ?? emp.full_name,
      employeeNumber: emp.employee_number ?? emp.id.slice(0, 8),
      department: emp.department_name ?? "General",
      leaveType: lt.name,
      leaveCategory: lt.category,
      openingBalanceHours: Math.max(0, openingBalance),
      accruedPeriodHours: monthlyAccrual,
      takenPeriodHours: takenPeriod,
      adjustmentHours: 0,
      closingBalanceHours: closingBalance,
      closingBalanceDays: closingDays,
      projectedYearEndHours: projectedYearEnd,
    });
  }

  // Sort by employeeName asc, leaveType asc
  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.leaveType.localeCompare(b.leaveType));

  return rows;
}

export function buildAbsenceReport(input: AggregatorInput): AbsenceReportRow[] {
  const { startDate, endDate, employees, leaveRequests, leaveTypes } = input;
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const leaveTypeByName = new Map(leaveTypes.map((t) => [t.name.toLowerCase(), t]));

  const rows: AbsenceReportRow[] = [];

  for (const req of leaveRequests) {
    if (req.end_date < startDate || req.start_date > endDate) continue;
    const emp = employeeMap.get(req.employee_id);
    const lt = leaveTypeByName.get(req.leaveTypeName.toLowerCase());

    const start = new Date(req.start_date);
    const end = new Date(req.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const hours = Number(req.total_hours ?? days * 8);

    rows.push({
      id: req.id,
      employeeId: req.employee_id,
      employeeName: emp?.known_as ?? emp?.full_name ?? req.employeeName,
      employeeNumber: emp?.employee_number ?? req.employeeNumber ?? req.employee_id.slice(0, 8),
      department: emp?.department_name ?? "General",
      leaveCategory: lt?.category ?? "other",
      leaveType: req.leaveTypeName || "Leave",
      startDate: req.start_date,
      endDate: req.end_date,
      totalDays: days,
      totalHours: Number(hours.toFixed(2)),
      isPaid: lt?.is_paid ?? true,
      reason: null,
      approvedBy: req.status === "approved" ? "Manager Approved" : null,
      status: req.status,
    });
  }

  // Sort by startDate desc
  rows.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.employeeName.localeCompare(b.employeeName));

  return rows;
}

export function calculateReportKPIs(
  timesheets: TimesheetPayrollRow[],
  attendance: AttendanceReportRow[],
  absences: AbsenceReportRow[],
  accruals: AccrualReportRow[],
): ReportKPIs {
  let totalPayrollHours = 0;
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let missingClockings = 0;

  for (const row of timesheets) {
    totalPayrollHours += row.totalPaidHours;
    totalRegularHours += row.normalHours;
    totalOvertimeHours += row.overtimeHours15 + row.overtimeHours20;
    if (row.hasComplianceFlag && row.complianceNotes?.includes("Missing clocking")) {
      missingClockings++;
    }
  }

  let totalLeaveHours = 0;
  let totalAbsenceDays = 0;

  for (const a of absences) {
    if (a.status === "approved") {
      totalLeaveHours += a.totalHours;
      totalAbsenceDays += a.totalDays;
    }
  }

  let punctualitySum = 0;
  let attendanceDaysTotal = 0;
  let scheduledDaysTotal = 0;

  for (const att of attendance) {
    punctualitySum += att.punctualityRate;
    attendanceDaysTotal += att.daysWorked;
    scheduledDaysTotal += att.scheduledDays;
  }

  let toilAccrued = 0;
  for (const acc of accruals) {
    if (acc.leaveCategory === "toil_taken" || acc.leaveType.toLowerCase().includes("toil")) {
      toilAccrued += acc.closingBalanceHours;
    }
  }

  const avgPunctuality = attendance.length > 0 ? Math.round(punctualitySum / attendance.length) : 100;
  const avgAttendance = scheduledDaysTotal > 0 ? Math.round((attendanceDaysTotal / scheduledDaysTotal) * 100) : 100;

  return {
    totalEmployees: attendance.length,
    totalPayrollHours: Number(totalPayrollHours.toFixed(2)),
    totalRegularHours: Number(totalRegularHours.toFixed(2)),
    totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
    totalLeaveHours: Number(totalLeaveHours.toFixed(2)),
    averageAttendanceRate: Math.min(100, avgAttendance),
    averagePunctualityRate: avgPunctuality,
    missingClockingCount: missingClockings,
    totalAbsenceDays,
    totalToilAccruedHours: Number(toilAccrued.toFixed(2)),
  };
}
