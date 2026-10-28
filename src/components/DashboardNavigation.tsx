"use client";

import {
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Home,
  Laptop,
  LogOut,
  Menu,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "@/lib/auth/actions";
import NotificationMenu from "@/components/NotificationMenu";
import CompanySwitcherMenu, { type CompanySwitcherItem } from "@/components/CompanySwitcherMenu";
import { usePanelBridge } from "@/components/dashboard/panel-bridge";
import { useZenMode } from "@/components/zen/ZenModeContext";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DashboardNavigationProps = {
  companyId: string;
  currentCompanyName?: string;
  companies?: CompanySwitcherItem[];
  isSuperAdmin?: boolean;
  notifications: DashboardNotification[];
  profileAvatarUrl?: string | null;
  profileName?: string | null;
};

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(nav.standalone)
  );
}

function navItemIcon(label: string) {
  const key = label.toLowerCase();
  if (key.includes("sysadmin") || key.includes("system")) return ShieldCheck;
  if (key.includes("payslip")) return FileSpreadsheet;
  if (key.includes("report") || key.includes("analytic") || key.includes("payroll")) return FileSpreadsheet;
  if (key.includes("attendance") || key.includes("workforce")) return Users;
  if (key.includes("people") || key.includes("employee")) return Users;
  if (key.includes("approve") || key.includes("review")) return ClipboardCheck;
  if (key.includes("leave")) return CalendarRange;
  if (key.includes("hour") || key.includes("time")) return Clock;
  if (key.includes("company")) return Building2;
  if (key.includes("polic") || key.includes("document") || key.includes("compliance")) return FileText;
  if (key.includes("account") || key.includes("settings")) return Settings2;
  return ShieldCheck;
}

function navItemDescription(key: string) {
  switch (key) {
    case "attendance":
      return "Live workforce status & who is clocked in";
    case "people":
      return "Employee directory & staff profiles";
    case "leave":
      return "Book leave, view balances & requests";
    case "manager-review":
      return "Approve submitted timesheets & corrections";
    case "my-reports":
      return "View shift hours worked & mini reports";
    case "account":
      return "Profile details, notifications & security";
    case "policies":
      return "Work rules, compliance & policy documents";
    case "company":
      return "Workstations, departments, company settings";
    case "reports":
      return "Advanced payroll audit & compliance export";
    case "payslips":
      return "Generate & print official employee payslips";
    case "sysadmin":
      return "Multi-tenant company provisioning & RBAC";
    default:
      return "";
  }
}

