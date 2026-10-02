"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveCompany, getCurrentUserAccess, requireUser } from "@/lib/foundation/queries";

type CreateEmployeeAccountState = {
  credentials?: {
    email: string;
    password: string;
  };
  error?: string;
  message?: string;
};

const AUTH_USER_PAGE_SIZE = 1000;
const AUTH_USER_PAGE_LIMIT = 10;
const PASSWORD_LENGTH = 16;
const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function generateTemporaryPassword() {
  let password = "";

  while (password.length < PASSWORD_LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= PASSWORD_CHARS.length * 4) continue;
    password += PASSWORD_CHARS[byte % PASSWORD_CHARS.length];
  }

  return password;
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  const targetEmail = email.trim().toLowerCase();

  for (let page = 1; page <= AUTH_USER_PAGE_LIMIT; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_PAGE_SIZE,
    });

    if (error) {
      throw new Error(error.message);
    }

    const authUser = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === targetEmail,
    );

    if (authUser) {
      return authUser.id;
    }

    if (data.users.length < AUTH_USER_PAGE_SIZE) {
      return null;
    }
  }

  throw new Error("Unable to verify whether this email already has Auth access. Try again shortly.");
}

async function removeStaleUnlinkedAuthUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  const authUserId = await findAuthUserIdByEmail(admin, email);

  if (!authUserId) {
    return;
  }

  const { data: linkedUser, error } = await admin
    .from("users")
    .select("id")
    .or(`auth_user_id.eq.${authUserId},email.eq.${email}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (linkedUser) {
    throw new Error("This email already has account access.");
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

export type EmployeeAccountRoleKey = "owner" | "hr_admin" | "branch_manager" | "payroll_viewer" | "employee";

export async function createEmployeeAccount(
  employeeId: string,
  roleKey: EmployeeAccountRoleKey,
  previousState: CreateEmployeeAccountState,
): Promise<CreateEmployeeAccountState> {
  void previousState;

  const { company } = await getActiveCompany();
  const { supabase, user } = await requireUser();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, company_id, full_name, email, user_id")
    .eq("company_id", company.id)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .single();

  if (employeeError || !employee) {
    return { error: "Employee record could not be found." };
  }

  if (!employee.email) {
    return { error: "Add an employee email address before creating an account." };
  }

  if (employee.user_id) {
    return { error: "This employee already has account access." };
  }

  const admin = createSupabaseAdminClient();
  const password = generateTemporaryPassword();

  try {
    await removeStaleUnlinkedAuthUser(admin, employee.email);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to prepare account creation.",
    };
  }

  const { data: authResult, error: authError } =
    await admin.auth.admin.createUser({
      email: employee.email,
      password,
      email_confirm: true,
      user_metadata: {
        company_id: company.id,
        employee_id: employee.id,
        provisioned_by: user.id,
      },
    });

  if (authError || !authResult.user) {
    return { error: authError?.message ?? "Unable to create Auth user." };
  }

  const { error: provisionError } = await admin.rpc("provision_employee_account", {
    target_employee_id: employee.id,
    target_auth_user_id: authResult.user.id,
    provisioned_by_auth_user_id: user.id,
    target_role_key: roleKey,
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(authResult.user.id);
    return { error: provisionError.message };
  }

  revalidatePath(`/dashboard/employees/${employee.id}`);
  revalidatePath("/dashboard/employees");

  return {
    credentials: {
      email: employee.email,
      password,
    },
    message: "Employee account created. Copy these credentials now.",
  };
}

export type AssignEmployeeRoleState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export async function assignEmployeeRole(
  employeeId: string,
  roleKey: EmployeeAccountRoleKey,
  previousState?: AssignEmployeeRoleState,
): Promise<AssignEmployeeRoleState> {
  void previousState;

  const { company } = await getActiveCompany();
  const { user } = await requireUser();
  const access = await getCurrentUserAccess();

  if (!access.canAssignRoles) {
    return {
      ok: false,
      error: "Unauthorized: Only superadmins, managers, and HR can assign employee roles.",
    };
  }

  if (roleKey === "owner" && !access.isSuperAdmin && !access.isOwner) {
    return {
      ok: false,
      error: "Only system superadmins or company owners can assign the Company Admin role.",
    };
  }

  const admin = createSupabaseAdminClient();

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id, company_id, full_name, email, user_id")
    .eq("company_id", company.id)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .single();

  if (employeeError || !employee) {
    return { ok: false, error: "Employee record could not be found." };
  }

  const { data: targetRole, error: roleError } = await admin
    .from("roles")
    .select("id, key, name")
    .eq("company_id", company.id)
    .eq("key", roleKey)
    .single();

  if (roleError || !targetRole) {
    return { ok: false, error: `Role '${roleKey}' is not configured for this company.` };
  }

  // Find assigner app user id
  const { data: assignerUser } = await admin
    .from("users")
    .select("id")
    .eq("company_id", company.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const assignerUserId = assignerUser?.id ?? null;

  if (employee.user_id) {
    // Revoke any existing active roles
    const { error: revokeError } = await admin
      .from("user_roles")
      .update({ revoked_at: new Date().toISOString() })
      .eq("company_id", company.id)
      .eq("user_id", employee.user_id)
      .is("revoked_at", null);

    if (revokeError) {
      return { ok: false, error: `Failed to update existing roles: ${revokeError.message}` };
    }

    // Insert new active role
    const { error: insertError } = await admin
      .from("user_roles")
      .insert({
        company_id: company.id,
        user_id: employee.user_id,
        role_id: targetRole.id,
        assigned_by: assignerUserId,
        assigned_at: new Date().toISOString(),
        revoked_at: null,
      });

    if (insertError) {
      return { ok: false, error: `Failed to assign role: ${insertError.message}` };
    }
  }

  // Also update pending invitations if any
  await admin
    .from("user_invitations")
    .update({ role_key: roleKey, updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("employee_id", employee.id)
    .eq("status", "pending");

  revalidatePath(`/dashboard/employees/${employee.id}`);
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `Role successfully updated to "${targetRole.name}".`,
  };
}
