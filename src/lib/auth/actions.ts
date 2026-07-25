"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

type CreateCompanyState = {
  ok: boolean;
  error?: string;
};

export async function createCompanyAndProvisionOwner(
  _previousState: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const companyName = String(formData.get("company_name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!companyName) {
    return { ok: false, error: "Company name is required." };
  }

  if (!fullName) {
    return { ok: false, error: "Your full name is required." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false, error: "Unable to verify your session. Try signing in again." };
  }

  const admin = createSupabaseAdminClient();
  const { error: provisionError } = await admin.rpc("provision_company_owner", {
    company_name: companyName,
    owner_auth_user_id: user.id,
    owner_full_name: fullName,
    owner_email: user.email,
  });

  if (provisionError) {
    return { ok: false, error: provisionError.message };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
