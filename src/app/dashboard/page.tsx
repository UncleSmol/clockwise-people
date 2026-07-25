import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import ComplianceDocuments from "@/components/compliance/ComplianceDocuments";
import CalendarWorkspace from "@/components/dashboard/CalendarWorkspace";
import { getAccountProfile } from "@/lib/account/queries";

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
const EmployeeLeaveRequests = dynamic(
  () => import("@/components/work-rules/EmployeeLeaveRequests"),
  {
    loading: () => <LoadingPanel label="leave workspace" />,
  },
);

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const [{ company }, access] = await Promise.all([
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
  ] = await Promise.all([
    access.employeeId ? getEmployeeTimeState() : Promise.resolve(null),
    canManageCompany
      ? getCompanySetup(company.id)
      : Promise.resolve({ branches: [], departments: [] }),
    canReviewTime ? getCompanyLiveTimeOverview() : Promise.resolve(null),
    canReviewTime ? getCompanyTimesheetCalendarEntries() : Promise.resolve([]),
    canReviewTime ? getCompanyCalendarEmployeeOptions() : Promise.resolve([]),
    canReviewTime ? getCompanyTimesheetCalendarHolidays() : Promise.resolve([]),
    canReviewTime ? getCompanyCalendarLeaveRequests() : Promise.resolve([]),
    canReviewTime ? getCompanyTimesheetCorrectionQueue() : Promise.resolve([]),
    canReviewTime ? getCompanySubmittedTimesheetQueue() : Promise.resolve([]),
    access.employeeId ? getEmployeeLeaveState() : Promise.resolve(null),
    canReviewTime ? getCompanyLeaveRequestQueue() : Promise.resolve([]),
    getAccountProfile(),
    canManageCompany ? getCompanyWorkRulesData() : Promise.resolve(null),
    canManageCompany ? getCompanyGeolocationData() : Promise.resolve(null),
    canManageEmployees ? getEmployeePageData() : Promise.resolve(null),
    canManageEmployees && selectedEmployeeId
      ? getEmployeeDetail(selectedEmployeeId)
      : Promise.resolve(null),
  ]);

  const currentDateLabel = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(new Date());

  const employeeDeactivateAction = selectedEmployee
    ? deactivateEmployee.bind(null, selectedEmployee.id)
    : null;

  const panels: WorkspacePanel[] = [];

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
                      branches={employeesData.branches}
                      departments={employeesData.departments}
                      managers={employeesData.managers}
                      schedules={employeesData.schedules}
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

              <section className="card p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Add employee</h2>
                  <p className="mt-1 text-xs text-muted">
                    All employee records are saved with company scope.
                  </p>
                </div>
                {employeesData.branches.length === 0 ? (
                  <div className="rounded-lg border border-warning/20 bg-warning/8 px-4 py-4 text-sm text-warning">
                    Branch setup is required first.
                  </div>
                ) : (
                  <EmployeeForm
                    branches={employeesData.branches}
                    departments={employeesData.departments}
                    managers={employeesData.managers}
                    schedules={employeesData.schedules}
                  />
                )}
              </section>

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
          description: "Manage company profile, branches, rules, and geolocation from one modal.",
          content: (
            <div className="grid gap-6">
              {activePanel === "company" && message ? (
                <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
                  {message}
                </div>
              ) : null}
              <section className="card grid gap-4 p-4 sm:p-6">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Company profile</h2>
                  <p className="mt-1 text-sm text-muted">Registration and workspace details.</p>
                </div>
                <CompanyProfileForm company={accountProfile.account.company} />
              </section>
              <CompanyWorkRulesPanel data={workRulesData} />
              <CompanyGeolocationPanel branches={companySetup.branches} data={geolocationData} />
            </div>
          ),
        });
  }

  panels.push({
      key: "account",
      label: "Account and settings",
      description: "Maintain profile details and credentials without leaving the calendar.",
      content: (
        <div className="grid gap-6">
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
      currentDateLabel={currentDateLabel}
        employeeClock={
          <EmployeeTimeClock todayEntry={employeeTimeState?.todayEntry ?? null} variant="strip" />
        }
      employeeCalendar={
        employeeTimeState ? (
          <EmployeeTimesheetCorrections
            correctionRequests={employeeTimeState.correctionRequests}
            currentWorkDate={employeeTimeState.currentWorkDate}
            entries={employeeTimeState.recentEntries}
            publicHolidays={employeeTimeState.publicHolidays}
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
          />
        ) : undefined
      }
      panels={panels}
    />
  );
}
