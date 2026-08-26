"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Clock3,
  LocateFixed,
  LogOut,
  MapPin,
  Sparkles,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import ViewportSidebar from "@/components/dashboard/ViewportSidebar";
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

function shortTime(value: string | null) {
  return value ? formatTime(value) : "–";
}

function statusLabel(status: CompanyLiveTimeEntry["status"]) {
  return {
    needs_review: "Needs review",
    not_started: "Not started",
    on_lunch: "On lunch",
    worked: "Shift complete",
    working: "Working",
  }[status];
}

function statusBadgeClass(status: CompanyLiveTimeEntry["status"]) {
  if (status === "working") return "border-success/30 bg-success/10 text-success";
  if (status === "on_lunch") return "border-warning/30 bg-warning/10 text-warning";
  if (status === "worked") return "border-border bg-surface-muted text-foreground";
  if (status === "needs_review") return "border-danger/30 bg-danger/10 text-danger";
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

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
    <section className="card grid gap-3 p-4">
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Live workforce
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <Users className="size-5 text-accent" />
            Today&apos;s attendance
          </h2>
          <p className="mt-1 text-xs text-muted">
            Live presence, clock status, and colleagues active today.
          </p>
        </div>
        <span className="w-max rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          {overview.workDate}
        </span>
      </div>

      {/* Stat Cards (Interactive Filter Tabs) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className={`card p-3 text-left transition-colors ${
            activeFilter === "all"
              ? "border-accent bg-surface shadow-sm ring-1 ring-accent/20"
              : "bg-surface hover:bg-surface-muted"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Total team
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {overview.totals.totalEmployees}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("working")}
          className={`card p-3 text-left transition-colors ${
            activeFilter === "working"
              ? "border-success/50 bg-success/10 shadow-sm ring-1 ring-success/30"
              : "bg-surface hover:bg-surface-muted"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-success">
              Working
            </p>
            <span className="flex size-2 rounded-full bg-success animate-ping" />
          </div>
          <p className="mt-1 text-xl font-bold text-success">
            {overview.totals.activeEmployees}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("on_lunch")}
          className={`card p-3 text-left transition-colors ${
            activeFilter === "on_lunch"
              ? "border-warning/50 bg-warning/10 shadow-sm ring-1 ring-warning/30"
              : "bg-surface hover:bg-surface-muted"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              On lunch
            </p>
            <UtensilsCrossed className="size-3.5 text-warning" />
          </div>
          <p className="mt-1 text-xl font-bold text-warning">
            {overview.totals.onLunch}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("worked")}
          className={`card p-3 text-left transition-colors ${
            activeFilter === "worked"
              ? "border-border bg-surface shadow-sm ring-1 ring-border"
              : "bg-surface hover:bg-surface-muted"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Shift complete
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {overview.totals.workedToday}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("not_started")}
          className={`card p-3 text-left transition-colors col-span-2 sm:col-span-1 ${
            activeFilter === "not_started"
              ? "border-border bg-surface shadow-sm ring-1 ring-border"
              : "bg-surface hover:bg-surface-muted"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Not started
          </p>
          <p className="mt-1 text-xl font-bold text-muted">
            {overview.totals.notStarted}
          </p>
        </button>
      </div>

      {/* Clocked-in Colleagues Avatar Strip */}
      {(workingColleagues.length > 0 || onLunchColleagues.length > 0) && (
        <div className="rounded-md border border-border bg-background p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              <p className="text-xs font-bold text-foreground">
                Colleagues active right now ({workingColleagues.length + onLunchColleagues.length})
              </p>
            </div>
            <span className="text-[11px] text-muted">Click to view public info</span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            {workingColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="group relative flex items-center gap-2 rounded-full border border-border bg-surface p-1 pr-2.5 transition-colors hover:border-success/60 hover:bg-success/5"
                title={`${colleague.knownAs ?? colleague.fullName} - Working since ${formatTime(colleague.clockIn)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-7 ring-2 ring-success"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-success ring-1 ring-background" />
                </div>
                <div className="text-left">
                  <p className="max-w-[110px] truncate text-xs font-semibold text-foreground group-hover:text-success">
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                </div>
              </button>
            ))}

            {onLunchColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="group relative flex items-center gap-2 rounded-full border border-border bg-surface p-1 pr-2.5 transition-colors hover:border-warning/60 hover:bg-warning/5"
                title={`${colleague.knownAs ?? colleague.fullName} - On lunch since ${formatTime(colleague.lunchStart)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-7 ring-2 ring-warning"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-warning ring-1 ring-background" />
                </div>
                <div className="text-left">
                  <p className="max-w-[110px] truncate text-xs font-semibold text-foreground group-hover:text-warning">
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attendance Entries Compact Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredEntries.length === 0 ? (
          <p className="col-span-full rounded-md border border-border bg-background p-4 text-center text-sm text-muted">
            No colleagues match the selected status filter.
          </p>
        ) : (
          filteredEntries.map((entry) => (
            <article
              key={entry.employeeId}
              onClick={() => setSelectedColleague(entry)}
              className="group flex flex-col justify-between gap-2.5 rounded-lg border border-border bg-surface p-3 shadow-tight transition-all hover:border-accent/60 hover:shadow-soft cursor-pointer"
            >
              {/* Header: Avatar, Name & Status Pill */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="relative shrink-0">
                    <EmployeeAvatar
                      name={entry.knownAs ?? entry.fullName}
                      src={entry.avatarUrl}
                      className="size-8"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ring-surface ${statusDotClass(entry.status)}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground group-hover:text-accent">
                      {entry.knownAs ?? entry.fullName}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {entry.jobTitle ?? "Team Member"}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(entry.status)}`}
                >
                  <span className={`size-1.5 rounded-full ${statusDotClass(entry.status)}`} />
                  {statusLabel(entry.status)}
                </span>
              </div>

              {/* Time Stats Compact Row */}
              <div className="grid grid-cols-3 gap-1 rounded-md border border-border/70 bg-surface-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-[10px] text-muted font-medium">In</p>
                  <p className="font-semibold text-foreground">{shortTime(entry.clockIn)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted font-medium">Out</p>
                  <p className="font-semibold text-foreground">{shortTime(entry.clockOut)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted font-medium">Worked</p>
                  <p className="font-semibold text-foreground">
                    {entry.clockOut
                      ? formatHours(entry.paidHours)
                      : activeDuration(entry, tick) ?? "--"}
                  </p>
                </div>
              </div>

              {/* Footer: Workstation & Department */}
              <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted">
                <span className="truncate" title={entry.workstationName ?? "Assigned workstation"}>
                  <MapPin className="mr-1 inline size-3 text-muted" />
                  {entry.workstationName ?? "No workstation"}
                </span>
                <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
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
        eyebrow="Colleague profile"
        title={selectedColleague ? (selectedColleague.knownAs ?? selectedColleague.fullName) : ""}
        description={selectedColleague?.jobTitle ?? "Colleague"}
        bodyClassName="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {selectedColleague ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-3.5 rounded-md border border-border bg-surface p-3.5">
              <div className="relative">
                <EmployeeAvatar
                  name={selectedColleague.knownAs ?? selectedColleague.fullName}
                  src={selectedColleague.avatarUrl}
                  className="size-14 ring-2 ring-border shadow-sm"
                />
                <span
                  className={`absolute bottom-0 right-0 block size-3.5 rounded-full ring-2 ring-surface ${statusDotClass(selectedColleague.status)}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-foreground">
                  {selectedColleague.knownAs ?? selectedColleague.fullName}
                </h3>
                <p className="text-xs text-muted">{selectedColleague.jobTitle ?? "Team Member"}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(selectedColleague.status)}`}
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

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Department
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {selectedColleague.departmentName ?? "General"}
                </p>
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Workstation
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {selectedColleague.workstationName ?? "Assigned workstation"}
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 rounded-md border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  Today&apos;s shift
                </p>
                <span className="text-xs text-muted">{overview.workDate}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[10px] text-muted">In</p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {shortTime(selectedColleague.clockIn)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[10px] text-muted">Lunch start</p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {shortTime(selectedColleague.lunchStart)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[10px] text-muted">Lunch end</p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {shortTime(selectedColleague.lunchEnd)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[10px] text-muted">Out</p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {shortTime(selectedColleague.clockOut)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Worked duration</p>
                  <p className="mt-0.5 text-base font-bold text-foreground">
                    {selectedColleague.clockOut
                      ? formatHours(selectedColleague.paidHours)
                      : activeDuration(selectedColleague, tick) ?? "--"}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] uppercase text-muted">Overtime</p>
                  <p className="mt-0.5 text-base font-bold text-foreground">
                    {formatHours(selectedColleague.overtimeHours)}
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-2.5">
                <p className="text-[10px] uppercase text-muted">Location check</p>
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
