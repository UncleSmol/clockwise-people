"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  employeeFormSchema,
  employmentStatuses,
  employmentTypes,
  paymentFrequencies,
  bankAccountTypes,
  paymentModes,
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

function getEmployeeFormDefaultValues(employee?: EmployeeRecord): EmployeeFormInput {
  return {
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
    id_number: employee?.id_number ?? "",
    tax_number: employee?.tax_number ?? "",
    address: employee?.address ?? "",
    payment_frequency: (employee?.payment_frequency ?? "monthly") as EmployeeFormValues["payment_frequency"],
    bank_name: employee?.bank_name ?? "",
    bank_account_number: employee?.bank_account_number ?? "",
    bank_account_type: (employee?.bank_account_type ?? "Cheque / Current") as EmployeeFormValues["bank_account_type"],
    payment_mode: (employee?.payment_mode ?? "EFT") as EmployeeFormValues["payment_mode"],
  };
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
    reset,
    formState: { errors },
    setError,
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: getEmployeeFormDefaultValues(employee),
  });

  useEffect(() => {
    reset(getEmployeeFormDefaultValues(employee));
  }, [employee, reset]);

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
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Full name</span>
          <input
            autoComplete="name"
            placeholder="Legal or payroll name"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("full_name")}
          />
          {errors.full_name && <span className="text-xs text-danger">{errors.full_name.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Known as</span>
          <input
            autoComplete="nickname"
            placeholder="Preferred display name"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("known_as")}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.co.za"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("email")}
          />
          {errors.email && <span className="text-xs text-danger">{errors.email.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Phone</span>
          <input
            autoComplete="tel"
            placeholder="+27 82 000 0000"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("phone_number")}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Workstation</span>
          <select
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("workstation_id")}
          >
            <option value="">No workstation</option>
            {workstations.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.label}</option>
            ))}
          </select>
          {errors.workstation_id && <span className="text-xs text-danger">{errors.workstation_id.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Department</span>
          <select
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("department_id")}
          >
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.label}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Job title</span>
          <input
            list="job-title-hints"
            placeholder="Start typing a role"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("job_title")}
          />
          <datalist id="job-title-hints">
            {jobTitleHints.map((jobTitle) => (
              <option key={jobTitle} value={jobTitle} />
            ))}
          </datalist>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Employment type</span>
          <select
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("employment_type")}
          >
            {employmentTypes.map((type) => (
              <option key={type} value={type}>{labelize(type)}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Start date</span>
          <input
            type="date"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("start_date")}
          />
          {errors.start_date && <span className="text-xs text-danger">{errors.start_date.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Employment status</span>
          <select
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("employment_status")}
          >
            {employmentStatuses.map((status) => (
              <option key={status} value={status}>{labelize(status)}</option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Work rule</span>
          <input type="hidden" value="" {...register("work_schedule_id")} />
          <div className="grid max-h-48 gap-2 overflow-y-auto rounded-2xl border border-border/80 bg-background p-3 shadow-xs">
            {schedules.map((schedule) => (
              <label
                key={schedule.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors"
              >
                <input
                  type="checkbox"
                  value={schedule.id}
                  className="size-4 rounded accent-primary text-primary"
                  {...register("work_schedule_ids")}
                />
                <span>{schedule.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Manager</span>
          <select
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("manager_employee_id")}
          >
            <option value="">No manager</option>
            {managers
              .filter((manager) => manager.id !== employee?.id)
              .map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.label}</option>
              ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted flex items-center justify-between">
            <span>Payroll identifier</span>
            <span className="text-[10px] font-normal lowercase text-muted">
              (auto-assigned if blank)
            </span>
          </span>
          <input
            placeholder="e.g. ee023 (Auto-assigned automatically)"
            className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            {...register("payroll_identifier")}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Monthly salary (ZAR)</span>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-sm font-bold text-muted">R</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background pl-9 pr-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("monthly_salary")}
            />
          </div>
          {errors.monthly_salary && <span className="text-xs text-danger">{errors.monthly_salary.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Hourly rate (ZAR)</span>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-sm font-bold text-muted">R</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background pl-9 pr-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("hourly_rate")}
            />
          </div>
          {errors.hourly_rate && <span className="text-xs text-danger">{errors.hourly_rate.message}</span>}
        </label>
      </div>

      {/* Statutory Identification Details (For Payslips & Tax Compliance) */}
      <div className="rounded-2xl border border-border/80 bg-surface/50 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted mb-3.5">
          Statutory Identification &amp; Address (For Payslips &amp; BCEA)
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">National ID / Passport Number</span>
            <input
              placeholder="e.g. 940322 0456 083"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("id_number")}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">SARS Tax Reference Number</span>
            <input
              placeholder="e.g. 9012345678"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("tax_number")}
            />
          </label>

          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Physical / Residential Address</span>
            <input
              placeholder="e.g. 49 Duncan Street, Witbank, 1039"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("address")}
            />
          </label>
        </div>
      </div>

      {/* Payroll & Banking Information (For Payslip Printout & EFT Disbursements) */}
      <div className="rounded-2xl border border-border/80 bg-surface/50 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted mb-3.5">
          Payroll Cycle &amp; Banking Details (For Payslips &amp; EFT)
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Payment Frequency</span>
            <select
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none capitalize focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("payment_frequency")}
            >
              {paymentFrequencies.map((freq) => (
                <option key={freq} value={freq}>{labelize(freq)}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Payment Mode</span>
            <select
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("payment_mode")}
            >
              {paymentModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Bank Name</span>
            <input
              placeholder="e.g. Standard Bank, FNB, Capitec, Nedbank"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("bank_name")}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Bank Account Number</span>
            <input
              placeholder="e.g. 10149977458"
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("bank_account_number")}
            />
          </label>

          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Account Type</span>
            <select
              className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
              {...register("bank_account_type")}
            >
              {bankAccountTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[44px] h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-bold text-white shadow-soft hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 transition-all cursor-pointer"
        >
          {isPending ? "Saving..." : employee ? "Save employee" : "Add employee"}
        </button>
      </div>
    </form>
  );
}
