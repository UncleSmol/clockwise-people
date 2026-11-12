"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, AlertCircle, Bell, Info, X } from "lucide-react";
import Link from "next/link";
import { playNotificationPing } from "@/lib/audio/notification-sound";
import {
  areNotificationsEnabled,
  areNotificationSoundsEnabled,
  getNotificationPreferences,
  useNotificationPreferences,
} from "@/lib/notifications/preferences";

export type ToastType = "success" | "error" | "notification" | "info";

export interface ToastPayload {
  id?: string;
  type: ToastType;
  title?: string;
  message: string;
  targetHref?: string;
  durationMs?: number;
}

interface ToastItem extends ToastPayload {
  id: string;
  createdAt: number;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (toast: ToastPayload) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Formats messages into clean, minimal, punchy text without clutter
 */
function formatMinimalMessage(toast: ToastPayload): string {
  const raw = (toast.title ? `${toast.title}: ${toast.message}` : toast.message) || "";

  if (raw.toLowerCase().includes("unsubmitted draft") || raw.toLowerCase().includes("cannot clock in")) {
    return "Submit past drafts to clock in";
  }
  if (raw.toLowerCase().includes("clocked in successfully")) {
    return "Clocked in";
  }
  if (raw.toLowerCase().includes("clocked out successfully")) {
    return "Clocked out";
  }
  if (raw.toLowerCase().includes("lunch break started")) {
    return "Lunch started";
  }
  if (raw.toLowerCase().includes("lunch break ended")) {
    return "Lunch ended";
  }
  if (raw.toLowerCase().includes("timesheet submitted")) {
    return "Timesheet submitted";
  }
  if (raw.toLowerCase().includes("leave application submitted")) {
    return "Leave requested";
  }
  if (raw.toLowerCase().includes("timesheet updated")) {
    return "Timesheet updated";
  }

  // Remove trailing period and keep it clean and minimal
  return raw.replace(/\.$/, "").trim();
}

/**
 * Global helper to trigger a toast from anywhere (even outside React tree or inside callbacks)
 */
export function dispatchGlobalToast(payload: ToastPayload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app:sliding-toast", {
        detail: payload,
      })
    );
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: dispatchGlobalToast,
      dismissToast: () => {},
    };
  }
  return ctx;
}

export function SlidingToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const preferences = useNotificationPreferences();
  const notificationsEnabled = areNotificationsEnabled(preferences);

  useEffect(() => {
    if (!notificationsEnabled) {
      setToasts((prev) => prev.filter((t) => t.type !== "notification"));
    }
  }, [notificationsEnabled]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (payload: ToastPayload) => {
      const prefs = getNotificationPreferences();

      // Suppress notification-type popups when notifications are disabled
      if (payload.type === "notification" && !areNotificationsEnabled(prefs)) {
        return;
      }

      const id = payload.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = payload.durationMs ?? (payload.type === "error" ? 4500 : 3500);

      // Play audio ping only when notifications and alert sounds are enabled
      if (
        (payload.type === "notification" || payload.type === "success") &&
        areNotificationSoundsEnabled(prefs)
      ) {
        playNotificationPing();
      }

      const newItem: ToastItem = {
        ...payload,
        id,
        durationMs: duration,
        createdAt: Date.now(),
      };

      setToasts(() => [newItem]);

      // Auto dismiss after duration
      if (timersRef.current.has(id)) {
        clearTimeout(timersRef.current.get(id)!);
      }

      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);

      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    function handleEvent(event: Event) {
      const custom = event as CustomEvent<ToastPayload>;
      if (custom.detail) {
        showToast(custom.detail);
      }
    }

    window.addEventListener("app:sliding-toast", handleEvent);
    return () => {
      window.removeEventListener("app:sliding-toast", handleEvent);
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Floating sliding popup at the top of the screen — harmonized with the Time Picker card design */}
      <aside
        aria-live="polite"
        aria-label="Notifications"
        className="fixed top-5 inset-x-0 mx-auto z-[99999] pointer-events-none flex flex-col items-center justify-start px-4 gap-2.5 w-fit max-w-[94vw] sm:max-w-md select-none"
      >
        {toasts.map((toast) => {
          const minimalText = formatMinimalMessage(toast);
          const isError = toast.type === "error";
          const isInfo = toast.type === "info";

          return (
            <div
              key={toast.id}
              role="alert"
              className={`toast-harmonized-capsule ${isError ? "toast-error" : isInfo ? "toast-info" : ""} pointer-events-auto rounded-full sm:rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2.5 sm:gap-3 transition-all transform animate-in slide-in-from-top-4 fade-in duration-300 ease-out`}
            >
              {/* Glowing Pivot Pulse Cap (matching Time Picker dial pivot) */}
              <span className="relative flex size-2 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                    isError ? "bg-rose-500" : isInfo ? "bg-blue-500" : "bg-primary"
                  }`}
                />
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    isError
                      ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                      : isInfo
                        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"
                        : "bg-primary shadow-[0_0_8px_rgba(46,155,95,0.7)]"
                  }`}
                />
              </span>

              {/* Type Icon in rounded badge matching Time Picker header */}
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-xl border shadow-2xs ${
                  isError
                    ? "border-rose-500/25 bg-rose-500/10 text-rose-600"
                    : isInfo
                      ? "border-blue-500/25 bg-blue-500/10 text-blue-600"
                      : "border-primary/25 bg-primary/10 text-primary"
                }`}
              >
                {isError ? (
                  <AlertCircle className="size-4 stroke-[2.4]" />
                ) : toast.type === "notification" ? (
                  <Bell className="size-4 stroke-[2.4]" />
                ) : isInfo ? (
                  <Info className="size-4 stroke-[2.4]" />
                ) : (
                  <Check className="size-4 stroke-[2.5]" />
                )}
              </div>

              {/* Minimal Text Message */}
              <span className="text-xs sm:text-[13px] font-black text-foreground tracking-tight truncate max-w-[220px] sm:max-w-xs">
                {minimalText}
              </span>

              {/* Action Link (if targetHref provided) */}
              {toast.targetHref ? (
                <Link
                  href={toast.targetHref}
                  onClick={() => dismissToast(toast.id)}
                  className="btn-aurora-done rounded-full px-3.5 py-1 text-[11px] font-extrabold text-white shadow-xs hover:scale-105 active:scale-95 transition-all whitespace-nowrap cursor-pointer ml-1"
                >
                  Review
                </Link>
              ) : null}

              {/* Quick Dismiss Button (matching Time Picker close button) */}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="size-6 rounded-full flex items-center justify-center border border-slate-200/80 bg-white/70 hover:bg-white text-slate-500 hover:text-slate-900 shadow-2xs transition-colors shrink-0 cursor-pointer ml-0.5"
              >
                <X className="size-3.5 stroke-[2.2]" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}
