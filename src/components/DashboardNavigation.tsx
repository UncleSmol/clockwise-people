"use client";

import {
  ClipboardCheck,
  LogOut,
  Settings2,
  ShieldCheck,
  Building2,
  Users,
  CalendarRange,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth/actions";
import NotificationMenu from "@/components/NotificationMenu";
import { useRealtime } from "@/components/realtime/RealtimeSyncProvider";
import { usePanelBridge } from "@/components/dashboard/panel-bridge";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type DashboardNavigationProps = {
  companyId: string;
  notifications: DashboardNotification[];
  profileAvatarUrl?: string | null;
  profileName?: string | null;
};

function navItemIcon(label: string) {
  const key = label.toLowerCase();
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
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <NotificationMenu companyId={companyId} notifications={notifications} />

      <div ref={containerRef} className="relative">
        <button
          aria-expanded={open}
          aria-label="Open account menu"
          title={
            isConnected
              ? "Live WebSockets active"
              : connectionState === "CONNECTING"
                ? "Connecting to live WebSockets..."
                : "Realtime offline"
          }
          onClick={() => setOpen((current) => !current)}
          type="button"
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
        </button>

        {open ? (
          <div className="card fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden p-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-72">
            {profileName ? (
              <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                {profileName}
              </p>
            ) : null}

            <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-2">
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
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-surface-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border p-2">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-danger/10"
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
  );
}