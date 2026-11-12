"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  FileCheck,
  Radio,
  Send,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { dispatchGlobalToast } from "@/components/notifications/SlidingToastProvider";
import {
  playNotificationPing,
  primeNotificationAudio,
} from "@/lib/audio/notification-sound";
import {
  areNotificationsEnabled,
  saveNotificationPreferences,
  useNotificationPreferences,
} from "@/lib/notifications/preferences";

export default function PushNotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const preferences = useNotificationPreferences();
  const effectiveEnabled = areNotificationsEnabled(preferences);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSupport = "Notification" in window && "serviceWorker" in navigator;
    setSupported(hasSupport);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const updatePreferences = (next: typeof preferences) => {
    const saved = saveNotificationPreferences(next);
    if (!saved.enabled) {
      setStatusMessage("All notifications, reminders, popup alerts, and chimes are disabled.");
    } else if (!saved.clockReminders && !saved.timesheetAlerts && !saved.approvals) {
      setStatusMessage("All notification categories are unchecked — alerts are paused.");
    } else {
      setStatusMessage(null);
    }
    return saved;
  };

  const toggleMasterNotifications = async () => {
    if (preferences.enabled) {
      updatePreferences({ ...preferences, enabled: false });
      return;
    }

    const restoreCategories =
      !preferences.clockReminders &&
      !preferences.timesheetAlerts &&
      !preferences.approvals;

    const next = updatePreferences({
      ...preferences,
      enabled: true,
      clockReminders: restoreCategories ? true : preferences.clockReminders,
      timesheetAlerts: restoreCategories ? true : preferences.timesheetAlerts,
      approvals: restoreCategories ? true : preferences.approvals,
    });

    if (next.soundEnabled) {
      primeNotificationAudio();
    }

    if (supported && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await requestNotificationPermission();
    } else {
      if (next.soundEnabled) {
        playNotificationPing();
      }
      dispatchGlobalToast({
        type: "success",
        message: "Notifications enabled!",
      });
    }
  };

  const requestNotificationPermission = async () => {
    if (!supported) return;

    primeNotificationAudio();
    setLoading(true);
    setStatusMessage(null);

    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js").catch(() => null);
      }

      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        const restoreCategories =
          !preferences.clockReminders &&
          !preferences.timesheetAlerts &&
          !preferences.approvals;
        const saved = updatePreferences({
          ...preferences,
          enabled: true,
          clockReminders: restoreCategories ? true : preferences.clockReminders,
          timesheetAlerts: restoreCategories ? true : preferences.timesheetAlerts,
          approvals: restoreCategories ? true : preferences.approvals,
        });
        if (saved.soundEnabled) {
          playNotificationPing();
        }
        dispatchGlobalToast({
          type: "success",
          message: "Push notifications successfully enabled!",
        });
        sendTestNotification(saved);
      } else if (result === "denied") {
        dispatchGlobalToast({
          type: "error",
          message:
            "Browser notifications were blocked. In-app settings remain configurable below.",
        });
      }
    } catch {
      dispatchGlobalToast({
        type: "error",
        message: "Failed to request permission. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async (overridePrefs = preferences) => {
    if (!areNotificationsEnabled(overridePrefs)) {
      setStatusMessage("Enable notifications and at least one category before sending a test.");
      return;
    }

    if (overridePrefs.soundEnabled) {
      playNotificationPing();
    }

    dispatchGlobalToast({
      type: "notification",
      title: "ClockWise People",
      message: "Push and popup notifications are active on this device.",
      targetHref: "/dashboard",
    });

    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker?.ready.catch(() => null);

    const title = "ClockWise People";
    const body =
      "Push notifications are active! You will receive timely clocking and timesheet alerts.";

    if (registration?.active) {
      registration.active.postMessage({
        payload: {
          body,
          tag: "test-notification",
          title,
          url: "/dashboard",
        },
        type: "SHOW_NOTIFICATION",
      });
      return;
    }

    try {
      new Notification(title, {
        body,
        icon: "/assets/android-chrome-192x192.png",
        tag: "test-notification",
      });
    } catch {
      // Notification constructor fallback
    }
  };

  const isGranted = supported && permission === "granted";
  const isDenied = supported && permission === "denied";

  return (
    <section className="grid min-w-0 gap-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`grid size-8 place-items-center rounded-md ${
                effectiveEnabled
                  ? "bg-accent/10 text-accent"
                  : "bg-surface-muted text-muted"
              }`}
            >
              {effectiveEnabled ? (
                <BellRing className="size-4" />
              ) : (
                <BellOff className="size-4" />
              )}
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">
                Push &amp; Alert Notifications
              </h2>
              <p className="text-xs text-muted">
                Control device alerts, shift reminders, popup notifications, and alert chimes.
              </p>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex w-max items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-2xs ${
            !preferences.enabled
              ? "bg-slate-600 text-white"
              : !effectiveEnabled
                ? "bg-amber-600 text-white"
                : !supported
                  ? "bg-[#2E9B5F] text-white"
                  : isGranted
                    ? "bg-[#2E9B5F] text-white"
                    : isDenied
                      ? "bg-rose-600 text-white"
                      : "bg-amber-500 text-white"
          }`}
        >
          {!preferences.enabled ? (
            <>
              <BellOff className="size-3.5" />
              Disabled
            </>
          ) : !effectiveEnabled ? (
            <>
              <BellOff className="size-3.5" />
              Muted (No Categories)
            </>
          ) : !supported ? (
            <>
              <CheckCircle2 className="size-3.5" />
              In-App Active
            </>
          ) : isGranted ? (
            <>
              <CheckCircle2 className="size-3.5" />
              Active &amp; Enabled
            </>
          ) : isDenied ? (
            <>
              <ShieldAlert className="size-3.5" />
              Browser Blocked
            </>
          ) : (
            <>
              <Radio className="size-3.5 animate-pulse" />
              Permission Needed
            </>
          )}
        </span>
      </div>

      {/* Master Enable / Disable Control */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {preferences.enabled ? "Notifications Enabled" : "Notifications Disabled"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {preferences.enabled
              ? "Turn off to mute all device notifications, shift reminders, popup alerts, and notification sounds."
              : "All device push notifications, shift reminders, notification popups, and alert sounds are off."}
          </p>
          {statusMessage ? (
            <p className="mt-1.5 text-xs font-semibold text-foreground/80">
              {statusMessage}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={preferences.enabled}
          onClick={toggleMasterNotifications}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer ${
            preferences.enabled
              ? "border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
              : "btn btn-primary text-white shadow-primary"
          }`}
        >
          {preferences.enabled ? (
            <>
              <BellOff className="size-3.5" />
              Disable Notifications
            </>
          ) : (
            <>
              <Bell className="size-3.5" />
              Enable Notifications
            </>
          )}
        </button>
      </div>

      {/* Permission Block Banner / Action */}
      {preferences.enabled && supported && !isGranted && !isDenied && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-amber-950">
                Enable device notifications to stay updated
              </p>
              <p className="mt-0.5 text-xs font-medium text-amber-900">
                Allow browser permission so ClockWise People can also send OS/mobile alerts outside the active tab.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={requestNotificationPermission}
              className="btn btn-primary rounded-full px-5 py-2 text-xs font-bold shadow-primary disabled:opacity-50"
            >
              <Bell className="size-3.5" />
              {loading ? "Enabling..." : "Allow Browser Alerts"}
            </button>
          </div>
        </div>
      )}

      {preferences.enabled && isDenied && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50/70 p-3.5 shadow-2xs">
          <p className="text-xs font-black text-rose-950">
            Browser push alerts are currently blocked
          </p>
          <p className="mt-1 text-xs font-medium text-rose-900">
            To allow OS/mobile alerts, click the lock / tune icon in your browser address bar, set Notifications to &quot;Allow&quot;, and refresh the page.
          </p>
        </div>
      )}

      {/* Preferences Checklist */}
      <div className="grid gap-2.5">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
          Notification Preferences
        </p>

        <div
          className={`grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 ${
            !preferences.enabled ? "opacity-55" : ""
          }`}
        >
          {/* Clock In / Out Reminders */}
          <label
            className={`flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all ${
              preferences.enabled
                ? "cursor-pointer hover:bg-surface-muted"
                : "cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!preferences.enabled}
              checked={preferences.enabled && preferences.clockReminders}
              onChange={(e) =>
                updatePreferences({
                  ...preferences,
                  clockReminders: e.target.checked,
                })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F] disabled:cursor-not-allowed"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-foreground">
                <Clock className="size-3 text-accent" />
                Shift Reminders
              </p>
              <p className="text-[11px] text-muted">
                10m &amp; 30m reminders before clock in and lunch.
              </p>
            </div>
          </label>

          {/* Timesheet Alerts */}
          <label
            className={`flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all ${
              preferences.enabled
                ? "cursor-pointer hover:bg-surface-muted"
                : "cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!preferences.enabled}
              checked={preferences.enabled && preferences.timesheetAlerts}
              onChange={(e) =>
                updatePreferences({
                  ...preferences,
                  timesheetAlerts: e.target.checked,
                })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F] disabled:cursor-not-allowed"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-foreground">
                <FileCheck className="size-3 text-accent" />
                Timesheet Alerts
              </p>
              <p className="text-[11px] text-muted">
                Notices when timesheets are rejected or need edits.
              </p>
            </div>
          </label>

          {/* Approvals & Leave */}
          <label
            className={`flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all ${
              preferences.enabled
                ? "cursor-pointer hover:bg-surface-muted"
                : "cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!preferences.enabled}
              checked={preferences.enabled && preferences.approvals}
              onChange={(e) =>
                updatePreferences({
                  ...preferences,
                  approvals: e.target.checked,
                })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F] disabled:cursor-not-allowed"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-foreground">
                <CheckCircle2 className="size-3 text-accent" />
                Approvals &amp; Leave
              </p>
              <p className="text-[11px] text-muted">
                Updates on approved and processed requests.
              </p>
            </div>
          </label>

          {/* Alert Sound */}
          <label
            className={`flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all ${
              preferences.enabled
                ? "cursor-pointer hover:bg-surface-muted"
                : "cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!preferences.enabled}
              checked={preferences.enabled && preferences.soundEnabled}
              onChange={(e) =>
                updatePreferences({
                  ...preferences,
                  soundEnabled: e.target.checked,
                })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F] disabled:cursor-not-allowed"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-foreground">
                {preferences.enabled && preferences.soundEnabled ? (
                  <Volume2 className="size-3 text-accent" />
                ) : (
                  <VolumeX className="size-3 text-muted" />
                )}
                Alert Sound
              </p>
              <p className="text-[11px] text-muted">
                Play chime when notifications and popups arrive.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Test Button Footer */}
      {effectiveEnabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[11px] font-medium text-muted">
            {isGranted
              ? "Notifications are active and connected to your device service worker."
              : "In-app alerts and reminders are active according to your preferences above."}
          </p>
          <button
            type="button"
            onClick={() => sendTestNotification()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted hover:border-primary shadow-2xs transition-colors cursor-pointer"
          >
            <Send className="size-3 text-accent" />
            Send Test Notification
          </button>
        </div>
      )}
    </section>
  );
}
