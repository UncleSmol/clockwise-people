import ChangePasswordForm from "@/components/account/ChangePasswordForm";
import ProfileForm from "@/components/account/ProfileForm";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import { getAccountProfile } from "@/lib/account/queries";

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replaceAll("_", " ");
}

function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not set";

  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value));
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-background/80 p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold capitalize text-foreground">
        {value || "Not set"}
      </p>
    </div>
  );
}

export default async function AccountPage() {
  const profile = await getAccountProfile();
  const employee = profile.employee;

  return (
    <div className="grid gap-8">
      <header className="premium-hero rounded-md p-5 text-white sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
          Account
        </p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
          Account profile
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-80">
          Signed in as {profile.account.email}. Account data is scoped to your
          role and employee record.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="premium-panel rounded-md p-5">
          <p className="text-sm font-medium text-muted">Workspace</p>
          <p className="mt-2 text-xl font-semibold text-foreground">
            {profile.account.companyName}
          </p>
          <p className="mt-2 text-sm text-muted">{profile.account.companyTimezone}</p>
        </div>
        <div className="premium-panel rounded-md p-5">
          <p className="text-sm font-medium text-muted">Access role</p>
          <p className="mt-2 text-xl font-semibold capitalize text-foreground">
            {profile.account.roles.map(formatLabel).join(", ") || "Not assigned"}
          </p>
          <p className="mt-2 text-sm text-muted">Controls what this account can view.</p>
        </div>
        <div className="premium-panel rounded-md p-5">
          <p className="text-sm font-medium text-muted">Employee link</p>
          <p className="mt-2 text-xl font-semibold text-foreground">
            {employee ? employee.employeeNumber : "No employee profile"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {employee ? "Linked to this signed-in account" : "Admin account only"}
          </p>
        </div>
      </section>

      {employee && (
        <>
          <section className="premium-card rounded-md p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar
                  name={employee.knownAs ?? employee.fullName}
                  src={employee.avatarUrl}
                  className="size-14 rounded-lg"
                />
                <div className="min-w-0">
                <h2 className="text-xl font-semibold text-foreground">Employee details</h2>
                <p className="mt-1 text-sm text-muted">
                  Personal and employment details available to this account.
                </p>
                </div>
              </div>
              <span className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold capitalize text-foreground">
                {formatLabel(employee.employmentStatus)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="Full name" value={employee.fullName} />
              <DetailItem label="Known as" value={employee.knownAs} />
              <DetailItem label="Email" value={employee.email} />
              <DetailItem label="Phone" value={employee.phoneNumber} />
              <DetailItem label="Employee no." value={employee.employeeNumber} />
              <DetailItem label="Job title" value={employee.jobTitle} />
              <DetailItem label="Employment type" value={formatLabel(employee.employmentType)} />
              <DetailItem label="Start date" value={employee.startDate} />
            </div>
          </section>

          <section className="premium-card grid gap-4 rounded-md p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Edit profile</h2>
              <p className="mt-1 text-sm text-muted">
                Update the details people see around the app.
              </p>
            </div>
            <ProfileForm employee={employee} />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="premium-card rounded-md p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-foreground">Work placement</h2>
              <p className="mt-1 text-sm text-muted">
                Branch and department context used for time and attendance.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailItem label="Branch" value={employee.branch?.name} />
                <DetailItem label="Branch code" value={employee.branch?.code} />
                <DetailItem label="Department" value={employee.department?.name} />
                <DetailItem label="Department code" value={employee.department?.code} />
              </div>
              <div className="mt-3">
                <DetailItem label="Branch address" value={employee.branch?.address} />
              </div>
            </div>

            <div className="premium-card rounded-md p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-foreground">Payroll basis</h2>
              <p className="mt-1 text-sm text-muted">
                Payroll identifiers and rates are visible only on your own linked profile.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailItem label="Payroll ID" value={employee.payrollIdentifier} />
                <DetailItem label="Compensation" value={formatLabel(employee.compensationType)} />
                <DetailItem label="Monthly salary" value={money(employee.monthlySalary)} />
                <DetailItem label="Hourly rate" value={money(employee.hourlyRate)} />
              </div>
            </div>
          </section>

          <section className="premium-card grid gap-4 rounded-md p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Time summary</h2>
              <p className="mt-1 text-sm text-muted">
                Recent time activity available for your own profile.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailItem label="Recent entries" value={profile.timeSummary.entriesCount} />
              <DetailItem
                label="Paid hours"
                value={profile.timeSummary.paidHours.toFixed(2)}
              />
              <DetailItem
                label="Warnings"
                value={profile.timeSummary.warningCount}
              />
            </div>
          </section>
        </>
      )}

      <section className="premium-card grid max-w-xl gap-4 rounded-md p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Change password</h2>
          <p className="mt-1 text-sm text-muted">
            Use this after receiving temporary credentials from your administrator.
          </p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
