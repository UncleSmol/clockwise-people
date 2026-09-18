"use client";

import {
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "@/lib/auth/actions";
import NotificationMenu from "@/components/NotificationMenu";
import { useRealtime } from "@/components/realtime/RealtimeSyncProvider";
import { usePanelBridge } from "@/components/dashboard/panel-bridge";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DashboardNavigationProps = {
  companyId: string;
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
  if (key.includes("report") || key.includes("analytic") || key.includes("payroll")) return FileSpreadsheet;
  if (key.includes("attendance") || key.includes("workforce")) return Users;
  if (key.includes("people") || key.includes("employee")) return Users;
  if (key.includes("approve") || key.includes("review")) return ClipboardCheck;
  if (key.includes("leave")) return CalendarRange;
  if (key.includes("company")) return Building2;
  if (key.includes("account") || key.includes("settings")) return Settings2;
  return ShieldCheck;
}

export default function DashboardNavigation({
  companyId,
  notifications,
  profileAvatarUrl,
  profileName,
}: DashboardNavigationProps) {
  const { navItems, openPanel } = usePanelBridge();
  const { isConnected, connectionState } = useRealtime();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone());
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showInstallGuide) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showInstallGuide]);

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
    } else {
      setShowInstallGuide(true);
      setOpen(false);
    }
  }, [installEvent]);

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationMenu companyId={companyId} notifications={notifications} />

        {/* Standalone User Profile Avatar with Realtime Status Badge */}
        <div
          className="relative flex items-center"
          title={
            isConnected
              ? `${profileName ?? "User"} · Live WebSockets active`
              : connectionState === "CONNECTING"
                ? `${profileName ?? "User"} · Connecting to live WebSockets...`
                : `${profileName ?? "User"} · Realtime offline`
          }
        >
          <div
            className={`relative grid size-8 place-items-center rounded-full bg-background transition-all sm:size-9 ${
              isConnected
                ? "ring-2 ring-emerald-500/80 ring-offset-2 ring-offset-background"
                : connectionState === "CONNECTING"
                  ? "ring-2 ring-amber-500/70 ring-offset-2 ring-offset-background animate-pulse"
                  : "border border-border"
            }`}
          >
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

            <span
              className={`absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full ring-2 ring-background ${
                isConnected
                  ? "bg-emerald-500"
                  : connectionState === "CONNECTING"
                    ? "bg-amber-500"
                    : "bg-muted"
              }`}
            >
              {isConnected ? (
                <span className="absolute inset-0 block size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              ) : null}
            </span>
          </div>
        </div>

        {/* Dedicated Menu Button */}
        <div ref={containerRef} className="relative">
          <button
            aria-expanded={open}
            aria-label="Open main navigation menu"
            onClick={() => setOpen((current) => !current)}
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-all shadow-2xs ${
              open
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-border bg-background text-foreground hover:bg-surface-muted hover:border-slate-400"
            }`}
          >
            <Menu className="size-4" />
            <span className="hidden xs:inline sm:inline">Menu</span>
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open ? (
            <div className="fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-border shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-72 bg-surface p-0">
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
                      <Laptop className="size-4 text-indigo-500" />
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
    </>
  );
}