"use client";

import LiveClock from "@/components/LiveClock";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GripVertical, Laptop, X } from "lucide-react";
import {
  PanelContext,
  WorkspaceSectionContext,
} from "./workspace-context";
import { usePanelBridge } from "./panel-bridge";
import ViewportSidebar from "./ViewportSidebar";
import { useZenMode } from "@/components/zen/ZenModeContext";

type WorkspacePanel = {
  content: ReactNode;
  description: string;
  key: string;
  label: string;
  tone?: "primary" | "subtle";
  desktopOnly?: boolean;
};

type CalendarWorkspaceProps = {
  companyName: string;
  companies: { id: string; name: string }[];
  isSuperAdmin: boolean;
  currentDateLabel: string;
  employeeCalendar: ReactNode;
  employeeClock: ReactNode;
  employeeHub?: ReactNode;
  initialActivePanelKey?: string | null;
  isManager: boolean;
  managerCalendar?: ReactNode;
  panels: WorkspacePanel[];
  zenView?: ReactNode;
};

export default function CalendarWorkspace({
  companyName,
  companies,
  isSuperAdmin,
  currentDateLabel,
  employeeCalendar,
  employeeClock,
  employeeHub,
  initialActivePanelKey = null,
  isManager,
  managerCalendar,
  panels,
  zenView,
}: CalendarWorkspaceProps) {
  const { registerNavItems, registerPanelOpener, registerPanelCloser, registerActivePanelKey } = usePanelBridge();
  const [activePanelKey, setActivePanelKey] = useState<string | null>(initialActivePanelKey);

  useEffect(() => {
    if (initialActivePanelKey) {
      setActivePanelKey(initialActivePanelKey);
    }
  }, [initialActivePanelKey]);

  useEffect(() => {
    registerActivePanelKey(activePanelKey);
  }, [activePanelKey, registerActivePanelKey]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"clock" | "calendar" | "records">("clock");
  const [workspaceMode, setWorkspaceMode] = useState<"me" | "team">(
    isManager && managerCalendar ? "team" : "me",
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const activePanel = useMemo(
    () => panels.find((panel) => panel.key === activePanelKey) ?? null,
    [activePanelKey, panels],
  );
  const [panelWidthPercent, setPanelWidthPercent] = useState(80);
  const resizingRef = useRef(false);

  const handleOpenPanel = useCallback((key: string) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelWidthPercent(90);
    }
    setActivePanelKey(key);
  }, []);

  useEffect(() => {
    registerPanelOpener(handleOpenPanel);
    registerPanelCloser(() => setActivePanelKey(null));
  }, [handleOpenPanel, registerPanelOpener, registerPanelCloser]);

  useEffect(() => {
    const handleNav = (detail?: { tab?: string; highlightEntryId?: string | null; highlightLeaveId?: string | null }) => {
      let isReview = detail?.tab === "review" || Boolean(detail?.highlightEntryId);
      let isLeave = detail?.tab === "leave" || Boolean(detail?.highlightLeaveId);

      if (typeof window !== "undefined") {
        const search = new URLSearchParams(window.location.search);
        if (search.get("highlightEntryId") || search.get("tab") === "review") {
          isReview = true;
        } else if (search.get("highlightLeaveId") || search.get("panel") === "leave") {
          isLeave = true;
        }
      }

      if (isReview) {
        setMobileTab("records");
        setWorkspaceMode("me");
        setActivePanelKey(null);
      } else if (isLeave) {
        setWorkspaceMode("me");
        setActivePanelKey("leave");
      }
    };

    handleNav();

    const onNavEvent = (e: Event) => {
      handleNav((e as CustomEvent).detail);
    };

    window.addEventListener("clockwise:notification-nav", onNavEvent);
    window.addEventListener("popstate", () => handleNav());
    return () => {
      window.removeEventListener("clockwise:notification-nav", onNavEvent);
      window.removeEventListener("popstate", () => handleNav());
    };
  }, []);

  useEffect(() => {
    registerNavItems(
      panels.map((panel) => ({
        key: panel.key,
        label: panel.label,
        desktopOnly: panel.desktopOnly,
      })),
    );
  }, [panels, registerNavItems]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (ev: globalThis.PointerEvent) => {
      if (!resizingRef.current) return;
      const vw = window.innerWidth;
      const pct = ((vw - ev.clientX) / vw) * 100;
      const maxPct = vw < 768 ? 90 : 80;
      setPanelWidthPercent(Math.min(maxPct, Math.max(40, pct)));
    };

    const handlePointerUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }, []);

  const isTeamMode = !isMobile && workspaceMode === "team" && isManager && managerCalendar;
  const { isZenMode, zenModeEnabled } = useZenMode();

  if (zenModeEnabled && isZenMode && zenView) {
    return (
      <PanelContext.Provider value={{ openPanel: handleOpenPanel }}>
        <WorkspaceSectionContext.Provider value="full">
          <div className="h-dvh max-h-dvh w-full flex flex-col p-0 m-0 overflow-hidden bg-transparent">
            {zenView}
          </div>
        </WorkspaceSectionContext.Provider>
      </PanelContext.Provider>
    );
  }

  return (
    <PanelContext.Provider value={{ openPanel: handleOpenPanel }}>
      <WorkspaceSectionContext.Provider
        value={
          employeeHub
            ? "full"
            : isMobile && !isTeamMode
              ? mobileTab === "records"
                ? "records"
                : mobileTab === "calendar"
                  ? "calendar"
                  : "full"
              : "full"
        }
      >
    <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 max-w-full flex-col gap-0 overflow-x-hidden">
      <section className="card mx-3 mb-4 mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft sm:mx-6">
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-extrabold tracking-tight text-foreground sm:text-xl">{companyName}</h1>
              </div>
              <p className="truncate text-[11px] font-medium text-muted sm:text-xs">
                {currentDateLabel} · <LiveClock />
              </p>
            </div>
          </div>
          <div className="hidden sm:flex shrink-0 items-center gap-1.5">
            {isManager && managerCalendar ? (
              <div className="flex gap-1 rounded-full border border-border bg-background/80 p-1 text-xs font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("me")}
                  className={`rounded-full px-3.5 py-1.5 transition-all ${
                    workspaceMode === "me"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  My Time
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("team")}
                  className={`rounded-full px-3.5 py-1.5 transition-all ${
                    workspaceMode === "team"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  My Team
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isMobile && !isTeamMode && !employeeHub ? (
        <div className="mx-3 mb-4 sm:mx-6">
          <div className="grid grid-cols-3 gap-1 rounded-full border border-border bg-surface p-1 text-xs font-semibold shadow-2xs">
            {(
              [
                ["clock", "Clock"],
                ["calendar", "Calendar"],
                ["records", "Records"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileTab(key)}
                className={`flex items-center justify-center rounded-full px-3 py-2 ${
                  mobileTab === key
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-foreground hover:bg-surface-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-3 min-w-0 flex-1 sm:mx-6 pb-32 sm:pb-8">
        {isTeamMode ? (
          managerCalendar
        ) : employeeHub ? (
          employeeHub
        ) : isMobile ? (
          <div className="grid gap-4">
            <div className={mobileTab === "clock" ? "" : "hidden"}>{employeeClock}</div>
            <div className={mobileTab === "clock" ? "hidden" : ""}>{employeeCalendar}</div>
          </div>
        ) : (
          <div className="grid gap-4">
            {employeeClock}
            {employeeCalendar}
          </div>
        )}
      </div>

      <ViewportSidebar
        open={Boolean(activePanel)}
        onClose={() => setActivePanelKey(null)}
        maxWidth=""
        backdropClassName="bg-slate-950/40 backdrop-blur-xs"
        panelStyle={isMobile ? { width: "100vw" } : { width: `${panelWidthPercent}vw` }}
        gutter={
          isMobile ? null : (
            <div
              className="flex cursor-ew-resize items-center justify-center px-1 py-0.5 hover:bg-accent/10"
              onPointerDown={handleResizeStart}
            >
              <GripVertical className="size-3 text-muted" />
            </div>
          )
        }
        header={
          <div className="z-10 flex shrink-0 flex-col border-b border-border bg-surface/95 backdrop-blur-md shadow-2xs">
            {/* Top Row: Title, Eyebrow & Close button */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:pt-4 sm:pb-3">
              <div className="min-w-0">
                <p className="hidden sm:block text-[10px] font-black uppercase tracking-[0.16em] text-accent">
                  Workspace Panel
                </p>
                <h3 className="truncate text-base font-extrabold tracking-tight text-foreground sm:text-xl">
                  {activePanel?.label ?? ""}
                </h3>
                <p className="hidden sm:block mt-0.5 truncate text-xs text-muted">
                  {activePanel?.description ?? ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActivePanelKey(null)}
                className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground hover:bg-surface-muted transition-colors shadow-2xs"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Quick Workspace Switcher Tab Bar (Desktop Only) */}
            {panels.length > 1 ? (
              <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto border-t border-border bg-surface-muted/50 backdrop-blur-xs px-4 py-2 sm:px-6 scrollbar-none">
                {panels
                  .filter((panel) => !panel.desktopOnly)
                  .map((panel) => {
                    const isActive = panel.key === activePanelKey;
                    const shortLabel =
                      panel.key === "reports"
                        ? "Reports"
                        : panel.key === "manager-review"
                          ? "Approvals"
                          : panel.key === "people"
                            ? "People"
                            : panel.key === "leave"
                              ? "Leave"
                              : panel.key === "company"
                                ? "Company"
                                : panel.key === "account"
                                  ? "Account"
                                  : panel.key === "policies"
                                    ? "Policies"
                                    : panel.key === "attendance"
                                      ? "Today's Attendance"
                                      : panel.key === "payslips"
                                        ? "Payslips"
                                        : panel.key === "sysadmin"
                                          ? "SysAdmin"
                                          : panel.label.split(" ")[0];

                    return (
                      <button
                        key={panel.key}
                        type="button"
                        onClick={() => setActivePanelKey(panel.key)}
                        className={`inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
              </div>
            ) : null}
          </div>
        }
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-4 sm:px-6 sm:py-6 pb-28 sm:pb-16 bg-surface"
      >
        {isMobile && activePanel?.desktopOnly ? (
          <div className="mx-auto my-auto flex max-w-sm flex-col items-center justify-center rounded-2xl border border-border bg-surface-muted/60 p-6 text-center shadow-xs">
            <div className="mb-3 grid size-12 place-items-center rounded-full bg-accent/15 text-accent">
              <Laptop className="size-6" />
            </div>
            <h4 className="text-base font-bold text-foreground">Desktop Feature</h4>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              <strong>{activePanel.label}</strong> is an advanced administrative feature optimized for larger desktop displays. Please sign in on a computer or laptop to access these management tools.
            </p>
            <button
              type="button"
              onClick={() => setActivePanelKey(null)}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary-hover transition-colors"
            >
              Return to Workspace
            </button>
          </div>
        ) : (
          activePanel?.content
        )}
      </ViewportSidebar>
    </div>
      </WorkspaceSectionContext.Provider>
    </PanelContext.Provider>
  );
}
