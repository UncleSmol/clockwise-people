"use client";

import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import type { EmployeeRecord } from "@/lib/employees/schema";

type EmployeeTableProps = {
  employees: EmployeeRecord[];
};

type Density = "comfortable" | "compact";

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeTable({ employees }: EmployeeTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const storedDensity = window.localStorage.getItem("cwp.employeeTableDensity");
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("cwp.employeeTableDensity", density);
  }, [density]);

  const columns = useMemo<ColumnDef<EmployeeRecord>[]>(
    () => [
      {
        header: "Employee",
        accessorKey: "full_name",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-foreground">{row.original.full_name}</div>
            <div className="mt-1 text-xs text-muted">
              {row.original.email ?? row.original.employee_number}
            </div>
          </div>
        ),
      },
      {
        header: "Branch",
        accessorKey: "branch_name",
        cell: ({ row }) => row.original.branch_name ?? "-",
      },
      {
        header: "Department",
        accessorKey: "department_name",
        cell: ({ row }) => row.original.department_name ?? "-",
      },
      {
        header: "Job title",
        accessorKey: "job_title",
        cell: ({ row }) => row.original.job_title ?? "-",
      },
      {
        header: "Status",
        accessorKey: "employment_status",
        cell: ({ row }) => (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
            {labelize(row.original.employment_status)}
          </span>
        ),
      },
      {
        header: "Start date",
        accessorKey: "start_date",
      },
      {
        header: "Payroll ID",
        accessorKey: "payroll_identifier",
        cell: ({ row }) => row.original.payroll_identifier ?? "-",
      },
      {
        header: "Action",
        id: "action",
        cell: ({ row }) => (
          <Link
            href={`/dashboard/employees/${row.original.id}`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            View
          </Link>
        ),
      },
    ],
    [],
  );

  // TanStack Table intentionally returns stable table helpers that React Compiler
  // does not memoize. This table does not pass those helpers into memoized children.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: employees,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (employees.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface px-6 py-10 text-center">
        <p className="text-lg font-semibold text-foreground">No employees registered</p>
        <p className="mt-2 text-sm text-muted">
          Add the first employee to start building the company register.
        </p>
      </div>
    );
  }

  const cellPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-4";

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Search employees"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none ring-ring focus:ring-2 md:max-w-sm"
        />
        <div className="hidden rounded-md border border-border bg-surface p-1 text-sm font-semibold lg:flex">
          <button
            type="button"
            onClick={() => setDensity("comfortable")}
            className={`rounded px-3 py-1.5 ${density === "comfortable" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => setDensity("compact")}
            className={`rounded px-3 py-1.5 ${density === "compact" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            Compact
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        {table.getRowModel().rows.map((row) => {
          const employee = row.original;

          return (
            <Link
              key={employee.id}
              href={`/dashboard/employees/${employee.id}`}
              className="rounded-md border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {employee.full_name}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {employee.email ?? employee.employee_number}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                  {labelize(employee.employment_status)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Branch
                  </p>
                  <p className="mt-1 truncate text-foreground">
                    {employee.branch_name ?? "-"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Role
                  </p>
                  <p className="mt-1 truncate text-foreground">
                    {employee.job_title ?? "-"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Start
                  </p>
                  <p className="mt-1 truncate text-foreground">{employee.start_date}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Payroll
                  </p>
                  <p className="mt-1 truncate text-foreground">
                    {employee.payroll_identifier ?? "-"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-surface lg:block">
        <div>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-[0.08em] text-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="align-top">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`${cellPadding} text-muted`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
