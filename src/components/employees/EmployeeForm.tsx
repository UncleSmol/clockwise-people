"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Briefcase, Building2, Calendar, Clock, DollarSign, Flag, Hash, Mail, MapPin, Phone, User, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  employeeFormSchema,
  employmentStatuses,
  employmentTypes,
  type EmployeeFormInput,
  type EmployeeFormValues,
  type EmployeeRecord,
  type SelectOption,
} from "@/lib/employees/schema";
import { createEmployee, updateEmployee } from "@/lib/employees/actions";
import { jobTitleHints } from "@/lib/foundation/form-options";

type EmployeeFormProps = {
  workstations: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  schedules: SelectOption[];
  standardMonthlyHours: number;
  employee?: EmployeeRecord;
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: string | number | null | undefined) {
  return value == null ? "" : String(value);
}

export default function EmployeeForm({
  workstations,
  departments,
  managers,
  schedules,
  standardMonthlyHours,
  employee,
}: EmployeeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    setError,
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      full_name: employee?.full_name ?? "",
      known_as: employee?.known_as ?? "",
      email: employee?.email ?? "",
      phone_number: employee?.phone_number ?? "",
      workstation_id: employee?.workstation_id ?? "",
      department_id: employee?.department_id ?? "",
      job_title: employee?.job_title ?? "",
      employment_type: (employee?.employment_type ?? "full_time") as EmployeeFormValues["employment_type"],
      employment_status: (employee?.employment_status ?? "active") as EmployeeFormValues["employment_status"],
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

  const monthlySalary = watch("monthly_salary");

  useEffect(() => {
    if (monthlySalary && standardMonthlyHours > 0) {
      const salary = parseFloat(monthlySalary);
      if (!isNaN(salary) && salary > 0) {
        setValue("hourly_rate", (salary / standardMonthlyHours).toFixed(2));
        return;
      }
    }
    setValue("hourly_rate", "");
  }, [monthlySalary, standardMonthlyHours, setValue]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = employee
        ? await updateEmployee(employee.id, values)
        : await createEmployee(values);

      if (!result.ok) {
        setError("root", { message: result.message });
        return;
      }

      router.push("/dashboard?panel=people");
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
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Full name</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <User className="size-4 shrink-0 text-muted" />
            <input
              autoComplete="name"
              placeholder="Legal or payroll name"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("full_name")}
            />
          </span>
          {errors.full_name && <span className="text-xs text-danger">{errors.full_name.message}</span>}
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Known as</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <User className="size-4 shrink-0 text-muted" />
            <input
              autoComplete="nickname"
              placeholder="Preferred display name"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("known_as")}
            />
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Email</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Mail className="size-4 shrink-0 text-muted" />
            <input
              type="email"
              autoComplete="email"
              placeholder="name@company.co.za"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("email")}
            />
          </span>
          {errors.email && <span className="text-xs text-danger">{errors.email.message}</span>}
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Phone</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Phone className="size-4 shrink-0 text-muted" />
            <input
              autoComplete="tel"
              placeholder="+27 82 000 0000"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("phone_number")}
            />
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workstation</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <MapPin className="size-4 shrink-0 text-muted" />
            <select className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("workstation_id")}>
              <option value="">No workstation</option>
              {workstations.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.label}</option>
              ))}
            </select>
          </span>
          {errors.workstation_id && <span className="text-xs text-danger">{errors.workstation_id.message}</span>}
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Department</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Building2 className="size-4 shrink-0 text-muted" />
            <select className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("department_id")}>
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.label}</option>
              ))}
            </select>
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Job title</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Briefcase className="size-4 shrink-0 text-muted" />
            <input
              list="job-title-hints"
              placeholder="Start typing a role"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("job_title")}
            />
          </span>
          <datalist id="job-title-hints">
            {jobTitleHints.map((jobTitle) => (
              <option key={jobTitle} value={jobTitle} />
            ))}
          </datalist>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Employment type</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Clock className="size-4 shrink-0 text-muted" />
            <select className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("employment_type")}>
              {employmentTypes.map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </select>
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Start date</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Calendar className="size-4 shrink-0 text-muted" />
            <input type="date" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("start_date")} />
          </span>
          {errors.start_date && <span className="text-xs text-danger">{errors.start_date.message}</span>}
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Employment status</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Flag className="size-4 shrink-0 text-muted" />
            <select className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("employment_status")}>
              {employmentStatuses.map((status) => (
                <option key={status} value={status}>{labelize(status)}</option>
              ))}
            </select>
          </span>
        </label>

        <fieldset className="grid gap-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Work rule</span>
          <input type="hidden" value="" {...register("work_schedule_id")} />
          <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {schedules.map((schedule) => (
              <label
                key={schedule.id}
                className="flex cursor-pointer items-center gap-2 rounded-md bg-surface px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-muted"
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
        </fieldset>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Manager</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <UserCheck className="size-4 shrink-0 text-muted" />
            <select className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("manager_employee_id")}>
              <option value="">No manager</option>
              {managers
                .filter((manager) => manager.id !== employee?.id)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.label}</option>
                ))}
            </select>
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Payroll identifier</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Hash className="size-4 shrink-0 text-muted" />
            <input
              placeholder="External payroll code"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              {...register("payroll_identifier")}
            />
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Monthly salary</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <DollarSign className="size-4 shrink-0 text-muted" />
            <input type="number" step="0.01" min="0" placeholder="0.00" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("monthly_salary")} />
          </span>
          {errors.monthly_salary && <span className="text-xs text-danger">{errors.monthly_salary.message}</span>}
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Hourly rate</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <DollarSign className="size-4 shrink-0 text-muted" />
            <input type="number" step="0.01" min="0" placeholder="0.00" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" {...register("hourly_rate")} />
          </span>
          {errors.hourly_rate && <span className="text-xs text-danger">{errors.hourly_rate.message}</span>}
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : employee ? "Save employee" : "Add employee"}
        </button>
      </div>
    </form>
  );
}
