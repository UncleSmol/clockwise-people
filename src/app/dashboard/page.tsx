import Link from "next/link";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import CompanyLiveWorkforce from "@/components/time-tracking/CompanyLiveWorkforce";
import CompanyTimesheetApprovalQueue from "@/components/time-tracking/CompanyTimesheetApprovalQueue";
import CompanyTimesheetCorrectionQueue from "@/components/time-tracking/CompanyTimesheetCorrectionQueue";
import EmployeeTimeClock from "@/components/time-tracking/EmployeeTimeClock";
import EmployeeTimesheetCorrections from "@/components/time-tracking/EmployeeTimesheetCorrections";
import CompanyLeaveRequestQueue from "@/components/work-rules/CompanyLeaveRequestQueue";
import EmployeeLeaveRequests from "@/components/work-rules/EmployeeLeaveRequests";
import {
  getActiveCompany,
  getCompanySetup,
  getCurrentUserAccess,
} from "@/lib/foundation/queries";
import { getEmployeePageData } from "@/lib/employees/queries";
import {
  getCompanyLiveTimeOverview,
  getCompanySubmittedTimesheetQueue,
  getCompanyTimesheetCorrectionQueue,
  getEmployeeTimeState,
} from "@/lib/time-tracking/queries";
import {
  getCompanyLeaveRequestQueue,
  getEmployeeLeaveState,
} from "@/lib/work-rules/queries";

