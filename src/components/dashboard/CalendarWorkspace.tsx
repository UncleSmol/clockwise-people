"use client";

import LiveClock from "@/components/LiveClock";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  GripVertical,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  PanelContext,
  WorkspaceSectionContext,
} from "./workspace-context";
import { usePanelBridge } from "./panel-bridge";
import ViewportSidebar from "./ViewportSidebar";

function getPanelIcon(key: string) {
  const k = key.toLowerCase();
  if (k.includes("report") || k.includes("payroll") || k.includes("analytic")) return FileSpreadsheet;
  if (k.includes("attendance") || k.includes("workforce")) return Users;
  if (k.includes("people") || k.includes("employee")) return Users;
  if (k.includes("review") || k.includes("approval")) return ClipboardCheck;
  if (k.includes("leave")) return CalendarDays;
  if (k.includes("company")) return Building2;
  if (k.includes("account") || k.includes("settings")) return Settings2;
  if (k.includes("polic") || k.includes("govern")) return ShieldCheck;
  return ShieldCheck;
}

type WorkspacePanel = {
  content: ReactNode;
  description: string;
  key: string;
  label: string;
  tone?: "primary" | "subtle";
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
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const { registerNavItems, registerPanelOpener } = usePanelBridge();
  const [activePanelKey, setActivePanelKey] = useState<string | null>(initialActivePanelKey);
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
  const [switcherPos, setSwitcherPos] = useState({ x: 16, y: 80 });
  const [switcherExpanded, setSwitcherExpanded] = useState(false);
  const switcherDragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const switcherElRef = useRef<HTMLDivElement>(null);

  const handleSwitcherPointerDown = useCallback((e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("select")) return;
    e.preventDefault();
    const el = switcherElRef.current;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    switcherDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: switcherPos.x,
      origY: switcherPos.y,
    };
  }, [switcherPos]);

  useEffect(() => {
    let rAFId: number | null = null;
    let latestX = switcherPos.x;
    let latestY = switcherPos.y;

    const handleMove = (e: globalThis.PointerEvent) => {
      const drag = switcherDragRef.current;
      if (!drag.dragging) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;

      const newX = drag.origX + dx;
      const newY = drag.origY + dy;
      const maxX = Math.max(0, window.innerWidth - (switcherElRef.current?.offsetWidth ?? 160));
      const maxY = Math.max(0, window.innerHeight - (switcherElRef.current?.offsetHeight ?? 48));
      const clampedX = Math.max(8, Math.min(maxX, newX));
      const clampedY = Math.max(8, Math.min(maxY, newY));

      latestX = clampedX;
      latestY = clampedY;

      if (rAFId !== null) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        if (switcherElRef.current) {
          switcherElRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
        }
      });
    };

    const handleUp = () => {
      const drag = switcherDragRef.current;
      if (!drag.dragging) return;
      drag.dragging = false;
      if (drag.moved) {
        setSwitcherPos({ x: latestX, y: latestY });
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp);
    return () => {
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [switcherPos.x, switcherPos.y]);

  const handleSwitcherClick = useCallback(() => {
    if (switcherDragRef.current.moved) return;
    setSwitcherExpanded((value) => !value);
  }, []);

  const handleOpenPanel = useCallback((key: string) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelWidthPercent(90);
    }
    setActivePanelKey(key);
  }, []);

  useEffect(() => {
    registerPanelOpener(handleOpenPanel);
  }, [handleOpenPanel, registerPanelOpener]);

  useEffect(() => {
    registerNavItems(
      panels.map((panel) => ({ key: panel.key, label: panel.label })),
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

  const isTeamMode = workspaceMode === "team" && isManager && managerCalendar;

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
    <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-col gap-0">
      <section className="card mx-4 mb-4 mt-4 overflow-hidden sm:mx-6">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
<div className="min-w-0">
  <h1 className="truncate text-sm font-bold text-foreground sm:text-lg">{companyName}</h1>
  <p className="truncate text-[10px] text-muted sm:text-xs">
    {currentDateLabel} · <LiveClock />
  </p>
</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isManager && managerCalendar ? (
              <div className="flex gap-1 rounded-lg border border-border bg-background p-1 text-xs font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("me")}
                  className={`rounded-md px-3 py-1.5 transition-all ${
                    workspaceMode === "me"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  My time
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("team")}
                  className={`rounded-md px-3 py-1.5 transition-all ${
                    workspaceMode === "team"
                      ? "bg-slate-900 text-white shadow-xs"
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
        <div className="mx-4 mb-4 sm:mx-6">
          <div className="grid grid-cols-3 gap-1 rounded-full border border-border bg-background p-1 text-xs font-semibold">
            {(
              [
                ["clock", "Clock", Clock3],
                ["calendar", "Calendar", CalendarDays],
                ["records", "Records", ClipboardCheck],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileTab(key)}
                className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 ${
                  mobileTab === key
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-surface-muted"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-4 min-w-0 flex-1 sm:mx-6">
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
        panelStyle={{ width: `${panelWidthPercent}vw` }}
        gutter={
          <div
            className="flex cursor-ew-resize items-center justify-center px-1 py-0.5 hover:bg-accent/10"
            onPointerDown={handleResizeStart}
          >
            <GripVertical className="size-3 text-muted" />
          </div>
        }
        header={
          <div className="z-10 flex shrink-0 flex-col border-b border-border bg-surface/90 backdrop-blur-md shadow-xs">
            {/* Top Row: Title, Eyebrow & Close button */}
            <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent">
                  Workspace Panel
                </p>
                <h3 className="mt-0.5 text-lg font-extrabold text-foreground sm:text-xl">
                  {activePanel?.label ?? ""}
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {activePanel?.description ?? ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActivePanelKey(null)}
                className="grid size-8 shrink-0 place-items-center rounded border border-border bg-background text-foreground hover:bg-surface-muted hover:border-slate-400 transition-colors shadow-2xs"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Quick Workspace Switcher Tab Bar */}
            {panels.length > 1 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border bg-surface-muted/60 backdrop-blur-xs px-4 py-2 sm:px-6 scrollbar-none">
                {panels.map((panel) => {
                  const isActive = panel.key === activePanelKey;
                  const Icon = getPanelIcon(panel.key);
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
                                    : panel.label.split(" ")[0];

                  return (
                    <button
                      key={panel.key}
                      type="button"
                      onClick={() => setActivePanelKey(panel.key)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "border border-border bg-white text-foreground hover:bg-slate-100 hover:border-slate-300"
                      }`}
                    >
                      <Icon className={`size-3.5 ${isActive ? "text-white" : "text-muted"}`} />
                      {shortLabel}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        }
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 bg-white"
      >
        {activePanel?.content}
      </ViewportSidebar>

      {isSuperAdmin ? (
        <div
          ref={switcherElRef}
          style={{
            transform: `translate3d(${switcherPos.x}px, ${switcherPos.y}px, 0)`,
            left: 0,
            top: 0,
            willChange: "transform",
          }}
          className="fixed z-50 touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={handleSwitcherPointerDown}
        >
          {switcherExpanded ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
              <button
                type="button"
                onClick={handleSwitcherClick}
                aria-label="Collapse company switcher"
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground"
              >
                <ChevronUp className="size-4" />
              </button>
              <select
                value={companyName}
                onChange={(e) => {
                  const target = e.target as HTMLSelectElement;
                  const selected = target.options[target.selectedIndex];
                  const companyId = selected.dataset.companyId;
                  if (companyId) {
                    document.cookie = `active_company_id=${companyId}; path=/; max-age=31536000`;
                    router.refresh();
                  }
                }}
                className="max-w-[140px] truncate bg-transparent text-xs font-semibold text-foreground outline-none cursor-pointer"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.name} data-company-id={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSwitcherClick}
              aria-label="Expand company switcher"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg"
            >
              <Building2 className="size-4 text-accent" />
              <span className="pointer-events-none max-w-[140px] truncate text-xs font-semibold text-foreground">
                {companyName}
              </span>
            </button>
          )}
        </div>
      ) : null}
    </div>
      </WorkspaceSectionContext.Provider>
    </PanelContext.Provider>
  );
}
