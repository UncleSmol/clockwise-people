"use client";

import { Building2, Hash, MapPin, Plus, Trash2, User, Users, X } from "lucide-react";
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
    const deptId = emp.department_id ?? "__unassigned__";
    if (!employeesByDepartment.has(deptId)) {
      employeesByDepartment.set(deptId, []);
    }
    employeesByDepartment.get(deptId)!.push(emp);
  }

  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Building2 className="size-5" />
          Departments
        </h2>
        <p className="mt-1 text-sm text-muted">
          Organise employees into departments for reporting and filtering.
        </p>
      </div>

      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <Plus className="size-4" />
          Add department
        </summary>
        <form action={createDepartment} className="grid gap-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Hash className="size-4 shrink-0 text-muted" />
                <input
                  name="name"
                  list="department-hints"
                  placeholder="e.g. Clinical"
                  required
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
              <datalist id="department-hints">
                {departmentHints.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Code</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Hash className="size-4 shrink-0 text-muted" />
                <input
                  name="code"
                  value={autoCode}
                  readOnly
                  placeholder="Auto-generated"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-muted outline-none"
                />
              </span>
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workstation</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <MapPin className="size-4 shrink-0 text-muted" />
              <select
                name="workstation_id"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Company-wide</option>
                {workstations.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </span>
            <span className="text-xs font-normal text-muted">Optional. Link the department to a specific workstation.</span>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Hash className="size-4" />
              Save department
            </button>
          </div>
        </form>
      </details>

      <div className="grid gap-4">
        {departments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No departments yet. Create your first department above.
          </p>
        ) : (
          departments.map((department) => {
            const deptEmployees = employeesByDepartment.get(department.id) ?? [];

            return (
              <div key={department.id} className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{department.name}</span>
                    <span className="text-xs text-muted">
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
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                      title="Deactivate department"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>

                <EmployeeDepartmentSection
                  departmentId={department.id}
                  employees={deptEmployees}
                  unassignedEmployees={employees.filter((e) => !e.department_id)}
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
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Users className="size-3.5" />
          Employees
        </span>
        {unassignedEmployees.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="size-3" />
            Assign employee
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <User className="size-4 shrink-0 text-muted" />
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            >
              <option value="">Select employee...</option>
              {unassignedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </span>
          <button
            type="button"
            disabled={!selectedEmployeeId || pending}
            onClick={handleAssign}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="inline-flex items-center rounded-lg p-2 text-muted hover:bg-surface-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {deptEmployees.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No employees assigned.</p>
      ) : (
        <div className="mt-2 grid gap-1">
          {deptEmployees.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5">
              <span className="text-sm text-foreground">{emp.full_name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(emp.id)}
                className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
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
