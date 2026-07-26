"use client";

import { ChevronDown, Clock, DollarSign, FileCheck, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState } from "react";
import { updateCompanyRules } from "@/lib/account/actions";
import type { CompanySettings } from "@/lib/foundation/schema";

type CompanyRulesFormProps = {
  settings: CompanySettings;
};

const initialState = {
  ok: true,
  message: "",
};

function Section({
  category,
  defaultRules,
  icon,
  title,
  description,
}: {
  category: string;
  defaultRules: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  const [state, formAction, pending] = useActionState(updateCompanyRules, initialState);

  return (
    <details className="group rounded-lg border border-border bg-surface open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden [&::marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="text-muted">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-4 sm:p-6">
        <p className="mb-3 text-xs text-muted">{description}</p>
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="category" value={category} />
          <textarea
            name="rules"
            defaultValue={defaultRules}
            rows={8}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground outline-none"
          />
          {state.message ? (
            <p className={`text-xs font-medium ${state.ok ? "text-success" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

export default function CompanyRulesForm({ settings }: CompanyRulesFormProps) {
  return (
    <section className="card grid gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Company rules</h2>
        <p className="mt-1 text-sm text-muted">
          Configure overtime, TOIL, leave, and approval rules as JSON.
        </p>
      </div>
      <div className="grid gap-3">
        <Section
          category="overtime_rules"
          defaultRules={JSON.stringify(settings.overtime_rules, null, 2)}
          icon={<Clock className="size-4" />}
          title="Overtime rules"
          description="Overtime multiplier, threshold hours, and rate configuration."
        />
        <Section
          category="toil_rules"
          defaultRules={JSON.stringify(settings.toil_rules, null, 2)}
          icon={<DollarSign className="size-4" />}
          title="TOIL rules"
          description="Accrual multiplier (default 1.5), max accrual, and expiry settings."
        />
        <Section
          category="leave_rules"
          defaultRules={JSON.stringify(settings.leave_rules, null, 2)}
          icon={<FileCheck className="size-4" />}
          title="Leave rules"
          description="Default yearly hours per category, carry-over limits, and BCEA thresholds."
        />
        <Section
          category="approval_rules"
          defaultRules={JSON.stringify(settings.approval_rules, null, 2)}
          icon={<ShieldCheck className="size-4" />}
          title="Approval rules"
          description="Auto-approve thresholds, approval chain, and escalation rules."
        />
      </div>
    </section>
  );
}
