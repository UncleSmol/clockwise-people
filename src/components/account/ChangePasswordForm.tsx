"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/account/actions";
import PasswordInput from "@/components/ui/PasswordInput";

const initialState = {
  ok: true,
  message: "",
};

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      {state.message && !state.ok && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {state.message}
        </div>
      )}

      {state.message && state.ok && (
        <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-foreground">
          {state.message}
        </div>
      )}

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>Current password</span>
        <PasswordInput
          name="current_password"
          required
          autoComplete="current-password"
          placeholder="Enter current password"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>New password</span>
        <PasswordInput
          name="password"
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="Enter new password (min. 8 characters)"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>Confirm new password</span>
        <PasswordInput
          name="confirm_password"
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="Confirm new password"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full rounded-full py-3 text-sm font-bold shadow-primary text-center"
      >
        {pending ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
