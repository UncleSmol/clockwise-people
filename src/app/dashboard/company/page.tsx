import {
  createBranch,
  createDepartment,
  deactivateBranch,
  deactivateDepartment,
} from "@/lib/foundation/actions";
import CompanyLogoForm from "@/components/company/CompanyLogoForm";
import CompanyWorkRulesPanel from "@/components/work-rules/CompanyWorkRulesPanel";
import {
  addressHints,
  departmentHints,
  timezoneOptions,
} from "@/lib/foundation/form-options";
import {
  getActiveCompany,
  getCompanySetup,
  requireCompanyAdmin,
} from "@/lib/foundation/queries";
import { getCompanyWorkRulesData } from "@/lib/work-rules/queries";

type CompanyPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function CompanyPage({ searchParams }: CompanyPageProps) {
  await requireCompanyAdmin();

  const params = await searchParams;
  const { company } = await getActiveCompany();
  const [{ branches, departments }, workRulesData] = await Promise.all([
    getCompanySetup(company.id),
    getCompanyWorkRulesData(),
  ]);
  const hasBranches = branches.length > 0;

  return (
    <div className="grid gap-8">
      <header className="premium-hero rounded-md p-5 text-white sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
              Company setup
            </p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{company.name}</h1>
            <p className="mt-3 max-w-2xl text-sm opacity-80">
              Configure the foundation records needed before employee registration and schedules.
            </p>
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 px-4 py-3">
            <p className="text-sm font-semibold">
              {hasBranches ? "Ready for employees" : "Branch required"}
            </p>
            <p className="mt-1 text-sm opacity-75">
              {hasBranches
                ? "You can now register employees."
                : "Add at least one branch before employee registration."}
            </p>
          </div>
        </div>
      </header>

      {params?.message && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {params.message}
        </div>
      )}

      <section className="premium-card grid gap-4 rounded-md p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Company logo</h2>
          <p className="mt-1 text-sm text-muted">
            Add a public logo link to use across the app.
          </p>
        </div>
        <CompanyLogoForm companyName={company.name} logoUrl={company.logo_url} />
      </section>

      <CompanyWorkRulesPanel data={workRulesData} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="premium-card rounded-md p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Add branch</h2>
          <p className="mt-1 text-sm text-muted">
            Branches are physical or operational locations employees can be assigned to.
          </p>
          <form action={createBranch} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Branch name
              <input
                name="name"
                required
                placeholder="e.g. Head Office, ePH, Ermelo"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              />
              <span className="text-xs font-normal text-muted">
                Use the business name people already use internally.
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Code
              <input
                name="code"
                placeholder="e.g. HQ, EPH, ERM"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              />
              <span className="text-xs font-normal text-muted">
                Optional short code for payroll exports and reports.
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Address
              <input
                name="address"
                list="address-hints"
                placeholder="Start with location name or full street address"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              />
              <datalist id="address-hints">
                {addressHints.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
              <span className="text-xs font-normal text-muted">
                Add enough detail for managers to identify the workplace clearly.
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Timezone
              <select
                name="timezone"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
                defaultValue={company.timezone}
              >
                <option value="">Use company timezone</option>
                {timezoneOptions.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal text-muted">
                Leave unchanged unless this branch operates in a different timezone.
              </span>
            </label>
            <button className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Add branch
            </button>
          </form>
        </div>

        <div className="premium-card rounded-md p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Add department</h2>
          <p className="mt-1 text-sm text-muted">
            Departments help group employees for approvals and reports.
          </p>
          <form action={createDepartment} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Department name
              <input
                name="name"
                list="department-hints"
                required
                placeholder="e.g. Admin, Clinical, Finance"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              />
              <datalist id="department-hints">
                {departmentHints.map((department) => (
                  <option key={department} value={department} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Code
              <input
                name="code"
                placeholder="e.g. ADM, CLN, FIN"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              />
              <span className="text-xs font-normal text-muted">
                Optional short code for compact tables and exports.
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Branch
              <select
                name="branch_id"
                className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
              >
                <option value="">Company-wide</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal text-muted">
                Use company-wide when the department exists across multiple branches.
              </span>
            </label>
            <button className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Add department
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="text-xl font-semibold text-foreground">Branches</h2>
            <p className="mt-1 text-sm text-muted">{branches.length} active branches</p>
          </div>
          <div className="divide-y divide-border">
            {branches.length === 0 ? (
              <div className="px-4 py-8 sm:px-6">
                <p className="font-semibold text-foreground">Add your first branch</p>
                <p className="mt-2 text-sm text-muted">
                  Employees cannot be registered until there is at least one active branch.
                </p>
              </div>
            ) : (
              branches.map((branch) => (
                <div key={branch.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div>
                    <p className="font-semibold text-foreground">{branch.name}</p>
                    <p className="mt-1 text-sm text-muted">{branch.code ?? "No code"}</p>
                  </div>
                  <form action={deactivateBranch}>
                    <input type="hidden" name="branch_id" value={branch.id} />
                    <button className="text-sm font-semibold text-danger hover:underline">
                      Deactivate
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="text-xl font-semibold text-foreground">Departments</h2>
            <p className="mt-1 text-sm text-muted">{departments.length} active departments</p>
          </div>
          <div className="divide-y divide-border">
            {departments.length === 0 ? (
              <div className="px-4 py-8 sm:px-6">
                <p className="font-semibold text-foreground">Departments are optional for now</p>
                <p className="mt-2 text-sm text-muted">
                  Add departments when you want cleaner grouping for reporting and management.
                </p>
              </div>
            ) : (
              departments.map((department) => (
                <div key={department.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div>
                    <p className="font-semibold text-foreground">{department.name}</p>
                    <p className="mt-1 text-sm text-muted">{department.code ?? "No code"}</p>
                  </div>
                  <form action={deactivateDepartment}>
                    <input type="hidden" name="department_id" value={department.id} />
                    <button className="text-sm font-semibold text-danger hover:underline">
                      Deactivate
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
