"use client";

import { useActionState, useState } from "react";
import { createEmployeeAccount } from "@/lib/employee-accounts/actions";
import { sendEmployeeInvite, createEmployeeInviteLink } from "@/lib/invitations/actions";

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

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "payroll_viewer", label: "Payroll Viewer" },
];

export default function EmployeeAccountPanel({
  employeeId,
  email,
  hasAccount,
}: EmployeeAccountPanelProps) {
  const [roleKey, setRoleKey] = useState<"owner" | "hr_admin" | "branch_manager" | "payroll_viewer" | "employee">("employee");
  const [state, formAction, pending] = useActionState(
    createEmployeeAccount.bind(null, employeeId, roleKey),
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

  const roleLabel = ROLE_OPTIONS.find((o) => o.value === roleKey)?.label ?? roleKey;

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-xl font-bold text-foreground">Account access</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Create a login for this employee or send them an invite to set up their own account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="badge badge-muted">
              {email ?? "No email saved"}
            </span>
            <span className="badge badge-muted">
              {hasAccount ? "Access active" : "No account"}
            </span>
            <span className="badge badge-accent capitalize">{roleLabel}</span>
          </div>
        </div>

        {!hasAccount && email && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value as "owner" | "hr_admin" | "branch_manager" | "payroll_viewer" | "employee")}
              className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              aria-label="Account role"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <form action={createEmployeeInviteLink.bind(null, employeeId, roleKey)}>
              <button
                type="submit"
                className="btn btn-ghost text-sm"
              >
                Copy invite link
              </button>
            </form>
            <form action={sendEmployeeInvite.bind(null, employeeId, roleKey)}>
              <button
                type="submit"
                className="btn btn-primary"
              >
                Send invite email
              </button>
            </form>
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-accent"
              >
                {pending ? "Creating..." : "Create account"}
              </button>
            </form>
          </div>
        )}
      </div>

      {!email && (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning/8 px-4 py-3 text-sm font-medium text-warning">
          Add an email address before creating an account or sending an invite.
        </div>
      )}

      {state.error && (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </div>
      )}

      {state.credentials && (
        <div className="mt-4 rounded-lg border border-accent/20 bg-accent/8 p-4">
          <p className="text-sm font-semibold text-foreground">
            {state.message ?? "Employee account created."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Email
              <input
                readOnly
                value={state.credentials.email}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Temporary password
              <input
                readOnly
                value={state.credentials.password}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={copyCredentials}
            className="btn btn-primary mt-3"
          >
            {copied ? "Copied" : "Copy credentials"}
          </button>
        </div>
      )}
    </section>
  );
}
