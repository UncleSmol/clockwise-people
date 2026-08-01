import type { ReactNode } from "react";
import { CalendarPlus, Clock3, Send, Sparkles } from "lucide-react";

type EmployeeMyTimeHubProps = {
  clock: ReactNode;
  leave: ReactNode;
  review: ReactNode;
};

function StepHeading({
  description,
  icon,
  step,
  title,
}: {
  description: string;
  icon: ReactNode;
  step: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          {icon}
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </div>
  );
}

export default function EmployeeMyTimeHub({
  clock,
  leave,
  review,
}: EmployeeMyTimeHubProps) {
  return (
    <div className="grid gap-4">
      <section className="card grid gap-3 p-4 sm:p-5">
        <StepHeading
          step="1"
          title="Clock in and out"
          description="Record your start, breaks, and end of day from any workstation."
          icon={<Clock3 className="size-4 text-accent" />}
        />
        {clock}
      </section>

      <section className="grid gap-3">
        <StepHeading
          step="2"
          title="Review and adjust"
          description="Fix the times for this period, add past days, then submit when ready. The detailed calendar is expandable below."
          icon={<Send className="size-4 text-accent" />}
        />
        {review}
      </section>

      <section className="grid gap-3">
        <StepHeading
          step="3"
          title="Leave and accruals"
          description="Check your balances, plan leave with the advisor, and convert overtime to TOIL."
          icon={<CalendarPlus className="size-4 text-accent" />}
        />
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-accent" />
            Leave advisor
          </p>
          {leave}
        </div>
      </section>
    </div>
  );
}
