"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";

const GESTURE_WINDOW_MS = 1500;
const MIN_VISIBLE_MS = 450;

export default function GlobalActionLoader() {
  const [visible, setVisible] = useState(false);
  const gestureRef = useRef(0);
  const visibleAtRef = useRef(0);
  const pendingRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || originalFetchRef.current) {
      return;
    }

    const originalFetch = window.fetch;
    originalFetchRef.current = originalFetch;

    const settleRequest = () => {
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current > 0) {
        return;
      }

      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }

      const remaining = Math.max(
        MIN_VISIBLE_MS - (Date.now() - visibleAtRef.current),
        0,
      );

      hideTimerRef.current = window.setTimeout(() => {
        if (pendingRef.current === 0) {
          setVisible(false);
        }
      }, remaining);
    };

    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const isUserInitiated =
        Date.now() - gestureRef.current <= GESTURE_WINDOW_MS;

      const call = originalFetch.call(window, input, init);

      if (!isUserInitiated) {
        return call;
      }

      if (pendingRef.current === 0) {
        visibleAtRef.current = Date.now();
      }

      pendingRef.current += 1;
      setVisible(true);

      return call.finally(settleRequest);
    };

    const markGesture = () => {
      gestureRef.current = Date.now();
    };

    const gestureEvents: ["pointerdown", "touchstart", "keydown", "submit"] = [
      "pointerdown",
      "touchstart",
      "keydown",
      "submit",
    ];

    gestureEvents.forEach((event) =>
      window.addEventListener(event, markGesture, true),
    );

    return () => {
      gestureEvents.forEach((event) =>
        window.removeEventListener(event, markGesture, true),
      );

      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }

      if (
        originalFetchRef.current &&
        window.fetch.name === "patchedFetch"
      ) {
        window.fetch = originalFetchRef.current;
      }

      originalFetchRef.current = null;
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      aria-busy={visible}
      aria-live="polite"
      className={`fixed inset-0 z-[100] grid min-h-screen place-items-center bg-surface px-6 text-foreground transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="w-full max-w-xl text-center" role="status">
        <BrandMark
          className="mb-8 flex justify-center"
          imageSize={112}
          imageClassName="card size-24 rounded-2xl border border-border bg-surface p-2 sm:size-28"
          textClassName="text-sm font-semibold uppercase tracking-[0.18em] text-accent"
        />
        <h1 className="text-3xl font-semibold tracking-normal text-primary sm:text-4xl">
          Hold tight
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted sm:text-lg">
          talking to the server&hellip;
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <span
            className="size-8 animate-spin rounded-full border-2 border-surface-muted border-t-primary"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}