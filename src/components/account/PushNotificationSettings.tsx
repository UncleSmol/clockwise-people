"use client";

import { useState } from "react";
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
} from "lucide-react";
import { dispatchGlobalToast } from "@/components/notifications/SlidingToastProvider";
import {
  playNotificationPing,
  primeNotificationAudio,
} from "@/lib/audio/notification-sound";

export default function PushNotificationSettings() {
  const [supported] = useState(() => {
    if (typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator) {
      return true;
    }
    return false;
  });
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Notification Preferences (persisted in localStorage)
  const [preferences, setPreferences] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("clockwise_push_preferences");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore corrupted local state
        }
      }
    }
    return {
      clockReminders: true,
      timesheetAlerts: true,
      approvals: true,
    };
  });

  const savePreferences = (next: typeof preferences) => {
    setPreferences(next);
    localStorage.setItem("clockwise_push_preferences", JSON.stringify(next));
  };

  const requestNotificationPermission = async () => {
    if (!supported) return;

    primeNotificationAudio();
    setLoading(true);
    setStatusMessage(null);

    try {
      // Ensure service worker is registered
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js").catch(() => null);
      }

      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        playNotificationPing();
        dispatchGlobalToast({ type: "success", message: "Push notifications successfully enabled!" });
        // Send a welcome test notification
        sendTestNotification();
      } else if (result === "denied") {
        dispatchGlobalToast({ type: "error", message: "Notifications were blocked. Please allow notifications in your browser site settings." });
      }
    } catch {
      dispatchGlobalToast({ type: "error", message: "Failed to request permission. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    playNotificationPing();
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker?.ready.catch(() => null);

    const title = "ClockWise People";
    const body = "🔔 Push notifications are active! You will receive timely clocking and timesheet alerts.";

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

  if (!supported) {
    return (
      <section className="card grid gap-3 rounded-lg border-2 border-border p-4 sm:p-6 shadow-2xs">
        <div className="flex items-center gap-2 text-muted">
          <BellOff className="size-5" />
          <h2 className="text-lg font-extrabold text-foreground">Push Notifications</h2>
        </div>
        <p className="text-xs font-semibold text-muted">
          Push notifications are not supported on this browser or device.
        </p>
      </section>
    );
  }

  const isGranted = permission === "granted";
  const isDenied = permission === "denied";

  return (
    <section className="grid min-w-0 gap-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-accent/10 text-accent">
              <BellRing className="size-4" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Push Notifications</h2>
              <p className="text-xs text-muted">
                Receive shift reminders, timesheet review alerts, and approval notices on this device.
              </p>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex w-max items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-2xs ${
            isGranted
              ? "bg-[#2E9B5F] text-white"
              : isDenied
                ? "bg-rose-600 text-white"
                : "bg-amber-500 text-white"
          }`}
        >
          {isGranted ? (
            <>
              <CheckCircle2 className="size-3.5" />
              Active & Enabled
            </>
          ) : isDenied ? (
            <>
              <ShieldAlert className="size-3.5" />
              Blocked by Browser
            </>
          ) : (
            <>
              <Radio className="size-3.5 animate-pulse" />
              Permission Needed
            </>
          )}
        </span>
      </div>


      {/* Permission Block Banner / Action */}
      {!isGranted && !isDenied && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-amber-950">
                Enable device notifications to stay updated
              </p>
              <p className="mt-0.5 text-xs font-medium text-amber-900">
                ClockWise People will notify you before scheduled shifts, when timesheets need review, and on leave approvals.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={requestNotificationPermission}
              className="btn btn-primary rounded-full px-5 py-2 text-xs font-bold shadow-primary disabled:opacity-50"
            >
              <Bell className="size-3.5" />
              {loading ? "Enabling..." : "Enable Push Notifications"}
            </button>
          </div>
        </div>
      )}

      {isDenied && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50/70 p-3.5 shadow-2xs">
          <p className="text-xs font-black text-rose-950">
            Notifications are currently blocked by your browser
          </p>
          <p className="mt-1 text-xs font-medium text-rose-900">
            To enable notifications, click the lock / tune icon in your browser address bar, set Notifications to &quot;Allow&quot;, and refresh the page.
          </p>
        </div>
      )}

      {/* Preferences Checklist */}
      <div className="grid gap-2.5">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
          Notification Preferences
        </p>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {/* Clock In / Out Reminders */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={preferences.clockReminders}
              onChange={(e) =>
                savePreferences({ ...preferences, clockReminders: e.target.checked })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F]"
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
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={preferences.timesheetAlerts}
              onChange={(e) =>
                savePreferences({ ...preferences, timesheetAlerts: e.target.checked })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F]"
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
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-all hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={preferences.approvals}
              onChange={(e) =>
                savePreferences({ ...preferences, approvals: e.target.checked })
              }
              className="mt-0.5 size-4 accent-[#2E9B5F]"
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
        </div>
      </div>

      {/* Test Button Footer */}
      {isGranted && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[11px] font-medium text-muted">
            Notifications are active and connected to your device service worker.
          </p>
          <button
            type="button"
            onClick={sendTestNotification}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted hover:border-primary shadow-2xs transition-colors"
          >
            <Send className="size-3 text-accent" />
            Send Test Notification
          </button>
        </div>
      )}
    </section>
  );
}
