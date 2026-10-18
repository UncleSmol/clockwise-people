"use client";

import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  clearAllDashboardNotifications,
  fetchDashboardNotifications,
  markDashboardNotificationRead,
} from "@/lib/dashboard/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type NotificationMenuProps = {
  companyId: string;
  notifications: DashboardNotification[];
};

const initialState = {
  ok: true,
  message: "",
};

function notificationTone(category: string) {
  if (category.includes("approved")) return "border-success/30 bg-success/10 text-success";
  if (category.includes("rejected")) return "border-danger/30 bg-danger/10 text-danger";
  return "border-accent/30 bg-accent/10 text-accent";
}

export default function NotificationMenu({ companyId, notifications }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const isInitialMount = useRef(true);
  const [state, action, pending] = useActionState(markDashboardNotificationRead, initialState);
  const [clearState, clearAction, clearPending] = useActionState(
    clearAllDashboardNotifications,
    initialState,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLiveNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let refreshTimeout: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }

      refreshTimeout = window.setTimeout(async () => {
        const next = await fetchDashboardNotifications();
        setLiveNotifications(next);
      }, 200);
    };

    const channel = supabase
      .channel(`app-notifications:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `company_id=eq.${companyId}`,
          schema: "public",
          table: "app_notifications",
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }

      supabase.removeChannel(channel);
    };
  }, [companyId]);

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
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={open}
        aria-label="Open notifications"
        className="relative grid size-8 place-items-center sm:size-10 rounded-full border border-border bg-background text-foreground"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell className="size-4" />
        {liveNotifications.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-0.5 text-[9px] font-bold leading-4 sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5 text-primary-foreground">
            {liveNotifications.length > 9 ? "9+" : liveNotifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-border bg-surface p-0 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[380px]">
          <div className="border-b border-border bg-surface/95 px-4 py-3.5 backdrop-blur-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-base font-extrabold text-foreground">Notification</p>
                <p className="text-xs text-muted">
                  {liveNotifications.length === 0
                    ? "No unread notifications"
                    : `${liveNotifications.length} unread`}
                </p>
              </div>
              {liveNotifications.length > 0 ? (
                <form action={clearAction}>
                  <button
                    disabled={clearPending}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-50 transition-colors"
                    type="submit"
                  >
                    <Trash2 className="size-3.5" />
                    Clear all
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="max-h-[calc(100dvh-9rem)] divide-y divide-border overflow-y-auto sm:max-h-96">
            {liveNotifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">You are all caught up.</p>
            ) : (
              liveNotifications.map((notification) => (
                <form key={notification.id} action={action} className="grid gap-2.5 p-4 transition-colors hover:bg-surface-muted/40">
                  <input type="hidden" name="notification_id" value={notification.id} />
                  <input type="hidden" name="target_href" value={notification.targetHref ?? ""} />
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl border ${notificationTone(notification.category)} shadow-2xs`}>
                      <CheckCircle2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground leading-snug">{notification.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{notification.body}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      disabled={pending}
                      className="btn btn-primary rounded-full px-3.5 py-1 text-xs font-bold shadow-2xs"
                    >
                      {notification.targetHref ? "Open and clear" : "Clear"}
                    </button>
                  </div>
                </form>
              ))
            )}
          </div>

          {(state.message || clearState.message) && !pending && !clearPending ? (
            <p className={`border-t border-border px-4 py-2.5 text-xs font-medium ${(state.message ? state.ok : clearState.ok) ? "text-success" : "text-danger"}`}>
              {state.message || clearState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
