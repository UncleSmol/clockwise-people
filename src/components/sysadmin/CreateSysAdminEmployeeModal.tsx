"use client";

import { useMemo, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, UserPlus, X } from "lucide-react";
import { createSysAdminEmployeeAction } from "@/lib/sysadmin/actions";
import type { SysAdminCreateEmployeeInput } from "@/lib/sysadmin/schema";
import type { AppRole } from "@/lib/foundation/schema";

type CreateSysAdminEmployeeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentials?: {
    email: string;
    password: string;
    role: string;
    companyName?: string;
  }) => void;
  companies: { id: string; name: string }[];
  initialCompanyId?: string;
  workstations: { id: string; company_id: string; name: string }[];
  schedules: { id: string; company_id: string; name: string }[];
};

const ROLES_INFO: { key: AppRole; title: string; description: string }[] = [
  {
    key: "employee",
    title: "Employee",
    description: "Self-service time clock, leave submissions, and personal timesheets.",
  },
  {
    key: "hr_admin",
    title: "HR Administrator",
    description: "Full management of company employees, leave approvals, and timesheets.",
  },
  {
    key: "branch_manager",
    title: "Branch / Workstation Manager",
    description: "Team approvals and operational oversight for assigned workstation.",
  },
  {
    key: "payroll_viewer",
    title: "Payroll Viewer",
    description: "Read-only access to payroll-ready periods, summaries, and compliance reports.",
  },
  {
    key: "owner",
    title: "Company Owner",
    description: "Primary tenant administrator with full control over setup and billing.",
  },
];

export default function CreateSysAdminEmployeeModal({
  isOpen,
  onClose,
  onSuccess,
  companies,
  initialCompanyId,
  workstations,
  schedules,
}: CreateSysAdminEmployeeModalProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    initialCompanyId || companies[0]?.id || "",
  );

  const filteredWorkstations = useMemo(
    () => workstations.filter((w) => w.company_id === selectedCompanyId),
    [workstations, selectedCompanyId],
  );

  const filteredSchedules = useMemo(
    () => schedules.filter((s) => s.company_id === selectedCompanyId),
    [schedules, selectedCompanyId],
  );

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<SysAdminCreateEmployeeInput>({
    company_id: initialCompanyId || companies[0]?.id || "",
    full_name: "",
    email: "",
    phone_number: "",
    job_title: "",
    workstation_id: filteredWorkstations[0]?.id || "",
    work_schedule_id: filteredSchedules[0]?.id || "",
    employment_type: "full_time",
    employment_status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    role_key: "employee",
    create_login: true,
    temporary_password: "",
  });

  if (!isOpen) return null;

  const handleCompanyChange = (newCompanyId: string) => {
    setSelectedCompanyId(newCompanyId);
    const newWs = workstations.filter((w) => w.company_id === newCompanyId);
    const newSched = schedules.filter((s) => s.company_id === newCompanyId);

    setFormData((prev) => ({
      ...prev,
      company_id: newCompanyId,
      workstation_id: newWs[0]?.id || "",
      work_schedule_id: newSched[0]?.id || "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const payload: SysAdminCreateEmployeeInput = {
        ...formData,
        company_id: selectedCompanyId,
        workstation_id: formData.workstation_id || filteredWorkstations[0]?.id || "",
      };

      const res = await createSysAdminEmployeeAction(payload);
      if (!res.ok) {
        setErrorMessage(res.message);
        setLoading(false);
        return;
      }

      onSuccess(res.credentials);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to add employee.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
          aria-label="Close add employee modal"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Add Employee & Assign Role</h2>
            <p className="text-xs text-muted">
              Creates employee HR record, configures tenant role, and provisions secure login credentials.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs text-danger font-medium">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Target Company Selector */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
            <label className="block text-xs font-bold text-primary mb-1 uppercase tracking-wider">
              Target Company
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Core Employee Details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Full Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Work Email <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="john.doe@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Job Title</label>
              <input
                type="text"
                placeholder="e.g. Software Engineer"
                value={formData.job_title ?? ""}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Phone Number</label>
              <input
                type="tel"
                placeholder="+27..."
                value={formData.phone_number ?? ""}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Assigned Workstation <span className="text-danger">*</span>
              </label>
              {filteredWorkstations.length > 0 ? (
                <select
                  value={formData.workstation_id}
                  onChange={(e) => setFormData({ ...formData, workstation_id: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {filteredWorkstations.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
                  No workstations found for this company.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Work Schedule</label>
              <select
                value={formData.work_schedule_id ?? ""}
                onChange={(e) => setFormData({ ...formData, work_schedule_id: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Default Schedule</option>
                {filteredSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Employment Type</label>
              <select
                value={formData.employment_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    employment_type: e.target.value as "full_time" | "part_time" | "contract" | "intern",
                  })
                }
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Start Date</label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="pt-2 border-t border-border">
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Assigned Tenant Role
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES_INFO.map((role) => (
                <label
                  key={role.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                    formData.role_key === role.key
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="role_key"
                    value={role.key}
                    checked={formData.role_key === role.key}
                    onChange={() => setFormData({ ...formData, role_key: role.key })}
                    className="mt-0.5 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="text-xs font-bold text-foreground">{role.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted leading-relaxed">
                      {role.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Login Provisioning Toggle */}
          <div className="pt-2 border-t border-border">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.create_login}
                onChange={(e) => setFormData({ ...formData, create_login: e.target.checked })}
                className="size-4 rounded text-primary focus:ring-primary"
              />
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-primary" />
                  Provision Supabase Login Account
                </div>
                <div className="text-[11px] text-muted">
                  Generates temporary login credentials and assigns this role immediately.
                </div>
              </div>
            </label>

            {formData.create_login ? (
              <div className="mt-3 pl-7">
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Custom Password (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to generate secure 14-character password"
                  value={formData.temporary_password ?? ""}
                  onChange={(e) => setFormData({ ...formData, temporary_password: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ) : null}
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.full_name.trim() || !formData.email.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding Employee...
                </>
              ) : (
                "Add Employee & Provision"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
