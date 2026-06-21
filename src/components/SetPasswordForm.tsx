"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    setError(null);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError("Unable to save password. Request a new invite.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form action={onSubmit} className="mt-6 grid gap-4">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

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
        Confirm password
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
        {saving ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
