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

export type ClockEventRecord = {
  id: string;
  event_type: ClockEventType;
  event_at: string;
  local_work_date: string;
  local_event_time: string;
};

export type EmployeeTimeState = {
  employee: {
    id: string;
    full_name: string;
    known_as: string | null;
    branch_id: string;
    branch_name: string | null;
    job_title: string | null;
  } | null;
  todayEntry: TimeEntryRecord | null;
  recentEntries: TimeEntryRecord[];
  recentEvents: ClockEventRecord[];
};
