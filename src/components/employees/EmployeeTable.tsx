"use client";

import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Hash,
  Loader2,
  Mail,
  MapPin,
  Search,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import type { EmployeeRecord } from "@/lib/employees/schema";
import { autoAssignMissingPayrollIdsAction } from "@/lib/employees/actions";

type EmployeeTableProps = {
  employees: EmployeeRecord[];
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type StatusFilter = "all" | "active" | "probation" | "on_leave" | "inactive";

export default function EmployeeTable({ employees }: EmployeeTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assignState, assignAction, assignPending] = useActionState(
    autoAssignMissingPayrollIdsAction,
    { ok: true, message: "" },
  );

  const unassignedPayrollCount = useMemo(() => {
    return employees.filter(
      (e) => !e.payroll_identifier || e.payroll_identifier.trim() === "",
    ).length;
  }, [employees]);

  const counts = useMemo(() => {
    return {
      all: employees.length,
      active: employees.filter((e) => e.employment_status === "active").length,
      probation: employees.filter((e) => e.employment_status === "probation").length,
      on_leave: employees.filter((e) => e.employment_status === "on_leave").length,
      inactive: employees.filter(
        (e) => e.employment_status === "terminated" || e.employment_status === "suspended",
      ).length,
    };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const search = globalFilter.trim().toLowerCase();

    return employees.filter((employee) => {
      // Status filter
      if (statusFilter === "active" && employee.employment_status !== "active") return false;
      if (statusFilter === "probation" && employee.employment_status !== "probation") return false;
      if (statusFilter === "on_leave" && employee.employment_status !== "on_leave") return false;
      if (
        statusFilter === "inactive" &&
        employee.employment_status !== "terminated" &&
        employee.employment_status !== "suspended"
      ) {
        return false;
      }

      // Search filter
      if (!search) return true;

      return [
        employee.full_name,
        employee.known_as,
        employee.email,
        employee.employee_number,
        employee.department_name,
        employee.job_title,
        employee.workstation_name,
        employee.employment_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [employees, globalFilter, statusFilter]);

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background px-6 py-10 text-center">
        <Users className="mx-auto size-10 text-muted/60" />
        <p className="mt-2 text-lg font-bold text-foreground">No employees registered</p>
        <p className="mt-1 text-sm text-muted">
          Add the first employee to start building the company register.
        </p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex h-10 min-h-[40px] flex-1 items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 text-xs font-semibold text-foreground focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition-colors">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Search by name, email, department, or role..."
              className="min-w-0 flex-1 bg-transparent py-2 text-xs font-semibold text-foreground placeholder:text-muted outline-none border-0"
            />
            {globalFilter ? (
              <button
                type="button"
                onClick={() => setGlobalFilter("")}
                className="shrink-0 text-xs font-bold text-muted hover:text-foreground px-1"
                title="Clear search"
              >
                ×
              </button>
            ) : null}
          </label>
          <span className="w-max rounded bg-slate-900 px-2.5 py-1 text-xs font-extrabold text-white shadow-2xs">
            {filteredEmployees.length} of {employees.length} employees
          </span>
        </div>

        {/* Status Segmented Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
              statusFilter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "border border-border bg-background text-foreground hover:bg-surface-muted"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            Active ({counts.active})
          </button>
          {counts.probation > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("probation")}
              className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                statusFilter === "probation"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "border border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100"
              }`}
            >
              Probation ({counts.probation})
            </button>
          )}
          {counts.on_leave > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("on_leave")}
              className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                statusFilter === "on_leave"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "border border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100"
              }`}
            >
              On Leave ({counts.on_leave})
            </button>
          )}
          {counts.inactive > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                statusFilter === "inactive"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "border border-slate-200 bg-slate-100/80 text-slate-800 hover:bg-slate-200"
              }`}
            >
              Inactive ({counts.inactive})
            </button>
          )}

          {unassignedPayrollCount > 0 ? (
            <form action={assignAction} className="ml-auto">
              <button
                type="submit"
                disabled={assignPending}
                className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold border border-emerald-500/40 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 shadow-2xs transition-all cursor-pointer"
              >
                {assignPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3 text-emerald-600" />
                )}
                <span>
                  {assignPending
                    ? "Assigning..."
                    : `Auto-assign ${unassignedPayrollCount} missing Payroll ID${unassignedPayrollCount === 1 ? "" : "s"}`}
                </span>
              </button>
            </form>
          ) : null}
        </div>

        {assignState.message ? (
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-bold ${
              assignState.ok
                ? "border-emerald-500/30 bg-emerald-50 text-emerald-950"
                : "border-rose-500/30 bg-rose-50 text-rose-950"
            }`}
          >
            {assignState.message}
          </div>
        ) : null}
      </div>

      {/* Employees Directory List */}
      <div className="divide-y divide-border">
        {filteredEmployees.length === 0 ? (
          <p className="p-6 text-center text-xs font-medium text-muted">
            No employees match your search or filter criteria.
          </p>
        ) : (
          filteredEmployees.map((employee) => {
            const status = employee.employment_status;
            const isInactive = status === "terminated" || status === "suspended";

            return (
              <details key={employee.id} className="group bg-surface transition-colors">
                <summary className="grid cursor-pointer list-none gap-2.5 px-4 py-3 text-sm hover:bg-surface-muted/40 sm:grid-cols-[1.2fr_1fr_auto_28px] sm:items-center">
                  {/* Name & Avatar */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <EmployeeAvatar
                      name={employee.known_as ?? employee.full_name}
                      src={employee.avatar_url}
                      className="size-9 ring-1 ring-border shadow-2xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-foreground">
                        {employee.known_as ?? employee.full_name}
                        {employee.employee_number ? (
                          <span className="ml-1.5 text-[11px] font-semibold text-muted">
                            #{employee.employee_number}
                          </span>
                        ) : null}
                        {employee.payroll_identifier ? (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-extrabold text-emerald-700 border border-emerald-500/20">
                            <Hash className="size-2.5" />
                            {employee.payroll_identifier}
                          </span>
                        ) : null}
                      </p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted">
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{employee.email ?? "No email"}</span>
                      </p>
                    </div>
                  </div>

                  {/* Workstation & Department */}
                  <div className="min-w-0 text-xs">
                    <p className="truncate font-semibold text-foreground flex items-center gap-1">
                      <Building2 className="size-3 shrink-0 text-muted" />
                      <span className="truncate">{employee.department_name ?? "General"}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted flex items-center gap-1">
                      <MapPin className="size-3 shrink-0 text-muted" />
                      <span className="truncate">{employee.workstation_name ?? "Assigned workstation"}</span>
                    </p>
                  </div>

                  {/* Solid Status Badge */}
                  <div className="flex items-center">
                    <span
                      className={`inline-flex w-max items-center rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        status === "active"
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : status === "probation"
                            ? "bg-amber-500 text-white shadow-2xs"
                            : status === "on_leave"
                              ? "bg-indigo-600 text-white shadow-2xs"
                              : isInactive
                                ? "bg-slate-700 text-white shadow-2xs"
                                : "bg-zinc-200 text-zinc-800"
                      }`}
                    >
                      {labelize(status)}
                    </span>
                  </div>

                  <ChevronDown className="hidden size-4 text-muted transition-transform group-open:rotate-180 sm:block" />
                </summary>

                {/* Expanded Details Panel */}
                <div className="grid gap-3 border-t border-border bg-background p-3.5 sm:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-md border border-border bg-white p-2 text-center shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Role</p>
                      <p className="mt-0.5 truncate text-xs font-extrabold text-foreground">
                        {employee.job_title ?? "Team Member"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-white p-2 text-center shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Department</p>
                      <p className="mt-0.5 truncate text-xs font-extrabold text-foreground">
                        {employee.department_name ?? "General"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-white p-2 text-center shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Start Date</p>
                      <p className="mt-0.5 truncate text-xs font-extrabold text-foreground">
                        {employee.start_date ?? "--"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-white p-2 text-center shadow-2xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Payroll ID</p>
                      <p className="mt-0.5 truncate text-xs font-mono font-black text-emerald-700">
                        {employee.payroll_identifier ?? "Auto-assigned"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Link
                      href={`/dashboard?panel=people&employeeId=${employee.id}`}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800"
                    >
                      <User className="size-3.5" />
                      Manage Record
                    </Link>
                  </div>
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
