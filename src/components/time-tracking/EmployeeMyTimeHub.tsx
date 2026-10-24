"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import PwaInstallButton from "@/components/PwaInstallButton";

type EmployeeMyTimeHubProps = {
  clock: ReactNode;
  leave: ReactNode;
  review: ReactNode;
  report?: ReactNode;
  clockBadge?: ReactNode;
  timesheetBadge?: ReactNode;
  leaveBadge?: ReactNode;
  reportBadge?: ReactNode;
};

function StepItem({
  badge,
  children,
  description,
  step,
  title,
  tone = "primary",
  open,
  onToggle,
}: {
  badge?: ReactNode;
  children: ReactNode;
  description: string;
  step: string;
  title: string;
  tone?: "primary" | "warning" | "holiday";
  open: boolean;
  onToggle: () => void;
}) {
  const headerBgClass =
    tone === "primary"
      ? "bg-gradient-to-r from-[#2E9B5F] to-[#23834C] text-white shadow-primary"
      : tone === "warning"
        ? "bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-soft"
        : "bg-gradient-to-r from-[#6C5CE7] to-[#5345C7] text-white";

  return (
    <section className="grid min-w-0 max-w-full grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-all">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex w-full items-start gap-3.5 px-4 py-4 text-left transition-[filter] duration-200 hover:brightness-105 sm:px-5 ${headerBgClass}`}
      >
        <span
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-[#111827] shadow-sm"
        >
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-white break-words leading-tight">
            {title}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-white/90">
            {description}
          </span>
          {badge ? (
            <div className="mt-2 inline-flex items-center">
              {badge}
            </div>
          ) : null}
        </span>
        <span className="flex shrink-0 items-start pt-1">
          <ChevronDown
            className={`size-4 shrink-0 text-white transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className="min-w-0 max-w-full border-t border-border bg-surface p-3.5 sm:p-5">{children}</div>
      ) : null}
    </section>
  );
}

export default function EmployeeMyTimeHub({
  clock,
  leave,
  review,
  report,
  clockBadge,
  timesheetBadge,
  leaveBadge,
  reportBadge,
}: EmployeeMyTimeHubProps) {
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({
    "1": true,
    "2": false,
    "3": false,
    "4": false,
  });

  useEffect(() => {
    const handleUrlOrEvent = (detail?: { tab?: string; highlightEntryId?: string | null; highlightLeaveId?: string | null }) => {
      let shouldOpenReview = false;
      let shouldOpenLeave = false;

      if (detail?.tab === "review" || detail?.highlightEntryId) {
        shouldOpenReview = true;
      } else if (detail?.tab === "leave" || detail?.highlightLeaveId) {
        shouldOpenLeave = true;
      }

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("highlightEntryId") || params.get("tab") === "review") {
          shouldOpenReview = true;
        } else if (params.get("highlightLeaveId") || params.get("tab") === "leave" || params.get("panel") === "leave") {
          shouldOpenLeave = true;
        }
      }

      if (shouldOpenReview) {
        setOpenSteps((prev) => ({ ...prev, "2": true }));
      } else if (shouldOpenLeave) {
        setOpenSteps((prev) => ({ ...prev, "3": true }));
      }
    };

    handleUrlOrEvent();

    const handleNav = (e: Event) => {
      handleUrlOrEvent((e as CustomEvent).detail);
    };

    const onPopState = () => {
      handleUrlOrEvent();
    };

    window.addEventListener("clockwise:notification-nav", handleNav);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("clockwise:notification-nav", handleNav);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const toggle = (step: string) =>
    setOpenSteps((prev) => ({ ...prev, [step]: !prev[step] }));

  return (
    <div className="grid min-w-0 max-w-full grid-cols-1 gap-4">
      <StepItem
        step="1"
        title="Clock in and out"
        description="Record your start, breaks, and end of day from any workstation."
        badge={clockBadge}
        tone="primary"
        open={openSteps["1"]}
        onToggle={() => toggle("1")}
      >
        {clock}
      </StepItem>

      <StepItem
        step="2"
        title="Review and adjust"
        description="Fix the times for this period, add past days, then submit when ready."
        badge={timesheetBadge}
        tone="warning"
        open={openSteps["2"]}
        onToggle={() => toggle("2")}
      >
        {review}
      </StepItem>

      <StepItem
        step="3"
        title="Leave and accruals"
        description="Check your balances, plan leave with the advisor, and track your time off."
        badge={leaveBadge}
        tone="holiday"
        open={openSteps["3"]}
        onToggle={() => toggle("3")}
      >
        {leave}
      </StepItem>

      {report ? (
        <StepItem
          step="4"
          title="My hours & reports"
          description="Audit your worked hours, overtime, and leave by payroll cycle."
          badge={reportBadge}
          tone="primary"
          open={openSteps["4"]}
          onToggle={() => toggle("4")}
        >
          {report}
        </StepItem>
      ) : null}

      <PwaInstallButton />
    </div>
  );
}