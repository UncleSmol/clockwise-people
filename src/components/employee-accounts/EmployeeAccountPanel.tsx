"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Shield, Sparkles, UserCheck } from "lucide-react";
import {
  createEmployeeAccount,
  assignEmployeeRole,
  toggleEmployeeSuperAdminAction,
  setEmployeePasswordBySuperAdminAction,
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
  isViewerSuperAdmin?: boolean;
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
  isViewerSuperAdmin = false,
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

  // Super Admin Password Management State
  const [targetPassword, setTargetPassword] = useState("");
  const [showTargetPassword, setShowTargetPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    ok: boolean;
    message: string;
    credentials?: { email: string; password: string };
  } | null>(null);
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [copiedPasswordCreds, setCopiedPasswordCreds] = useState(false);

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
        return "border-slate-700 bg-slate-900 text-white";
      case "branch_manager":
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900";
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

  function handleGeneratePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const array = new Uint8Array(14);
    window.crypto.getRandomValues(array);
    const generated = Array.from(array, (byte) => chars[byte % chars.length]).join("");
    setTargetPassword(generated);
    setShowTargetPassword(true);
    setPasswordFeedback(null);
  }

  function handleSetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPassword = targetPassword.trim();
    if (!cleanPassword || cleanPassword.length < 8) return;
    setPasswordFeedback(null);

    startPasswordTransition(async () => {
      try {
        const result = await setEmployeePasswordBySuperAdminAction(
          employeeId,
          cleanPassword,
          provisionRoleKey,
        );

        if (result.ok) {
          setPasswordFeedback({
            ok: true,
            message: result.message ?? "Password updated successfully in Supabase Auth.",
            credentials: result.credentials,
          });
        } else {
          setPasswordFeedback({
            ok: false,
            message: result.error ?? "Failed to set user password.",
          });
        }
      } catch (err) {
        setPasswordFeedback({
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred while setting the password.",
        });
      }
    });
  }

  async function copyPasswordCredentials(creds: { email: string; password: string }) {
    const text = `ClockWise People Credentials\nEmail: ${creds.email}\nPassword: ${creds.password}\n\nSign in at: ${typeof window !== "undefined" ? window.location.origin : ""}/login`;
    await navigator.clipboard.writeText(text);
    setCopiedPasswordCreds(true);
    window.setTimeout(() => setCopiedPasswordCreds(false), 2000);
  }

  return (
    <section className="grid min-w-0 gap-5 rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-soft">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <h2 className="text-xl font-extrabold text-foreground">Account Access &amp; Role</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {hasAccount
              ? "This employee has active platform access. Authorized administrators, managers, and HR can assign or modify their system role."
              : "Create a login credentials package or send an onboarding invitation with their initial system role."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="badge badge-muted rounded-full px-3 py-1 text-xs">
              {email ?? "No email saved"}
            </span>
            <span className={`badge rounded-full px-3 py-1 text-xs ${hasAccount ? "badge-accent" : "badge-muted"}`}>
              {hasAccount ? "Access active" : "No account"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold capitalize ${getBadgeTone(
                currentRoleKey ?? (hasAccount ? "employee" : null),
              )}`}
            >
              <Shield className="size-3" />
              {activeRoleLabel}
            </span>
            {isSuperAdminUser ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
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
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Initial Role</span>
              <span className="flex items-center gap-2 rounded-full border border-border/80 bg-background px-4">
                <Shield className="size-4 shrink-0 text-muted" />
                <select
                  value={provisionRoleKey}
                  onChange={(e) => setProvisionRoleKey(e.target.value as EmployeeAccountRoleKey)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none cursor-pointer"
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
                className="inline-flex min-h-[44px] h-11 items-center justify-center rounded-full border border-border/80 bg-background px-4 text-xs font-bold text-foreground hover:bg-surface-muted shadow-xs transition-colors cursor-pointer"
              >
                Copy invite link
              </button>
            </form>
            <form action={sendEmployeeInvite.bind(null, employeeId, provisionRoleKey)}>
              <button
                type="submit"
                className="inline-flex min-h-[44px] h-11 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold text-white shadow-soft hover:brightness-105 transition-all cursor-pointer"
              >
                Send invite email
              </button>
            </form>
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-[44px] h-11 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold text-white shadow-soft hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
              >
                {pending ? "Creating..." : "Create account"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Role Assignment Section for employees WITH an active account */}
      {hasAccount && canAssignRoles && (
        <div className="rounded-2xl border border-border/80 bg-background/60 p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                <UserCheck className="size-4 text-primary" />
                Assign Role to Employee
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                Update permissions for this user across ClockWise People. Changes apply immediately.
              </p>
            </div>

            <form onSubmit={handleAssignRoleSubmit} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background px-4">
                <Shield className="size-4 shrink-0 text-muted" />
                <select
                  value={assignRoleKey}
                  onChange={(e) => setAssignRoleKey(e.target.value as EmployeeAccountRoleKey)}
                  className="h-11 min-w-[170px] bg-transparent text-sm text-foreground outline-none cursor-pointer"
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
                className="inline-flex min-h-[44px] h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-6 text-xs font-bold text-white shadow-soft hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
              className={`mt-3.5 rounded-full border px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
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
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Shield className="size-4 text-primary" />
                <h3 className="text-sm font-extrabold text-foreground">Super Administrator Privileges</h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
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
              className={`inline-flex min-h-[44px] h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-xs font-bold transition-all cursor-pointer ${
                isSuperAdminUser
                  ? "border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
                  : "bg-primary text-white shadow-soft hover:brightness-105"
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
              className={`mt-3.5 rounded-full border px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
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

      {/* Super Admin Direct Password Management */}
      {isViewerSuperAdmin && email && (
        <div id="password-panel" className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-5 sm:p-6 shadow-soft">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                    <KeyRound className="size-4" />
                  </div>
                  <h3 className="text-sm font-extrabold text-foreground">
                    Super Admin Password Management
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                    <Shield className="size-2.5" />
                    Super Admin Tool
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  {hasAccount
                    ? "Directly change and override this user's password in Supabase Auth. The new credentials take effect immediately without requiring email confirmation."
                    : "Create this employee's account and set their initial password directly in Supabase Auth."}
                </p>
              </div>
            </div>

            <form onSubmit={handleSetPasswordSubmit} className="mt-1 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <input
                    type={showTargetPassword ? "text" : "password"}
                    value={targetPassword}
                    onChange={(e) => setTargetPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    autoComplete="new-password"
                    disabled={isPasswordPending}
                    className="h-11 w-full rounded-full border border-border/80 bg-background pl-4 pr-11 text-xs font-mono font-medium text-foreground outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTargetPassword(!showTargetPassword)}
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-pointer transition-colors"
                    aria-label={showTargetPassword ? "Hide password" : "Show password"}
                  >
                    {showTargetPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  disabled={isPasswordPending}
                  className="inline-flex min-h-[44px] h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border/80 bg-background px-4 text-xs font-bold text-foreground hover:bg-surface-muted shadow-xs transition-colors cursor-pointer"
                  title="Generate random secure password"
                >
                  <Sparkles className="size-3.5 text-amber-600" />
                  <span>Generate Password</span>
                </button>

                <button
                  type="submit"
                  disabled={isPasswordPending || targetPassword.trim().length < 8}
                  className="inline-flex min-h-[44px] h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-amber-600 px-6 text-xs font-bold text-white shadow-soft hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isPasswordPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Setting Password...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-3.5" />
                      <span>{hasAccount ? "Set New Password" : "Create with Password"}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-muted">
                <span>Must be at least 8 characters. Directly synchronized to Supabase Auth.</span>
                {targetPassword ? (
                  <span className={targetPassword.length >= 8 ? "text-emerald-600 font-semibold" : "text-amber-600"}>
                    {targetPassword.length} characters
                  </span>
                ) : null}
              </div>
            </form>

            {/* Feedback & Copy Credentials Area */}
            {passwordFeedback && (
              <div
                className={`rounded-2xl border p-4 text-xs font-medium ${
                  passwordFeedback.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-950"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {passwordFeedback.ok ? (
                    <Check className="size-4 text-emerald-600 shrink-0" />
                  ) : null}
                  <span>{passwordFeedback.message}</span>
                </div>

                {passwordFeedback.credentials && (
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-background p-3.5 shadow-xs">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      Active Credentials for {email}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <span className="text-[10px] text-muted">Email:</span>
                        <p className="font-mono text-xs font-semibold text-foreground select-all">
                          {passwordFeedback.credentials.email}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted">Password:</span>
                        <p className="font-mono text-xs font-semibold text-foreground select-all">
                          {passwordFeedback.credentials.password}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyPasswordCredentials(passwordFeedback.credentials!)}
                        className="inline-flex min-h-[36px] h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-white shadow-soft hover:brightness-105 cursor-pointer transition-all"
                      >
                        {copiedPasswordCreds ? (
                          <>
                            <Check className="size-3.5" />
                            <span>Copied to Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            <span>Copy Login Credentials</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPasswordFeedback(null);
                          setTargetPassword("");
                        }}
                        className="inline-flex min-h-[36px] h-9 items-center justify-center rounded-full border border-border px-3 text-xs font-medium text-muted hover:text-foreground cursor-pointer transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!email && (
        <div className="rounded-2xl border border-warning/20 bg-warning/10 px-5 py-3 text-sm font-semibold text-warning">
          Add an email address before creating an account or sending an invite.
        </div>
      )}

      {state.error && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger">
          {state.error}
        </div>
      )}

      {state.credentials && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-soft">
          <p className="text-sm font-bold text-foreground">
            {state.message ?? "Employee account created."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold text-foreground">
              Email
              <input
                readOnly
                value={state.credentials.email}
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none shadow-xs"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-foreground">
              Temporary password
              <input
                readOnly
                value={state.credentials.password}
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none font-mono shadow-xs"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={copyCredentials}
            className="inline-flex min-h-[44px] h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-xs font-bold text-white shadow-soft hover:brightness-105 mt-4 cursor-pointer transition-all"
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
