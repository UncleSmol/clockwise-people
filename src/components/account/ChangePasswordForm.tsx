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
        <div className="rounded-lg border border-danger/20 bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
          {state.message}
        </div>
      )}

      {state.message && state.ok && (
        <div className="rounded-lg border border-accent/20 bg-accent/8 px-4 py-3 text-sm font-medium text-foreground">
          {state.message}
        </div>
      )}

      <label className="grid gap-1.5 text-sm font-medium text-foreground">
        Current password
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-foreground">
        New password
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-foreground">
        Confirm new password
        <input
          name="confirm_password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-accent w-full text-center"
      >
        {pending ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