export default function DashboardNavigation({
  companyId,
  currentCompanyName,
  companies,
  isSuperAdmin,
  notifications,
  profileAvatarUrl,
  profileName,
}: DashboardNavigationProps) {
  const { navItems, openPanel, closePanel, activePanelKey } = usePanelBridge();
  const { isZenMode, toggleZenMode, activeColorConfig, zenModeEnabled } = useZenMode();
  const [open, setOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsInstalled(isRunningStandalone());
  }, []);

  useEffect(() => {
    if (!showInstallGuide && !mobileDrawerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showInstallGuide, mobileDrawerOpen]);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const handleDownloadClick = useCallback(async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setInstallEvent(null);
      }
      setOpen(false);
      setMobileDrawerOpen(false);
    } else {
      setShowInstallGuide(true);
      setOpen(false);
      setMobileDrawerOpen(false);
    }
  }, [installEvent]);

  const mobileItems = useMemo(
    () => navItems.filter((item) => !item.desktopOnly),
    [navItems],
  );

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-3">
        {isSuperAdmin && companies && companies.length > 0 ? (
          <CompanySwitcherMenu
            companyId={companyId}
            currentCompanyName={currentCompanyName ?? "Company"}
            companies={companies}
          />
        ) : null}

        <NotificationMenu companyId={companyId} notifications={notifications} />

        {/* Zen Mode Header Toggle Button (Accessible in top header on mobile & desktop) */}
        {zenModeEnabled ? (
          <button
            type="button"
            onClick={toggleZenMode}
            title={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
            aria-label={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
            className="relative flex size-8 sm:size-9 items-center justify-center rounded-full text-white font-black text-xs sm:text-sm shadow-xs border border-white/40 transition-transform active:scale-95 cursor-pointer shrink-0"
            style={{
              backgroundColor: activeColorConfig.bgHex,
              boxShadow: `0 0 10px ${activeColorConfig.glowHex}`,
            }}
          >
            <span className="font-sans font-black select-none">Z</span>
          </button>
        ) : null}

        {/* Standalone User Profile Avatar */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.innerWidth >= 640) {
              setOpen((c) => !c);
            } else {
              setMobileDrawerOpen(true);
            }
          }}
          className="relative flex items-center cursor-pointer transition-transform active:scale-95"
          title={profileName ? `${profileName} profile` : "User profile"}
          aria-label="Open user settings menu"
        >
          <div className="relative grid size-8 place-items-center rounded-full border border-border bg-background transition-all sm:size-9 hover:border-primary/50">
            <div className="size-full overflow-hidden rounded-full">
              {profileAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileAvatarUrl}
                  alt={profileName ? `${profileName} profile` : "Your profile"}
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-xs font-bold text-foreground uppercase">
                  <Settings2 className="size-4" />
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Dedicated Menu Button (Desktop Only: hidden on mobile) */}
        <div ref={containerRef} className="relative hidden sm:block">
          <button
            aria-expanded={open}
            aria-label="Open main navigation menu"
            onClick={() => setOpen((current) => !current)}
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all shadow-2xs ${
              open
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-foreground hover:bg-surface-muted hover:border-primary/50"
            }`}
          >
            <Menu className="size-4" />
            <span className="hidden xs:inline sm:inline">Menu</span>
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open ? (
            <div className="fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-border shadow-soft sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-72 bg-surface p-0">
              {profileName ? (
                <div className="border-b border-border/80 bg-surface/90 backdrop-blur-xs px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">
                    Signed in as
                  </p>
                  <p className="truncate text-sm font-extrabold text-foreground">
                    {profileName}
                  </p>
                </div>
              ) : null}

              {/* Workspace Navigation Links */}
              <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto p-2">
                {navItems.map((item) => {
                  const Icon = navItemIcon(item.label);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        openPanel(item.key);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors"
                    >
                      <Icon className="size-4 shrink-0 text-muted" />
                      {item.label}
                    </button>
                  );
                })}
              </div>


              {/* Download App Action in Menu Drawer */}
              <div className="border-t border-border/80 bg-surface/90 backdrop-blur-xs p-2">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-left transition-all hover:bg-emerald-500/20 hover:border-emerald-500 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-2xs">
                      <Download className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-black text-foreground">
                        {isInstalled ? "App Installed" : "Download App"}
                      </span>
                      <span className="block truncate text-[10px] font-semibold text-muted">
                        {isInstalled ? "Running native app" : "Install on Phone or PC"}
                      </span>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                    {isInstalled ? "Ready" : "Install"}
                  </span>
                </button>
              </div>

              {/* Sign Out Action */}
              <div className="border-t border-border p-2">
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-bold text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut className="size-4 shrink-0" />
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Download & Installation Guide Modal */}
      {mounted && showInstallGuide
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex min-h-dvh w-screen items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-4 backdrop-blur-sm"
              onClick={() => setShowInstallGuide(false)}
            >
              <div
                className="relative my-auto flex max-h-[calc(100dvh-2.5rem)] sm:max-h-[calc(100dvh-4rem)] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                      <Download className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-foreground sm:text-lg">
                        Download &amp; Install App
                      </h3>
                      <p className="truncate text-xs font-semibold text-muted">
                        Install ClockWise People on your device
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInstallGuide(false)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted hover:text-foreground cursor-pointer"
                    aria-label="Close download guide"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="overflow-y-auto p-5 space-y-3.5 text-xs text-muted leading-relaxed">
                  {/* Native Install Button if event available */}
                  {installEvent && (
                    <button
                      type="button"
                      onClick={async () => {
                        await installEvent.prompt();
                        const choice = await installEvent.userChoice;
                        if (choice.outcome === "accepted") {
                          setIsInstalled(true);
                          setInstallEvent(null);
                          setShowInstallGuide(false);
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 transition-all cursor-pointer"
                    >
                      <Download className="size-4" />
                      <span>1-Click Instant Install</span>
                    </button>
                  )}

                  {/* iOS Instructions */}
                  <div className="rounded-xl border border-border bg-surface-muted/60 p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Smartphone className="size-4 text-accent" />
                      <h4 className="font-black text-foreground">Apple iPhone &amp; iPad (Safari)</h4>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 text-xs">
                      <li>
                        Tap the <strong>Share</strong> icon (<Share2 className="inline size-3 text-accent" />) at the bottom of Safari.
                      </li>
                      <li>
                        Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.
                      </li>
                      <li>Tap <strong>Add</strong> in the top right corner.</li>
                    </ol>
                  </div>

                  {/* Android Instructions */}
                  <div className="rounded-xl border border-border bg-surface-muted/60 p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Smartphone className="size-4 text-emerald-600" />
                      <h4 className="font-black text-foreground">Android (Chrome / Samsung)</h4>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 text-xs">
                      <li>Tap the <strong>three dots menu (⋮)</strong> at top right.</li>
                      <li>
                        Select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                      </li>
                      <li>Confirm installation to add to your app drawer.</li>
                    </ol>
                  </div>

                  {/* Desktop Instructions */}
                  <div className="rounded-xl border border-border bg-surface-muted/60 p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Laptop className="size-4 text-slate-700" />
                      <h4 className="font-black text-foreground">Desktop (Chrome / Edge / Mac)</h4>
                    </div>
                    <p className="text-xs">
                      Click the <strong>Install</strong> icon (<Download className="inline size-3 text-accent" />) in the URL address bar or browser menu to run as a dedicated desktop app.
                    </p>
                  </div>

                  {/* App Benefits Highlights */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-[11px] text-foreground font-medium">
                    <div className="flex items-center gap-1.5 font-bold mb-1 text-emerald-700">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      Installed App Benefits:
                    </div>
                    <p className="text-muted leading-normal">
                      Instant 1-tap clock in/out, offline shifts caching, instant overtime &amp; leave notifications, and zero browser tab clutter.
                    </p>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 flex shrink-0 justify-end border-t border-border bg-surface px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setShowInstallGuide(false)}
                    className="rounded-lg border border-border bg-foreground px-4 py-2 text-xs font-bold text-background hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Universal Floating Bottom Navigation Bar (Persistent across tab switches) */}
      {mounted
        ? createPortal(
            <nav
              aria-label="Bottom Navigation"
              className="sm:hidden md:hidden lg:hidden mobile-bottom-nav hide-when-zen fixed bottom-0 inset-x-0 z-[75] flex items-center justify-around border-t border-border bg-surface/95 backdrop-blur-md px-3 pt-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] pointer-events-auto"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {/* 1. Home */}
              {(() => {
                const isHomeActive = !activePanelKey && !mobileDrawerOpen;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      closePanel();
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                      isHomeActive ? "text-primary" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                        isHomeActive
                          ? "bg-primary/10 text-primary font-bold shadow-2xs"
                          : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                      }`}
                    >
                      <Home className="size-4" />
                    </span>
                    <span
                      className={`text-[10px] tracking-tight ${
                        isHomeActive ? "font-bold text-primary" : "font-semibold text-muted group-hover:text-foreground"
                      }`}
                    >
                      Home
                    </span>
                  </button>
                );
              })()}

              {/* 2. My Hours */}
              {(() => {
                const isMyHoursActive = activePanelKey === "my-reports" && !mobileDrawerOpen;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      if (activePanelKey === "my-reports") {
                        closePanel();
                      } else {
                        openPanel("my-reports");
                      }
                    }}
                    className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                      isMyHoursActive ? "text-primary" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                        isMyHoursActive
                          ? "bg-primary/10 text-primary font-bold shadow-2xs"
                          : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                      }`}
                    >
                      <Clock className="size-4" />
                    </span>
                    <span
                      className={`text-[10px] tracking-tight ${
                        isMyHoursActive ? "font-bold text-primary" : "font-semibold text-muted group-hover:text-foreground"
                      }`}
                    >
                      My Hours
                    </span>
                  </button>
                );
              })()}

              {/* 3. Leave */}
              {(() => {
                const isLeaveActive = activePanelKey === "leave" && !mobileDrawerOpen;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      if (activePanelKey === "leave") {
                        closePanel();
                      } else {
                        openPanel("leave");
                      }
                    }}
                    className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                      isLeaveActive ? "text-primary" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                        isLeaveActive
                          ? "bg-primary/10 text-primary font-bold shadow-2xs"
                          : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                      }`}
                    >
                      <CalendarRange className="size-4" />
                    </span>
                    <span
                      className={`text-[10px] tracking-tight ${
                        isLeaveActive ? "font-bold text-primary" : "font-semibold text-muted group-hover:text-foreground"
                      }`}
                    >
                      Leave
                    </span>
                  </button>
                );
              })()}

              {/* 4. Approvals (for Managers/Admins) or Attendance (for Employees) */}
              {navItems.some((n) => n.key === "manager-review") ? (
                (() => {
                  const isApprovalsActive = activePanelKey === "manager-review" && !mobileDrawerOpen;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        if (activePanelKey === "manager-review") {
                          closePanel();
                        } else {
                          openPanel("manager-review");
                        }
                      }}
                      className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                        isApprovalsActive ? "text-primary" : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                          isApprovalsActive
                            ? "bg-primary/10 text-primary font-bold shadow-2xs"
                            : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                        }`}
                      >
                        <ClipboardCheck className="size-4" />
                      </span>
                      <span
                        className={`text-[10px] tracking-tight ${
                          isApprovalsActive ? "font-bold text-primary" : "font-semibold text-muted group-hover:text-foreground"
                        }`}
                      >
                        Approvals
                      </span>
                    </button>
                  );
                })()
              ) : (
                (() => {
                  const isAttendanceActive = activePanelKey === "attendance" && !mobileDrawerOpen;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        if (activePanelKey === "attendance") {
                          closePanel();
                        } else {
                          openPanel("attendance");
                        }
                      }}
                      className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                        isAttendanceActive ? "text-primary" : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                          isAttendanceActive
                            ? "bg-primary/10 text-primary font-bold shadow-2xs"
                            : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                        }`}
                      >
                        <Users className="size-4" />
                      </span>
                      <span
                        className={`text-[10px] tracking-tight ${
                          isAttendanceActive ? "font-bold text-primary" : "font-semibold text-muted group-hover:text-foreground"
                        }`}
                      >
                        Attendance
                      </span>
                    </button>
                  );
                })()
              )}

              {/* 5. Mobile Drawer Trigger */}
              <button
                type="button"
                onClick={() => setMobileDrawerOpen((prev) => !prev)}
                className={`group flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
                  mobileDrawerOpen ? "text-primary" : "text-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                    mobileDrawerOpen
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-surface-muted/60 text-muted group-hover:text-foreground group-hover:bg-surface-muted"
                  }`}
                >
                  <Menu className="size-4" />
                </span>
                <span
                  className={`text-[10px] tracking-tight ${
                    mobileDrawerOpen ? "text-primary font-bold" : "font-semibold text-muted group-hover:text-foreground"
                  }`}
                >
                  Menu
                </span>
              </button>
            </nav>,
            document.body
          )
        : null}

      {/* Mobile Drawer (Slide-up Bottom Sheet) */}
      {mounted && mobileDrawerOpen
        ? createPortal(
            <div
              className="sm:hidden md:hidden lg:hidden mobile-drawer-modal fixed inset-x-0 top-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-[70] flex items-end bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => setMobileDrawerOpen(false)}
            >
              <div
                className="relative flex max-h-full w-full flex-col rounded-t-3xl border-t border-border bg-surface shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag Handle */}
                <div className="flex w-full items-center justify-center pt-3 pb-1">
                  <div className="h-1.5 w-12 rounded-full bg-border" />
                </div>

                {/* Profile Header */}
                <div className="flex items-center justify-between border-b border-border/80 px-5 py-3 bg-surface/90">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 shrink-0 overflow-hidden rounded-full border border-border bg-background shadow-2xs">
                      {profileAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profileAvatarUrl}
                          alt={profileName ? `${profileName} avatar` : "Avatar"}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-xs font-bold text-foreground">
                          {profileName ? profileName.slice(0, 2).toUpperCase() : "CW"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-foreground">
                        {profileName || "ClockWise User"}
                      </p>
                      <p className="truncate text-xs font-medium text-muted">
                        {currentCompanyName || "ClockWise Workspace"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted hover:text-foreground transition-colors"
                    aria-label="Close menu drawer"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="overflow-y-auto px-4 py-3 space-y-4">
                  {/* Company Switcher for Mobile Superadmins */}
                  {isSuperAdmin && companies && companies.length > 0 ? (
                    <div className="rounded-2xl border border-border bg-surface-muted/40 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2 px-1">
                        Active Workspace
                      </p>
                      <CompanySwitcherMenu
                        companyId={companyId}
                        currentCompanyName={currentCompanyName ?? "Company"}
                        companies={companies}
                      />
                    </div>
                  ) : null}


                  {/* Simplified Mobile Navigation */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted px-2 pb-1">
                      Mobile Workspace
                    </p>
                    {mobileItems.map((item) => {
                      const Icon = navItemIcon(item.label);
                      const desc = navItemDescription(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setMobileDrawerOpen(false);
                            openPanel(item.key);
                          }}
                          className="flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-colors hover:bg-surface-muted active:bg-surface-muted/80"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground border border-border">
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-foreground">
                                {item.label}
                              </p>
                              {desc ? (
                                <p className="truncate text-[10px] text-muted font-normal">
                                  {desc}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted" />
                        </button>
                      );
                    })}
                  </div>

                  {/* App Download / Install Action */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        handleDownloadClick();
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left transition-all hover:bg-emerald-500/20 active:scale-98"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                          <Download className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {isInstalled ? "App Installed" : "Download Mobile App"}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {isInstalled ? "Running native web app" : "Add to home screen for 1-tap clock in"}
                          </span>
                        </div>
                      </div>
                      <span className="rounded bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0">
                        {isInstalled ? "Ready" : "Install"}
                      </span>
                    </button>
                  </div>

                  {/* Sign Out Action */}
                  <div className="pt-1 pb-4">
                    <form action={signOut}>
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 py-2.5 text-xs font-bold text-danger transition-colors hover:bg-danger/20 active:scale-98"
                      >
                        <LogOut className="size-4 shrink-0" />
                        Sign out
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}