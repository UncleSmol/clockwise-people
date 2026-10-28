"use client";

import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Trash2,
  Radio,
  ExternalLink,
  X,
} from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  clearAllDashboardNotifications,
  fetchDashboardNotifications,
  markDashboardNotificationRead,
} from "@/lib/dashboard/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DashboardNotification } from "@/lib/dashboard/schema";
import { dispatchGlobalToast } from "@/components/notifications/SlidingToastProvider";
import {
  playNotificationPing,
  primeNotificationAudio,
} from "@/lib/audio/notification-sound";

type NotificationMenuProps = {
  companyId: string;
  notifications: DashboardNotification[];
};

const initialState = {
  ok: true,
  message: "",
};

function getNotificationDestination(notification: DashboardNotification): string {
  const category = (notification.category || "").toLowerCase();
  const targetHref = notification.targetHref || "";

  // Extract time entry id from targetHref e.g. /dashboard/time?time_entry_id=xxx
  const timeMatch = targetHref.match(/time_entry_id=([^&]+)/);
  const entryId = timeMatch ? decodeURIComponent(timeMatch[1]) : null;

  // Extract leave request id from targetHref e.g. /dashboard/leave?leave_request_id=xxx
  const leaveMatch = targetHref.match(/leave_request_id=([^&]+)/);
  const leaveId = leaveMatch ? decodeURIComponent(leaveMatch[1]) : null;

  if (category.includes("rejected") && entryId) {
    return `/dashboard?tab=review&highlightEntryId=${encodeURIComponent(entryId)}&mode=edit`;
  }
  if (category.includes("approved") && entryId) {
    return `/dashboard?tab=review&highlightEntryId=${encodeURIComponent(entryId)}&mode=pulsate`;
  }
  if (entryId) {
    return `/dashboard?tab=review&highlightEntryId=${encodeURIComponent(entryId)}&mode=view`;
  }
  if (leaveId) {
    return `/dashboard?panel=leave&highlightLeaveId=${encodeURIComponent(leaveId)}`;
  }

  if (targetHref.startsWith("/dashboard")) {
    return targetHref;
  }
  return "/dashboard";
}

function getNotificationIconAndBadge(category: string, title: string) {
  const cat = category.toLowerCase();
  const t = title.toLowerCase();

  if (cat.includes("rejected") || t.includes("rejected")) {
    return {
      icon: <AlertTriangle className="size-4.5 text-rose-500" />,
      iconBg: "bg-rose-500/10 border-rose-500/30 text-rose-500",
      badgeText: "Rejected · Click to Edit",
      badgeClass: "bg-rose-600 text-white",
    };
  }
  if (cat.includes("approved") || t.includes("approved")) {
    return {
      icon: <CheckCircle2 className="size-4.5 text-emerald-500" />,
      iconBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
      badgeText: "Approved",
      badgeClass: "bg-emerald-600 text-white",
    };
  }
  if (cat.includes("leave")) {
    return {
      icon: <Calendar className="size-4.5 text-purple-500" />,
      iconBg: "bg-purple-500/10 border-purple-500/30 text-purple-500",
      badgeText: "Time Off",
      badgeClass: "bg-purple-600 text-white",
    };
  }
  return {
    icon: <Clock className="size-4.5 text-blue-500" />,
    iconBg: "bg-blue-500/10 border-blue-500/30 text-blue-500",
    badgeText: "Update",
    badgeClass: "bg-slate-700 text-white",
  };
}

