import { notFound } from "next/navigation";
import EmployeeAccountPanel from "@/components/employee-accounts/EmployeeAccountPanel";
import EmployeeForm from "@/components/employees/EmployeeForm";
import { deactivateEmployee } from "@/lib/employees/actions";
import { getEmployeeDetail, getEmployeePageData } from "@/lib/employees/queries";
import { requireEmployeeAdmin } from "@/lib/foundation/queries";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  await requireEmployeeAdmin();

  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;
  const pageData = await getEmployeePageData();
  const employee = await getEmployeeDetail(employeeId);

  if (!employee) {
    notFound();
  }

  const deactivate = deactivateEmployee.bind(null, employee.id);

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

      <EmployeeAccountPanel
        employeeId={employee.id}
        email={employee.email}
        hasAccount={Boolean(employee.user_id)}
      />

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
