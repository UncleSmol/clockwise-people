"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean(window.navigator.standalone))
  );
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem("clockwise-install-dismissed") === "true") {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const fallbackTimer = window.setTimeout(() => {
      if (!isStandalone()) setVisible(true);
    }, 1200);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;

    if (choice.outcome === "accepted") {
      localStorage.setItem("clockwise-install-dismissed", "true");
      setVisible(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem("clockwise-install-dismissed", "true");
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-md border border-border bg-surface p-3 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Install ClockWise People</p>
          <p className="mt-1 text-sm text-muted">
            Install this device for faster clocking and reminder notifications.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          aria-label="Close install prompt"
          className="grid size-8 place-items-center rounded-md border border-border bg-background text-foreground"
          onClick={dismiss}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
