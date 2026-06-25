"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/foundation/queries";
import { employeeFormSchema, type EmployeeFormInput } from "./schema";

type ActionState = {
  ok: boolean;
  message: string;
};

async function nextEmployeeNumber(companyId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("next_company_employee_number", {
    target_company_id: companyId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

function blankToNull(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function moneyToNumber(value: string | undefined) {
  return value?.trim() ? Number(value) : null;
}

export async function createEmployee(
  input: EmployeeFormInput,
): Promise<ActionState> {
  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid employee data." };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const values = parsed.data;
  const hourlyRate = moneyToNumber(values.hourly_rate);

  const { error } = await supabase.from("employees").insert({
    company_id: company.id,
    employee_number: await nextEmployeeNumber(company.id),
    full_name: values.full_name,
    known_as: blankToNull(values.known_as),
    email: blankToNull(values.email),
    phone_number: blankToNull(values.phone_number),
    branch_id: values.branch_id,
    department_id: blankToNull(values.department_id),
    job_title: blankToNull(values.job_title),
    employment_type: values.employment_type,
    employment_status: values.employment_status,
    start_date: values.start_date,
    work_schedule_id: blankToNull(values.work_schedule_id),
    manager_employee_id: blankToNull(values.manager_employee_id),
    payroll_identifier: blankToNull(values.payroll_identifier),
    monthly_salary: moneyToNumber(values.monthly_salary),
    hourly_rate: hourlyRate,
    compensation_type: hourlyRate ? "hourly" : "monthly",
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/employees");
  return { ok: true, message: "Employee created." };
}

export async function updateEmployee(
  employeeId: string,
  input: EmployeeFormInput,
): Promise<ActionState> {
  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid employee data." };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const values = parsed.data;
  const hourlyRate = moneyToNumber(values.hourly_rate);

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: values.full_name,
      known_as: blankToNull(values.known_as),
      email: blankToNull(values.email),
      phone_number: blankToNull(values.phone_number),
      branch_id: values.branch_id,
      department_id: blankToNull(values.department_id),
      job_title: blankToNull(values.job_title),
      employment_type: values.employment_type,
      employment_status: values.employment_status,
      start_date: values.start_date,
      work_schedule_id: blankToNull(values.work_schedule_id),
      manager_employee_id: blankToNull(values.manager_employee_id),
      payroll_identifier: blankToNull(values.payroll_identifier),
      monthly_salary: moneyToNumber(values.monthly_salary),
      hourly_rate: hourlyRate,
      compensation_type: hourlyRate ? "hourly" : "monthly",
    })
    .eq("company_id", company.id)
    .eq("id", employeeId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/employees");
  revalidatePath(`/dashboard/employees/${employeeId}`);
  return { ok: true, message: "Employee updated." };
}

export async function deactivateEmployee(employeeId: string) {
  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("employees")
    .update({
      employment_status: "inactive",
      deleted_at: new Date().toISOString(),
    })
    .eq("company_id", company.id)
    .eq("id", employeeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/employees");
  redirect("/dashboard/employees");
}
