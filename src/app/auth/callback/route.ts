import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const inviteId = url.searchParams.get("inviteId");
  const origin = url.origin;

  if (!code || !inviteId) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("Unable to verify account access. Contact your administrator.")}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const { error: acceptError } = await admin.rpc("accept_user_invitation", {
    invitation_id: inviteId,
    accepted_auth_user_id: user.id,
    accepted_email: user.email,
  });

  if (acceptError) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("Unable to activate this invite. Contact your administrator.")}`,
    );
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
