"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, Shield, UserCheck } from "lucide-react";
import {
  createEmployeeAccount,
  assignEmployeeRole,
  toggleEmployeeSuperAdminAction,
  type EmployeeAccountRoleKey,
} from "@/lib/employee-accounts/actions";
import { sendEmployeeInvite, createEmployeeInviteLink } from "@/lib/invitations/actions";
import type { AppRole } from "@/lib/foundation/schema";

type EmployeeAccountPanelProps = {
  employeeId: string;
  email: string | null;
  hasAccount: boolean;
  currentRoleKey?: AppRole | null;
  currentRoleName?: string | null;
  canAssignRoles?: boolean;
  canAssignOwnerRole?: boolean;
  canAssignSuperAdmin?: boolean;
  isSuperAdmin?: boolean;
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

const BASE_ROLE_OPTIONS: { value: EmployeeAccountRoleKey; label: string; description: string }[] = [
  { value: "employee", label: "Employee", description: "Standard clock-in, personal timesheets, and leave requests" },
  { value: "branch_manager", label: "Branch Manager", description: "Team & workstation timesheet reviews, approvals, and employee oversight" },
  { value: "hr_admin", label: "HR Admin", description: "Operational management of employees, leave rules, and workforce settings" },
  { value: "payroll_viewer", label: "Payroll Viewer", description: "Read-only access to payroll reports and locked timesheets" },
];

const OWNER_ROLE_OPTION: { value: EmployeeAccountRoleKey; label: string; description: string } = {
  value: "owner",
  label: "Company Owner / Admin",
  description: "Root tenant administrator with full company, user, billing, and setup control",
};

export default function EmployeeAccountPanel({
  employeeId,
  email,
  hasAccount,
  currentRoleKey,
  currentRoleName,
  canAssignRoles = true,
  canAssignOwnerRole = false,
  canAssignSuperAdmin = false,
  isSuperAdmin = false,
}: EmployeeAccountPanelProps) {
  const roleOptions = canAssignOwnerRole
    ? [OWNER_ROLE_OPTION, ...BASE_ROLE_OPTIONS]
    : BASE_ROLE_OPTIONS;

  const initialRole: EmployeeAccountRoleKey =
    (currentRoleKey as EmployeeAccountRoleKey) || "employee";

  const [provisionRoleKey, setProvisionRoleKey] = useState<EmployeeAccountRoleKey>(initialRole);
  const [assignRoleKey, setAssignRoleKey] = useState<EmployeeAccountRoleKey>(initialRole);
  const [assignFeedback, setAssignFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isAssignPending, startAssignTransition] = useTransition();

  const [isSuperAdminUser, setIsSuperAdminUser] = useState<boolean>(isSuperAdmin);
  const [superAdminFeedback, setSuperAdminFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSuperAdminPending, startSuperAdminTransition] = useTransition();

  const [state, formAction, pending] = useActionState(
    createEmployeeAccount.bind(null, employeeId, provisionRoleKey),
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

  const activeRoleLabel =
    currentRoleName ??
    (currentRoleKey
      ? roleOptions.find((o) => o.value === currentRoleKey)?.label ?? currentRoleKey
      : hasAccount
        ? "Employee"
        : "No Account");

  function getBadgeTone(roleKey?: string | null) {
    switch (roleKey) {
      case "owner":
        return "border-amber-500/40 bg-amber-500/10 text-amber-900";
      case "hr_admin":
        return "border-blue-500/40 bg-blue-500/10 text-blue-900";
      case "branch_manager":
        return "border-purple-500/40 bg-purple-500/10 text-purple-900";
      case "payroll_viewer":
        return "border-slate-500/40 bg-slate-500/10 text-slate-900";
      default:
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900";
    }
  }

  function handleAssignRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAssignFeedback(null);

    startAssignTransition(async () => {
      try {
        const result = await assignEmployeeRole(employeeId, assignRoleKey);
        if (result.ok) {
          setAssignFeedback({ ok: true, message: result.message ?? "Role updated successfully." });
        } else {
          setAssignFeedback({ ok: false, message: result.error ?? "Failed to assign role." });
        }
      } catch (err) {
        setAssignFeedback({
          ok: false,
          message: err instanceof Error ? err.message : "An unexpected error occurred while assigning role.",
        });
      }
    });
  }

  function handleToggleSuperAdmin() {
    setSuperAdminFeedback(null);
    const nextState = !isSuperAdminUser;

    startSuperAdminTransition(async () => {
      try {
        const result = await toggleEmployeeSuperAdminAction(employeeId, nextState);
        if (result.ok) {
          setIsSuperAdminUser(nextState);
          setSuperAdminFeedback({
            ok: true,
            message: result.message ?? "Super Admin status updated successfully.",
          });
        } else {
          setSuperAdminFeedback({
            ok: false,
            message: result.error ?? "Failed to update Super Admin status.",
          });
        }
      } catch (err) {
        setSuperAdminFeedback({
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred while toggling Super Admin status.",
        });
      }
    });
  }

  return (
    <section className="grid min-w-0 gap-5 rounded-xl border border-border bg-surface p-5 shadow-2xs">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-accent" />
            <h2 className="text-xl font-bold text-foreground">Account Access &amp; Role</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {hasAccount
              ? "This employee has active platform access. Authorized administrators, managers, and HR can assign or modify their system role."
              : "Create a login credentials package or send an onboarding invitation with their initial system role."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="badge badge-muted">
              {email ?? "No email saved"}
            </span>
            <span className={`badge ${hasAccount ? "badge-accent" : "badge-muted"}`}>
              {hasAccount ? "Access active" : "No account"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-bold capitalize ${getBadgeTone(
                currentRoleKey ?? (hasAccount ? "employee" : null),
              )}`}
            >
              <Shield className="size-3" />
              {activeRoleLabel}
            </span>
            {isSuperAdminUser ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                <Shield className="size-3" />
                Super Admin (Universal)
              </span>
            ) : null}
          </div>
        </div>

        {/* Action controls for employees WITHOUT an account yet */}
        {!hasAccount && email && canAssignRoles && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Initial Role</span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Shield className="size-4 shrink-0 text-muted" />
                <select
                  value={provisionRoleKey}
                  onChange={(e) => setProvisionRoleKey(e.target.value as EmployeeAccountRoleKey)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                  aria-label="Account initial role"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <form action={createEmployeeInviteLink.bind(null, employeeId, provisionRoleKey)}>
              <button
                type="submit"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted cursor-pointer"
              >
                Copy invite link
              </button>
            </form>
            <form action={sendEmployeeInvite.bind(null, employeeId, provisionRoleKey)}>
              <button
                type="submit"
                className="btn btn-primary cursor-pointer"
              >
                Send invite email
              </button>
            </form>
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-accent cursor-pointer"
              >
                {pending ? "Creating..." : "Create account"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Role Assignment Section for employees WITH an active account */}
      {hasAccount && canAssignRoles && (
        <div className="rounded-lg border border-border/80 bg-background/60 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <UserCheck className="size-4 text-accent" />
                Assign Role to Employee
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                Update permissions for this user across ClockWise People. Changes apply immediately.
              </p>
            </div>

            <form onSubmit={handleAssignRoleSubmit} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Shield className="size-4 shrink-0 text-muted" />
                <select
                  value={assignRoleKey}
                  onChange={(e) => setAssignRoleKey(e.target.value as EmployeeAccountRoleKey)}
                  className="h-9 min-w-[170px] bg-transparent text-sm text-foreground outline-none cursor-pointer"
                  aria-label="Target employee role"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isAssignPending || assignRoleKey === currentRoleKey}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isAssignPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="size-3.5" />
                    <span>Assign Role</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Feedback messages */}
          {assignFeedback && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                assignFeedback.ok
                  ? "border-emerald-500/30 bg-emerald-50 text-emerald-950"
                  : "border-rose-500/30 bg-rose-50 text-rose-950"
              }`}
            >
              {assignFeedback.ok ? <Check className="size-4 text-emerald-600 shrink-0" /> : null}
              <span>{assignFeedback.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Super Admin Universal Privilege Management */}
      {hasAccount && canAssignSuperAdmin && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Shield className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Super Administrator Privileges</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isSuperAdminUser
                      ? "bg-primary/20 text-primary"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  {isSuperAdminUser ? "Active (Universal Tenant Access)" : "Standard User"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Universal company switching, cross-tenant provisioning, and platform-wide sysadmin access.
              </p>
            </div>

            <button
              type="button"
              disabled={isSuperAdminPending}
              onClick={handleToggleSuperAdmin}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-bold transition-all cursor-pointer ${
                isSuperAdminUser
                  ? "border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
                  : "bg-primary text-white shadow-xs hover:bg-primary/90"
              }`}
            >
              {isSuperAdminPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : isSuperAdminUser ? (
                <span>Revoke Super Admin</span>
              ) : (
                <>
                  <Shield className="size-3.5" />
                  <span>Grant Super Admin</span>
                </>
              )}
            </button>
          </div>

          {superAdminFeedback && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                superAdminFeedback.ok
                  ? "border-emerald-500/30 bg-emerald-50 text-emerald-950"
                  : "border-rose-500/30 bg-rose-50 text-rose-950"
              }`}
            >
              {superAdminFeedback.ok ? <Check className="size-4 text-emerald-600 shrink-0" /> : null}
              <span>{superAdminFeedback.message}</span>
            </div>
          )}
        </div>
      )}

      {!email && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Add an email address before creating an account or sending an invite.
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </div>
      )}

      {state.credentials && (
        <div className="rounded-lg border border-accent/20 bg-accent/10 p-4">
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
                className="input"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Temporary password
              <input
                readOnly
                value={state.credentials.password}
                onFocus={(event) => event.currentTarget.select()}
                className="input font-mono"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={copyCredentials}
            className="btn btn-primary mt-3 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-4" />
                <span>Copy credentials</span>
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
