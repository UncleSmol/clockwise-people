"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Clock3,
  MapPin,
  Sparkles,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeEvent } from "@/components/realtime/RealtimeSyncProvider";
import type {
  CompanyLiveTimeEntry,
  CompanyLiveTimeOverview,
} from "@/lib/time-tracking/schema";

type CompanyLiveWorkforceProps = {
  overview: CompanyLiveTimeOverview;
};

type FilterTab = "all" | "working" | "on_lunch" | "worked" | "not_started";

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
    worked: "Shift complete",
    working: "Clocked in & Working",
  }[status];
}

function statusBadgeClass(status: CompanyLiveTimeEntry["status"]) {
  if (status === "working") return "border-success/30 bg-success/15 text-success";
  if (status === "on_lunch") return "border-warning/30 bg-warning/15 text-warning";
  if (status === "worked") return "border-border bg-surface-muted text-muted";
  if (status === "needs_review") return "border-danger/30 bg-danger/15 text-danger";
  return "border-border bg-surface-muted text-muted";
}

function statusDotClass(status: CompanyLiveTimeEntry["status"]) {
  if (status === "working") return "bg-success";
  if (status === "on_lunch") return "bg-warning";
  if (status === "worked") return "bg-primary";
  return "bg-muted";
}

function geofenceLabel(entry: CompanyLiveTimeEntry) {
  if (!entry.latestGeofenceStatus) return "No clock location";

  const event = entry.latestGeofenceEventType?.replaceAll("_", " ") ?? "clock";
  const distance =
    entry.latestGeofenceDistanceMeters === null
      ? ""
      : ` · ${Math.round(entry.latestGeofenceDistanceMeters)}m`;

  if (entry.latestGeofenceStatus === "in_range") {
    return `${event}: in range${distance}`;
  }
  if (entry.latestGeofenceStatus === "out_of_range") {
    return `${event}: out of range${distance}`;
  }
  if (entry.latestGeofenceStatus === "no_location") {
    return `${event}: no location`;
  }
  if (entry.latestGeofenceStatus === "no_workstation") {
    return `${event}: no workstation`;
  }

  return `${event}: location unknown`;
}

function geofenceClass(status: string | null) {
  if (status === "in_range") return "border-success/30 bg-success/10 text-success";
  if (status === "out_of_range") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "no_location") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-surface-muted text-muted";
}

