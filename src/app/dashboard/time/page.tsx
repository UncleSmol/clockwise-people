import EmployeeAvatar from "@/components/EmployeeAvatar";
import CompanyLiveWorkforce from "@/components/time-tracking/CompanyLiveWorkforce";
import CompanyTimesheetApprovalQueue from "@/components/time-tracking/CompanyTimesheetApprovalQueue";
import CompanyTimesheetCalendar from "@/components/time-tracking/CompanyTimesheetCalendar";
import CompanyTimesheetCorrectionQueue from "@/components/time-tracking/CompanyTimesheetCorrectionQueue";
import EmployeeTimeClock from "@/components/time-tracking/EmployeeTimeClock";
import EmployeeTimesheetCorrections from "@/components/time-tracking/EmployeeTimesheetCorrections";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import {
  getCompanyLiveTimeOverview,
  getCompanySubmittedTimesheetQueue,
  getCompanyTimesheetCalendarEntries,
  getCompanyTimesheetCorrectionQueue,
  getEmployeeTimeState,
} from "@/lib/time-tracking/queries";

export default async function TimePage() {
  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);

  const canReviewTime = access.canReviewBranchTime || access.canManageDirectReports;
  const [
    timeState,
    liveTimeOverview,
    calendarEntries,
    correctionQueue,
    submittedTimesheets,
  ] = await Promise.all([
    access.employeeId ? getEmployeeTimeState() : Promise.resolve(null),
    canReviewTime ? getCompanyLiveTimeOverview() : Promise.resolve(null),
    canReviewTime ? getCompanyTimesheetCalendarEntries() : Promise.resolve([]),
    canReviewTime ? getCompanyTimesheetCorrectionQueue() : Promise.resolve([]),
    canReviewTime ? getCompanySubmittedTimesheetQueue() : Promise.resolve([]),
  ]);

  const displayName =
    timeState?.employee?.known_as ?? timeState?.employee?.full_name ?? "Time tracking";

  return (
    <div className="grid gap-4">
      <header className="premium-hero grid gap-3 rounded-md p-4 text-white sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-3">
          {timeState?.employee ? (
            <EmployeeAvatar
              name={displayName}
              src={timeState.employee.avatar_url}
              className="size-14 rounded-lg border-white/25 bg-white/10 text-white"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
              Time
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">
              {timeState?.employee ? displayName : company.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm opacity-80">
              Clock in, manage timesheets, and review company time records from one place.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
            Current day
          </p>
          <p className="mt-1 text-sm font-semibold">
            {new Intl.DateTimeFormat("en-ZA", {
              day: "numeric",
              month: "long",
              weekday: "long",
            }).format(new Date())}
          </p>
        </div>
      </header>

      {timeState ? (
        <>
          <EmployeeTimeClock todayEntry={timeState.todayEntry} />

          <EmployeeTimesheetCorrections
            correctionRequests={timeState.correctionRequests}
            currentWorkDate={timeState.currentWorkDate}
            entries={timeState.recentEntries}
            publicHolidays={timeState.publicHolidays}
          />
        </>
      ) : null}

      {canReviewTime && liveTimeOverview ? (
        <>
          <CompanyTimesheetCalendar entries={calendarEntries} />

          <CompanyLiveWorkforce overview={liveTimeOverview} />

          <CompanyTimesheetCorrectionQueue requests={correctionQueue} />

          <CompanyTimesheetApprovalQueue timesheets={submittedTimesheets} />
        </>
      ) : null}
    </div>
  );
}
