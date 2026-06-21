import { notFound } from "next/navigation";
import EmployeeForm from "@/components/employees/EmployeeForm";
import InviteLinkPanel from "@/components/invitations/InviteLinkPanel";
import { deactivateEmployee } from "@/lib/employees/actions";
import { getEmployeeDetail, getEmployeePageData } from "@/lib/employees/queries";
import {
  cancelEmployeeInvite,
  createEmployeeInviteLink,
  sendEmployeeInvite,
} from "@/lib/invitations/actions";
import { getEmployeeInvitation } from "@/lib/invitations/queries";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ manualInviteUrl?: string; message?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;
  const pageData = await getEmployeePageData();
  const employee = await getEmployeeDetail(employeeId);

  if (!employee) {
    notFound();
  }

  const invitation = await getEmployeeInvitation(employee.id, employee.company_id);
  const deactivate = deactivateEmployee.bind(null, employee.id);
  const sendInvite = sendEmployeeInvite.bind(null, employee.id);
  const createInviteLink = createEmployeeInviteLink.bind(null, employee.id);
  const cancelInvite = invitation
    ? cancelEmployeeInvite.bind(null, invitation.id, employee.id)
    : null;
  const hasPendingInvite = invitation?.status === "pending";
  const hasAcceptedInvite = invitation?.status === "accepted" || Boolean(employee.user_id);

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          Employee detail
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{employee.full_name}</h1>
        <p className="mt-2 text-sm text-muted">
          {employee.employee_number} - {employee.branch_name ?? "No branch"}
        </p>
      </header>

      {resolvedSearchParams?.message && (
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
          {resolvedSearchParams.message}
        </div>
      )}

      <section className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Account access</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Invite this employee to create their own login. After acceptance, the backend links their auth account to this employee record and assigns the employee role.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-foreground">
                {employee.email ?? "No email saved"}
              </span>
              <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-foreground">
                {hasAcceptedInvite
                  ? "Access active"
                  : hasPendingInvite
                    ? "Invite pending"
                    : "Not invited"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!hasAcceptedInvite && employee.email && (
              <form action={sendInvite}>
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  {hasPendingInvite ? "Resend invite" : "Send invite"}
                </button>
              </form>
            )}
            {!hasAcceptedInvite && employee.email && (
              <form action={createInviteLink}>
                <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground">
                  Create invite link
                </button>
              </form>
            )}
            {hasPendingInvite && cancelInvite && (
              <form action={cancelInvite}>
                <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground">
                  Cancel invite
                </button>
              </form>
            )}
          </div>
        </div>

        {!employee.email && (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
            Add an email address before sending an invite.
          </div>
        )}

        {resolvedSearchParams?.manualInviteUrl && (
          <InviteLinkPanel inviteUrl={resolvedSearchParams.manualInviteUrl} />
        )}
      </section>

      <section className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Edit employee</h2>
          <p className="mt-1 text-sm text-muted">
            Updates are scoped by company and employee id on the backend.
          </p>
        </div>
        <EmployeeForm
          branches={pageData.branches}
          departments={pageData.departments}
          managers={pageData.managers}
          employee={employee}
        />
      </section>

      <section className="rounded-md border border-danger/30 bg-danger/10 p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-danger">Deactivate employee</h2>
        <p className="mt-2 max-w-2xl text-sm text-danger">
          This performs a soft delete by marking the employee inactive and setting deleted_at.
        </p>
        <form action={deactivate} className="mt-4">
          <button className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white">
            Deactivate employee
          </button>
        </form>
      </section>
    </div>
  );
}