function activeDuration(entry: CompanyLiveTimeEntry, _tick: number) {
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
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [selectedColleague, setSelectedColleague] = useState<CompanyLiveTimeEntry | null>(null);

  // Live timer tick for calculating active working duration
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  // Listen to realtime WebSocket updates directly
  useRealtimeEvent("time_entries", () => {
    router.refresh();
  });

  useRealtimeEvent("time_clock_events", () => {
    router.refresh();
  });

  const workingColleagues = useMemo(
    () => overview.entries.filter((entry) => entry.status === "working"),
    [overview.entries],
  );

  const onLunchColleagues = useMemo(
    () => overview.entries.filter((entry) => entry.status === "on_lunch"),
    [overview.entries],
  );

  const filteredEntries = useMemo(() => {
    let list = overview.entries;
    if (activeFilter === "working") {
      list = list.filter((e) => e.status === "working");
    } else if (activeFilter === "on_lunch") {
      list = list.filter((e) => e.status === "on_lunch");
    } else if (activeFilter === "worked") {
      list = list.filter((e) => e.status === "worked");
    } else if (activeFilter === "not_started") {
      list = list.filter((e) => e.status === "not_started");
    }

    return [...list].sort((left, right) => {
      const priority = {
        working: 0,
        on_lunch: 1,
        worked: 2,
        needs_review: 3,
        not_started: 4,
      };

      return priority[left.status] - priority[right.status];
    });
  }, [overview.entries, activeFilter]);

  return (
    <section className="card grid gap-4 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-success animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Live Workforce Attendance
            </p>
          </div>
          <h2 className="mt-1 text-xl font-bold text-foreground">
            Today&apos;s Attendance
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Live real-time status of colleagues currently working, on lunch, or scheduled today.
          </p>
        </div>
        <span className="w-max rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
          {overview.workDate}
        </span>
      </div>

      {/* Live Stat Cards (Interactive Filter Tabs) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className={`card flex flex-col justify-between p-3 text-left transition-all ${
            activeFilter === "all"
              ? "border-accent bg-accent/[0.08] shadow-sm"
              : "hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Total Team
            </span>
            <Users className="size-4 text-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {overview.totals.totalEmployees}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("working")}
          className={`card flex flex-col justify-between p-3 text-left transition-all ${
            activeFilter === "working"
              ? "border-success bg-success/10 shadow-sm"
              : "hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-success">
              Working
            </span>
            <span className="flex size-2 rounded-full bg-success animate-ping" />
          </div>
          <p className="mt-2 text-2xl font-bold text-success">
            {overview.totals.activeEmployees}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("on_lunch")}
          className={`card flex flex-col justify-between p-3 text-left transition-all ${
            activeFilter === "on_lunch"
              ? "border-warning bg-warning/10 shadow-sm"
              : "hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              On Lunch
            </span>
            <UtensilsCrossed className="size-4 text-warning" />
          </div>
          <p className="mt-2 text-2xl font-bold text-warning">
            {overview.totals.onLunch}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("worked")}
          className={`card flex flex-col justify-between p-3 text-left transition-all ${
            activeFilter === "worked"
              ? "border-primary bg-primary/10 shadow-sm"
              : "hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Shift Complete
            </span>
            <CheckCircle2 className="size-4 text-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {overview.totals.workedToday}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("not_started")}
          className={`card flex flex-col justify-between p-3 text-left transition-all col-span-2 sm:col-span-1 ${
            activeFilter === "not_started"
              ? "border-muted bg-surface shadow-sm"
              : "hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Not Started
            </span>
            <Clock className="size-4 text-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold text-muted">
            {overview.totals.notStarted}
          </p>
        </button>
      </div>

      {/* Clocked-in Colleagues Live Avatar Strip */}
      {(workingColleagues.length > 0 || onLunchColleagues.length > 0) && (
        <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              <p className="text-xs font-bold text-foreground">
                Colleagues Active Right Now ({workingColleagues.length + onLunchColleagues.length})
              </p>
            </div>
            <span className="text-[11px] text-muted">Click an avatar to view public info</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {workingColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="group relative flex items-center gap-2 rounded-full border border-border bg-surface p-1 pr-3 transition-all hover:border-success hover:bg-success/5"
                title={`${colleague.knownAs ?? colleague.fullName} - Working since ${formatTime(colleague.clockIn)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-8 ring-2 ring-success"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-success ring-1 ring-background" />
                </div>
                <div className="text-left">
                  <p className="max-w-[120px] truncate text-xs font-semibold text-foreground group-hover:text-success">
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                  <p className="text-[10px] text-muted leading-tight">
                    In {formatTime(colleague.clockIn)}
                  </p>
                </div>
              </button>
            ))}

            {onLunchColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="group relative flex items-center gap-2 rounded-full border border-border bg-surface p-1 pr-3 transition-all hover:border-warning hover:bg-warning/5"
                title={`${colleague.knownAs ?? colleague.fullName} - On lunch since ${formatTime(colleague.lunchStart)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-8 ring-2 ring-warning"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-warning ring-1 ring-background" />
                </div>
                <div className="text-left">
                  <p className="max-w-[120px] truncate text-xs font-semibold text-foreground group-hover:text-warning">
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                  <p className="text-[10px] text-warning leading-tight">
                    On lunch
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attendance Entries Grid / Cards */}
      <div className="grid gap-2.5">
        {filteredEntries.length === 0 ? (
          <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted">
            No colleagues match the selected status filter.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <article
              key={entry.employeeId}
              onClick={() => setSelectedColleague(entry)}
              className="grid cursor-pointer gap-3 rounded-lg border border-border bg-background p-3.5 shadow-sm transition-all hover:border-accent/60 hover:bg-surface xl:grid-cols-[1.2fr_130px_1fr_190px_90px] xl:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0">
                  <EmployeeAvatar
                    name={entry.knownAs ?? entry.fullName}
                    src={entry.avatarUrl}
                    className={`size-10 ${
                      entry.status === "working"
                        ? "ring-2 ring-success"
                        : entry.status === "on_lunch"
                          ? "ring-2 ring-warning"
                          : ""
                    }`}
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 block size-3 rounded-full ring-2 ring-background ${statusDotClass(entry.status)}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {entry.knownAs ?? entry.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.jobTitle ?? "Team Member"}
                    {entry.departmentName ? ` · ${entry.departmentName}` : ""}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex w-max items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(entry.status)}`}
              >
                <span className={`size-1.5 rounded-full ${statusDotClass(entry.status)}`} />
                {statusLabel(entry.status)}
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted">In</p>
                  <p className="font-semibold text-foreground">{formatTime(entry.clockIn)}</p>
                </div>
                <div>
                  <p className="text-muted">Out</p>
                  <p className="font-semibold text-foreground">{formatTime(entry.clockOut)}</p>
                </div>
                <div>
                  <p className="text-muted">Worked</p>
                  <p className="font-semibold text-foreground">
                    {entry.clockOut
                      ? formatHours(entry.paidHours)
                      : activeDuration(entry, tick) ?? "--"}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Overtime</p>
                  <p className="font-semibold text-foreground">
                    {formatHours(entry.overtimeHours)}
                  </p>
                </div>
              </div>

              <div>
                <span
                  className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${geofenceClass(entry.latestGeofenceStatus)}`}
                >
                  <span className="truncate">{geofenceLabel(entry)}</span>
                </span>
                {entry.workstationName ? (
                  <p className="mt-1 truncate text-xs text-muted">
                    <MapPin className="mr-1 inline size-3 text-muted" />
                    {entry.workstationName}
                  </p>
                ) : null}
              </div>

              <div className="text-right">
                <span className="rounded bg-surface-muted px-2 py-1 text-xs font-semibold text-muted">
                  {entry.departmentName ?? "General"}
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Colleague Public Profile Modal / Sidebar */}
      <ViewportSidebar
        open={Boolean(selectedColleague)}
        onClose={() => setSelectedColleague(null)}
        maxWidth="max-w-md"
        eyebrow="Colleague Profile"
        title={selectedColleague ? (selectedColleague.knownAs ?? selectedColleague.fullName) : ""}
        description={selectedColleague?.jobTitle ?? "Colleague"}
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-6"
      >
        {selectedColleague ? (
          <div className="grid gap-5">
            {/* Avatar & Header Card */}
            <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
              <div className="relative">
                <EmployeeAvatar
                  name={selectedColleague.knownAs ?? selectedColleague.fullName}
                  src={selectedColleague.avatarUrl}
                  className="size-16 ring-4 ring-background shadow-md"
                />
                <span
                  className={`absolute bottom-0 right-0 block size-4 rounded-full ring-2 ring-background ${statusDotClass(selectedColleague.status)}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-bold text-foreground">
                  {selectedColleague.knownAs ?? selectedColleague.fullName}
                </h3>
                <p className="text-xs text-muted">{selectedColleague.jobTitle ?? "Team Member"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(selectedColleague.status)}`}
                  >
                    <span className={`size-1.5 rounded-full ${statusDotClass(selectedColleague.status)}`} />
                    {statusLabel(selectedColleague.status)}
                  </span>
                  {selectedColleague.employeeNumber ? (
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                      #{selectedColleague.employeeNumber}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Public Details Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Department
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {selectedColleague.departmentName ?? "General"}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Workstation
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {selectedColleague.workstationName ?? "Assigned workstation"}
                </p>
              </div>
            </div>

            {/* Today's Live Attendance */}
            <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
                  Today&apos;s Live Shift
                </p>
                <span className="text-xs text-muted">{overview.workDate}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Clock In</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatTime(selectedColleague.clockIn)}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Lunch Start</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatTime(selectedColleague.lunchStart)}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Lunch End</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatTime(selectedColleague.lunchEnd)}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Clock Out</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatTime(selectedColleague.clockOut)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Worked Duration</p>
                  <p className="mt-1 text-base font-bold text-foreground">
                    {selectedColleague.clockOut
                      ? formatHours(selectedColleague.paidHours)
                      : activeDuration(selectedColleague, tick) ?? "--"}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Overtime</p>
                  <p className="mt-1 text-base font-bold text-foreground">
                    {formatHours(selectedColleague.overtimeHours)}
                  </p>
                </div>
              </div>

              {/* Location Verification Status */}
              <div className="rounded-lg border border-border bg-background p-2.5">
                <p className="text-[10px] uppercase text-muted">Location Check</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${geofenceClass(selectedColleague.latestGeofenceStatus)}`}
                  >
                    {geofenceLabel(selectedColleague)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportSidebar>
    </section>
  );
}
