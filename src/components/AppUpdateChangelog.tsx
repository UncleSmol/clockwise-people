"use client";

import { CheckCircle2, ChevronDown, Sparkles, X } from "lucide-react";
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

  const updateCount = updates.length;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-end p-3 sm:p-5">
      <section className="pointer-events-auto max-h-[78dvh] w-full max-w-lg overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-3">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                What&apos;s new
              </p>
              <h2 className="mt-1 text-lg font-semibold">Latest updates</h2>
              <p className="mt-1 text-sm text-muted">
                {updateCount === 1
                  ? "One unread update is ready."
                  : `${updateCount} unread updates are grouped here.`}
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

        <div className="max-h-[52dvh] overflow-y-auto p-3">
          {state.message ? (
            <p className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {state.message}
            </p>
          ) : null}

          {updates.map((update, index) => (
            <details
              key={update.id}
              className="group border-b border-border last:border-b-0"
              open={index === 0}
            >
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-3 rounded-md px-2 py-3 hover:bg-surface-muted/35">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-foreground">
                      {update.title}
                    </h3>
                    <span className="w-max rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                      {formatDate(update.published_at)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {update.summary}
                  </p>
                </div>
                <ChevronDown className="mt-1 size-4 text-muted transition-transform group-open:rotate-180" />
              </summary>

              <ul className="grid gap-2 px-2 pb-3">
                {update.changes.map((change) => (
                  <li key={change} className="flex gap-2 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <form action={formAction} className="border-t border-border bg-surface p-3">
          {updates.map((update) => (
            <input key={update.id} type="hidden" name="update_ids" value={update.id} />
          ))}
          <button
            disabled={pending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Saving..." : `Got it, clear ${updateCount === 1 ? "update" : "updates"}`}
          </button>
        </form>
      </section>
    </div>
  );
}
