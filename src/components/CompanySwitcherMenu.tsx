"use client";

import { Building2, Check, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { switchActiveCompanyAction } from "@/lib/sysadmin/actions";

export type CompanySwitcherItem = {
  id: string;
  name: string;
  trading_name?: string | null;
  logo_url?: string | null;
};

type CompanySwitcherMenuProps = {
  companyId: string;
  currentCompanyName: string;
  companies: CompanySwitcherItem[];
};

export default function CompanySwitcherMenu({
  companyId,
  currentCompanyName,
  companies,
}: CompanySwitcherMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetSwitchingId, setTargetSwitchingId] = useState<string | null>(null);
  const [isSwitching, startSwitchTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.trading_name && c.trading_name.toLowerCase().includes(q)),
    );
  }, [companies, searchQuery]);

  const handleCompanySwitch = useCallback(
    (targetId: string) => {
      if (!targetId || targetId === companyId || isSwitching) return;
      setTargetSwitchingId(targetId);
      startSwitchTransition(async () => {
        try {
          await switchActiveCompanyAction(targetId);
          setOpen(false);
          router.refresh();
        } catch (err) {
          console.error("Failed to switch company:", err);
        } finally {
          setTargetSwitchingId(null);
        }
      });
    },
    [companyId, isSwitching, router],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={open}
        aria-label="SuperAdmin company switcher"
        title={`SuperAdmin Switcher · Current: ${currentCompanyName}. Click to switch.`}
        className={`relative grid size-8 place-items-center sm:size-10 rounded-full border border-red-950 bg-[#8b0000] text-white shadow-md transition-all cursor-pointer hover:bg-[#6e0000] hover:border-black hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-800/50 ${open
          ? "ring-2 ring-red-800 ring-offset-2 ring-offset-background bg-[#6e0000]"
          : ""
          }`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Building2 className="size-4 text-white" />
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-border/80 bg-surface p-0 shadow-soft sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[320px]">
          {/* Header */}
          <div className="border-b border-border/70 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[#8b0000] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                    SuperAdmin
                  </span>
                  <p className="font-bold text-foreground text-xs truncate">Tenant Switcher</p>
                </div>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  Active: <span className="font-semibold text-foreground">{currentCompanyName}</span>
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-muted text-muted border border-border px-2.5 py-0.5 text-[10px] font-bold">
                {companies.length} {companies.length === 1 ? "Company" : "Companies"}
              </span>
            </div>

            {companies.length > 3 ? (
              <div className="relative mt-2.5 flex items-center">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted shrink-0 z-10" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search companies..."
                  style={{ paddingLeft: "2.5rem", paddingRight: "2rem" }}
                  className="w-full rounded-full border border-border bg-background py-2 text-xs text-foreground placeholder:text-muted/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs"
                  autoFocus
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-muted hover:text-foreground hover:bg-surface-muted transition-colors z-10"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Companies List */}
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto sm:max-h-72 p-2 space-y-1">
            {filteredCompanies.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted">
                No company matches &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredCompanies.map((company) => {
                const isActive = company.id === companyId;
                const isPendingSwitch = isSwitching && targetSwitchingId === company.id;

                return (
                  <button
                    key={company.id}
                    type="button"
                    disabled={isSwitching}
                    onClick={() => handleCompanySwitch(company.id)}
                    className={`group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-all cursor-pointer ${isActive
                      ? "bg-primary/10 text-primary border border-primary/30 font-bold cursor-default"
                      : "text-foreground hover:bg-surface-muted/70 border border-transparent"
                      } disabled:opacity-60`}
                  >
                    {/* Left: Avatar initials & Names */}
                    <div className="flex min-w-0 items-center gap-2.5 flex-1">
                      <div
                        className={`grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-black uppercase ${isActive
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface-muted text-muted group-hover:border-primary group-hover:text-foreground"
                          }`}
                      >
                        {company.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-semibold leading-tight">{company.name}</p>
                          {isActive ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-800 dark:text-emerald-300">
                              <Check className="size-2.5 stroke-[3]" />
                              Active
                            </span>
                          ) : null}
                        </div>
                        {company.trading_name ? (
                          <p className="truncate text-[10px] text-muted mt-0.5">{company.trading_name}</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: Company Logo with Animated Border for Active Workspace */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isPendingSwitch ? (
                        <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                      ) : null}

                      {isActive ? (
                        <div
                          className="animated-active-workspace-border size-8.5 rounded-lg shrink-0"
                          title={`${company.name} (Active workspace)`}
                        >
                          <div className="animated-active-workspace-border-inner size-full rounded-[6px] bg-white p-0.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={company.logo_url || "/assets/clockwise-people-logo.png"}
                              alt={`${company.name} logo`}
                              className="size-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/assets/clockwise-people-logo.png";
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div
                          className="size-8 rounded-lg border border-border/80 bg-white p-0.5 shadow-2xs flex items-center justify-center overflow-hidden shrink-0 transition-transform group-hover:scale-105"
                          title={`${company.name} logo`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={company.logo_url || "/assets/clockwise-people-logo.png"}
                            alt={`${company.name} logo`}
                            className={`size-full object-contain ${company.logo_url ? "" : "opacity-60"}`}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/assets/clockwise-people-logo.png";
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
