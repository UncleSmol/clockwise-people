"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, BellRing, Info, X } from "lucide-react";
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
      const duration = payload.durationMs ?? (payload.type === "error" ? 5500 : 4500);

      // Play iPhone ping sound for incoming notifications or success alerts
      if (payload.type === "notification") {
        playNotificationPing();
      }

      const newItem: ToastItem = {
        ...payload,
        id,
        durationMs: duration,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        // Keep at most 2 active toasts so they do not obstruct the screen
        const existing = prev.filter((t) => t.id !== id);
        return [...existing.slice(-1), newItem];
      });

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

  // Listen to window custom event so any non-react action callback or background sync can dispatch
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

      {/* Floating sliding popup container anchored at the bottom of the screen */}
      <aside
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-5 inset-x-0 mx-auto z-[99999] pointer-events-none flex flex-col items-center justify-end px-4 gap-2 w-full max-w-sm sm:max-w-md select-none"
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error";
          const isSuccess = toast.type === "success";
          const isNotification = toast.type === "notification";

          return (
            <div
              key={toast.id}
              role="alert"
              className="pointer-events-auto w-full rounded-2xl border border-white/20 bg-slate-900/95 text-white backdrop-blur-2xl shadow-2xl p-3.5 sm:p-4 flex items-start gap-3 transition-all transform animate-in slide-in-from-bottom duration-300 ease-out"
              style={{
                boxShadow: isError
                  ? "0 20px 45px -10px rgba(225, 29, 72, 0.35), 0 0 20px rgba(225, 29, 72, 0.2)"
                  : isSuccess
                  ? "0 20px 45px -10px rgba(16, 185, 129, 0.35), 0 0 20px rgba(16, 185, 129, 0.2)"
                  : isNotification
                  ? "0 20px 45px -10px rgba(59, 130, 246, 0.35), 0 0 20px rgba(59, 130, 246, 0.2)"
                  : "0 20px 45px -10px rgba(15, 23, 42, 0.5)",
              }}
            >
              {/* Type Icon */}
              <div
                className={`size-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  isError
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                    : isSuccess
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : isNotification
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "bg-slate-700/50 border-slate-600/50 text-slate-300"
                }`}
              >
                {isError ? (
                  <AlertCircle className="size-5" />
                ) : isSuccess ? (
                  <CheckCircle2 className="size-5" />
                ) : isNotification ? (
                  <BellRing className="size-5" />
                ) : (
                  <Info className="size-5" />
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 min-w-0 pr-1">
                {toast.title ? (
                  <p className="text-xs sm:text-sm font-black tracking-tight text-white leading-snug">
                    {toast.title}
                  </p>
                ) : null}
                <p
                  className={`text-xs font-semibold text-slate-200 leading-relaxed ${
                    toast.title ? "mt-0.5" : ""
                  }`}
                >
                  {toast.message}
                </p>

                {toast.targetHref ? (
                  <Link
                    href={toast.targetHref}
                    onClick={() => dismissToast(toast.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 underline mt-1.5 transition-colors"
                  >
                    View details &rarr;
                  </Link>
                ) : null}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}