export default async function DashboardPage() {
  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);

  const isManagementView =
    access.canManageEmployees ||
    access.canReviewBranchTime ||
    access.canManageDirectReports;

  if (!isManagementView && access.employeeId) {
    const [timeState, leaveState] = await Promise.all([
      getEmployeeTimeState(),
      getEmployeeLeaveState(),
    ]);
    const displayName =
      timeState.employee?.known_as ?? timeState.employee?.full_name ?? "Employee";

    return (
      <div className="grid gap-4">
        <header className="premium-hero grid gap-3 rounded-md p-4 text-white sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex min-w-0 items-center gap-3">
            <EmployeeAvatar
              name={displayName}
              src={timeState.employee?.avatar_url}
              className="size-14 rounded-lg border-white/25 bg-white/10 text-white"
            />
            <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
              Employee dashboard
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">
              {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm opacity-80">
              {timeState.employee?.branch_name
                ? `${timeState.employee.branch_name}${timeState.employee.job_title ? ` - ${timeState.employee.job_title}` : ""}`
                : "Your time records are scoped to your own employee profile."}
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

        <EmployeeTimeClock todayEntry={timeState.todayEntry} />

        <EmployeeTimesheetCorrections
          correctionRequests={timeState.correctionRequests}
          currentWorkDate={timeState.currentWorkDate}
          entries={timeState.recentEntries}
          publicHolidays={timeState.publicHolidays}
        />

        <EmployeeLeaveRequests state={leaveState} />

      </div>
    );
  }

  const [
    { branches, departments },
    employeesData,
    liveTimeOverview,
    correctionQueue,
    submittedTimesheets,
    leaveRequests,
  ] = await Promise.all([
    getCompanySetup(company.id),
    getEmployeePageData(),
    getCompanyLiveTimeOverview(),
    getCompanyTimesheetCorrectionQueue(),
    getCompanySubmittedTimesheetQueue(),
    getCompanyLeaveRequestQueue(),
  ]);

  const hasBranches = branches.length > 0;
  const hasDepartments = departments.length > 0;
  const hasEmployees = employeesData.employees.length > 0;
  const completedSteps = [true, hasBranches, hasEmployees].filter(Boolean).length;
  const setupProgress = Math.round((completedSteps / 3) * 100);
  const foundationComplete = setupProgress === 100;
  const nextAction = !hasBranches
    ? {
        title: "Add your first branch",
        body: "Employees must belong to a branch, so branch setup comes before employee registration.",
        href: "/dashboard/company",
        label: "Go to company setup",
      }
    : !hasEmployees
      ? {
          title: "Register your first employee",
          body: "Once employees are in place, schedules can be added next for accurate time calculations.",
          href: "/dashboard/employees",
          label: "Add employees",
        }
      : {
          title: "Foundation is ready",
          body: "Your company has the minimum setup needed for the next phase: work schedules.",
          href: "/dashboard/employees",
          label: "Review employees",
        };

  const stats = [
    {
      label: "Company",
      value: "Ready",
      detail: "Provisioned by administrator",
    },
    {
      label: "Branches",
      value: branches.length,
      detail: hasBranches ? "Employee locations ready" : "Required before employees",
    },
    {
      label: "Employees",
      value: employeesData.employees.length,
      detail: hasEmployees ? "Register active" : "No staff registered yet",
    },
  ];

  const workforceStats = [
    {
      label: "Active employees",
      value: employeesData.employees.length,
      detail: "Current registered workforce",
    },
    {
      label: "Branches",
      value: branches.length,
      detail: "Operational locations",
    },
    {
      label: "Departments",
      value: departments.length,
      detail: "Reporting groups",
    },
  ];

  const employmentMix = employeesData.employees.reduce<Record<string, number>>(
    (counts, employee) => {
      counts[employee.employment_type] = (counts[employee.employment_type] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const checklist = [
    {
      title: "Company account",
      description: `${company.name} is assigned to this signed-in owner account.`,
      complete: true,
    },
    {
      title: "Branch setup",
      description: hasBranches
        ? `${branches.length} active branch${branches.length === 1 ? "" : "es"} available for employee records.`
        : "Add at least one branch before registering employees.",
      complete: hasBranches,
    },
    {
      title: "Department setup",
      description: hasDepartments
        ? `${departments.length} department${departments.length === 1 ? "" : "s"} configured for reporting.`
        : "Departments are optional now, but useful for clean reporting later.",
      complete: hasDepartments,
      optional: true,
    },
    {
      title: "Employee register",
      description: hasEmployees
        ? `${employeesData.employees.length} active employee record${employeesData.employees.length === 1 ? "" : "s"} ready.`
        : "Add employees after branch setup is complete.",
      complete: hasEmployees,
    },
  ];

  return (
    <div className="grid gap-4">
      <header className="premium-hero grid gap-4 rounded-md p-4 text-white sm:p-5 lg:grid-cols-[1fr_280px] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
            Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{company.name}</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-80">
            {foundationComplete
              ? "A current snapshot of your workforce register."
              : "Complete the foundation in order: company assignment, branches, then employees."}
          </p>
        </div>

        {!foundationComplete ? (
          <div className="rounded-md border border-white/15 bg-white/10 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">Foundation readiness</span>
              <span className="text-sm font-semibold text-accent">{setupProgress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${setupProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>

      {foundationComplete ? (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            {workforceStats.map((stat) => (
              <div key={stat.label} className="premium-panel rounded-md p-4">
                <p className="text-sm font-medium text-muted">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted">{stat.detail}</p>
              </div>
            ))}
          </section>

          <CompanyLiveWorkforce overview={liveTimeOverview} />

          <CompanyTimesheetCorrectionQueue requests={correctionQueue} />

          <CompanyTimesheetApprovalQueue timesheets={submittedTimesheets} />

          <CompanyLeaveRequestQueue requests={leaveRequests} />

          <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="premium-card rounded-md">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold text-foreground">Workforce composition</h2>
                <p className="mt-1 text-xs text-muted">
                  Employee count by employment type.
                </p>
              </div>
              <div className="divide-y divide-border">
                {Object.entries(employmentMix).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between px-4 py-3">
                    <span className="font-semibold capitalize text-foreground">
                      {type.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold text-foreground">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <aside className="premium-card rounded-md p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                Quick actions
              </p>
              <div className="mt-3 grid gap-2">
                <Link
                  href="/dashboard/employees"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:border-accent"
                >
                  Manage employees
                </Link>
                <Link
                  href="/dashboard/company"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:border-accent"
                >
                  Manage branches and departments
                </Link>
              </div>
            </aside>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="premium-panel rounded-md p-4">
                <p className="text-sm font-medium text-muted">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted">{stat.detail}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="premium-card rounded-md">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold text-foreground">Setup checklist</h2>
                <p className="mt-1 text-xs text-muted">
                  The app will guide you through the minimum foundation before schedules and timesheets.
                </p>
              </div>
              <div className="divide-y divide-border">
                {checklist.map((item) => (
                  <div key={item.title} className="grid gap-3 px-4 py-3 sm:grid-cols-[110px_1fr]">
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          item.complete
                            ? "bg-success/10 text-success"
                            : item.optional
                              ? "bg-warning/10 text-warning"
                              : "bg-danger/10 text-danger"
                        }`}
                      >
                        {item.complete ? "Complete" : item.optional ? "Optional" : "Needed"}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-xs text-muted">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="premium-hero rounded-md p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                Next step
              </p>
              <h2 className="mt-2 text-xl font-semibold">{nextAction.title}</h2>
              <p className="mt-2 text-sm leading-5 opacity-80">{nextAction.body}</p>
              <Link
                href={nextAction.href}
                className="mt-4 inline-flex rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
              >
                {nextAction.label}
              </Link>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
