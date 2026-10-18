"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert, X } from "lucide-react";

type CredentialsRevealModalProps = {
  credentials: {
    email: string;
    password: string;
    role: string;
    companyName?: string;
  };
  onClose: () => void;
};

export default function CredentialsRevealModal({
  credentials,
  onClose,
}: CredentialsRevealModalProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    const text = `Company: ${credentials.companyName || "N/A"}\nEmail: ${credentials.email}\nPassword: ${credentials.password}\nRole: ${credentials.role}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-border/80 bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-surface-muted text-muted hover:bg-surface-muted/80 hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close credentials modal"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Employee Login Credentials</h3>
            <p className="text-xs text-muted">Account provisioned with tenant-scoped role.</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning flex items-start gap-2.5 shadow-soft">
          <ShieldAlert className="size-4 shrink-0 mt-0.5 text-warning" />
          <span>
            Copy and securely deliver these credentials now. The temporary password will not be displayed again.
          </span>
        </div>

        <div className="mt-4 space-y-2.5 rounded-2xl border border-border/80 bg-surface-muted/40 p-4 text-xs shadow-soft">
          {credentials.companyName ? (
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted">Target Company:</span>
              <span className="font-semibold text-foreground">{credentials.companyName}</span>
            </div>
          ) : null}
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted">Assigned Role:</span>
            <span className="font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full text-[11px]">
              {credentials.role}
            </span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted">Login Email:</span>
            <span className="font-mono font-medium text-foreground">{credentials.email}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Temporary Password:</span>
            <span className="font-mono font-bold text-foreground text-sm bg-surface px-3 py-1 rounded-full border border-border shadow-soft">
              {credentials.password}
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft hover:bg-primary-hover transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="size-4 text-white" />
                Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy Credentials
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-soft"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
