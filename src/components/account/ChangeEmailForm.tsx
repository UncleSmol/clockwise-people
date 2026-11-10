"use client";

import { useActionState, useState } from "react";
import { Mail, Check, AlertTriangle, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { changeOwnEmail, type ChangeEmailState } from "@/lib/account/actions";

const initialState: ChangeEmailState = {
  ok: true,
  message: "",
};

type ChangeEmailFormProps = {
  currentEmail: string | null;
};

export default function ChangeEmailForm({ currentEmail }: ChangeEmailFormProps) {
  const [state, formAction, pending] = useActionState(
    changeOwnEmail,
    initialState,
  );
  const [newEmail, setNewEmail] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  return (
    <form action={formAction} className="grid gap-4">
      {state.message && !state.ok && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs font-semibold text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      {state.message && state.ok && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <Check className="size-4 shrink-0 text-emerald-600" />
          <span>{state.message}</span>
        </div>
      )}

      <div className="rounded-2xl border border-border/80 bg-surface-muted/40 p-3.5 flex items-center justify-between text-xs">
        <span className="text-muted font-bold uppercase tracking-wider text-[10px]">Current Login Email:</span>
        <span className="font-mono font-semibold text-foreground select-all">{currentEmail || "Not available"}</span>
      </div>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>New login email</span>
        <div className="relative">
          <input
            name="new_email"
            type="email"
            required
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new-email@company.com"
            style={{ paddingLeft: "3rem", paddingRight: "1.125rem" }}
            className="has-icon-left h-11 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Mail className="size-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span>Confirm with current password</span>
        <div className="relative">
          <input
            name="current_password"
            type={showCurrentPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Enter current password"
            style={{ paddingLeft: "3rem", paddingRight: "3rem" }}
            className="has-icon-left has-icon-right h-11 w-full rounded-full border border-border bg-surface pl-12 pr-12 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Lock className="size-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <button
            type="button"
            onClick={() => setShowCurrentPassword((prev) => !prev)}
            tabIndex={-1}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground cursor-pointer transition-colors z-10 flex items-center justify-center rounded-full hover:bg-surface-muted focus:outline-none"
            aria-label={showCurrentPassword ? "Hide password" : "Show password"}
            title={showCurrentPassword ? "Hide password" : "Show password"}
          >
            {showCurrentPassword ? (
              <EyeOff className="size-4 shrink-0" />
            ) : (
              <Eye className="size-4 shrink-0" />
            )}
          </button>
        </div>
      </label>

      <button
        type="submit"
        disabled={pending || !newEmail.trim()}
        className="inline-flex min-h-[44px] h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-white shadow-soft hover:bg-primary-hover disabled:opacity-60 transition-all cursor-pointer"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Updating email...</span>
          </>
        ) : (
          <>
            <span>Update login email</span>
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}

