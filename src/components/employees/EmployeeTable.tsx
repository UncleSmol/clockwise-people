"use client";

import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import type { EmployeeRecord } from "@/lib/employees/schema";

type EmployeeTableProps = {
  employees: EmployeeRecord[];
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeTable({ employees }: EmployeeTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const filteredEmployees = useMemo(() => {
    const search = globalFilter.trim().toLowerCase();

    if (!search) return employees;

    return employees.filter((employee) =>
      [
        employee.full_name,
        employee.known_as,
        employee.email,
        employee.employee_number,
        employee.branch_name,
        employee.department_name,
        employee.job_title,
        employee.employment_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [employees, globalFilter]);

  if (employees.length === 0) {
    return (
      <div className="premium-card rounded-md px-6 py-10 text-center">
        <p className="text-lg font-semibold text-foreground">No employees registered</p>
        <p className="mt-2 text-sm text-muted">
          Add the first employee to start building the company register.
        </p>
      </div>
    );
  }

  return (
    <div className="premium-card overflow-hidden rounded-md">
      <div className="border-b border-border bg-surface px-3 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search employees"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </label>
      </div>

      <div className="divide-y divide-border">
        {filteredEmployees.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted">No employees match your search.</p>
        ) : (
          filteredEmployees.map((employee) => (
            <details key={employee.id} className="group bg-surface">
              <summary className="grid cursor-pointer list-none gap-2 px-3 py-2.5 text-sm hover:bg-surface-muted/35 sm:grid-cols-[1fr_150px_120px_32px] sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <EmployeeAvatar
                    name={employee.known_as ?? employee.full_name}
                    src={employee.avatar_url}
                    className="size-8"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {employee.known_as ?? employee.full_name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {employee.employee_number} {employee.email ? `- ${employee.email}` : ""}
                    </p>
                  </div>
                </div>

                <p className="truncate text-xs font-medium text-muted sm:text-sm">
                  {employee.branch_name ?? "No branch"}
                </p>

                <span className="w-max rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                  {labelize(employee.employment_status)}
                </span>

                <ChevronDown className="hidden size-4 text-muted transition-transform group-open:rotate-180 sm:block" />
              </summary>

              <div className="grid gap-3 border-t border-border bg-background px-3 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Role</p>
                    <p className="mt-1 text-foreground">{employee.job_title ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Department</p>
                    <p className="mt-1 text-foreground">{employee.department_name ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Start</p>
                    <p className="mt-1 text-foreground">{employee.start_date}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Payroll</p>
                    <p className="mt-1 text-foreground">{employee.payroll_identifier ?? "-"}</p>
                  </div>
                </div>

                <Link
                  href={`/dashboard/employees/${employee.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                >
                  View
                </Link>
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
