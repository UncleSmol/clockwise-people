import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const { inviteId } = (await request.json()) as { inviteId?: string };
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");

  if (!inviteId) {
    return jsonError("Missing invite.");
  }

  if (!accessToken) {
    return jsonError("Missing session.", 401);
  }

  const admin = createSupabaseAdminClient();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return jsonError("Unable to verify account.", 401);
  }

  const { data: invitation, error: invitationError } = await admin
    .from("user_invitations")
    .select("id, email, status, auth_user_id, expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (invitationError) {
    return jsonError("Unable to verify invite.");
  }

  if (!invitation) {
    return jsonError("This invite link is no longer available. Request a fresh invite.");
  }

  if (invitation.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return jsonError("This invite belongs to a different email address.");
  }

  if (invitation.status === "accepted") {
    if (invitation.auth_user_id === user.id) {
      return NextResponse.json({ ok: true });
    }

    return jsonError("This invite has already been accepted by another account.");
  }

  if (invitation.status !== "pending") {
    return jsonError("This invite is no longer active. Request a fresh invite.");
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await admin
      .from("user_invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)
      .eq("status", "pending");

    return jsonError("This invite has expired. Request a fresh invite.");
  }

  const { error: acceptError } = await admin.rpc("accept_user_invitation", {
    invitation_id: inviteId,
    accepted_auth_user_id: user.id,
    accepted_email: user.email,
  });

  if (acceptError) {
    return jsonError(acceptError.message || "Unable to activate invite.");
  }

  return NextResponse.json({ ok: true });
}
