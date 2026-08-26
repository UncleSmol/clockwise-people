import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import ComplianceDocuments from "@/components/compliance/ComplianceDocuments";
import CalendarWorkspace from "@/components/dashboard/CalendarWorkspace";
import { getAccountProfile, getCompanySettings } from "@/lib/account/queries";
import { deactivateEmployee } from "@/lib/employees/actions";
import { getEmployeeDetail, getEmployeePageData } from "@/lib/employees/queries";
import { getActiveCompany, getCompanySetup, getCurrentUserAccess } from "@/lib/foundation/queries";
import { getCompanyGeolocationData } from "@/lib/geolocation/queries";
import {
  getCompanyCalendarEmployeeOptions,
  getCompanyCalendarLeaveRequests,
  getCompanyLiveTimeOverview,
  getCompanySubmittedTimesheetQueue,
  getCompanyTimesheetCalendarEntries,
  getCompanyTimesheetCalendarHolidays,
  getCompanyTimesheetCorrectionQueue,
  getEmployeeTimeState,
} from "@/lib/time-tracking/queries";
import {
  getCompanyLeaveRequestQueue,
  getCompanyWorkRulesData,
  getEmployeeLeaveState,
} from "@/lib/work-rules/queries";

type DashboardPageProps = {
  searchParams?: Promise<{
    employeeId?: string;
    manualInviteUrl?: string;
    message?: string;
    panel?: string;
  }>;
};

type WorkspacePanel = {
  content: ReactNode;
  description: string;
  key: string;
  label: string;
  tone?: "primary" | "subtle";
};

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="card p-4 sm:p-6">
      <p className="text-sm font-medium text-muted">Loading {label.toLowerCase()}...</p>
    </section>
  );
}

