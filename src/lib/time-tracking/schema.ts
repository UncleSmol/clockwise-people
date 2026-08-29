export const clockEventTypes = [
  "clock_in",
  "lunch_start",
  "lunch_end",
  "clock_out",
  "switch_workstation",
] as const;

export type ClockEventType = (typeof clockEventTypes)[number];

export type TimeEntryRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  workstation_id: string | null;
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
  leave_type_id: string | null;
  locationEvents?: TimeClockLocationEvent[];
  scheduleValidation?: ScheduleValidation;
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

export type TimeClockLocationEvent = ClockEventRecord & {
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  workstationName: string | null;
  distance_meters: number | null;
  geofence_status: string | null;
};

export type EmployeeTimeState = {
  currentWorkDate: string;
  employee: {
    id: string;
    full_name: string;
    known_as: string | null;
    avatar_url: string | null;
    job_title: string | null;
  } | null;
  todayEntry: TimeEntryRecord | null;
  recentEntries: TimeEntryRecord[];
  recentEvents: ClockEventRecord[];
  correctionRequests: TimesheetCorrectionRequest[];
  publicHolidays: CompanyPublicHoliday[];
  workstations: { id: string; name: string }[];
  assignedWorkstationId: string | null;
  autoEndLunchOnLapse?: boolean;
  autoClockoutAfterLunch?: boolean;
  defaultLunchMinutes?: number;
  autoClockoutBasedOnSchedule?: boolean;
  autoClockoutGraceMinutes?: number;
  todaySchedule: {
    start_time: string | null;
    end_time: string | null;
    lunch_minutes: number;
    is_working_day: boolean;
  } | null;
};

export type CompanyLiveTimeEntry = {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  workstationName: string | null;
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
  latestGeofenceStatus: string | null;
  latestGeofenceDistanceMeters: number | null;
  latestGeofenceEventType: ClockEventType | null;
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
  workstationName: string | null;
};

export type ScheduleValidation = {
  isCompliant: boolean;
  issues: string[];
};

export type CompanySubmittedTimesheet = TimeEntryRecord & {
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  workstationName: string | null;
  paidTimeOffHours: number;
  locationEvents: TimeClockLocationEvent[];
  scheduleValidation: ScheduleValidation;
};

export type CompanyTimesheetCalendarEntry = TimeEntryRecord & {
  employeeNumber: string;
  fullName: string;
  knownAs: string | null;
  avatarUrl: string | null;
  workstationName: string | null;
  paidTimeOffHours: number;
  locationEvents: TimeClockLocationEvent[];
  scheduleValidation: ScheduleValidation;
};

export type CompanyCalendarEmployeeOption = {
  id: string;
  label: string;
};

export type CompanyCalendarLeaveRequest = {
  id: string;
  employee_id: string;
  employeeName: string;
  employeeNumber: string;
  leaveTypeName: string;
  start_date: string;
  end_date: string;
  total_hours: number | string;
  status: "draft" | "submitted" | "approved" | "rejected" | "cancelled" | "locked";
};
