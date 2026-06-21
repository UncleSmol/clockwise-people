"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";

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

export async function createEmployeeAccount(
  employeeId: string,
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
