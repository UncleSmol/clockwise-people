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
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {state.message}
        </div>
      )}

      {state.message && state.ok && (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-foreground">
          {state.message}
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
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
