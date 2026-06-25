export const clockEventTypes = [
  "clock_in",
  "lunch_start",
  "lunch_end",
  "clock_out",
] as const;

export type ClockEventType = (typeof clockEventTypes)[number];

export type TimeEntryRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  branch_id: string;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
  gross_hours: number;
  lunch_hours: number;
  paid_hours: number;
  normal_hours: number;
  overtime_hours: number;
  missing_clocking: boolean;
  late_arrival: boolean;
  early_departure: boolean;
  warning_notes: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled" | "locked";
};

export type CompanyPublicHoliday = {
  id: string;
  holiday_date: string;
  name: string;
  is_paid: boolean;
};

export type TimesheetCorrectionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "locked";

export type TimesheetCorrectionRequest = {
  id: string;
  company_id: string;
  employee_id: string;
  time_entry_id: string;
  payroll_period_id: string | null;
  work_date: string;
  original_clock_in: string | null;
  original_lunch_start: string | null;
  original_lunch_end: string | null;
  original_clock_out: string | null;
  proposed_clock_in: string | null;
  proposed_lunch_start: string | null;
  proposed_lunch_end: string | null;
  proposed_clock_out: string | null;
  reason: string;
  status: TimesheetCorrectionStatus;
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
};

export type ClockEventRecord = {
  id: string;
  event_type: ClockEventType;
  event_at: string;
  local_work_date: string;
  local_event_time: string;
};

export type EmployeeTimeState = {
  currentWorkDate: string;
  employee: {
    id: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    branch_id: string;
    branch_name: string | null;
    job_title: string | null;
  } | null;
  todayEntry: TimeEntryRecord | null;
  recentEntries: TimeEntryRecord[];
  recentEvents: ClockEventRecord[];
  correctionRequests: TimesheetCorrectionRequest[];
  publicHolidays: CompanyPublicHoliday[];
};

export type CompanyLiveTimeEntry = {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  branchName: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  workDate: string | null;
  clockIn: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  clockOut: string | null;
  paidHours: number;
  overtimeHours: number;
  missingClocking: boolean;
  lateArrival: boolean;
  earlyDeparture: boolean;
  status: "not_started" | "working" | "on_lunch" | "worked" | "needs_review";
};

export type CompanyLiveTimeOverview = {
  companyId: string;
  workDate: string;
  totals: {
    activeEmployees: number;
    notStarted: number;
    onLunch: number;
    workedToday: number;
    needsReview: number;
    totalEmployees: number;
  };
  entries: CompanyLiveTimeEntry[];
};

export type CompanyTimesheetCorrectionRequest = TimesheetCorrectionRequest & {
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  branchName: string | null;
};

export type CompanySubmittedTimesheet = TimeEntryRecord & {
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  branchName: string | null;
};
