import EmployeeForm from "@/components/employees/EmployeeForm";
import EmployeeTable from "@/components/employees/EmployeeTable";
import { requireEmployeeAdmin } from "@/lib/foundation/queries";
import { getEmployeePageData } from "@/lib/employees/queries";
import Link from "next/link";

type EmployeesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  await requireEmployeeAdmin();

  const params = await searchParams;
  const data = await getEmployeePageData();

  if (!data.isConfigured) {
    return (
      <section className="rounded-md border border-border bg-surface p-6">
        <h1 className="text-2xl font-semibold text-foreground">Supabase is not configured</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the environment before using the employee register.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <header className="premium-hero rounded-md p-4 text-white sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Employee register</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Employees</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-80">
            Register employees for {data.companyName}. The backend resolves tenant scope through the signed-in user.
          </p>
        </div>
      </header>

      {params?.message && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {params.message}
        </div>
      )}

      <section className="premium-card rounded-md p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Add employee</h2>
          <p className="mt-1 text-xs text-muted">All employee records are saved with `company_id`.</p>
        </div>
        {data.branches.length === 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-4">
            <p className="font-semibold text-warning">Branch setup is required first</p>
            <p className="mt-2 text-sm text-warning">
              Every employee must belong to a branch. Add a branch, then return here to register employees.
            </p>
            <Link
              href="/dashboard/company"
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add branch
            </Link>
          </div>
        ) : (
          <EmployeeForm
            branches={data.branches}
            departments={data.departments}
            managers={data.managers}
            schedules={data.schedules}
          />
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Employee list</h2>
          <p className="mt-1 text-xs text-muted">{data.employees.length} active employee records. Tap a row to expand.</p>
        </div>
        {data.employees.length === 0 ? (
          <div className="premium-card rounded-md p-4 sm:p-6">
            <p className="text-lg font-semibold text-foreground">No employees yet</p>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Use the form above to add the first employee. After employees are registered, the next phase can add work schedules for accurate timesheet calculations.
            </p>
          </div>
        ) : (
          <EmployeeTable employees={data.employees} />
        )}
      </section>
    </div>
  );
}
