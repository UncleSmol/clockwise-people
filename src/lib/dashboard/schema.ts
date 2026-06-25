import type { ClockEventType, TimeEntryRecord } from "@/lib/time-tracking/schema";

export type DashboardHoliday = {
  id: string;
  holiday_date: string;
  name: string;
  is_paid: boolean;
};

export type DashboardTeamMovement = {
  id: string;
  employeeName: string;
  employeeNumber: string;
  branchName: string | null;
  eventType: ClockEventType;
  eventAt: string;
  localEventTime: string;
  geofenceStatus: string | null;
};

export type DashboardReminderSchedule = {
  currentWorkDate: string;
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
  lunchStartTime: string | null;
  lunchEndTime: string | null;
  timezone: string;
  todayEntry: TimeEntryRecord | null;
};

export type DashboardNotification = {
  id: string;
  category: string;
  title: string;
  body: string;
  targetHref: string | null;
  readAt: string | null;
  createdAt: string;
};

export type DashboardExperienceData = {
  holidays: DashboardHoliday[];
  teamMovements: DashboardTeamMovement[];
  reminderSchedule: DashboardReminderSchedule | null;
  notifications: DashboardNotification[];
};
