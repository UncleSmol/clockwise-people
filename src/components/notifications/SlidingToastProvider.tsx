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
    return "Submit last week's draft to clock in";
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
      const id = payload.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = payload.durationMs ?? (payload.type === "error" ? 4500 : 3500);

      // Play audio ping
      if (payload.type === "notification" || payload.type === "success") {
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

      {/* Floating sliding popup at the top of the screen — same vibrant emerald color as time picker */}
      <aside
        aria-live="polite"
        aria-label="Notifications"
        className="fixed top-5 inset-x-0 mx-auto z-[99999] pointer-events-none flex flex-col items-center justify-start px-4 gap-2 w-fit max-w-[92vw] sm:max-w-md select-none"
      >
        {toasts.map((toast) => {
          const minimalText = formatMinimalMessage(toast);

          return (
            <div
              key={toast.id}
              role="alert"
              className="pointer-events-auto rounded-full border border-white/25 bg-gradient-to-r from-[#2E9B5F] to-[#258550] text-white shadow-[0_12px_28px_-6px_rgba(46,155,95,0.45)] px-4 py-2 sm:py-2.5 flex items-center gap-2.5 transition-all transform animate-in slide-in-from-top-4 fade-in duration-300 ease-out"
            >
              {/* Type Icon in soft translucent circle */}
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
                {toast.type === "error" ? (
                  <AlertCircle className="size-3.5 stroke-[2.5]" />
                ) : toast.type === "notification" ? (
                  <Bell className="size-3.5 stroke-[2.5]" />
                ) : toast.type === "info" ? (
                  <Info className="size-3.5 stroke-[2.5]" />
                ) : (
                  <Check className="size-3.5 stroke-[2.5]" />
                )}
              </div>

              {/* Minimal Text Message */}
              <span className="text-xs sm:text-[13px] font-bold text-white tracking-tight truncate max-w-[240px] sm:max-w-xs">
                {minimalText}
              </span>

              {/* Action Link (if targetHref provided) */}
              {toast.targetHref ? (
                <Link
                  href={toast.targetHref}
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-full bg-white text-[#258550] hover:bg-white/90 px-3 py-1 text-[11px] font-black shadow-xs hover:scale-105 active:scale-95 transition-all whitespace-nowrap cursor-pointer ml-1"
                >
                  Review
                </Link>
              ) : null}

              {/* Quick Dismiss Button */}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-white/70 hover:text-white p-0.5 rounded-full hover:bg-white/15 transition-colors shrink-0 cursor-pointer ml-0.5"
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
