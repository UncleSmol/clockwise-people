"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/account/actions";

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
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>New password</span>
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>Confirm new password</span>
        <input
          name="confirm_password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
