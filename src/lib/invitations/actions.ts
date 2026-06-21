"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";

const AUTH_USER_PAGE_SIZE = 1000;
const AUTH_USER_PAGE_LIMIT = 10;

function appBaseUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL?.replace(/^/, "https://") ??
    "http://localhost:3000";

  return new URL(rawUrl).origin;
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

async function removeUnlinkedAuthInviteUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  const authUserId = await findAuthUserIdByEmail(admin, email);

  if (!authUserId) {
    return;
  }

  const { data: linkedUser, error: linkedUserError } = await admin
    .from("users")
    .select("id")
    .or(`auth_user_id.eq.${authUserId},email.eq.${email}`)
    .limit(1)
    .maybeSingle();

  if (linkedUserError) {
    throw new Error(linkedUserError.message);
  }

  if (linkedUser) {
    throw new Error("This email already has account access. Use the existing account or deactivate it first.");
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

async function createPendingEmployeeInvitation(employeeId: string) {
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
    redirect(`/dashboard/employees/${employeeId}?message=Employee record could not be found.`);
  }

  if (!employee.email) {
    redirect(`/dashboard/employees/${employeeId}?message=Add an employee email address before sending an invite.`);
  }

  if (employee.user_id) {
    redirect(`/dashboard/employees/${employeeId}?message=This employee already has account access.`);
  }

  const { data: inviter, error: inviterError } = await supabase
    .from("users")
    .select("id")
    .eq("company_id", company.id)
    .eq("auth_user_id", user.id)
    .single();

  if (inviterError || !inviter) {
    redirect(`/dashboard/employees/${employeeId}?message=Unable to verify inviter permissions.`);
  }

  const admin = createSupabaseAdminClient();

  try {
    await removeUnlinkedAuthInviteUser(admin, employee.email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare a fresh invite.";
    redirect(`/dashboard/employees/${employeeId}?message=${encodeURIComponent(message)}`);
  }

  await supabase
    .from("user_invitations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("company_id", company.id)
    .eq("employee_id", employeeId)
    .eq("status", "pending");

  const { data: invitation, error: invitationError } = await supabase
    .from("user_invitations")
    .insert({
      company_id: company.id,
      employee_id: employee.id,
      email: employee.email,
      role_key: "employee",
      invited_by: inviter.id,
    })
    .select("id")
    .single();

  if (invitationError || !invitation) {
    redirect(`/dashboard/employees/${employeeId}?message=${encodeURIComponent(invitationError?.message ?? "Unable to create invite.")}`);
  }

  return { admin, company, employee, invitation, supabase };
}

export async function sendEmployeeInvite(employeeId: string) {
  const { admin, company, employee, invitation, supabase } =
    await createPendingEmployeeInvitation(employeeId);

  const redirectTo = `${appBaseUrl()}/auth/callback?inviteId=${invitation.id}`;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    employee.email,
    {
      redirectTo,
      data: {
        invitation_id: invitation.id,
        company_id: company.id,
        employee_id: employee.id,
      },
    },
  );

  if (inviteError) {
    await supabase
      .from("user_invitations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("company_id", company.id)
      .eq("id", invitation.id);

    redirect(`/dashboard/employees/${employeeId}?message=${encodeURIComponent(inviteError.message)}`);
  }

  revalidatePath(`/dashboard/employees/${employeeId}`);
  redirect(`/dashboard/employees/${employeeId}?message=Invite sent.`);
}

export async function createEmployeeInviteLink(employeeId: string) {
  const { admin, company, employee, invitation, supabase } =
    await createPendingEmployeeInvitation(employeeId);

  const redirectTo = `${appBaseUrl()}/auth/callback?inviteId=${invitation.id}`;
  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: employee.email,
    options: {
      redirectTo,
      data: {
        invitation_id: invitation.id,
        company_id: company.id,
        employee_id: employee.id,
      },
    },
  });

  if (linkError || !data.properties.action_link) {
    await supabase
      .from("user_invitations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("company_id", company.id)
      .eq("id", invitation.id);

    redirect(`/dashboard/employees/${employeeId}?message=${encodeURIComponent(linkError?.message ?? "Unable to create invite link.")}`);
  }

  revalidatePath(`/dashboard/employees/${employeeId}`);
  redirect(
    `/dashboard/employees/${employeeId}?message=Invite link created.&manualInviteUrl=${encodeURIComponent(data.properties.action_link)}`,
  );
}

export async function cancelEmployeeInvite(invitationId: string, employeeId: string) {
  const { company } = await getActiveCompany();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("user_invitations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("company_id", company.id)
    .eq("id", invitationId)
    .eq("employee_id", employeeId)
    .eq("status", "pending");

  if (error) {
    redirect(`/dashboard/employees/${employeeId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/employees/${employeeId}`);
  redirect(`/dashboard/employees/${employeeId}?message=Invite cancelled.`);
}
