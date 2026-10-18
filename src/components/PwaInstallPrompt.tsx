"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
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
    const markInstalled = () => {
      localStorage.setItem("clockwise-install-installed", "true");
      localStorage.setItem("clockwise-install-dismissed", "true");
      setInstallEvent(null);
      setVisible(false);
    };

    if (isStandalone()) {
      markInstalled();
      return;
    }

    if (
      localStorage.getItem("clockwise-install-installed") === "true" ||
      localStorage.getItem("clockwise-install-dismissed") === "true"
    ) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      if (isStandalone() || localStorage.getItem("clockwise-install-installed") === "true") {
        return;
      }

      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      markInstalled();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;

    if (choice.outcome === "accepted") {
      localStorage.setItem("clockwise-install-installed", "true");
      localStorage.setItem("clockwise-install-dismissed", "true");
      setVisible(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem("clockwise-install-dismissed", "true");
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-4 bottom-20 sm:bottom-4 z-[70] mx-auto max-w-xl rounded-2xl border border-border/80 bg-surface p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary shadow-soft">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">Install ClockWise People</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            Install this device for faster clocking and reminder notifications.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-soft hover:bg-primary-hover transition-colors cursor-pointer"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full border border-border bg-surface px-5 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-soft"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          aria-label="Close install prompt"
          className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
          onClick={dismiss}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
