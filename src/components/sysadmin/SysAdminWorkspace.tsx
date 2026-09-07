"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Globe,
  Lock,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import CreateCompanyModal from "./CreateCompanyModal";
import CreateSysAdminEmployeeModal from "./CreateSysAdminEmployeeModal";
import CredentialsRevealModal from "./CredentialsRevealModal";
import { switchActiveCompanyAction } from "@/lib/sysadmin/actions";
import type { SysAdminCompanyOverview } from "@/lib/sysadmin/schema";

type SysAdminWorkspaceProps = {
  activeCompanyId: string;
  companies: SysAdminCompanyOverview[];
  workstations: { id: string; company_id: string; name: string }[];
  schedules: { id: string; company_id: string; name: string }[];
};

export default function SysAdminWorkspace({
  activeCompanyId,
  companies,
  workstations,
  schedules,
}: SysAdminWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [selectedTargetCompanyId, setSelectedTargetCompanyId] = useState<string>(activeCompanyId);

  const [revealedCredentials, setRevealedCredentials] = useState<{
    email: string;
    password: string;
    role: string;
    companyName?: string;
  } | null>(null);

  // Total summary statistics
  const totalEmployees = useMemo(
    () => companies.reduce((acc, c) => acc + c.employee_count, 0),
    [companies],
  );
  const totalWorkstations = useMemo(
    () => companies.reduce((acc, c) => acc + c.workstation_count, 0),
    [companies],
  );

  // Filtered companies
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const query = searchQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.trading_name && c.trading_name.toLowerCase().includes(query)) ||
        (c.industry && c.industry.toLowerCase().includes(query)) ||
        c.country.toLowerCase().includes(query),
    );
  }, [companies, searchQuery]);

  const handleSwitchCompany = (companyId: string) => {
    startTransition(async () => {
      await switchActiveCompanyAction(companyId);
      router.refresh();
    });
  };

  const openAddEmployeeForCompany = (companyId: string) => {
    setSelectedTargetCompanyId(companyId);
    setIsAddEmployeeOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-2xs sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-sm">
              <ShieldCheck className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">SysAdmin Management Console</h1>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  Tenant Isolation Active
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Create new tenant companies, assign employees with RBAC roles, and enforce Row-Level Security boundaries.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreateCompanyOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary/90 sm:flex-none"
            >
              <Plus className="size-4" />
              New Company
            </button>
            <button
              type="button"
              onClick={() => openAddEmployeeForCompany(activeCompanyId)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted sm:flex-none"
            >
              <UserPlus className="size-4 text-primary" />
              Add Employee
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">Total Companies</span>
              <Building2 className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-foreground">{companies.length}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">Active workspace tenants</div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">Total Employees</span>
              <Users className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-foreground">{totalEmployees}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">Across all tenants</div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">Active Workstations</span>
              <MapPin className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-foreground">{totalWorkstations}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">Geofenced clock locations</div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">RLS Security Policy</span>
              <Lock className="size-4 shrink-0 text-emerald-500" />
            </div>
            <div className="mt-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              Strict Multi-Tenancy
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted">Zero cross-company visibility</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search companies by name, country, industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="text-xs text-muted">
            Showing <strong className="text-foreground">{filteredCompanies.length}</strong> of{" "}
            <strong className="text-foreground">{companies.length}</strong> companies
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((comp) => {
            const isActiveCompany = comp.id === activeCompanyId;

            return (
              <div
                key={comp.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${isActiveCompany
                    ? "border-primary/40 bg-primary/[0.03] shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-surface shadow-2xs hover:border-border/80"
                  }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${isActiveCompany
                            ? "bg-primary text-white"
                            : "border border-border bg-surface-muted text-foreground"
                          }`}
                      >
                        {comp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-bold text-foreground">{comp.name}</h2>
                          {isActiveCompany ? (
                            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Active Context
                            </span>
                          ) : null}
                        </div>
                        {comp.trading_name ? (
                          <div className="truncate text-xs text-muted">Trading as: {comp.trading_name}</div>
                        ) : null}
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Active
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-surface-muted/60 p-3">
                      <span className="text-[11px] text-muted">Employees</span>
                      <div className="mt-1 flex items-center gap-1.5 font-bold text-foreground">
                        <Users className="size-3.5 text-primary" />
                        <span className="truncate">{comp.employee_count} enrolled</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-surface-muted/60 p-3">
                      <span className="text-[11px] text-muted">Workstations</span>
                      <div className="mt-1 flex items-center gap-1.5 font-bold text-foreground">
                        <MapPin className="size-3.5 text-primary" />
                        <span className="truncate">{comp.workstation_count} geofenced</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <Globe className="size-3 shrink-0 text-muted" />
                      <span className="truncate">{comp.country} ({comp.timezone})</span>
                    </span>
                    <span>
                      Cycle: <strong className="capitalize text-foreground">{comp.payroll_cycle}</strong>
                    </span>
                    {comp.registration_number ? (
                      <span>
                        Reg: <strong className="text-foreground">{comp.registration_number}</strong>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                  <button
                    type="button"
                    onClick={() => openAddEmployeeForCompany(comp.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <UserPlus className="size-3.5" />
                    Add Employee
                  </button>

                  {!isActiveCompany ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSwitchCompany(comp.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                    >
                      <span>Switch Context</span>
                      <ArrowRight className="size-3.5 text-muted" />
                    </button>
                  ) : (
                    <span className="flex flex-1 items-center justify-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> Current Workspace
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredCompanies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted sm:p-12">
            <Building2 className="mx-auto mb-3 size-10 text-muted/60" />
            <p className="text-sm font-medium">No companies match your search.</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-surface-muted/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div className="space-y-1.5 text-xs">
            <h3 className="font-bold text-foreground">Airtight Multi-Tenancy Architecture</h3>
            <p className="leading-relaxed text-muted">
              Every table in the database is protected by PostgreSQL <strong>Row-Level Security (RLS)</strong>.
              When an employee logs in, the security functions <code>public.is_company_member(company_id)</code> and{" "}
              <code>public.current_user_company_ids()</code> automatically filter all queries to their assigned company.
              Employees cannot query, view, or modify users, timesheets, or leave data from other companies.
              Only users flagged with <code>is_super_admin = true</code> possess cross-tenant provisioning capabilities.
            </p>
          </div>
        </div>
      </div>

      <CreateCompanyModal
        isOpen={isCreateCompanyOpen}
        onClose={() => setIsCreateCompanyOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <CreateSysAdminEmployeeModal
        isOpen={isAddEmployeeOpen}
        onClose={() => setIsAddEmployeeOpen(false)}
        onSuccess={(creds) => {
          router.refresh();
          if (creds) {
            setRevealedCredentials(creds);
          }
        }}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        initialCompanyId={selectedTargetCompanyId}
        workstations={workstations}
        schedules={schedules}
      />

      {revealedCredentials ? (
        <CredentialsRevealModal
          credentials={revealedCredentials}
          onClose={() => setRevealedCredentials(null)}
        />
      ) : null}
    </div>
  );
}
