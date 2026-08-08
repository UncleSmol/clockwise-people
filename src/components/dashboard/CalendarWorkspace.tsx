"use client";

import LiveClock from "@/components/LiveClock";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronUp,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  GripVertical,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  PanelContext,
  WorkspaceSectionContext,
} from "./workspace-context";
import ViewportSidebar from "./ViewportSidebar";

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

function panelIcon(label: string) {
  const key = label.toLowerCase();
  if (key.includes("clock")) return Clock3;
  if (key.includes("people") || key.includes("employee")) return Users;
  if (key.includes("approve") || key.includes("review")) return ClipboardCheck;
  if (key.includes("leave")) return CalendarRange;
  if (key.includes("company")) return Building2;
  if (key.includes("account") || key.includes("settings")) return Settings2;
  if (key.includes("policy") || key.includes("document")) return ShieldCheck;
  return BriefcaseBusiness;
}

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
  const [activePanelKey, setActivePanelKey] = useState<string | null>(initialActivePanelKey);
  const [showServices, setShowServices] = useState(false);
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
    const el = e.target as HTMLElement;
    el.setPointerCapture(e.pointerId);
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
    const handleMove = (e: globalThis.PointerEvent) => {
      const drag = switcherDragRef.current;
      if (!drag.dragging) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      setSwitcherPos({
        x: drag.origX + dx,
        y: drag.origY + dy,
      });
    };
    const handleUp = () => {
      switcherDragRef.current.dragging = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

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
              <div className="flex gap-0.5 rounded-full border border-border bg-background p-0.5 text-[10px] font-semibold sm:text-xs">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("me")}
                  className={`rounded-full px-2 py-1 sm:px-3 sm:py-1.5 ${
                    workspaceMode === "me"
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:text-accent"
                  }`}
                >
                  My time
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("team")}
                  className={`rounded-full px-2 py-1 sm:px-3 sm:py-1.5 ${
                    workspaceMode === "team"
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:text-accent"
                  }`}
                >
                  Team
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setShowServices(!showServices)}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-muted hover:bg-surface-muted hover:text-foreground sm:icon-btn sm:px-0 sm:py-0 sm:text-inherit sm:font-normal"
                aria-label="Services"
              >
                <LayoutGrid className="size-3.5 sm:size-4" />
                <span className="sm:hidden">Menu</span>
              </button>

            </div>
          </div>
        </div>
      </section>

      {showServices && panels.length > 0 && (
        <section className="card mx-4 mb-4 overflow-hidden sm:mx-6">
          <div className="grid gap-1 p-2">
            {panels.map((panel) => {
              const Icon = panelIcon(panel.label);
              return (
                <button
                  key={panel.key}
                  type="button"
                  onClick={() => {
                    handleOpenPanel(panel.key);
                    setShowServices(false);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-surface-muted"
                >
                  <Icon className="size-4 text-muted" />
                  {panel.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

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
        backdropClassName="bg-foreground/15 backdrop-blur-sm"
        panelStyle={{ width: `${panelWidthPercent}vw` }}
        gutter={
          <div
            className="flex cursor-ew-resize items-center justify-center px-1 py-0.5 hover:bg-accent/10"
            onPointerDown={handleResizeStart}
          >
            <GripVertical className="size-3 text-muted" />
          </div>
        }
        eyebrow={
          activePanel
            ? activePanel.key === "leave"
              ? "Leave"
              : activePanel.key === "manager-review"
                ? "Approvals"
                : activePanel.key === "people"
                  ? "People"
                  : activePanel.key === "company"
                    ? "Company"
                    : activePanel.key === "account"
                      ? "Account"
                      : activePanel.key === "policies"
                        ? "Governance"
                        : "Services"
            : ""
        }
        title={activePanel?.label ?? ""}
        description={activePanel?.description ?? ""}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6"
      >
        {activePanel?.content}
      </ViewportSidebar>

      {isSuperAdmin ? (
        <div
          ref={switcherElRef}
          style={{ left: switcherPos.x, top: switcherPos.y }}
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
