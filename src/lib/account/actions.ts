"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChangePasswordState = {
  ok: boolean;
  message: string;
};

type UpdateProfileState = {
  ok: boolean;
  message: string;
};

const initialError = {
  ok: false,
  message: "Unable to update password. Try again.",
};

const profileSchema = z.object({
  avatar_url: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;

      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Use a valid profile picture link that starts with http:// or https://"),
  email: z.email("Enter a valid email address").optional().or(z.literal("")),
  known_as: z.string().trim().max(80, "Keep this name shorter than 80 characters").optional(),
  phone_number: z.string().trim().max(40, "Keep this phone number shorter than 40 characters").optional(),
});

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the profile details and try again.";
}

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

export async function updateOwnProfile(
  _previousState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const parsed = profileSchema.safeParse({
    avatar_url: String(formData.get("avatar_url") ?? ""),
    email: String(formData.get("email") ?? ""),
    known_as: String(formData.get("known_as") ?? ""),
    phone_number: String(formData.get("phone_number") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_own_employee_profile", {
    profile_avatar_url: parsed.data.avatar_url || null,
    profile_email: parsed.data.email || null,
    profile_known_as: parsed.data.known_as || null,
    profile_phone_number: parsed.data.phone_number || null,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/employees");

  return { ok: true, message: "Profile updated." };
}
