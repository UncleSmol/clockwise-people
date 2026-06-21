"use client";

import { useActionState, useState } from "react";
import { createEmployeeAccount } from "@/lib/employee-accounts/actions";

type EmployeeAccountPanelProps = {
  employeeId: string;
  email: string | null;
  hasAccount: boolean;
};

type ActionState = {
  credentials?: {
    email: string;
    password: string;
  };
  error?: string;
  message?: string;
};

const initialState: ActionState = {};

export default function EmployeeAccountPanel({
  employeeId,
  email,
  hasAccount,
}: EmployeeAccountPanelProps) {
  const [state, formAction, pending] = useActionState(
    createEmployeeAccount.bind(null, employeeId),
    initialState,
  );
  const [copied, setCopied] = useState(false);

  const credentialText = state.credentials
    ? `ClockWise People login\nEmail: ${state.credentials.email}\nTemporary password: ${state.credentials.password}\n\nSign in and change this password from your account settings.`
    : "";

  async function copyCredentials() {
    if (!credentialText) return;

    await navigator.clipboard.writeText(credentialText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="premium-card rounded-md p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Account access</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Create a login for this employee. The temporary password is shown once, then the employee can change it after signing in.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-foreground">
              {email ?? "No email saved"}
            </span>
            <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-foreground">
              {hasAccount ? "Access active" : "No account"}
            </span>
          </div>
        </div>

        {!hasAccount && email && (
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-60"
            >
              {pending ? "Creating..." : "Create account"}
            </button>
          </form>
        )}
      </div>

      {!email && (
        <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Add an email address before creating an account.
        </div>
      )}

      {state.error && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </div>
      )}

      {state.credentials && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            {state.message ?? "Employee account created."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Email
              <input
                readOnly
                value={state.credentials.email}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none"
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Temporary password
              <input
                readOnly
                value={state.credentials.password}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none"
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={copyCredentials}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {copied ? "Copied" : "Copy credentials"}
          </button>
        </div>
      )}
    </section>
  );
}
