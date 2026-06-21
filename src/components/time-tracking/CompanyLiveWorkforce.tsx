"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CompanyLiveTimeEntry,
  CompanyLiveTimeOverview,
} from "@/lib/time-tracking/schema";

type CompanyLiveWorkforceProps = {
  overview: CompanyLiveTimeOverview;
};

function formatTime(value: string | null) {
  if (!value) return "--";

  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-ZA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}h`;
}

function statusLabel(status: CompanyLiveTimeEntry["status"]) {
  return {
    needs_review: "Needs review",
    not_started: "Not started",
    on_lunch: "On lunch",
    worked: "Worked",
    working: "Working",
  }[status];
}

function statusClass(status: CompanyLiveTimeEntry["status"]) {
  if (status === "working") return "bg-success/10 text-success";
  if (status === "on_lunch") return "bg-warning/10 text-warning";
  if (status === "needs_review") return "bg-danger/10 text-danger";
  return "bg-surface-muted text-foreground";
}

function activeDuration(entry: CompanyLiveTimeEntry, tick: number) {
  void tick;

  if (!entry.clockIn || entry.clockOut) return null;

  const [hours = "0", minutes = "0"] = entry.clockIn.split(":");
  const start = new Date();
  start.setHours(Number(hours), Number(minutes), 0, 0);
  const diffMinutes = Math.max(
    Math.floor((Date.now() - start.getTime()) / 60000),
    0,
  );
  const durationHours = Math.floor(diffMinutes / 60);
  const durationMinutes = diffMinutes % 60;

  return `${durationHours}h ${String(durationMinutes).padStart(2, "0")}m`;
}

export default function CompanyLiveWorkforce({
  overview,
}: CompanyLiveWorkforceProps) {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const visibleEntries = useMemo(
    () =>
      [...overview.entries].sort((left, right) => {
        const priority = {
          needs_review: 0,
          working: 1,
          on_lunch: 2,
          worked: 3,
          not_started: 4,
        };

        return priority[left.status] - priority[right.status];
      }),
    [overview.entries],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let refreshTimeout: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }

      refreshTimeout = window.setTimeout(() => {
        router.refresh();
      }, 800);
    };

    const channel = supabase
      .channel(`company-time:${overview.companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `company_id=eq.${overview.companyId}`,
          schema: "public",
          table: "time_entries",
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }

      supabase.removeChannel(channel);
    };
  }, [overview.companyId, router]);

  return (
    <section className="premium-card grid gap-5 rounded-md p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="premium-eyebrow">
            Live workforce
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">
            Today&apos;s attendance
          </h2>
          <p className="mt-1 text-sm text-muted">
            Backend data is refreshed when employees update time records.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background/80 px-3 py-1 text-sm font-semibold text-foreground shadow-sm">
          {overview.workDate}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Working", overview.totals.activeEmployees],
          ["On lunch", overview.totals.onLunch],
          ["Worked", overview.totals.workedToday],
          ["Not started", overview.totals.notStarted],
          ["Needs review", overview.totals.needsReview],
        ].map(([label, value]) => (
          <div key={label} className="premium-panel rounded-md p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {visibleEntries.map((entry) => (
          <div
            key={entry.employeeId}
            className="grid gap-3 rounded-md border border-border bg-background/80 p-4 shadow-sm lg:grid-cols-[1.2fr_120px_1fr_100px] lg:items-center"
          >
            <div>
              <p className="text-base font-semibold text-foreground">
                {entry.knownAs ?? entry.fullName}
              </p>
              <p className="mt-1 text-sm text-muted">
                {entry.employeeNumber} - {entry.branchName ?? "No branch"}
                {entry.jobTitle ? ` - ${entry.jobTitle}` : ""}
              </p>
            </div>

            <span
              className={`w-max rounded-full px-3 py-1 text-sm font-semibold ${statusClass(entry.status)}`}
            >
              {statusLabel(entry.status)}
            </span>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted">In</p>
                <p className="font-semibold text-foreground">{formatTime(entry.clockIn)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Out</p>
                <p className="font-semibold text-foreground">{formatTime(entry.clockOut)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Worked</p>
                <p className="font-semibold text-foreground">
                  {entry.clockOut
                    ? formatHours(entry.paidHours)
                    : activeDuration(entry, tick) ?? "--"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Overtime</p>
                <p className="font-semibold text-foreground">
                  {formatHours(entry.overtimeHours)}
                </p>
              </div>
            </div>

            <p className="text-right text-sm font-semibold text-muted">
              {entry.departmentName ?? "General"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

