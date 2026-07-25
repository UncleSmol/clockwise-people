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
    <div className="mt-4 rounded-lg border border-accent/20 bg-accent/8 p-4">
      <p className="text-sm font-semibold text-foreground">Manual invite link</p>
      <p className="mt-1 text-sm text-muted">
        Copy this link and send it to the employee through your preferred channel.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          onClick={copyInviteUrl}
          className="btn btn-primary"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
