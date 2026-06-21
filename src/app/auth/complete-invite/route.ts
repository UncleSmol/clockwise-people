import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { inviteId } = (await request.json()) as { inviteId?: string };
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");

  if (!inviteId) {
    return NextResponse.json({ error: "Missing invite." }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return NextResponse.json({ error: "Unable to verify account." }, { status: 401 });
  }

  const { error: acceptError } = await admin.rpc("accept_user_invitation", {
    invitation_id: inviteId,
    accepted_auth_user_id: user.id,
    accepted_email: user.email,
  });

  if (acceptError) {
    return NextResponse.json({ error: "Unable to activate invite." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
