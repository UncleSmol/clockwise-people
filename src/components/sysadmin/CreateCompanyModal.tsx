"use client";

import { useState } from "react";
import { Building2, Globe2, Loader2, MapPin, X } from "lucide-react";
import { createCompanyBySysAdminAction } from "@/lib/sysadmin/actions";
import type { SysAdminCreateCompanyInput } from "@/lib/sysadmin/schema";

type CreateCompanyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (companyId: string) => void;
};

export default function CreateCompanyModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCompanyModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<SysAdminCreateCompanyInput>({
    name: "",
    country: "South Africa",
    timezone: "Africa/Johannesburg",
    payroll_cycle: "monthly",
    registration_number: "",
    trading_name: "",
    industry: "",
    contact_email: "",
    contact_phone: "",
    workstation_name: "Headquarters",
    workstation_address: "",
    workstation_lat: -26.2041,
    workstation_lng: 28.0473,
    workstation_radius: 150,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await createCompanyBySysAdminAction(formData);
      if (!res.ok) {
        setErrorMessage(res.message);
        setLoading(false);
        return;
      }

      onSuccess(res.data?.companyId ?? "");
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create company.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
          aria-label="Close create company modal"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Create New Company</h2>
            <p className="text-xs text-muted">
              Creates a dedicated tenant with isolated workspace, roles, and geofenced workstation.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs text-danger font-medium">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Company Core Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-3">
              <Globe2 className="size-3.5 text-primary" />
              Company Identity & Jurisdiction
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Company Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Trading Name</label>
                <input
                  type="text"
                  placeholder="Optional trading name"
                  value={formData.trading_name ?? ""}
                  onChange={(e) => setFormData({ ...formData, trading_name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Registration Number</label>
                <input
                  type="text"
                  placeholder="e.g. 2026/123456/07"
                  value={formData.registration_number ?? ""}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Country</label>
                <input
                  type="text"
                  required
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Payroll Cycle</label>
                <select
                  value={formData.payroll_cycle}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payroll_cycle: e.target.value as "monthly" | "weekly" | "bi-weekly",
                    })
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Contact Email</label>
                <input
                  type="email"
                  placeholder="admin@company.com"
                  value={formData.contact_email ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Technology, Retail, Manufacturing"
                  value={formData.industry ?? ""}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Default Workstation */}
          <div className="pt-2 border-t border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-3">
              <MapPin className="size-3.5 text-primary" />
              Default Workstation & Geofence
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1">Workstation Name</label>
                <input
                  type="text"
                  required
                  placeholder="Headquarters"
                  value={formData.workstation_name}
                  onChange={(e) => setFormData({ ...formData, workstation_name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Radius (Meters)</label>
                <input
                  type="number"
                  min={25}
                  max={5000}
                  value={formData.workstation_radius}
                  onChange={(e) =>
                    setFormData({ ...formData, workstation_radius: Number(e.target.value) || 150 })
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-foreground mb-1">Street Address</label>
                <input
                  type="text"
                  placeholder="e.g. 100 Main St, Johannesburg"
                  value={formData.workstation_address ?? ""}
                  onChange={(e) => setFormData({ ...formData, workstation_address: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
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
              disabled={loading || !formData.name.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating Company...
                </>
              ) : (
                "Create Company"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
