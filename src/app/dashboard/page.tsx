import Link from "next/link";
import EmployeeTimeClock from "@/components/time-tracking/EmployeeTimeClock";
import {
  getActiveCompany,
  getCompanySetup,
  getCurrentUserAccess,
} from "@/lib/foundation/queries";
import { getEmployeePageData } from "@/lib/employees/queries";
import { getEmployeeTimeState } from "@/lib/time-tracking/queries";

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string | null) {
  if (!value) return "Not recorded";

  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-ZA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}h`;
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not recorded";
  if (start && !end) return `${formatTime(start)} - active`;
  if (!start && end) return `Started before ${formatTime(end)}`;
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export default async function DashboardPage() {
  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);

  if (!access.canManageEmployees && access.employeeId) {
    const timeState = await getEmployeeTimeState();
    const displayName =
      timeState.employee?.known_as ?? timeState.employee?.full_name ?? "Employee";

    return (
      <div className="grid gap-6">
        <header className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              Employee dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
              {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              {timeState.employee?.branch_name
                ? `${timeState.employee.branch_name}${timeState.employee.job_title ? ` - ${timeState.employee.job_title}` : ""}`
                : "Your time records are scoped to your own employee profile."}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Current day
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {new Intl.DateTimeFormat("en-ZA", {
                day: "numeric",
                month: "long",
                weekday: "long",
              }).format(new Date())}
            </p>
          </div>
        </header>

        <EmployeeTimeClock todayEntry={timeState.todayEntry} />

        <section className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Recent time records</h2>
              <p className="mt-1 text-sm text-muted">
                Only your own records are visible from this account.
              </p>
            </div>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold text-foreground">
              {timeState.recentEntries.length} records
            </span>
          </div>
          {timeState.recentEntries.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-4 text-sm text-muted">
              No time entries yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {timeState.recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-md border border-border bg-background p-4 text-sm lg:grid-cols-[140px_1fr_auto] lg:items-center"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatDate(entry.work_date)}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      {entry.status}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">In</p>
                      <p className="font-semibold text-foreground">{formatTime(entry.clock_in)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Lunch</p>
                      <p className="font-semibold text-foreground">
                        {formatTimeRange(entry.lunch_start, entry.lunch_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Out</p>
                      <p className="font-semibold text-foreground">{formatTime(entry.clock_out)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Warnings</p>
                      <p className="font-semibold text-foreground">
                        {entry.missing_clocking || entry.late_arrival || entry.early_departure
                          ? "Needs review"
                          : "Clear"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md bg-surface-muted px-3 py-2 text-right">
                    <p className="text-xs text-muted">Paid</p>
                    <p className="font-semibold text-foreground">
                      {formatHours(entry.paid_hours)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const [{ branches, departments }, employeesData] = await Promise.all([
    getCompanySetup(company.id),
    getEmployeePageData(),
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
    <div className="grid gap-6">
      <header className="grid gap-5 rounded-md border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[1fr_320px] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{company.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {foundationComplete
              ? "A current snapshot of your workforce register."
              : "Complete the foundation in order: company assignment, branches, then employees."}
          </p>
        </div>

        {!foundationComplete ? (
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-foreground">Foundation readiness</span>
              <span className="text-sm font-semibold text-accent">{setupProgress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
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
          <section className="grid gap-4 md:grid-cols-3">
            {workforceStats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-surface p-5">
                <p className="text-sm font-medium text-muted">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{stat.value}</p>
                <p className="mt-2 text-sm text-muted">{stat.detail}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="rounded-md border border-border bg-surface">
              <div className="border-b border-border px-4 py-4 sm:px-6">
                <h2 className="text-xl font-semibold text-foreground">Workforce composition</h2>
                <p className="mt-1 text-sm text-muted">
                  Employee count by employment type.
                </p>
              </div>
              <div className="divide-y divide-border">
                {Object.entries(employmentMix).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between px-4 py-4 sm:px-6">
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

            <aside className="rounded-md border border-border bg-surface p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                Quick actions
              </p>
              <div className="mt-5 grid gap-3">
                <Link
                  href="/dashboard/employees"
                  className="rounded-md border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:border-accent"
                >
                  Manage employees
                </Link>
                <Link
                  href="/dashboard/company"
                  className="rounded-md border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:border-accent"
                >
                  Manage branches and departments
                </Link>
              </div>
            </aside>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-surface p-5">
                <p className="text-sm font-medium text-muted">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{stat.value}</p>
                <p className="mt-2 text-sm text-muted">{stat.detail}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="rounded-md border border-border bg-surface">
              <div className="border-b border-border px-4 py-4 sm:px-6">
                <h2 className="text-xl font-semibold text-foreground">Setup checklist</h2>
                <p className="mt-1 text-sm text-muted">
                  The app will guide you through the minimum foundation before schedules and timesheets.
                </p>
              </div>
              <div className="divide-y divide-border">
                {checklist.map((item) => (
                  <div key={item.title} className="grid gap-3 px-4 py-5 sm:grid-cols-[120px_1fr] sm:px-6">
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
                      <p className="mt-1 text-sm text-muted">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-md border border-border bg-primary p-6 text-primary-foreground">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] opacity-70">
                Next step
              </p>
              <h2 className="mt-3 text-2xl font-semibold">{nextAction.title}</h2>
              <p className="mt-3 text-sm leading-6 opacity-80">{nextAction.body}</p>
              <Link
                href={nextAction.href}
                className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
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
