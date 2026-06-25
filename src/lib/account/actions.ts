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

type UpdateCompanyProfileState = {
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

const companyProfileSchema = z.object({
  address_line_1: z.string().trim().max(160, "Keep address line 1 shorter than 160 characters").optional(),
  address_line_2: z.string().trim().max(160, "Keep address line 2 shorter than 160 characters").optional(),
  city: z.string().trim().max(80, "Keep the city shorter than 80 characters").optional(),
  contact_email: z.email("Enter a valid company contact email").optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40, "Keep the company phone shorter than 40 characters").optional(),
  country: z.string().trim().min(2, "Country is required"),
  industry: z.string().trim().max(100, "Keep the industry shorter than 100 characters").optional(),
  name: z.string().trim().min(2, "Company name is required"),
  payroll_cycle: z.string().trim().min(2, "Payroll cycle is required"),
  postal_code: z.string().trim().max(20, "Keep the postal code shorter than 20 characters").optional(),
  province: z.string().trim().max(80, "Keep the province shorter than 80 characters").optional(),
  registration_number: z.string().trim().max(80, "Keep the registration number shorter than 80 characters").optional(),
  tax_number: z.string().trim().max(80, "Keep the tax number shorter than 80 characters").optional(),
  timezone: z.string().trim().min(2, "Timezone is required"),
  trading_name: z.string().trim().max(120, "Keep the trading name shorter than 120 characters").optional(),
  vat_number: z.string().trim().max(80, "Keep the VAT number shorter than 80 characters").optional(),
  website_url: z
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
    }, "Use a valid website link that starts with http:// or https://"),
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

export async function updateCompanyProfile(
  _previousState: UpdateCompanyProfileState,
  formData: FormData,
): Promise<UpdateCompanyProfileState> {
  const companyId = String(formData.get("company_id") ?? "").trim();
  const parsed = companyProfileSchema.safeParse({
    address_line_1: String(formData.get("address_line_1") ?? ""),
    address_line_2: String(formData.get("address_line_2") ?? ""),
    city: String(formData.get("city") ?? ""),
    contact_email: String(formData.get("contact_email") ?? ""),
    contact_phone: String(formData.get("contact_phone") ?? ""),
    country: String(formData.get("country") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    name: String(formData.get("name") ?? ""),
    payroll_cycle: String(formData.get("payroll_cycle") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    province: String(formData.get("province") ?? ""),
    registration_number: String(formData.get("registration_number") ?? ""),
    tax_number: String(formData.get("tax_number") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    trading_name: String(formData.get("trading_name") ?? ""),
    vat_number: String(formData.get("vat_number") ?? ""),
    website_url: String(formData.get("website_url") ?? ""),
  });

  if (!companyId) {
    return { ok: false, message: "Company could not be resolved." };
  }

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_company_profile", {
    company_address_line_1: parsed.data.address_line_1 || null,
    company_address_line_2: parsed.data.address_line_2 || null,
    company_city: parsed.data.city || null,
    company_contact_email: parsed.data.contact_email || null,
    company_contact_phone: parsed.data.contact_phone || null,
    company_country: parsed.data.country,
    company_industry: parsed.data.industry || null,
    company_name: parsed.data.name,
    company_payroll_cycle: parsed.data.payroll_cycle,
    company_postal_code: parsed.data.postal_code || null,
    company_province: parsed.data.province || null,
    company_registration_number: parsed.data.registration_number || null,
    company_tax_number: parsed.data.tax_number || null,
    company_timezone: parsed.data.timezone,
    company_trading_name: parsed.data.trading_name || null,
    company_vat_number: parsed.data.vat_number || null,
    company_website_url: parsed.data.website_url || null,
    target_company_id: companyId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/company");

  return { ok: true, message: "Company profile updated." };
}
