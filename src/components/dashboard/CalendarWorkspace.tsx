"use client";

import LiveClock from "@/components/LiveClock";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  GripVertical,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

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
  initialActivePanelKey = null,
  isManager,
  managerCalendar,
  panels,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [activePanelKey, setActivePanelKey] = useState<string | null>(initialActivePanelKey);
  const [showServices, setShowServices] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"me" | "team">(
    isManager && managerCalendar ? "team" : "me",
  );

  const activePanel = useMemo(
    () => panels.find((panel) => panel.key === activePanelKey) ?? null,
    [activePanelKey, panels],
  );
  const [panelWidthPercent, setPanelWidthPercent] = useState(80);
  const resizingRef = useRef(false);
  const [switcherPos, setSwitcherPos] = useState({ x: 16, y: 80 });
  const switcherDragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const switcherElRef = useRef<HTMLDivElement>(null);

  const handleSwitcherPointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault();
    const el = e.target as HTMLElement;
    el.setPointerCapture(e.pointerId);
    switcherDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: switcherPos.x,
      origY: switcherPos.y,
    };
  }, [switcherPos]);

  useEffect(() => {
    const handleMove = (e: globalThis.PointerEvent) => {
      if (!switcherDragRef.current.dragging) return;
      setSwitcherPos({
        x: switcherDragRef.current.origX + (e.clientX - switcherDragRef.current.startX),
        y: switcherDragRef.current.origY + (e.clientY - switcherDragRef.current.startY),
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

  useEffect(() => {
    if (!activePanel) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.innerWidth < 768) {
      setPanelWidthPercent(90);
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activePanel]);

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

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-0">
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
                    setActivePanelKey(panel.key);
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

      <div className="mx-4 flex-1 sm:mx-6">
        {workspaceMode === "team" && isManager && managerCalendar
          ? managerCalendar
          : employeeCalendar}
      </div>

      <div className="mx-4 mb-4 mt-4 sm:mx-6">
        {employeeClock}
      </div>

      {activePanel ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/15 backdrop-blur-sm">
          <div
            className="flex h-full flex-col overflow-hidden border-l border-border bg-surface shadow-2xl animate-slide-in-right"
            style={{ width: `${panelWidthPercent}vw` }}
          >
            <div
              className="flex shrink-0 cursor-ew-resize items-center justify-center px-1 py-0.5 hover:bg-accent/10"
              onPointerDown={handleResizeStart}
            >
              <GripVertical className="size-3 text-muted" />
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  {activePanel.key === "leave" ? "Leave" :
                   activePanel.key === "manager-review" ? "Approvals" :
                   activePanel.key === "people" ? "People" :
                   activePanel.key === "company" ? "Company" :
                   activePanel.key === "account" ? "Account" :
                   activePanel.key === "policies" ? "Governance" : "Services"}
                </span>
                <h3 className="mt-1 text-xl font-bold text-foreground">{activePanel.label}</h3>
                <p className="mt-1 text-sm text-muted">{activePanel.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePanelKey(null)}
                className="icon-btn mt-0.5 shrink-0 text-muted hover:bg-surface-muted hover:text-foreground"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
              {activePanel.content}
            </div>
          </div>
        </div>
      ) : null}

      {isSuperAdmin ? (
        <div
          ref={switcherElRef}
          style={{ left: switcherPos.x, top: switcherPos.y }}
          className="fixed z-50 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={handleSwitcherPointerDown}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Company</span>
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
      ) : null}
    </div>
  );
}