const ChangePasswordForm = dynamic(() => import("@/components/account/ChangePasswordForm"), {
  loading: () => <LoadingPanel label="password tools" />,
});
const PushNotificationSettings = dynamic(
  () => import("@/components/account/PushNotificationSettings"),
  {
    loading: () => <LoadingPanel label="notification preferences" />,
  },
);
const CompanyProfileForm = dynamic(() => import("@/components/account/CompanyProfileForm"), {
  loading: () => <LoadingPanel label="company profile" />,
});
const ProfileForm = dynamic(() => import("@/components/account/ProfileForm"), {
  loading: () => <LoadingPanel label="profile editor" />,
});
const EmployeeAccountPanel = dynamic(
  () => import("@/components/employee-accounts/EmployeeAccountPanel"),
  {
    loading: () => <LoadingPanel label="account access" />,
  },
);
const EmployeeForm = dynamic(() => import("@/components/employees/EmployeeForm"), {
  loading: () => <LoadingPanel label="employee form" />,
});
const EmployeeTable = dynamic(() => import("@/components/employees/EmployeeTable"), {
  loading: () => <LoadingPanel label="employee register" />,
});
const CompanyGeolocationPanel = dynamic(
  () => import("@/components/geolocation/CompanyGeolocationPanel"),
  {
    loading: () => <LoadingPanel label="geolocation tools" />,
  },
);
const CompanyDepartmentPanel = dynamic(
  () => import("@/components/foundation/CompanyDepartmentPanel"),
  {
    loading: () => <LoadingPanel label="department tools" />,
  },
);
const CompanyLogoForm = dynamic(() => import("@/components/company/CompanyLogoForm"), {
  loading: () => <LoadingPanel label="logo settings" />,
});
const InviteLinkPanel = dynamic(() => import("@/components/invitations/InviteLinkPanel"), {
  loading: () => <LoadingPanel label="invite link" />,
});
const CompanyLiveWorkforce = dynamic(
  () => import("@/components/time-tracking/CompanyLiveWorkforce"),
  {
    loading: () => <LoadingPanel label="live workforce" />,
  },
);
const CompanyTimesheetApprovalQueue = dynamic(
  () => import("@/components/time-tracking/CompanyTimesheetApprovalQueue"),
  {
    loading: () => <LoadingPanel label="approval queue" />,
  },
);
const CompanyTimesheetCalendar = dynamic(
  () => import("@/components/time-tracking/CompanyTimesheetCalendar"),
  {
    loading: () => <LoadingPanel label="team calendar" />,
  },
);
const CompanyTimesheetCorrectionQueue = dynamic(
  () => import("@/components/time-tracking/CompanyTimesheetCorrectionQueue"),
  {
    loading: () => <LoadingPanel label="correction queue" />,
  },
);
const EmployeeTimeClock = dynamic(() => import("@/components/time-tracking/EmployeeTimeClock"), {
  loading: () => <LoadingPanel label="time clock" />,
});
const EmployeeTimesheetCorrections = dynamic(
  () => import("@/components/time-tracking/EmployeeTimesheetCorrections"),
  {
    loading: () => <LoadingPanel label="timesheets" />,
  },
);
const EmployeeMyTimeHub = dynamic(
  () => import("@/components/time-tracking/EmployeeMyTimeHub"),
  {
    loading: () => <LoadingPanel label="my time" />,
  },
);
const CompanyLeaveRequestQueue = dynamic(
  () => import("@/components/work-rules/CompanyLeaveRequestQueue"),
  {
    loading: () => <LoadingPanel label="leave requests" />,
  },
);
const CompanyWorkRulesPanel = dynamic(
  () => import("@/components/work-rules/CompanyWorkRulesPanel"),
  {
    loading: () => <LoadingPanel label="work rules" />,
  },
);
const CompanyLeaveAccrualPanel = dynamic(
  () => import("@/components/work-rules/CompanyLeaveAccrualPanel"),
  {
    loading: () => <LoadingPanel label="leave accruals" />,
  },
);
const EmployeeLeaveRequests = dynamic(
  () => import("@/components/work-rules/EmployeeLeaveRequests"),
  {
    loading: () => <LoadingPanel label="leave workspace" />,
  },
);
const CompanyRulesForm = dynamic(
  () => import("@/components/account/CompanyRulesForm"),
  {
    loading: () => <LoadingPanel label="company rules" />,
  },
);
const CompanyReportsWorkspace = dynamic(
  () => import("@/components/reports/CompanyReportsWorkspace"),
  {
    loading: () => <LoadingPanel label="reporting center" />,
  },
);

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const [{ companies, company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);

  const canManageCompany = access.canManageCompany;
  const canManageEmployees = access.canManageEmployees;
  const canReviewTime = access.canReviewBranchTime || access.canManageDirectReports;
  const activePanel = params?.panel ?? null;
  const selectedEmployeeId = params?.employeeId ?? null;
  const message = params?.message ? decodeURIComponent(params.message) : "";
  const manualInviteUrl = params?.manualInviteUrl
    ? decodeURIComponent(params.manualInviteUrl)
    : "";

  const [
    employeeTimeState,
    companySetup,
    liveTimeOverview,
    calendarEntries,
    calendarEmployees,
    calendarHolidays,
    calendarLeaveRequests,
    correctionQueue,
    submittedTimesheets,
    leaveState,
    leaveRequests,
    accountProfile,
    workRulesData,
    geolocationData,
    employeesData,
    selectedEmployee,
    companySettings,
  ] = await Promise.all([
    getEmployeeTimeState(),
    canManageCompany
      ? getCompanySetup(company.id)
      : Promise.resolve({ workstations: [], departments: [] }),
    getCompanyLiveTimeOverview(),
    canReviewTime ? getCompanyTimesheetCalendarEntries() : Promise.resolve([]),
    canReviewTime ? getCompanyCalendarEmployeeOptions() : Promise.resolve([]),
    canReviewTime ? getCompanyTimesheetCalendarHolidays() : Promise.resolve([]),
    canReviewTime ? getCompanyCalendarLeaveRequests() : Promise.resolve([]),
    canReviewTime ? getCompanyTimesheetCorrectionQueue() : Promise.resolve([]),
    canReviewTime ? getCompanySubmittedTimesheetQueue() : Promise.resolve([]),
    getEmployeeLeaveState(),
    canReviewTime ? getCompanyLeaveRequestQueue() : Promise.resolve([]),
    getAccountProfile(),
    canManageCompany ? getCompanyWorkRulesData() : Promise.resolve(null),
    canManageCompany ? getCompanyGeolocationData() : Promise.resolve(null),
    canManageEmployees ? getEmployeePageData() : Promise.resolve(null),
    canManageEmployees && selectedEmployeeId
      ? getEmployeeDetail(selectedEmployeeId)
      : Promise.resolve(null),
    canManageCompany ? getCompanySettings() : Promise.resolve(null),
  ]);

  const currentDateLabel = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(new Date());

  const todayEntry = employeeTimeState?.todayEntry ?? null;
  const draftCount =
    employeeTimeState?.recentEntries.filter((entry) => entry.status === "draft").length ?? 0;
  const submittedCount =
    employeeTimeState?.recentEntries.filter((entry) => entry.status === "submitted").length ?? 0;
  const pendingLeaveCount =
    leaveState?.requests.filter((request) => request.status === "submitted").length ?? 0;

  const clockBadge = !todayEntry?.clock_in ? (
    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
      Not clocked in
    </span>
  ) : todayEntry.clock_out ? (
    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
      Complete
    </span>
  ) : (
    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
      Clocked in
    </span>
  );

  const timesheetBadge = draftCount === 0 && submittedCount === 0 ? (
    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
      Up to date
    </span>
  ) : (
    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
      {draftCount > 0
        ? `${draftCount} draft${draftCount === 1 ? "" : "s"}`
        : `${submittedCount} pending`}
      {draftCount > 0 && submittedCount > 0 ? ` · ${submittedCount} pending` : ""}
    </span>
  );

  const leaveBadge = pendingLeaveCount > 0 ? (
    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
      {pendingLeaveCount} pending
    </span>
  ) : (
    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
      No pending
    </span>
  );

  const employeeDeactivateAction = selectedEmployee
    ? deactivateEmployee.bind(null, selectedEmployee.id)
    : null;

  const panels: WorkspacePanel[] = [];

  if (liveTimeOverview) {
    panels.push({
      key: "attendance",
      label: "Today's attendance",
      description: "Live workforce status and colleagues clocked in today.",
      tone: "primary" as const,
      content: <CompanyLiveWorkforce overview={liveTimeOverview} />,
    });
  }

  if (leaveState || canReviewTime) {
    panels.push({
      key: "leave",
      label: "Leave and balances",
      description: "Submit leave, review balances, and process leave approvals.",
      tone: "primary" as const,
      content: (
        <div className="grid gap-6">
          {activePanel === "leave" && message ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
              {message}
            </div>
          ) : null}
          {leaveState ? <EmployeeLeaveRequests state={leaveState} /> : null}
          {canReviewTime ? <CompanyLeaveRequestQueue requests={leaveRequests} /> : null}
        </div>
      ),
    });
  }

  if (canReviewTime) {
    panels.push({
      key: "manager-review",
      label: "Approvals and corrections",
      description:
        "Review submitted timesheets, correction requests, and live workforce status.",
      content: (
        <div className="grid gap-6">
          {liveTimeOverview ? <CompanyLiveWorkforce overview={liveTimeOverview} /> : null}
          <CompanyTimesheetCorrectionQueue requests={correctionQueue} />
          <CompanyTimesheetApprovalQueue timesheets={submittedTimesheets} />
        </div>
      ),
    });
  }

  if (canManageEmployees && employeesData) {
    panels.push({
          key: "people",
          label: "People and employee records",
          description: "Create employee records and maintain the active employee register.",
          content: (
            <div className="grid gap-6">
              {activePanel === "people" && message ? (
                <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
                  {message}
                </div>
              ) : null}

              {selectedEmployee ? (
                <>
                  <EmployeeAccountPanel
                    employeeId={selectedEmployee.id}
                    email={selectedEmployee.email}
                    hasAccount={Boolean(selectedEmployee.user_id)}
                  />

                  {manualInviteUrl ? <InviteLinkPanel inviteUrl={manualInviteUrl} /> : null}

                  <section className="card grid gap-4 p-4 sm:p-6">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">Edit employee</h2>
                      <p className="mt-1 text-sm text-muted">
                        Updates are scoped by company and employee id on the backend.
                      </p>
                    </div>
                    <EmployeeForm
                      workstations={employeesData.workstations}
                      departments={employeesData.departments}
                      managers={employeesData.managers}
                      schedules={employeesData.schedules}
                      standardMonthlyHours={employeesData.standardMonthlyHours}
                      employee={selectedEmployee}
                    />
                  </section>

                  {employeeDeactivateAction ? (
                    <section className="rounded-lg border border-danger/20 bg-danger/8 p-4 sm:p-6">
                      <h2 className="text-xl font-semibold text-danger">Deactivate employee</h2>
                      <p className="mt-2 max-w-2xl text-sm text-danger">
                        This performs a soft delete by marking the employee inactive and setting
                        deleted_at.
                      </p>
                      <form action={employeeDeactivateAction} className="mt-4">
                        <button className="btn btn-danger">
                          Deactivate employee
                        </button>
                      </form>
                    </section>
                  ) : null}
                </>
              ) : null}

              <section className="grid gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Employee list</h2>
                  <p className="mt-1 text-xs text-muted">
                    {employeesData.employees.length} active employee records.
                  </p>
                </div>
                {employeesData.employees.length > 0 ? (
                  <EmployeeTable employees={employeesData.employees} />
                ) : (
                  <div className="card p-4 text-sm text-muted">No employees yet.</div>
                )}
              </section>
            </div>
          ),
        });
  }

  if (canManageCompany && workRulesData && geolocationData) {
    panels.push({
          key: "company",
          label: "Company setup",
          description: "Manage company profile, workstations, rules, departments, and employees from one modal.",
          content: (
            <div className="grid gap-6">
              {activePanel === "company" && message ? (
                <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
                  {message}
                </div>
              ) : null}

              {/* Company profile */}
              <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Company profile</h2>
                    <p className="mt-0.5 text-sm text-muted">Registration and workspace details.</p>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-6 border-t border-border p-4 sm:p-6">
                  <CompanyProfileForm company={accountProfile.account.company} />
                  <CompanyLogoForm
                    companyName={accountProfile.account.company.name}
                    logoUrl={accountProfile.account.company.logo_url}
                  />
                </div>
              </details>

              {/* Workstations & Geolocation */}
              <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Workstations &amp; Geolocation</h2>
                    <p className="mt-0.5 text-sm text-muted">Manage physical locations and geofence boundaries.</p>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border">
                  <CompanyGeolocationPanel data={geolocationData} />
                </div>
              </details>

              {/* Work rules & leave */}
              <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Work rules &amp; leave</h2>
                    <p className="mt-0.5 text-sm text-muted">Define working hours, overtime rules, and leave policies.</p>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border">
                  <CompanyWorkRulesPanel data={workRulesData} />
                  <CompanyLeaveAccrualPanel data={workRulesData} />
                </div>
              </details>

              {/* Departments */}
              <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Departments</h2>
                    <p className="mt-0.5 text-sm text-muted">Organise employees into departments for reporting and filtering.</p>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border">
                  <CompanyDepartmentPanel
                    workstations={companySetup.workstations}
                    departments={companySetup.departments}
                    employees={employeesData?.employees ?? []}
                  />
                </div>
              </details>

              {/* Add Employee */}
              {employeesData ? (
                <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Add employee</h2>
                      <p className="mt-0.5 text-sm text-muted">Create employee records scoped to the company.</p>
                    </div>
                    <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border p-4 sm:p-6">
                    {employeesData.workstations.length === 0 ? (
                      <div className="rounded-lg border border-warning/20 bg-warning/8 px-4 py-4 text-sm text-warning">
                        Workstation setup is required first.
                      </div>
                    ) : (
                      <EmployeeForm
                        workstations={employeesData.workstations}
                        departments={employeesData.departments}
                        managers={employeesData.managers}
                        schedules={employeesData.schedules}
                        standardMonthlyHours={employeesData.standardMonthlyHours}
                      />
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          ),
        });
  }

  if (canManageCompany || canReviewTime) {
    const reportEmployees = (employeesData?.employees ?? []).map((e) => ({
      id: e.id,
      full_name: e.full_name,
      known_as: e.known_as ?? null,
      avatar_url: e.avatar_url ?? null,
      employee_number: e.employee_number ?? e.id.slice(0, 8),
      department_name: e.department_name ?? null,
      workstation_name: e.workstation_name ?? null,
      job_title: e.job_title ?? null,
      daily_hours: 8,
    }));

    const finalReportEmployees =
      reportEmployees.length > 0
        ? reportEmployees
        : calendarEmployees.map((e) => ({
            id: e.id,
            full_name: e.label,
            known_as: null,
            avatar_url: null,
            employee_number: e.id.slice(0, 8),
            department_name: null,
            workstation_name: null,
            job_title: null,
            daily_hours: 8,
          }));

    const payrollConfig = (companySettings?.approval_rules as Record<string, unknown> | undefined)
      ?.payroll_period_config as import("@/lib/reports/payroll-periods").PayrollPeriodConfig | undefined;

    panels.push({
      key: "reports",
      label: "Reports and analytics",
      description: "Audit timesheets by payroll period, analyze attendance punctuality, track leave accruals, and pull compliance exports.",
      content: (
        <CompanyReportsWorkspace
          companyName={company.name}
          employees={finalReportEmployees}
          departments={employeesData?.departments ?? []}
          workstations={geolocationData?.workstations ?? []}
          timesheetEntries={calendarEntries}
          leaveRequests={calendarLeaveRequests}
          leaveTypes={workRulesData?.leaveTypes ?? []}
          leaveAssignments={workRulesData?.leaveBalances ?? []}
          publicHolidays={calendarHolidays}
          payrollConfig={payrollConfig}
        />
      ),
    });
  }

  panels.push({
      key: "account",
      label: "Account and settings",
      description: "Maintain profile details, push notifications, and credentials.",
      content: (
        <div className="grid gap-6">
          <PushNotificationSettings />
          {accountProfile.employee ? (
            <section className="card grid gap-4 p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Profile</h2>
                <p className="mt-1 text-sm text-muted">Update the details people see around the app.</p>
              </div>
              <ProfileForm employee={accountProfile.employee} />
            </section>
          ) : null}
          <section className="card grid max-w-xl gap-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Change password</h2>
              <p className="mt-1 text-sm text-muted">Use this after receiving temporary credentials.</p>
            </div>
            <ChangePasswordForm />
          </section>
          {companySettings ? <CompanyRulesForm settings={companySettings} /> : null}
        </div>
      ),
    });

  panels.push({
      key: "policies",
      label: "Policies and documents",
      description: "Compliance, privacy, geolocation, overtime, and governance documents.",
      content: <ComplianceDocuments />,
    });

  return (
    <CalendarWorkspace
      companyName={company.name}
      companies={companies}
      isSuperAdmin={access.isSuperAdmin}
      currentDateLabel={currentDateLabel}
        employeeClock={
          <EmployeeTimeClock
            todayEntry={employeeTimeState?.todayEntry ?? null}
            variant="strip"
            workstations={employeeTimeState?.workstations ?? []}
            assignedWorkstationId={employeeTimeState?.assignedWorkstationId ?? null}
            todaySchedule={employeeTimeState?.todaySchedule ?? null}
          />
        }
      employeeCalendar={
        employeeTimeState ? (
          <EmployeeTimesheetCorrections
            collapsedCalendar
            correctionRequests={employeeTimeState.correctionRequests}
            currentWorkDate={employeeTimeState.currentWorkDate}
            entries={employeeTimeState.recentEntries}
            publicHolidays={employeeTimeState.publicHolidays}
            liveOverview={liveTimeOverview}
          />
        ) : (
          <section className="card p-6 text-sm text-muted">
            No employee time profile is linked to this account.
          </section>
        )
      }
      employeeHub={
        employeeTimeState ? (
          <EmployeeMyTimeHub
            clock={
              <EmployeeTimeClock
                todayEntry={employeeTimeState.todayEntry ?? null}
                variant="strip"
                workstations={employeeTimeState.workstations ?? []}
                assignedWorkstationId={employeeTimeState.assignedWorkstationId ?? null}
                todaySchedule={employeeTimeState.todaySchedule ?? null}
              />
            }
            clockBadge={clockBadge}
            review={
              <EmployeeTimesheetCorrections
                collapsedCalendar
                correctionRequests={employeeTimeState.correctionRequests}
                currentWorkDate={employeeTimeState.currentWorkDate}
                entries={employeeTimeState.recentEntries}
                publicHolidays={employeeTimeState.publicHolidays}
                liveOverview={liveTimeOverview}
              />
            }
            timesheetBadge={timesheetBadge}
            leave={
              leaveState ? (
                <EmployeeLeaveRequests state={leaveState} />
              ) : (
                <section className="card p-6 text-sm text-muted">
                  No employee leave profile is linked to this account.
                </section>
              )
            }
            leaveBadge={leaveBadge}
          />
        ) : (
          <section className="card p-6 text-sm text-muted">
            No employee time profile is linked to this account.
          </section>
        )
      }
      initialActivePanelKey={activePanel}
      isManager={canReviewTime}
      managerCalendar={
        canReviewTime ? (
          <CompanyTimesheetCalendar
            employees={calendarEmployees}
            entries={calendarEntries}
            leaveRequests={calendarLeaveRequests}
            publicHolidays={calendarHolidays}
            liveOverview={liveTimeOverview}
          />
        ) : undefined
      }
      panels={panels}
    />
  );
}