// Triggers native mobile vibration & desktop OS banner
async function triggerDeviceNotification(notification: {
  id?: string;
  title: string;
  body: string;
  targetHref?: string | null;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const targetUrl = notification.targetHref || "/dashboard";
  const tag = `cw-notify-${notification.id || Date.now()}`;

  const registration = await navigator.serviceWorker?.ready.catch(() => null);

  if (registration?.active) {
    registration.active.postMessage({
      type: "SHOW_NOTIFICATION",
      payload: {
        title: notification.title,
        body: notification.body,
        url: targetUrl,
        tag,
      },
    });
    return;
  }

  try {
    const n = new Notification(notification.title, {
      body: notification.body,
      icon: "/assets/android-chrome-192x192.png",
      badge: "/assets/favicon-32x32.png",
      tag,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = targetUrl;
    };
  } catch {
    // browser sandbox
  }
}

export default function NotificationMenu({ companyId, notifications }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const isInitialMount = useRef(true);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [requestingPerm, setRequestingPerm] = useState(false);

  const [clearState, clearAction, clearPending] = useActionState(
    clearAllDashboardNotifications,
    initialState,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    primeNotificationAudio();
    setRequestingPerm(true);
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js").catch(() => null);
      }
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === "granted") {
        playNotificationPing();
        await triggerDeviceNotification({
          title: "ClockWise People Alerts Active",
          body: "Mobile vibration and desktop popup alerts are enabled!",
          targetHref: "/dashboard",
        });
      }
    } catch {
      // ignore
    } finally {
      setRequestingPerm(false);
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Mark current notifications as already seen in memory
      notifications.forEach((n) => notifiedIdsRef.current.add(n.id));
      return;
    }
    setLiveNotifications(notifications);
  }, [notifications]);

  // Realtime Supabase notifications with Native Device dispatch
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

        // Dispatch sliding bottom toast and device notification for newly arrived notifications
        for (const item of next) {
          if (!notifiedIdsRef.current.has(item.id)) {
            notifiedIdsRef.current.add(item.id);
            const destination = getNotificationDestination(item);

            // Play iPhone ping sound
            playNotificationPing();

            // Pop up at the bottom of the screen
            dispatchGlobalToast({
              id: item.id,
              type: "notification",
              title: item.title,
              message: item.body,
              targetHref: destination,
            });

            // Native device / OS notification if granted
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              triggerDeviceNotification({
                id: item.id,
                title: item.title,
                body: item.body,
                targetHref: destination,
              });
            }
          }
        }
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

  // Click on a notification: Mark as read, close menu, and deep-link directly to relevant item
  const handleNotificationClick = useCallback(
    async (notification: DashboardNotification) => {
      const destination = getNotificationDestination(notification);
      setOpen(false);

      // Optimistic removal from unread live list
      setLiveNotifications((prev) => prev.filter((n) => n.id !== notification.id));

      // Mark as read in backend
      const formData = new FormData();
      formData.append("notification_id", notification.id);
      formData.append("target_href", destination);
      markDashboardNotificationRead(initialState, formData).catch(() => null);

      // Parse parameters to trigger instant in-page tab opening & pulsating highlight
      const timeMatch = destination.match(/highlightEntryId=([^&]+)/);
      const leaveMatch = destination.match(/highlightLeaveId=([^&]+)/);
      const modeMatch = destination.match(/mode=([^&]+)/);

      const entryId = timeMatch ? decodeURIComponent(timeMatch[1]) : null;
      const leaveId = leaveMatch ? decodeURIComponent(leaveMatch[1]) : null;
      const mode = modeMatch ? decodeURIComponent(modeMatch[1]) : "view";
      const isLeave = destination.includes("panel=leave") || Boolean(leaveId);

      if (typeof window !== "undefined") {
        if (window.location.pathname === "/dashboard") {
          window.history.pushState({}, "", destination);

          // Dispatch event so EmployeeMyTimeHub & EmployeeTimesheetCorrections react instantly
          window.dispatchEvent(
            new CustomEvent("clockwise:notification-nav", {
              detail: {
                highlightEntryId: entryId,
                highlightLeaveId: leaveId,
                mode,
                tab: isLeave ? "leave" : "review",
              },
            }),
          );
        } else {
          window.location.href = destination;
        }
      }
    },
    [],
  );

  const handleDismissSingle = useCallback(
    async (e: React.MouseEvent, notification: DashboardNotification) => {
      e.stopPropagation();
      setLiveNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      const formData = new FormData();
      formData.append("notification_id", notification.id);
      markDashboardNotificationRead(initialState, formData).catch(() => null);
    },
    [],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={open}
        aria-label="Open notifications"
        className="relative grid size-8 place-items-center sm:size-9 rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-muted active:scale-95 cursor-pointer shadow-2xs"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell className="size-4" />
        {liveNotifications.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-black leading-4 sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5 text-white shadow-xs">
            {liveNotifications.length > 9 ? "9+" : liveNotifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[75] max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-900 p-0 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[410px]"
          style={{ backgroundColor: "#ffffff" }}
        >
          {/* Header (Fully Opaque) */}
          <div className="border-b border-border bg-white dark:bg-slate-900 px-4 py-3.5 select-none">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-base font-extrabold text-foreground tracking-tight">Notifications</p>
                <p className="text-xs font-semibold text-muted">
                  {liveNotifications.length === 0
                    ? "No unread notifications"
                    : `${liveNotifications.length} unread alert${liveNotifications.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {liveNotifications.length > 0 ? (
                <form action={clearAction}>
                  <button
                    disabled={clearPending}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-foreground hover:bg-surface-muted disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    type="submit"
                  >
                    <Trash2 className="size-3.5 text-muted" />
                    Clear all
                  </button>
                </form>
              ) : null}
            </div>

            {/* Device Native Notification Banner (PWA Mobile & Desktop Alert Hook) */}
            {permission !== "granted" ? (
              <div className="mt-3 flex items-center justify-between gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                    <BellRing className="size-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-emerald-950 dark:text-emerald-200 truncate">
                      Enable Native Device Alerts
                    </p>
                    <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 truncate">
                      Vibrate phone &amp; desktop popups
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={requestingPerm}
                  onClick={requestPermission}
                  className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black text-white hover:bg-emerald-700 shadow-2xs cursor-pointer transition-colors"
                >
                  {requestingPerm ? "Enabling..." : "Enable"}
                </button>
              </div>
            ) : (
              <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                <Radio className="size-2.5 text-emerald-600 animate-pulse" />
                <span>Device Alerts: Active (Mobile &amp; Desktop Popups)</span>
              </div>
            )}
          </div>

          {/* Notification List (Solid Background - Zero Transparency) */}
          <div
            className="max-h-[calc(100dvh-12rem)] divide-y divide-border overflow-y-auto sm:max-h-[380px] bg-white dark:bg-slate-900"
            style={{ backgroundColor: "#ffffff" }}
          >
            {liveNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center bg-white dark:bg-slate-900">
                <span className="grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
                  <CheckCircle2 className="size-6" />
                </span>
                <p className="text-sm font-black text-foreground">You are all caught up!</p>
                <p className="mt-0.5 text-xs text-muted max-w-xs">
                  New timesheet approvals, rejections, and time-off updates will appear here and ping your device.
                </p>
              </div>
            ) : (
              liveNotifications.map((notification) => {
                const { icon, iconBg, badgeText, badgeClass } = getNotificationIconAndBadge(
                  notification.category,
                  notification.title,
                );
                const isRejected = notification.category.toLowerCase().includes("rejected");
                const isApproved = notification.category.toLowerCase().includes("approved");

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(notification);
                      }
                    }}
                    className="group relative flex flex-col gap-2 p-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer bg-white dark:bg-slate-900"
                    style={{ backgroundColor: "#ffffff" }}
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border ${iconBg} shadow-2xs`}>
                          {icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeClass}`}>
                              {badgeText}
                            </span>
                            <span className="text-[10px] text-muted">
                              {new Intl.DateTimeFormat("en-ZA", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "numeric",
                                month: "short",
                              }).format(new Date(notification.createdAt))}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-foreground leading-snug break-words">
                            {notification.title}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted break-words">
                            {notification.body}
                          </p>
                        </div>
                      </div>

                      {/* Individual Dismiss Button */}
                      <button
                        type="button"
                        title="Dismiss notification"
                        onClick={(e) => handleDismissSingle(e, notification)}
                        className="opacity-60 hover:opacity-100 hover:text-danger p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    {/* Action prompt footer on card */}
                    <div className="flex items-center justify-between border-t border-border/50 pt-1.5 text-[10px] font-bold text-muted group-hover:text-primary transition-colors">
                      <span className="truncate">
                        {isRejected
                          ? "👉 Tap to open timesheet ready to edit"
                          : isApproved
                            ? "👉 Tap to view verified timesheet"
                            : "👉 Tap to view details"}
                      </span>
                      <ExternalLink className="size-3 shrink-0 ml-1 opacity-70 group-hover:opacity-100" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {clearState.message && !clearPending ? (
            <p className={`border-t border-border px-4 py-2 text-xs font-medium bg-white dark:bg-slate-900 ${clearState.ok ? "text-success" : "text-danger"}`}>
              {clearState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
