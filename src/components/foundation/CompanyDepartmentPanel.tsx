"use client";

import { Building2, Plus, Trash2, Users, X } from "lucide-react";
import { useState } from "react";
import { createDepartment, deactivateDepartment, assignEmployeeDepartment } from "@/lib/foundation/actions";
import type { Department } from "@/lib/foundation/schema";
import type { CompanyWorkstation } from "@/lib/geolocation/schema";
import type { EmployeeRecord } from "@/lib/employees/schema";
import { departmentHints } from "@/lib/foundation/form-options";

type CompanyDepartmentPanelProps = {
  workstations: CompanyWorkstation[];
  departments: Department[];
  employees: EmployeeRecord[];
};

function generateCode(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length === 0) return "";

  if (words.length >= 2) {
    return words.map((w) => w[0]).join("").toUpperCase();
  }

  const single = words[0].toUpperCase();
  if (single.length <= 4) return single;
  return single.slice(0, 4);
}

export default function CompanyDepartmentPanel({
  workstations,
  departments,
  employees,
}: CompanyDepartmentPanelProps) {
  const [departmentName, setDepartmentName] = useState("");
  const autoCode = generateCode(departmentName);

  const employeesByDepartment = new Map<string, EmployeeRecord[]>();
  for (const emp of employees) {
    if (emp.employment_status !== "active") continue;
    const deptId = emp.department_id ?? "__unassigned__";
    if (!employeesByDepartment.has(deptId)) {
      employeesByDepartment.set(deptId, []);
    }
    employeesByDepartment.get(deptId)!.push(emp);
  }

  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Departments
        </h2>
        <p className="mt-1 text-sm text-muted">
          Organise employees into departments for reporting and filtering.
        </p>
      </div>

      <details className="group rounded-2xl border border-border/80 bg-surface shadow-soft">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-bold text-foreground">
          <Plus className="size-4 text-primary" />
          Add department
        </summary>
        <form action={createDepartment} className="grid gap-4 border-t border-border/70 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Name</span>
              <input
                name="name"
                list="department-hints"
                placeholder="e.g. Clinical"
                required
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                className="h-11 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary shadow-xs"
              />
              <datalist id="department-hints">
                {departmentHints.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Code</span>
              <input
                name="code"
                value={autoCode}
                readOnly
                placeholder="Auto-generated"
                className="h-11 w-full rounded-full border border-border/80 bg-background/70 px-4 text-sm text-muted outline-none font-mono"
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Workstation</span>
            <select
              name="workstation_id"
              className="h-11 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary shadow-xs"
            >
              <option value="">Company-wide</option>
              {workstations.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">Optional. Link the department to a specific workstation.</span>
          </label>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="inline-flex min-h-[44px] h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-white shadow-soft hover:brightness-105 cursor-pointer transition-all"
            >
              Save department
            </button>
          </div>
        </form>
      </details>

      <div className="grid gap-4">
        {departments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
            No departments yet. Create your first department above.
          </p>
        ) : (
          departments.map((department) => {
            const deptEmployees = employeesByDepartment.get(department.id) ?? [];

            return (
              <div key={department.id} className="rounded-2xl border border-border/80 bg-surface shadow-soft overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-bold text-foreground">{department.name}</span>
                    <span className="text-xs text-muted font-medium">
                      {department.code ? `#${department.code}` : ""}
                      {deptEmployees.length > 0
                        ? ` \u00b7 ${deptEmployees.length} employee${deptEmployees.length === 1 ? "" : "s"}`
                        : " \u00b7 No employees"}
                    </span>
                  </div>
                  <form action={deactivateDepartment}>
                    <input type="hidden" name="department_id" value={department.id} />
                    <button
                      type="submit"
                      className="inline-flex size-8.5 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
                      title="Deactivate department"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>

                <EmployeeDepartmentSection
                  departmentId={department.id}
                  employees={deptEmployees}
                  unassignedEmployees={employees.filter((e) => !e.department_id && e.employment_status === "active")}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function EmployeeDepartmentSection({
  departmentId,
  employees: deptEmployees,
  unassignedEmployees,
}: {
  departmentId: string;
  employees: EmployeeRecord[];
  unassignedEmployees: EmployeeRecord[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [pending, setPending] = useState(false);

  const handleAssign = async () => {
    if (!selectedEmployeeId) return;
    setPending(true);
    await assignEmployeeDepartment(selectedEmployeeId, departmentId);
    setPending(false);
    setSelectedEmployeeId("");
    setShowAdd(false);
  };

  const handleRemove = async (employeeId: string) => {
    setPending(true);
    await assignEmployeeDepartment(employeeId, null);
    setPending(false);
  };

  return (
    <div className="border-t border-border/70 px-5 py-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <Users className="size-3.5 text-primary" />
          Employees
        </span>
        {unassignedEmployees.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            <Plus className="size-3" />
            Assign employee
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mt-2.5 flex items-center gap-2">
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="h-10 flex-1 rounded-full border border-border/80 bg-background px-4 text-xs font-medium text-foreground outline-none focus:border-primary shadow-xs"
          >
            <option value="">Select employee...</option>
            {unassignedEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedEmployeeId || pending}
            onClick={handleAssign}
            className="inline-flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-xs font-bold text-white shadow-soft hover:brightness-105 disabled:opacity-60 cursor-pointer transition-all"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {deptEmployees.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No employees assigned.</p>
      ) : (
        <div className="mt-2.5 grid gap-1.5">
          {deptEmployees.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between rounded-full bg-background/80 border border-border/60 px-4 py-2">
              <span className="text-xs font-bold text-foreground">{emp.full_name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(emp.id)}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
                title="Remove from department"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
