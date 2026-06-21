"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChangePasswordState = {
  ok: boolean;
  message: string;
};

const initialError = {
  ok: false,
  message: "Unable to update password. Try again.",
};

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword) {
    return { ok: false, message: "Enter your current password." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Use at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: "Passwords do not match." };
  }

  if (password === currentPassword) {
    return { ok: false, message: "Choose a password that is different from the current one." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false, message: "Your session could not be verified." };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    return initialError;
  }

  return { ok: true, message: "Password updated." };
}
