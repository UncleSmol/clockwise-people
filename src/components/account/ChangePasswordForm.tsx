"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(formData: FormData) {
    const currentPassword = String(formData.get("current_password") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    setMessage(null);
    setError(null);

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      setSaving(false);
      setError("Your session could not be verified.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setSaving(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError("Unable to update password. Try again.");
      return;
    }

    setMessage("Password updated.");
  }

  return (
    <form action={onSubmit} className="grid gap-4">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-foreground">
          {message}
        </div>
      )}

      <label className="grid gap-2 text-sm font-medium text-foreground">
        Current password
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-foreground">
        New password
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-foreground">
        Confirm new password
        <input
          name="confirm_password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
