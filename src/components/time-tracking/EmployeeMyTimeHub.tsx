"use client";

import { useState, type ReactNode } from "react";
import { CalendarPlus, ChevronDown, Clock3, Send } from "lucide-react";

type EmployeeMyTimeHubProps = {
  clock: ReactNode;
  leave: ReactNode;
  review: ReactNode;
  clockBadge?: ReactNode;
  timesheetBadge?: ReactNode;
  leaveBadge?: ReactNode;
};

function StepItem({
  badge,
  children,
  description,
  icon,
  step,
  title,
  tone,
  open,
  onToggle,
}: {
  badge?: ReactNode;
  children: ReactNode;
  description: string;
  icon: ReactNode;
  step: string;
  title: string;
  tone: "primary" | "warning" | "holiday";
  open: boolean;
  onToggle: () => void;
}) {
  const toneBadge = {
    primary: "bg-primary",
    warning: "bg-warning",
    holiday: "bg-holiday",
  }[tone];
  const toneRim = {
    primary: "border-l-primary",
    warning: "border-l-warning",
    holiday: "border-l-holiday",
  }[tone];

  return (
    <section
      className={`card grid min-w-0 grid-cols-1 overflow-hidden border-l-4 ${toneRim}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${toneBadge}`}
        >
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-base font-semibold text-foreground">
            {icon}
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        </span>
        {badge ? <span className="shrink-0">{badge}</span> : null}
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="min-w-0 border-t border-border p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}

export default function EmployeeMyTimeHub({
  clock,
  leave,
  review,
  clockBadge,
  timesheetBadge,
  leaveBadge,
}: EmployeeMyTimeHubProps) {
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({
    "1": true,
    "2": false,
    "3": false,
  });

  const toggle = (step: string) =>
    setOpenSteps((prev) => ({ ...prev, [step]: !prev[step] }));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <StepItem
        step="1"
        title="Clock in and out"
        description="Record your start, breaks, and end of day from any workstation."
        icon={<Clock3 className="size-4 text-accent" />}
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
        icon={<Send className="size-4 text-accent" />}
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
        description="Check your balances, plan leave with the advisor, and convert overtime to TOIL."
        icon={<CalendarPlus className="size-4 text-accent" />}
        badge={leaveBadge}
        tone="holiday"
        open={openSteps["3"]}
        onToggle={() => toggle("3")}
      >
        {leave}
      </StepItem>
    </div>
  );
}