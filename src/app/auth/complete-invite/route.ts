import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { inviteId } = (await request.json()) as { inviteId?: string };

  if (!inviteId) {
    return NextResponse.json({ error: "Missing invite." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: "Unable to verify account." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { error: acceptError } = await admin.rpc("accept_user_invitation", {
    invitation_id: inviteId,
    accepted_auth_user_id: user.id,
    accepted_email: user.email,
  });

  if (acceptError) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Unable to activate invite." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
