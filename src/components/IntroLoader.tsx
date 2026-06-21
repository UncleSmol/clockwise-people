"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";

type ResourceStatus = "idle" | "loading" | "ready" | "error";

type IntroResource = {
  id: string;
  label: string;
  status: ResourceStatus;
};

type IntroLoaderProps = {
  children: ReactNode;
  resources?: IntroResource[];
  isPreparing?: boolean;
  minimumVisibleMs?: number;
};

const DEFAULT_RESOURCES: IntroResource[] = [
  { id: "company", label: "Company workspace", status: "idle" },
  { id: "people", label: "People records", status: "idle" },
  { id: "time", label: "Time and attendance", status: "idle" },
  { id: "payroll", label: "Payroll preparation", status: "idle" },
];

function isTerminal(status: ResourceStatus) {
  return status === "ready" || status === "error";
}

function getAssetStatus(root: HTMLElement | null) {
  if (!root) {
    return { pending: 0, total: 0 };
  }

  const images = Array.from(root.querySelectorAll("img"));
  const videos = Array.from(root.querySelectorAll("video"));
  const iframes = Array.from(root.querySelectorAll("iframe"));
  const manualPending = Array.from(
    root.querySelectorAll("[data-intro-pending='true']"),
  );

  const pendingImages = images.filter((image) => !image.complete);
  const pendingVideos = videos.filter(
    (video) => video.readyState < 3 && video.dataset.introFailed !== "true",
  );
  const pendingFrames = iframes.filter((frame) => {
    try {
      return frame.contentDocument?.readyState !== "complete";
    } catch {
      return false;
    }
  });

  return {
    pending:
      pendingImages.length +
      pendingVideos.length +
      pendingFrames.length +
      manualPending.length,
    total: images.length + videos.length + iframes.length + manualPending.length,
  };
}

export default function IntroLoader({
  children,
  resources = DEFAULT_RESOURCES,
  isPreparing = false,
  minimumVisibleMs = 900,
}: IntroLoaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const [pageReady, setPageReady] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [assetStatus, setAssetStatus] = useState({ pending: 0, total: 0 });
  const [canReveal, setCanReveal] = useState(false);

  const activeResources = useMemo(
    () => resources.filter((resource) => !isTerminal(resource.status)),
    [resources],
  );

  const totalSteps = Math.max(resources.length + assetStatus.total + 2, 1);
  const completedSteps =
    resources.length -
    activeResources.length +
    (pageReady ? 1 : 0) +
    (fontsReady ? 1 : 0) +
    Math.max(assetStatus.total - assetStatus.pending, 0);
  const progress = Math.min(
    100,
    Math.round((completedSteps / totalSteps) * 100),
  );

  const isReady =
    pageReady &&
    fontsReady &&
    assetStatus.pending === 0 &&
    activeResources.length === 0 &&
    !isPreparing;

  const currentLabel =
    activeResources[0]?.label ??
    (assetStatus.pending > 0
      ? "Preparing interface assets"
      : isPreparing
        ? "Preparing workspace"
        : "Final checks");

  const contentVisible = isReady && canReveal;

  useEffect(() => {
    startedAt.current = Date.now();
    const markReady = () => setPageReady(true);

    if (document.readyState === "complete") {
      markReady();
      return;
    }

    window.addEventListener("load", markReady, { once: true });
    return () => window.removeEventListener("load", markReady);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if ("fonts" in document) {
      document.fonts.ready.then(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      });
    } else {
      queueMicrotask(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = contentRef.current;

    const refreshAssets = () => {
      setAssetStatus(getAssetStatus(root));
    };

    refreshAssets();

    if (!root) {
      return;
    }

    const observer = new MutationObserver(refreshAssets);
    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["src", "data-intro-pending"],
    });

    const assets = root.querySelectorAll("img, video, iframe");
    const interval = window.setInterval(refreshAssets, 250);

    assets.forEach((asset) => {
      asset.addEventListener("load", refreshAssets);
      asset.addEventListener("loadeddata", refreshAssets);
      asset.addEventListener("canplaythrough", refreshAssets);
      asset.addEventListener("error", () => {
        if (asset instanceof HTMLVideoElement) {
          asset.dataset.introFailed = "true";
        }

        refreshAssets();
      });
    });

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      assets.forEach((asset) => {
        asset.removeEventListener("load", refreshAssets);
        asset.removeEventListener("loadeddata", refreshAssets);
        asset.removeEventListener("canplaythrough", refreshAssets);
      });
    };
  }, [children]);

  useEffect(() => {
    if (!isReady) return;

    const elapsed = Date.now() - (startedAt.current || Date.now());
    const remaining = Math.max(minimumVisibleMs - elapsed, 0);
    const timeout = window.setTimeout(() => setCanReveal(true), remaining);

    return () => window.clearTimeout(timeout);
  }, [isReady, minimumVisibleMs]);

  return (
    <>
      <div
        ref={contentRef}
        aria-hidden={!contentVisible}
        className={contentVisible ? "contents" : "pointer-events-none opacity-0"}
      >
        {children}
      </div>

      {!contentVisible && (
        <section
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-background px-6 text-foreground"
        >
          <div className="w-full max-w-xl text-center">
            <div className="mx-auto mb-8 grid size-28 place-items-center rounded-2xl border border-border bg-surface p-2 shadow-sm sm:size-32">
              <Image
                src="/assets/clockwise-people-logo.png"
                alt="ClockWise People logo"
                width={128}
                height={128}
                className="size-full rounded-xl object-cover"
                priority
              />
            </div>

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              ClockWise People
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-primary sm:text-6xl">
              Getting your workspace ready
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base font-medium text-muted sm:text-lg">
              {currentLabel}
            </p>

            <div className="mt-8 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-sm font-medium text-muted">
              <span>{progress}% prepared</span>
              <span>
                {activeResources.length + assetStatus.pending} waiting
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
