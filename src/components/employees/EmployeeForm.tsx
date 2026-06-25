"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  employeeFormSchema,
  employmentStatuses,
  employmentTypes,
  type EmployeeFormInput,
  type EmployeeRecord,
  type SelectOption,
} from "@/lib/employees/schema";
import { createEmployee, updateEmployee } from "@/lib/employees/actions";
import { jobTitleHints } from "@/lib/foundation/form-options";

type EmployeeFormProps = {
  branches: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  schedules: SelectOption[];
  employee?: EmployeeRecord;
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: string | number | null | undefined) {
  return value == null ? "" : String(value);
}

export default function EmployeeForm({
  branches,
  departments,
  managers,
  schedules,
  employee,
}: EmployeeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      full_name: employee?.full_name ?? "",
      known_as: employee?.known_as ?? "",
      email: employee?.email ?? "",
      phone_number: employee?.phone_number ?? "",
      branch_id: employee?.branch_id ?? "",
      department_id: employee?.department_id ?? "",
      job_title: employee?.job_title ?? "",
      employment_type: employee?.employment_type ?? "full_time",
      employment_status: employee?.employment_status ?? "active",
      start_date: employee?.start_date ?? "",
      work_schedule_id: employee?.work_schedule_id ?? "",
      work_schedule_ids: employee?.work_schedule_ids ?? (
        employee?.work_schedule_id ? [employee.work_schedule_id] : []
      ),
      manager_employee_id: employee?.manager_employee_id ?? "",
      payroll_identifier: employee?.payroll_identifier ?? "",
      monthly_salary: fieldValue(employee?.monthly_salary),
      hourly_rate: fieldValue(employee?.hourly_rate),
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = employee
        ? await updateEmployee(employee.id, values)
        : await createEmployee(values);

      if (!result.ok) {
        setError("root", { message: result.message });
        return;
      }

      router.push("/dashboard/employees");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {errors.root?.message && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {errors.root.message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Full name
          <input
            autoComplete="name"
            placeholder="Legal or payroll name"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("full_name")}
          />
          {errors.full_name && <span className="text-xs text-danger">{errors.full_name.message}</span>}
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Known as
          <input
            autoComplete="nickname"
            placeholder="Preferred display name"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("known_as")}
          />
          <span className="text-xs font-normal text-muted">
            Optional. Used where a shorter familiar name is clearer.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Email
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.co.za"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("email")}
          />
          {errors.email && <span className="text-xs text-danger">{errors.email.message}</span>}
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Phone
          <input
            autoComplete="tel"
            placeholder="+27 82 000 0000"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("phone_number")}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Branch
          <select className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("branch_id")}>
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.label}
              </option>
            ))}
          </select>
          {errors.branch_id && <span className="text-xs text-danger">{errors.branch_id.message}</span>}
          <span className="text-xs font-normal text-muted">
            Required. Time and approvals are branch-aware.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Department
          <select className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("department_id")}>
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Optional now, useful for reporting and filtering.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Job title
          <input
            list="job-title-hints"
            placeholder="Start typing a role"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("job_title")}
          />
          <datalist id="job-title-hints">
            {jobTitleHints.map((jobTitle) => (
              <option key={jobTitle} value={jobTitle} />
            ))}
          </datalist>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Employment type
          <select className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("employment_type")}>
            {employmentTypes.map((type) => (
              <option key={type} value={type}>
                {labelize(type)}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Drives future schedule defaults and payroll reporting.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Start date
          <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("start_date")} />
          {errors.start_date && <span className="text-xs text-danger">{errors.start_date.message}</span>}
          <span className="text-xs font-normal text-muted">
            Use the employment start date, not the date the record was captured.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Employment status
          <select className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("employment_status")}>
            {employmentStatuses.map((status) => (
              <option key={status} value={status}>
                {labelize(status)}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Inactive and terminated employees stay out of active register workflows.
          </span>
        </label>

        <fieldset className="grid gap-2 text-sm font-medium text-foreground">
          Work rule
          <input type="hidden" value="" {...register("work_schedule_id")} />
          <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border bg-surface p-2">
            {schedules.length === 0 ? (
              <p className="px-2 py-1 text-xs font-normal text-muted">
                No work rules available. The company default will be used.
              </p>
            ) : null}
            {schedules.map((schedule) => (
              <label
                key={schedule.id}
                className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm font-semibold text-foreground"
              >
                <input
                  type="checkbox"
                  value={schedule.id}
                  className="size-4 accent-current"
                  {...register("work_schedule_ids")}
                />
                <span>{schedule.label}</span>
              </label>
            ))}
          </div>
          <span className="text-xs font-normal text-muted">
            Assign one or more rules. Leave days only deduct hours from matched working days.
          </span>
        </fieldset>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Manager
          <select className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("manager_employee_id")}>
            <option value="">No manager</option>
            {managers
              .filter((manager) => manager.id !== employee?.id)
              .map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.label}
                </option>
              ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Optional. This manager can review the employee&apos;s timesheet requests.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Payroll identifier
          <input
            placeholder="External payroll code"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            {...register("payroll_identifier")}
          />
          <span className="text-xs font-normal text-muted">
            Optional link to the payroll system’s employee code.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Monthly salary
          <input type="number" step="0.01" min="0" className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("monthly_salary")} />
          {errors.monthly_salary && <span className="text-xs text-danger">{errors.monthly_salary.message}</span>}
          <span className="text-xs font-normal text-muted">
            Use monthly salary for salaried employees.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Hourly rate
          <input type="number" step="0.01" min="0" className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2" {...register("hourly_rate")} />
          {errors.hourly_rate && <span className="text-xs text-danger">{errors.hourly_rate.message}</span>}
          <span className="text-xs font-normal text-muted">
            If hourly rate is entered, the record is treated as hourly paid.
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : employee ? "Save employee" : "Add employee"}
        </button>
      </div>
    </form>
  );
}
