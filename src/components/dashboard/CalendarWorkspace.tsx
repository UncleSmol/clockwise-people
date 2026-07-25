"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Clock3,
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
  currentDateLabel,
  employeeCalendar,
  employeeClock,
  initialActivePanelKey = null,
  isManager,
  managerCalendar,
  panels,
}: CalendarWorkspaceProps) {
  const [activePanelKey, setActivePanelKey] = useState<string | null>(initialActivePanelKey);
  const [showServices, setShowServices] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"me" | "team">(
    isManager && managerCalendar ? "team" : "me",
  );

  const activePanel = useMemo(
    () => panels.find((panel) => panel.key === activePanelKey) ?? null,
    [activePanelKey, panels],
  );

  useEffect(() => {
    if (!activePanel) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activePanel]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-0">
      <section className="card mx-4 mb-4 mt-4 overflow-hidden sm:mx-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-foreground">{companyName}</h1>
              <p className="text-xs text-muted">{currentDateLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isManager && managerCalendar ? (
              <div className="flex gap-1 rounded-full border border-border bg-background p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("me")}
                  className={`rounded-full px-3 py-1.5 ${
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
                  className={`rounded-full px-3 py-1.5 ${
                    workspaceMode === "team"
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:text-accent"
                  }`}
                >
                  Team
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowServices(!showServices)}
                className="icon-btn text-muted hover:text-foreground"
                aria-label="Services"
              >
                <LayoutGrid className="size-4" />
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
        <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6">
          <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">{activePanel.label}</h3>
                <p className="mt-0.5 text-sm text-muted">{activePanel.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePanelKey(null)}
                className="icon-btn text-muted hover:text-foreground"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {activePanel.content}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
