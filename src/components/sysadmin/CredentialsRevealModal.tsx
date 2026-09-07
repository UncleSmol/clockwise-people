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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
          aria-label="Close credentials modal"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Employee Login Credentials</h3>
            <p className="text-xs text-muted">Account provisioned with tenant-scoped role.</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning flex items-start gap-2.5">
          <ShieldAlert className="size-4 shrink-0 mt-0.5 text-warning" />
          <span>
            Copy and securely deliver these credentials now. The temporary password will not be displayed again.
          </span>
        </div>

        <div className="mt-4 space-y-2.5 rounded-xl border border-border bg-surface-muted p-4 text-xs">
          {credentials.companyName ? (
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted">Target Company:</span>
              <span className="font-semibold text-foreground">{credentials.companyName}</span>
            </div>
          ) : null}
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted">Assigned Role:</span>
            <span className="font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md text-[11px]">
              {credentials.role}
            </span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted">Login Email:</span>
            <span className="font-mono font-medium text-foreground">{credentials.email}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Temporary Password:</span>
            <span className="font-mono font-bold text-foreground text-sm bg-surface px-2 py-1 rounded-md border border-border">
              {credentials.password}
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-primary/90 transition-colors"
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
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
