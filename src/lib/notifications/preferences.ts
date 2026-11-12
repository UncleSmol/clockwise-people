"use client";

import { useSyncExternalStore } from "react";

export const NOTIFICATION_PREFERENCES_STORAGE_KEY = "clockwise_push_preferences";
const PREFERENCES_CHANGED_EVENT = "clockwise:push-preferences-changed";

export interface NotificationPreferences {
  /** Master switch for notifications, popups, reminders, and alert sounds */
  enabled: boolean;
  /** Play sound chimes when notifications or alerts arrive */
  soundEnabled: boolean;
  /** Shift, lunch, and clock-out reminders */
  clockReminders: boolean;
  /** Timesheet rejection / review alerts */
  timesheetAlerts: boolean;
  /** Approval and leave decision notifications */
  approvals: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  soundEnabled: true,
  clockReminders: true,
  timesheetAlerts: true,
  approvals: true,
};

function normalizePreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const record = raw as Partial<NotificationPreferences>;
  const clockReminders =
    typeof record.clockReminders === "boolean"
      ? record.clockReminders
      : DEFAULT_NOTIFICATION_PREFERENCES.clockReminders;
  const timesheetAlerts =
    typeof record.timesheetAlerts === "boolean"
      ? record.timesheetAlerts
      : DEFAULT_NOTIFICATION_PREFERENCES.timesheetAlerts;
  const approvals =
    typeof record.approvals === "boolean"
      ? record.approvals
      : DEFAULT_NOTIFICATION_PREFERENCES.approvals;
  const soundEnabled =
    typeof record.soundEnabled === "boolean"
      ? record.soundEnabled
      : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled;

  // Backward compatibility: if an older saved object turned all 3 categories off
  // before the master `enabled` key existed, treat notifications as disabled.
  const hasAnyCategory = clockReminders || timesheetAlerts || approvals;
  const enabled =
    typeof record.enabled === "boolean" ? record.enabled : hasAnyCategory;

  return {
    enabled,
    soundEnabled,
    clockReminders,
    timesheetAlerts,
    approvals,
  };
}

let cachedRaw: string | null | undefined;
let cachedSnapshot: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedSnapshot;
    }

    cachedRaw = raw;
    cachedSnapshot = raw
      ? normalizePreferences(JSON.parse(raw))
      : DEFAULT_NOTIFICATION_PREFERENCES;
    return cachedSnapshot;
  } catch {
    return cachedSnapshot;
  }
}

function getServerNotificationPreferences(): NotificationPreferences {
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

export function saveNotificationPreferences(
  next: NotificationPreferences,
): NotificationPreferences {
  const normalized = normalizePreferences(next);
  const serialized = JSON.stringify(normalized);

  cachedRaw = serialized;
  cachedSnapshot = normalized;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        NOTIFICATION_PREFERENCES_STORAGE_KEY,
        serialized,
      );
    } catch {
      // Ignore storage quota/privacy mode errors
    }

    window.dispatchEvent(
      new CustomEvent<NotificationPreferences>(PREFERENCES_CHANGED_EVENT, {
        detail: normalized,
      }),
    );
  }

  return normalized;
}

export function subscribeNotificationPreferences(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === NOTIFICATION_PREFERENCES_STORAGE_KEY
    ) {
      cachedRaw = undefined;
      listener();
    }
  };

  const handleCustom = () => {
    listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(PREFERENCES_CHANGED_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, handleCustom);
  };
}

export function useNotificationPreferences(): NotificationPreferences {
  return useSyncExternalStore(
    subscribeNotificationPreferences,
    getNotificationPreferences,
    getServerNotificationPreferences,
  );
}

export function areNotificationsEnabled(
  prefs: NotificationPreferences = getNotificationPreferences(),
): boolean {
  return (
    prefs.enabled &&
    (prefs.clockReminders || prefs.timesheetAlerts || prefs.approvals)
  );
}

export function areNotificationSoundsEnabled(
  prefs: NotificationPreferences = getNotificationPreferences(),
): boolean {
  return areNotificationsEnabled(prefs) && prefs.soundEnabled;
}

export function shouldDeliverAppNotification(
  category: string | null | undefined,
  title?: string | null,
  prefs: NotificationPreferences = getNotificationPreferences(),
): boolean {
  if (!areNotificationsEnabled(prefs)) {
    return false;
  }

  const cat = (category || "").toLowerCase();
  const heading = (title || "").toLowerCase();

  if (cat.includes("leave") || cat.includes("approved") || heading.includes("approved")) {
    return prefs.approvals;
  }

  if (cat.includes("timesheet") || cat.includes("rejected") || heading.includes("timesheet")) {
    return prefs.timesheetAlerts;
  }

  if (
    cat.includes("clock") ||
    cat.includes("shift") ||
    cat.includes("reminder") ||
    cat.includes("lunch")
  ) {
    return prefs.clockReminders;
  }

  return prefs.clockReminders || prefs.timesheetAlerts || prefs.approvals;
}
