"use client";

import {
  ChevronDown,
  Loader2,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import type { EmployeeRecord } from "@/lib/employees/schema";
import { autoAssignMissingPayrollIdsAction } from "@/lib/employees/actions";

type EmployeeTableProps = {
  employees: EmployeeRecord[];
  selectedEmployeeId?: string | null;
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type StatusFilter = "all" | "active" | "probation" | "on_leave" | "inactive";

export default function EmployeeTable({ employees, selectedEmployeeId }: EmployeeTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assignState, assignAction, assignPending] = useActionState(
    autoAssignMissingPayrollIdsAction,
    { ok: true, message: "" },
  );

  useEffect(() => {
    if (selectedEmployeeId) {
      const pane = document.getElementById("selected-employee-manage-pane");
      if (pane) {
        pane.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [selectedEmployeeId]);

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
      <div className="rounded-xl border border-border/80 bg-surface px-6 py-10 text-center shadow-2xs">
        <p className="text-base font-bold text-foreground">No employees registered</p>
        <p className="mt-1 text-xs text-muted">
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
          <label className="flex h-11 min-h-[44px] sm:h-10 sm:min-h-[40px] flex-1 items-center gap-2.5 rounded-full border border-border bg-background px-4 text-base sm:text-xs font-semibold text-foreground focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 shadow-soft transition-colors">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Search by name, email, department, or role..."
              className="min-w-0 flex-1 bg-transparent py-2 text-base sm:text-xs font-semibold text-foreground placeholder:text-muted outline-none border-0"
            />
            {globalFilter ? (
              <button
                type="button"
                onClick={() => setGlobalFilter("")}
                className="shrink-0 text-sm sm:text-xs font-bold text-muted hover:text-foreground px-1.5 py-1 min-h-[32px] flex items-center justify-center cursor-pointer"
                title="Clear search"
              >
                ×
              </button>
            ) : null}
          </label>
          <span className="w-max rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-soft">
            {filteredEmployees.length} of {employees.length} employees
          </span>
        </div>

        {/* Status Segmented Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`min-h-[36px] sm:min-h-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === "all"
                ? "bg-primary text-white shadow-soft"
                : "border border-border bg-surface text-foreground hover:bg-surface-muted"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`min-h-[36px] sm:min-h-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === "active"
                ? "bg-primary text-white shadow-soft"
                : "border border-border bg-surface text-foreground hover:bg-surface-muted"
            }`}
          >
            Active ({counts.active})
          </button>
          {counts.probation > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("probation")}
              className={`min-h-[36px] sm:min-h-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "probation"
                  ? "bg-primary text-white shadow-soft"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              Probation ({counts.probation})
            </button>
          )}
          {counts.on_leave > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("on_leave")}
              className={`min-h-[36px] sm:min-h-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "on_leave"
                  ? "bg-primary text-white shadow-soft"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              On Leave ({counts.on_leave})
            </button>
          )}
          {counts.inactive > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`min-h-[36px] sm:min-h-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "inactive"
                  ? "bg-primary text-white shadow-soft"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
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
                className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border border-border bg-surface text-foreground hover:bg-surface-muted shadow-soft transition-all cursor-pointer"
              >
                {assignPending ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : null}
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
            className={`rounded-2xl border px-4 py-3 text-xs font-semibold shadow-soft ${
              assignState.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {assignState.message}
          </div>
        ) : null}
      </div>

      {/* Employees Directory List */}
      <div className="divide-y divide-border rounded-2xl border border-border/80 bg-surface shadow-soft overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <p className="p-6 text-center text-xs font-medium text-muted">
            No employees match your search or filter criteria.
          </p>
        ) : (
          filteredEmployees.map((employee) => {
            const status = employee.employment_status;
            const isInactive = status === "terminated" || status === "suspended";
            const isSelected = selectedEmployeeId === employee.id;

            return (
              <details
                key={employee.id}
                open={isSelected ? true : undefined}
                className={`group transition-all duration-200 ${
                  isSelected
                    ? "bg-primary/5 ring-2 ring-primary/40 border-primary"
                    : "bg-surface hover:bg-surface-muted/20"
                }`}
              >
                <summary className="grid cursor-pointer list-none gap-3 px-4 py-3.5 text-sm hover:bg-surface-muted/40 sm:grid-cols-[1.2fr_1fr_auto_28px] sm:items-center">
                  {/* Name & Avatar */}
                  <div className="flex min-w-0 items-start sm:items-center gap-3">
                    <EmployeeAvatar
                      name={employee.known_as ?? employee.full_name}
                      src={employee.avatar_url}
                      className="size-9 shrink-0 ring-1 ring-border shadow-soft"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground break-words leading-tight">
                        {employee.known_as ?? employee.full_name}
                        {isSelected ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                            Editing
                          </span>
                        ) : null}
                        {employee.employee_number ? (
                          <span className="ml-1.5 text-xs font-normal text-muted">
                            #{employee.employee_number}
                          </span>
                        ) : null}
                        {employee.payroll_identifier ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-mono font-semibold text-foreground border border-border">
                            {employee.payroll_identifier}
                          </span>
                        ) : null}
                        {employee.role_name ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted border border-border">
                            {employee.role_name}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted break-all leading-tight">
                        {employee.email ?? "No email"}
                      </p>
                    </div>
                  </div>

                  {/* Workstation & Department */}
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold text-foreground break-words leading-tight">
                      {employee.department_name ?? "General"}
                    </p>
                    <p className="mt-0.5 text-muted break-words leading-tight">
                      {employee.workstation_name ?? "Assigned workstation"}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center">
                    <span
                      className={`inline-flex w-max items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${
                        status === "active"
                          ? "border-emerald-500/30 bg-emerald-50 text-emerald-800"
                          : status === "probation"
                            ? "border-amber-500/30 bg-amber-50 text-amber-800"
                            : status === "on_leave"
                              ? "border-amber-500/30 bg-amber-50 text-amber-800"
                              : isInactive
                                ? "border-slate-300 bg-slate-100 text-slate-700"
                                : "border-border bg-surface-muted text-foreground"
                      }`}
                    >
                      {labelize(status)}
                    </span>
                  </div>

                  <ChevronDown className="hidden size-4 shrink-0 text-muted transition-transform group-open:rotate-180 sm:block" />
                </summary>

                {/* Expanded Details Panel */}
                <div className="grid gap-3 border-t border-border bg-background/50 p-4 sm:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div className="rounded-2xl border border-border bg-surface p-2.5 text-center shadow-soft">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Job Title</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground break-words leading-tight">
                        {employee.job_title ?? "Team Member"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-2.5 text-center shadow-soft">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">System Role</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground capitalize break-words leading-tight">
                        {employee.role_name ?? (employee.user_id ? "Employee" : "No Account")}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-2.5 text-center shadow-soft">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Department</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground break-words leading-tight">
                        {employee.department_name ?? "General"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-2.5 text-center shadow-soft">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Start Date</p>
                      <p className="mt-0.5 text-xs font-bold text-foreground break-words leading-tight">
                        {employee.start_date ?? "--"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-2.5 text-center shadow-soft">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Payroll ID</p>
                      <p className="mt-0.5 text-xs font-mono font-bold text-foreground break-words leading-tight">
                        {employee.payroll_identifier ?? "Auto-assigned"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {isSelected ? (
                      <span className="text-xs font-bold text-primary hidden sm:inline">
                        Currently Managing
                      </span>
                    ) : null}
                    <Link
                      href={`/dashboard?panel=people&employeeId=${employee.id}`}
                      onClick={() => {
                        const pane = document.getElementById("selected-employee-manage-pane");
                        if (pane) {
                          pane.scrollIntoView({ behavior: "smooth", block: "start" });
                        } else {
                          const scrollParent = document.querySelector(".overflow-y-auto");
                          scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      className={`inline-flex min-h-[44px] sm:min-h-0 sm:h-9 items-center justify-center rounded-full px-5 text-xs font-bold shadow-soft cursor-pointer transition-all ${
                        isSelected
                          ? "bg-slate-900 text-white hover:bg-slate-800 ring-2 ring-slate-900/20"
                          : "bg-primary text-white hover:bg-primary-hover"
                      }`}
                    >
                      {isSelected ? "Editing Record" : "Manage Record"}
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
