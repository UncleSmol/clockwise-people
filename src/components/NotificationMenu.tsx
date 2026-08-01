"use client";

import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { clearAllDashboardNotifications, markDashboardNotificationRead } from "@/lib/dashboard/actions";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type NotificationMenuProps = {
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

export default function NotificationMenu({ notifications }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markDashboardNotificationRead, initialState);
  const [clearState, clearAction, clearPending] = useActionState(
    clearAllDashboardNotifications,
    initialState,
  );
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
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={open}
        aria-label="Open notifications"
        className="relative grid size-8 place-items-center sm:size-10 rounded-full border border-border bg-background text-foreground"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell className="size-4" />
        {notifications.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-0.5 text-[9px] font-bold leading-4 sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5 text-primary-foreground">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[65] max-h-[calc(100dvh-5rem)] overflow-hidden p-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[360px]">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">Notifications</p>
                <p className="mt-1 text-xs text-muted">
                  {notifications.length === 0
                    ? "No unread notifications"
                    : `${notifications.length} unread`}
                </p>
              </div>
              {notifications.length > 0 ? (
                <form action={clearAction}>
                  <button
                    disabled={clearPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
                    type="submit"
                  >
                    <Trash2 className="size-3.5" />
                    Clear all
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto sm:max-h-96">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">You are all caught up.</p>
            ) : (
              notifications.map((notification) => (
                <form key={notification.id} action={action} className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0">
                  <input type="hidden" name="notification_id" value={notification.id} />
                  <input type="hidden" name="target_href" value={notification.targetHref ?? ""} />
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${notificationTone(notification.category)}`}>
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                      <p className="mt-1 text-xs text-muted">{notification.body}</p>
                    </div>
                  </div>
                  <button
                    disabled={pending}
                    className="btn btn-primary justify-self-start px-3 py-1.5 text-xs"
                  >
                    {notification.targetHref ? "Open and clear" : "Clear"}
                  </button>
                </form>
              ))
            )}
          </div>

          {(state.message || clearState.message) && !pending && !clearPending ? (
            <p className={`border-t border-border px-3 py-2 text-xs ${(state.message ? state.ok : clearState.ok) ? "text-success" : "text-danger"}`}>
              {state.message || clearState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
