"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL?.replace(/^/, "https://") ??
    "http://localhost:3000"
  );
}

export async function sendEmployeeInvite(employeeId: string) {
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

  const admin = createSupabaseAdminClient();
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
