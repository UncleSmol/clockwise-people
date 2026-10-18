"use client";

import { useState } from "react";

type InviteLinkPanelProps = {
  inviteUrl: string;
};

export default function InviteLinkPanel({ inviteUrl }: InviteLinkPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-soft">
      <p className="text-sm font-bold text-foreground">Manual invite link</p>
      <p className="mt-1 text-xs text-muted">
        Copy this link and send it to the employee through your preferred channel.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 flex-1 rounded-full border border-border/80 bg-background px-4 font-mono text-xs text-foreground outline-none focus:border-primary shadow-xs"
        />
        <button
          type="button"
          onClick={copyInviteUrl}
          className="inline-flex min-h-[44px] h-11 items-center justify-center rounded-full bg-primary px-6 text-xs font-bold text-white shadow-soft hover:brightness-105 cursor-pointer transition-all"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
