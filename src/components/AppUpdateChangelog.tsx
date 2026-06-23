"use client";

import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useActionState, useState } from "react";
import { markAppUpdatesSeen } from "@/lib/app-updates/actions";
import type { AppUpdate } from "@/lib/app-updates/schema";

type AppUpdateChangelogProps = {
  updates: AppUpdate[];
};

const initialState = {
  ok: true,
  message: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function AppUpdateChangelog({
  updates,
}: AppUpdateChangelogProps) {
  const [open, setOpen] = useState(updates.length > 0);
  const [state, formAction, pending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const result = await markAppUpdatesSeen(previousState, formData);

      if (result.ok) {
        setOpen(false);
      }

      return result;
    },
    initialState,
  );

  if (!open || updates.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/55 p-3 sm:place-items-center sm:p-6">
      <section className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-md border border-border bg-surface text-foreground shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-3">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                What&apos;s new
              </p>
              <h2 className="mt-1 text-xl font-semibold">Latest updates</h2>
              <p className="mt-1 text-sm text-muted">
                A quick summary of what changed in ClockWise People.
              </p>
            </div>
          </div>

          <form action={formAction}>
            {updates.map((update) => (
              <input key={update.id} type="hidden" name="update_ids" value={update.id} />
            ))}
            <button
              disabled={pending}
              aria-label="Close updates"
              className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground disabled:opacity-60"
            >
              <X className="size-4" />
            </button>
          </form>
        </div>

        <div className="grid gap-3 p-4">
          {state.message ? (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {state.message}
            </p>
          ) : null}

          {updates.map((update) => (
            <article key={update.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{update.title}</h3>
                  <p className="mt-1 text-sm text-muted">{update.summary}</p>
                </div>
                <span className="w-max rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                  {formatDate(update.published_at)}
                </span>
              </div>

              <ul className="mt-3 grid gap-2">
                {update.changes.map((change) => (
                  <li key={change} className="flex gap-2 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <form action={formAction} className="sticky bottom-0 border-t border-border bg-surface p-4">
          {updates.map((update) => (
            <input key={update.id} type="hidden" name="update_ids" value={update.id} />
          ))}
          <button
            disabled={pending}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Saving..." : "Got it"}
          </button>
        </form>
      </section>
    </div>
  );
}
