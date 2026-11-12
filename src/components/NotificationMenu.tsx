"use client";

import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Trash2,
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
import {
  areNotificationsEnabled,
  areNotificationSoundsEnabled,
  getNotificationPreferences,
  saveNotificationPreferences,
  shouldDeliverAppNotification,
  useNotificationPreferences,
} from "@/lib/notifications/preferences";

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
  if (!areNotificationsEnabled()) return;
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
  const preferences = useNotificationPreferences();
  const notificationsEnabled = areNotificationsEnabled(preferences);

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
        const current = getNotificationPreferences();
        const nextPrefs = saveNotificationPreferences({
          ...current,
          enabled: true,
          clockReminders:
            current.clockReminders || current.timesheetAlerts || current.approvals
              ? current.clockReminders
              : true,
          timesheetAlerts:
            current.clockReminders || current.timesheetAlerts || current.approvals
              ? current.timesheetAlerts
              : true,
          approvals:
            current.clockReminders || current.timesheetAlerts || current.approvals
              ? current.approvals
              : true,
        });
        if (areNotificationSoundsEnabled(nextPrefs)) {
          playNotificationPing();
        }
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

        const prefs = getNotificationPreferences();
        if (!areNotificationsEnabled(prefs)) {
          next.forEach((item) => notifiedIdsRef.current.add(item.id));
          return;
        }

        // Dispatch popup toast, sound, and device notification for newly arrived enabled categories
        for (const item of next) {
          if (!notifiedIdsRef.current.has(item.id)) {
            notifiedIdsRef.current.add(item.id);
            if (!shouldDeliverAppNotification(item.category, item.title, prefs)) {
              continue;
            }

            const destination = getNotificationDestination(item);

            // Play ping sound if enabled
            if (areNotificationSoundsEnabled(prefs)) {
              playNotificationPing();
            }

            // Floating popup capsule
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
        aria-label={notificationsEnabled ? "Open notifications" : "Open notifications (muted)"}
        className={`relative grid size-8 place-items-center sm:size-9 rounded-full border bg-surface transition-all hover:bg-emerald-500/10 active:scale-95 cursor-pointer shadow-2xs ${
          notificationsEnabled
            ? "border-emerald-500/20 text-foreground"
            : "border-slate-300/60 dark:border-slate-700 text-muted"
        }`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {notificationsEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        {notificationsEnabled && liveNotifications.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-gradient-to-r from-[#2E9B5F] to-[#258550] px-1 text-[9px] font-black leading-4 sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5 text-white shadow-xs">
            {liveNotifications.length > 9 ? "9+" : liveNotifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Mobile Frosted Backdrop */}
          <div
            className="fixed inset-0 z-[74] bg-slate-950/45 backdrop-blur-md sm:hidden transition-opacity"
            onClick={() => setOpen(false)}
          />

          <div
            className="notification-harmonized-popover fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-[75] max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom,0px))] overflow-hidden rounded-[26px] sm:rounded-[30px] p-4 sm:p-5 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[410px] animate-in zoom-in-95 duration-200"
          >
            {/* Header (Harmonized with Time Picker Header) */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/60 dark:border-slate-800 select-none">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl flex items-center justify-center border border-primary/20 bg-primary/10 shadow-2xs">
                  <Bell className="size-4 text-primary stroke-[2.4]" />
                </div>
                <div>
                  <span className="text-xs font-black tracking-[0.16em] uppercase text-foreground block">
                    Notifications
                  </span>
                  <span className="text-[10px] font-semibold text-muted">
                    {liveNotifications.length === 0
                      ? "All caught up"
                      : `${liveNotifications.length} unread alert${liveNotifications.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {liveNotifications.length > 0 ? (
                  <form action={clearAction}>
                    <button
                      disabled={clearPending}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                      type="submit"
                      title="Clear all notifications"
                    >
                      <Trash2 className="size-3 text-muted" />
                      <span className="text-[11px]">Clear</span>
                    </button>
                  </form>
                ) : null}

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="size-8 rounded-full flex items-center justify-center border border-slate-200 bg-white/80 hover:bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shadow-2xs transition-colors cursor-pointer"
                  aria-label="Close notifications"
                >
                  <X className="size-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Device Native Notification Banner (only when notifications are enabled and browser permission not yet granted) */}
            {!notificationsEnabled ? (
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-surface-muted/60 px-3 py-2.5 mt-3 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <BellOff className="size-3.5 shrink-0 text-muted" />
                  <span className="text-[11px] font-semibold text-muted truncate">
                    Notifications disabled in settings
                  </span>
                </div>
                <a
                  href="/dashboard?panel=account"
                  onClick={() => setOpen(false)}
                  className="shrink-0 text-[10px] font-extrabold text-primary hover:underline"
                >
                  Settings
                </a>
              </div>
            ) : permission !== "granted" ? (
              <div className="digital-well rounded-2xl p-3 mt-3 flex items-center justify-between gap-2.5 shadow-soft">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary border border-primary/20">
                    <BellRing className="size-3.5 stroke-[2.3]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-foreground truncate">
                      Enable Device Alerts
                    </p>
                    <p className="text-[10px] text-muted truncate">
                      Vibrate phone &amp; desktop popups
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={requestingPerm}
                  onClick={requestPermission}
                  className="btn-aurora-done shrink-0 rounded-xl px-3.5 py-1.5 text-[10px] font-extrabold text-white shadow-xs cursor-pointer transition-all"
                >
                  {requestingPerm ? "Enabling..." : "Enable"}
                </button>
              </div>
            ) : null}

            {/* Notification List (Harmonized Cards) */}
            <div className="max-h-[calc(100dvh-13rem)] sm:max-h-[380px] overflow-y-auto space-y-2 pr-1 pt-3">
              {liveNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                  <div className="size-12 rounded-2xl flex items-center justify-center border border-primary/20 bg-primary/10 text-primary shadow-soft mb-2.5">
                    <CheckCircle2 className="size-6 stroke-[2.2]" />
                  </div>
                  <p className="text-sm font-black text-foreground tracking-tight">You are all caught up!</p>
                  <p className="mt-1 text-xs text-muted max-w-xs leading-relaxed">
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
                      className="group relative flex flex-col gap-2 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 p-3.5 transition-all hover:border-primary/50 shadow-2xs hover:shadow-soft cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border ${iconBg} shadow-2xs`}>
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeClass} shadow-2xs`}>
                                {badgeText}
                              </span>
                              <span className="text-[10px] text-muted font-medium">
                                {new Intl.DateTimeFormat("en-ZA", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "numeric",
                                  month: "short",
                                }).format(new Date(notification.createdAt))}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-black text-foreground leading-snug break-words">
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
                          className="size-6 rounded-full flex items-center justify-center border border-slate-200/80 bg-white/70 hover:bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-400 hover:text-danger shadow-2xs transition-colors shrink-0 cursor-pointer"
                        >
                          <X className="size-3.5 stroke-[2.2]" />
                        </button>
                      </div>

                      {/* Action prompt footer on card */}
                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2 text-[10px] font-extrabold text-muted group-hover:text-primary transition-colors">
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
              <p className={`mt-2 rounded-xl border border-border p-2 text-center text-xs font-semibold ${clearState.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                {clearState.message}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
