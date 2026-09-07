"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccess, requireUser } from "@/lib/foundation/queries";
import {
  sysAdminCreateCompanySchema,
  sysAdminCreateEmployeeSchema,
  type SysAdminCreateCompanyInput,
  type SysAdminCreateEmployeeInput,
} from "./schema";

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function generateSecurePassword(length = 14): string {
  let password = "";
  while (password.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= PASSWORD_CHARS.length * 4) continue;
    password += PASSWORD_CHARS[byte % PASSWORD_CHARS.length];
  }
  return password;
}

export type SysAdminActionResult<T = unknown> = {
  ok: boolean;
  message: string;
  data?: T;
  credentials?: {
    email: string;
    password: string;
    role: string;
    companyName?: string;
  };
};

export async function createCompanyBySysAdminAction(
  input: SysAdminCreateCompanyInput,
): Promise<SysAdminActionResult<{ companyId: string }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const parsed = sysAdminCreateCompanySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid company input data.",
    };
  }

  const { user } = await requireUser();
  const values = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("create_company_by_sysadmin", {
    company_name: values.name,
    company_country: values.country,
    company_timezone: values.timezone,
    company_payroll_cycle: values.payroll_cycle,
    company_registration_number: values.registration_number || null,
    company_trading_name: values.trading_name || null,
    company_industry: values.industry || null,
    company_contact_email: values.contact_email || null,
    company_contact_phone: values.contact_phone || null,
    workstation_name: values.workstation_name,
    workstation_address: values.workstation_address || null,
    workstation_lat: values.workstation_lat,
    workstation_lng: values.workstation_lng,
    workstation_radius: values.workstation_radius,
    work_schedule_name: "Standard 40h",
    creator_auth_id: user.id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const result = data as { company_id: string; workstation_id: string; schedule_id: string } | null;
  const newCompanyId = result?.company_id;

  if (!newCompanyId) {
    return { ok: false, message: "Failed to obtain new company identifier." };
  }

  // Set the active company cookie to the new company
  const cookieStore = await cookies();
  cookieStore.set("active_company_id", newCompanyId, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/employees");

  return {
    ok: true,
    message: `Company "${values.name}" created successfully with default workstation and schedule.`,
    data: { companyId: newCompanyId },
  };
}

export async function createSysAdminEmployeeAction(
  input: SysAdminCreateEmployeeInput,
): Promise<SysAdminActionResult<{ employeeId: string }>> {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    return { ok: false, message: "Unauthorized: Super Administrator privileges required." };
  }

  const parsed = sysAdminCreateEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid employee data.",
    };
  }

  const { user } = await requireUser();
  const values = parsed.data;
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  // 1. Fetch Company Name
  const { data: companyRecord } = await admin
    .from("companies")
    .select("id, name")
    .eq("id", values.company_id)
    .single();

  if (!companyRecord) {
    return { ok: false, message: "Target company was not found." };
  }

  // 2. Generate employee number using atomic counter RPC
  const { data: employeeNumber, error: numberError } = await admin.rpc(
    "next_company_employee_number",
    { target_company_id: values.company_id },
  );

  const finalEmployeeNumber = employeeNumber ?? `EMP-${Date.now().toString().slice(-4)}`;

  // 3. Insert Employee Record
  const { data: employee, error: empError } = await admin
    .from("employees")
    .insert({
      company_id: values.company_id,
      employee_number: finalEmployeeNumber,
      full_name: values.full_name,
      email: values.email,
      phone_number: values.phone_number || null,
      job_title: values.job_title || null,
      workstation_id: values.workstation_id,
      work_schedule_id: values.work_schedule_id || null,
      employment_type: values.employment_type,
      employment_status: values.employment_status,
      start_date: values.start_date,
      compensation_type: "monthly",
    })
    .select("id")
    .single();

  if (empError || !employee) {
    return { ok: false, message: empError?.message ?? "Unable to create employee record." };
  }

  // 4. Create Workstation Assignment
  await admin.from("employee_workstation_assignments").insert({
    company_id: values.company_id,
    employee_id: employee.id,
    workstation_id: values.workstation_id,
    is_active: true,
  });

  // 5. If work schedule provided, register schedule assignment
  if (values.work_schedule_id) {
    await admin.rpc("set_employee_work_schedule_assignments", {
      target_employee_id: employee.id,
      target_work_schedule_ids: [values.work_schedule_id],
    });
  }

  // 6. Handle User Login Provisioning if requested
  let credentials: { email: string; password: string; role: string; companyName: string } | undefined;

  if (values.create_login) {
    const temporaryPassword = values.temporary_password || generateSecurePassword();

    // Check if auth user exists or remove stale unlinked
    const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    const existingAuthUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === values.email.toLowerCase(),
    );

    let authUserId: string;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
      // Update password to the new temporary password
      await admin.auth.admin.updateUserById(authUserId, {
        password: temporaryPassword,
      });
    } else {
      const { data: authResult, error: authError } = await admin.auth.admin.createUser({
        email: values.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          company_id: values.company_id,
          employee_id: employee.id,
          provisioned_by: user.id,
        },
      });

      if (authError || !authResult.user) {
        return {
          ok: true,
          message: `Employee was created, but login user creation returned: ${authError?.message ?? "unknown error"}.`,
          data: { employeeId: employee.id },
        };
      }

      authUserId = authResult.user.id;
    }

    // Provision account and assign role
    const { error: provisionError } = await admin.rpc("provision_employee_account", {
      target_employee_id: employee.id,
      target_auth_user_id: authUserId,
      provisioned_by_auth_user_id: user.id,
      target_role_key: values.role_key,
    });

    if (provisionError) {
      return {
        ok: true,
        message: `Employee created, but role provisioning encountered: ${provisionError.message}`,
        data: { employeeId: employee.id },
      };
    }

    credentials = {
      email: values.email,
      password: temporaryPassword,
      role: values.role_key,
      companyName: companyRecord.name,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/employees");

  return {
    ok: true,
    message: `Employee "${values.full_name}" added to ${companyRecord.name} with role "${values.role_key}".`,
    data: { employeeId: employee.id },
    credentials,
  };
}

export async function switchActiveCompanyAction(companyId: string) {
  const access = await getCurrentUserAccess();
  if (!access.isSuperAdmin) {
    throw new Error("Unauthorized: Only Super Administrators can switch active company.");
  }

  const cookieStore = await cookies();
  cookieStore.set("active_company_id", companyId, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });

  revalidatePath("/dashboard");
}
