"use client";

import { Bell, CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { markDashboardNotificationRead } from "@/lib/dashboard/actions";
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
        className="relative grid size-10 place-items-center rounded-full border border-border bg-background text-foreground"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell className="size-4" />
        {notifications.length > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-5 text-white">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[65] mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-md border border-border bg-surface shadow-2xl">
          <div className="border-b border-border px-3 py-3">
            <p className="font-semibold text-foreground">Notifications</p>
            <p className="mt-1 text-xs text-muted">
              {notifications.length === 0
                ? "No unread notifications"
                : `${notifications.length} unread`}
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
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
                    className="justify-self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {notification.targetHref ? "Open and clear" : "Clear"}
                  </button>
                </form>
              ))
            )}
          </div>

          {state.message ? (
            <p className={`border-t border-border px-3 py-2 text-xs ${state.ok ? "text-success" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
