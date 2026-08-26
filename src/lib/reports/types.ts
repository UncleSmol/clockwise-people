import type { PayrollPeriod } from "./payroll-periods";

export type TimesheetPayrollRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  workstation: string;
  workDate: string;
  clockIn: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  clockOut: string | null;
  normalHours: number;
  overtimeHours15: number; // 1.5x Overtime
  overtimeHours20: number; // 2.0x Sunday / Public holiday overtime
  holidayHours: number;
  leaveHours: number;
  totalPaidHours: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled" | "locked" | string;
  managerSignOff: string | null;
  hasComplianceFlag: boolean;
  complianceNotes: string | null;
};

export type AttendanceReportRow = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  workstation: string;
  jobTitle: string;
  scheduledDays: number;
  daysWorked: number;
  totalHoursWorked: number;
  normalHours: number;
  overtimeHours: number;
  onTimeArrivals: number;
  lateArrivals: number;
  earlyDepartures: number;
  missingClockings: number;
  punctualityRate: number; // percentage (0-100)
  geofenceComplianceRate: number; // percentage (0-100)
  complianceScore: number; // percentage (0-100)
};

export type AccrualReportRow = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  leaveType: string;
  leaveCategory: string;
  openingBalanceHours: number;
  accruedPeriodHours: number;
  takenPeriodHours: number;
  adjustmentHours: number;
  closingBalanceHours: number;
  closingBalanceDays: number;
  projectedYearEndHours: number;
};

export type AbsenceReportRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  leaveCategory: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalHours: number;
  isPaid: boolean;
  reason: string | null;
  approvedBy: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled" | "locked" | string;
};

export type ReportKPIs = {
  totalEmployees: number;
  totalPayrollHours: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalLeaveHours: number;
  averageAttendanceRate: number;
  averagePunctualityRate: number;
  missingClockingCount: number;
  totalAbsenceDays: number;
  totalToilAccruedHours: number;
};

export type ReportFilterState = {
  payrollPeriodId: string;
  customStartDate?: string;
  customEndDate?: string;
  departmentId?: string;
  workstationId?: string;
  employeeId?: string;
  searchTerm?: string;
  statusFilter?: string;
};
