"use client";

import { useState, useTransition } from "react";
import { Loader2, Shield, ShieldAlert, ShieldCheck, UserPlus, X } from "lucide-react";
import { setSuperAdminRoleAction } from "@/lib/sysadmin/actions";

type ManageSuperAdminModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingSuperAdminEmails?: string[];
};

export default function ManageSuperAdminModal({
  isOpen,
  onClose,
  onSuccess,
  existingSuperAdminEmails = [],
}: ManageSuperAdminModalProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const normalizedInput = email.toLowerCase().trim();
  const isAlreadySuperAdmin = existingSuperAdminEmails.some(
    (e) => e.toLowerCase() === normalizedInput,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedInput) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (isAlreadySuperAdmin) {
      setErrorMessage("This account already possesses Super Administrator privileges.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await setSuperAdminRoleAction(normalizedInput, true);
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        setEmail("");
        onSuccess();
        onClose();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred while assigning role.",
        );
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Grant Super Administrator</h2>
              <p className="text-xs text-muted">
                Assign universal cross-tenant privileges to any email address.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {errorMessage ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Account Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                placeholder="e.g. name@gmail.com, name@yahoo.co.za, name@formalize.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
              Super Admin rights can be assigned to anyone using Gmail, Yahoo, Formalize, or any other email provider so long as assigned by Doctor or Sizwe.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <Shield className="size-4 text-amber-600 shrink-0" />
              Universal Access Scope
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900/90">
              Super Administrators can toggle between all companies, provision tenant workspaces, view employee profiles across tenants, and inspect cross-company reports.
            </p>
          </div>

          <div className="pt-3 flex justify-end gap-2.5 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !normalizedInput || isAlreadySuperAdmin}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Granting...</span>
                </>
              ) : (
                <>
                  <UserPlus className="size-3.5" />
                  <span>Confirm &amp; Grant Super Admin</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
