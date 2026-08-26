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

function geofenceLabel(entry: CompanyLiveTimeEntry) {
  if (!entry.latestGeofenceStatus) return "No location";

  const event = entry.latestGeofenceEventType?.replaceAll("_", " ") ?? "clock";
  const distance =
    entry.latestGeofenceDistanceMeters === null
      ? ""
      : ` · ${Math.round(entry.latestGeofenceDistanceMeters)}m`;

  if (entry.latestGeofenceStatus === "in_range") {
    return `In range${distance}`;
  }
  if (entry.latestGeofenceStatus === "out_of_range") {
    return `Out of range${distance}`;
  }
  if (entry.latestGeofenceStatus === "no_location") {
    return `No location`;
  }
  if (entry.latestGeofenceStatus === "no_workstation") {
    return `No workstation`;
  }

  return `Unknown`;
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
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Live workforce
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-foreground">
            <Users className="size-5 text-accent" />
            Today&apos;s attendance
          </h2>
          <p className="mt-1 text-xs text-muted">
            Real-time workforce presence, break status, and daily time logs.
          </p>
        </div>
        <span className="w-max rounded border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground shadow-xs">
          {overview.workDate}
        </span>
      </div>

      {/* Bold Segmented Stat Filter Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {/* Total Team */}
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className={`rounded-lg p-3 text-left transition-all ${
            activeFilter === "all"
              ? "bg-slate-900 text-white shadow-md ring-2 ring-slate-900 ring-offset-1"
              : "border border-border bg-surface hover:bg-surface-muted text-foreground"
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${activeFilter === "all" ? "text-slate-300" : "text-muted"}`}>
            Total team
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {overview.totals.totalEmployees}
          </p>
        </button>

        {/* Working */}
        <button
          type="button"
          onClick={() => setActiveFilter("working")}
          className={`rounded-lg p-3 text-left transition-all ${
            activeFilter === "working"
              ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600 ring-offset-1"
              : "border border-emerald-300/80 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-950"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${activeFilter === "working" ? "text-emerald-100" : "text-emerald-800"}`}>
              Working
            </p>
            <span className="flex size-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <p className={`mt-1 text-2xl font-extrabold ${activeFilter === "working" ? "text-white" : "text-emerald-700"}`}>
            {overview.totals.activeEmployees}
          </p>
        </button>

        {/* On Lunch */}
        <button
          type="button"
          onClick={() => setActiveFilter("on_lunch")}
          className={`rounded-lg p-3 text-left transition-all ${
            activeFilter === "on_lunch"
              ? "bg-amber-500 text-white shadow-md ring-2 ring-amber-500 ring-offset-1"
              : "border border-amber-300/80 bg-amber-50/80 hover:bg-amber-100 text-amber-950"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${activeFilter === "on_lunch" ? "text-amber-100" : "text-amber-800"}`}>
              On lunch
            </p>
            <UtensilsCrossed className={`size-3.5 ${activeFilter === "on_lunch" ? "text-white" : "text-amber-700"}`} />
          </div>
          <p className={`mt-1 text-2xl font-extrabold ${activeFilter === "on_lunch" ? "text-white" : "text-amber-700"}`}>
            {overview.totals.onLunch}
          </p>
        </button>

        {/* Shift Complete */}
        <button
          type="button"
          onClick={() => setActiveFilter("worked")}
          className={`rounded-lg p-3 text-left transition-all ${
            activeFilter === "worked"
              ? "bg-slate-700 text-white shadow-md ring-2 ring-slate-700 ring-offset-1"
              : "border border-slate-300 bg-slate-100/80 hover:bg-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${activeFilter === "worked" ? "text-slate-300" : "text-slate-600"}`}>
              Completed
            </p>
            <CheckCircle2 className={`size-3.5 ${activeFilter === "worked" ? "text-emerald-400" : "text-slate-500"}`} />
          </div>
          <p className={`mt-1 text-2xl font-extrabold ${activeFilter === "worked" ? "text-white" : "text-slate-800"}`}>
            {overview.totals.workedToday}
          </p>
        </button>

        {/* Not Started */}
        <button
          type="button"
          onClick={() => setActiveFilter("not_started")}
          className={`rounded-lg p-3 text-left transition-all col-span-2 sm:col-span-1 ${
            activeFilter === "not_started"
              ? "bg-zinc-600 text-white shadow-md ring-2 ring-zinc-600 ring-offset-1"
              : "border border-zinc-300 bg-zinc-100/80 hover:bg-zinc-200 text-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${activeFilter === "not_started" ? "text-zinc-200" : "text-zinc-500"}`}>
              Not started
            </p>
            <Clock className={`size-3.5 ${activeFilter === "not_started" ? "text-zinc-300" : "text-zinc-400"}`} />
          </div>
          <p className={`mt-1 text-2xl font-extrabold ${activeFilter === "not_started" ? "text-white" : "text-zinc-600"}`}>
            {overview.totals.notStarted}
          </p>
        </button>
      </div>

      {/* Clocked-in Colleagues Avatar Strip */}
      {(workingColleagues.length > 0 || onLunchColleagues.length > 0) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-xs font-bold text-emerald-950">
                Active right now ({workingColleagues.length + onLunchColleagues.length})
              </p>
            </div>
            <span className="text-[11px] font-medium text-emerald-800">Tap to inspect</span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {workingColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="group relative flex items-center gap-2 rounded-md border border-emerald-300 bg-white p-1 pr-2 shadow-xs transition-all hover:bg-emerald-50 hover:shadow-sm"
                title={`${colleague.knownAs ?? colleague.fullName} - Working since ${formatTime(colleague.clockIn)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-7 ring-2 ring-emerald-500"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-500 ring-1 ring-white" />
                </div>
                <div className="text-left">
                  <p className="max-w-[110px] truncate text-xs font-bold text-emerald-950">
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
                className="group relative flex items-center gap-2 rounded-md border border-amber-300 bg-white p-1 pr-2 shadow-xs transition-all hover:bg-amber-50 hover:shadow-sm"
                title={`${colleague.knownAs ?? colleague.fullName} - On lunch since ${formatTime(colleague.lunchStart)}`}
              >
                <div className="relative">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className="size-7 ring-2 ring-amber-500"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-amber-500 ring-1 ring-white" />
                </div>
                <div className="text-left">
                  <p className="max-w-[110px] truncate text-xs font-bold text-amber-950">
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attendance Entries Distinct Strong-Colored Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredEntries.length === 0 ? (
          <p className="col-span-full rounded-lg border border-border bg-background p-5 text-center text-sm font-medium text-muted">
            No colleagues match the selected status filter.
          </p>
        ) : (
          filteredEntries.map((entry) => {
            if (entry.status === "working") {
              return (
                <article
                  key={entry.employeeId}
                  onClick={() => setSelectedColleague(entry)}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-emerald-600 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-emerald-700/60"
                >
                  {/* Top: Avatar, Name & Solid Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={entry.knownAs ?? entry.fullName}
                          src={entry.avatarUrl}
                          className="size-8.5 ring-2 ring-white shadow-xs"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-300 ring-2 ring-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-white">
                          {entry.knownAs ?? entry.fullName}
                        </p>
                        <p className="truncate text-[11px] font-medium text-emerald-100">
                          {entry.jobTitle ?? "Team Member"}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-emerald-400/30">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
                      </span>
                      Working
                    </span>
                  </div>

                  {/* High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-2 text-center text-slate-900 shadow-xs">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Status</p>
                      <p className="font-extrabold text-emerald-600 text-xs animate-pulse">Active</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Duration</p>
                      <p className="font-extrabold text-emerald-700 text-xs">
                        {activeDuration(entry, tick) ?? "--"}
                      </p>
                    </div>
                  </div>

                  {/* Footer Pills */}
                  <div className="flex items-center justify-between gap-1.5 text-[11px]">
                    <span
                      className="inline-flex max-w-[65%] items-center truncate rounded bg-emerald-700/70 px-2 py-0.5 font-semibold text-emerald-50"
                      title={entry.workstationName ?? "Assigned workstation"}
                    >
                      <MapPin className="mr-1 inline size-2.5 shrink-0 text-emerald-200" />
                      <span className="truncate">{entry.workstationName ?? geofenceLabel(entry)}</span>
                    </span>
                    <span className="shrink-0 rounded bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-white border border-emerald-400/20">
                      {entry.departmentName ?? "General"}
                    </span>
                  </div>
                </article>
              );
            }

            if (entry.status === "on_lunch") {
              return (
                <article
                  key={entry.employeeId}
                  onClick={() => setSelectedColleague(entry)}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-amber-500 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-amber-600/60"
                >
                  {/* Top: Avatar, Name & Solid Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={entry.knownAs ?? entry.fullName}
                          src={entry.avatarUrl}
                          className="size-8.5 ring-2 ring-white shadow-xs"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-amber-200 ring-2 ring-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-white">
                          {entry.knownAs ?? entry.fullName}
                        </p>
                        <p className="truncate text-[11px] font-medium text-amber-100">
                          {entry.jobTitle ?? "Team Member"}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-amber-300/30">
                      <UtensilsCrossed className="size-2.5 text-amber-200" />
                      On lunch
                    </span>
                  </div>

                  {/* High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-2 text-center text-slate-900 shadow-xs">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Lunch</p>
                      <p className="font-extrabold text-amber-600 text-xs">{shortTime(entry.lunchStart)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Worked</p>
                      <p className="font-extrabold text-slate-900 text-xs">
                        {activeDuration(entry, tick) ?? "--"}
                      </p>
                    </div>
                  </div>

                  {/* Footer Pills */}
                  <div className="flex items-center justify-between gap-1.5 text-[11px]">
                    <span
                      className="inline-flex max-w-[65%] items-center truncate rounded bg-amber-600/70 px-2 py-0.5 font-semibold text-amber-50"
                      title={entry.workstationName ?? "Assigned workstation"}
                    >
                      <MapPin className="mr-1 inline size-2.5 shrink-0 text-amber-200" />
                      <span className="truncate">{entry.workstationName ?? geofenceLabel(entry)}</span>
                    </span>
                    <span className="shrink-0 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-white border border-amber-300/20">
                      {entry.departmentName ?? "General"}
                    </span>
                  </div>
                </article>
              );
            }

            if (entry.status === "worked") {
              return (
                <article
                  key={entry.employeeId}
                  onClick={() => setSelectedColleague(entry)}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-slate-800 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-slate-900/60"
                >
                  {/* Top: Avatar, Name & Solid Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={entry.knownAs ?? entry.fullName}
                          src={entry.avatarUrl}
                          className="size-8.5 ring-2 ring-slate-600 shadow-xs"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-emerald-400 ring-2 ring-slate-800" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-white">
                          {entry.knownAs ?? entry.fullName}
                        </p>
                        <p className="truncate text-[11px] font-medium text-slate-300">
                          {entry.jobTitle ?? "Team Member"}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 border border-slate-700">
                      <CheckCircle2 className="size-2.5 text-emerald-400" />
                      Done
                    </span>
                  </div>

                  {/* High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-2 text-center text-slate-900 shadow-xs">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Out</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockOut)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total</p>
                      <p className="font-extrabold text-emerald-700 text-xs">{formatHours(entry.paidHours)}</p>
                    </div>
                  </div>

                  {/* Footer Pills */}
                  <div className="flex items-center justify-between gap-1.5 text-[11px]">
                    <span
                      className="inline-flex max-w-[65%] items-center truncate rounded bg-slate-700/80 px-2 py-0.5 font-semibold text-slate-200"
                      title={entry.workstationName ?? "Assigned workstation"}
                    >
                      <MapPin className="mr-1 inline size-2.5 shrink-0 text-slate-400" />
                      <span className="truncate">{entry.workstationName ?? geofenceLabel(entry)}</span>
                    </span>
                    <span className="shrink-0 rounded bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                      {entry.departmentName ?? "General"}
                    </span>
                  </div>
                </article>
              );
            }

            if (entry.status === "needs_review") {
              return (
                <article
                  key={entry.employeeId}
                  onClick={() => setSelectedColleague(entry)}
                  className="group flex flex-col justify-between gap-2.5 rounded-lg bg-rose-600 p-3 text-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ring-1 ring-rose-700/60"
                >
                  {/* Top: Avatar, Name & Solid Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative shrink-0">
                        <EmployeeAvatar
                          name={entry.knownAs ?? entry.fullName}
                          src={entry.avatarUrl}
                          className="size-8.5 ring-2 ring-white shadow-xs"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-rose-300 ring-2 ring-rose-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-white">
                          {entry.knownAs ?? entry.fullName}
                        </p>
                        <p className="truncate text-[11px] font-medium text-rose-100">
                          {entry.jobTitle ?? "Team Member"}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-950/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white border border-rose-400/30">
                      <AlertTriangle className="size-2.5 text-rose-200" />
                      Review
                    </span>
                  </div>

                  {/* High-Contrast White Metrics Box */}
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white p-2 text-center text-slate-900 shadow-xs">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Out</p>
                      <p className="font-extrabold text-slate-900 text-xs">{shortTime(entry.clockOut)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Flag</p>
                      <p className="font-extrabold text-rose-600 text-xs">Review</p>
                    </div>
                  </div>

                  {/* Footer Pills */}
                  <div className="flex items-center justify-between gap-1.5 text-[11px]">
                    <span
                      className="inline-flex max-w-[65%] items-center truncate rounded bg-rose-700/70 px-2 py-0.5 font-semibold text-rose-50"
                      title={entry.workstationName ?? "Assigned workstation"}
                    >
                      <MapPin className="mr-1 inline size-2.5 shrink-0 text-rose-200" />
                      <span className="truncate">{entry.workstationName ?? geofenceLabel(entry)}</span>
                    </span>
                    <span className="shrink-0 rounded bg-rose-950/50 px-2 py-0.5 text-[10px] font-bold text-white border border-rose-400/20">
                      {entry.departmentName ?? "General"}
                    </span>
                  </div>
                </article>
              );
            }

            // Not Started
            return (
              <article
                key={entry.employeeId}
                onClick={() => setSelectedColleague(entry)}
                className="group flex flex-col justify-between gap-2.5 rounded-lg border border-zinc-300/80 bg-zinc-100/90 p-3 text-zinc-800 shadow-xs transition-all hover:bg-zinc-100 hover:border-zinc-400 hover:shadow-sm cursor-pointer"
              >
                {/* Top: Avatar, Name & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="relative shrink-0">
                      <EmployeeAvatar
                        name={entry.knownAs ?? entry.fullName}
                        src={entry.avatarUrl}
                        className="size-8.5 ring-1 ring-zinc-300 opacity-80"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-zinc-400 ring-2 ring-zinc-100" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-zinc-900">
                        {entry.knownAs ?? entry.fullName}
                      </p>
                      <p className="truncate text-[11px] font-medium text-zinc-500">
                        {entry.jobTitle ?? "Team Member"}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 border border-zinc-300/60">
                    <Clock className="size-2.5 text-zinc-500" />
                    Not started
                  </span>
                </div>

                {/* Neutral Prompt Box */}
                <div className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 bg-white/80 p-2 text-center text-xs font-medium text-zinc-500 shadow-2xs">
                  <Clock className="size-3 text-zinc-400" />
                  <span className="text-[11px]">No clock events today</span>
                </div>

                {/* Footer Pills */}
                <div className="flex items-center justify-between gap-1.5 text-[11px]">
                  <span
                    className="inline-flex max-w-[65%] items-center truncate rounded bg-zinc-200/80 px-2 py-0.5 font-semibold text-zinc-700"
                    title={entry.workstationName ?? "Assigned workstation"}
                  >
                    <MapPin className="mr-1 inline size-2.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{entry.workstationName ?? "No workstation"}</span>
                  </span>
                  <span className="shrink-0 rounded bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold text-zinc-700 border border-zinc-300/60">
                    {entry.departmentName ?? "General"}
                  </span>
                </div>
              </article>
            );
          })
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
            {/* Solid Status Hero Card */}
            <div
              className={`flex items-center gap-3.5 rounded-lg p-4 shadow-sm ${
                selectedColleague.status === "working"
                  ? "bg-emerald-600 text-white ring-1 ring-emerald-700/60"
                  : selectedColleague.status === "on_lunch"
                    ? "bg-amber-500 text-white ring-1 ring-amber-600/60"
                    : selectedColleague.status === "worked"
                      ? "bg-slate-800 text-white ring-1 ring-slate-900/60"
                      : selectedColleague.status === "needs_review"
                        ? "bg-rose-600 text-white ring-1 ring-rose-700/60"
                        : "border border-zinc-300 bg-zinc-100 text-zinc-900"
              }`}
            >
              <div className="relative">
                <EmployeeAvatar
                  name={selectedColleague.knownAs ?? selectedColleague.fullName}
                  src={selectedColleague.avatarUrl}
                  className="size-14 ring-2 ring-white shadow-xs"
                />
                <span
                  className={`absolute bottom-0 right-0 block size-3.5 rounded-full ring-2 ${
                    selectedColleague.status === "working"
                      ? "bg-emerald-300 ring-emerald-600"
                      : selectedColleague.status === "on_lunch"
                        ? "bg-amber-200 ring-amber-500"
                        : selectedColleague.status === "worked"
                          ? "bg-emerald-400 ring-slate-800"
                          : selectedColleague.status === "needs_review"
                            ? "bg-rose-200 ring-rose-600"
                            : "bg-zinc-400 ring-zinc-100"
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-extrabold">
                  {selectedColleague.knownAs ?? selectedColleague.fullName}
                </h3>
                <p className={`text-xs font-medium ${selectedColleague.status === "not_started" ? "text-zinc-600" : "opacity-90"}`}>
                  {selectedColleague.jobTitle ?? "Team Member"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${
                      selectedColleague.status === "working"
                        ? "bg-emerald-950/40 text-white border border-emerald-400/30"
                        : selectedColleague.status === "on_lunch"
                          ? "bg-amber-950/40 text-white border border-amber-300/30"
                          : selectedColleague.status === "worked"
                            ? "bg-slate-900/80 text-emerald-400 border border-slate-700"
                            : selectedColleague.status === "needs_review"
                              ? "bg-rose-950/50 text-white border border-rose-400/30"
                              : "bg-zinc-200 text-zinc-700 border border-zinc-300"
                    }`}
                  >
                    {statusLabel(selectedColleague.status)}
                  </span>
                  {selectedColleague.employeeNumber ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${
                        selectedColleague.status === "not_started"
                          ? "bg-zinc-200 text-zinc-700"
                          : "bg-black/20 text-white"
                      }`}
                    >
                      #{selectedColleague.employeeNumber}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Department & Workstation Cards */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Department
                </p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {selectedColleague.departmentName ?? "General"}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Workstation
                </p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {selectedColleague.workstationName ?? "Assigned workstation"}
                </p>
              </div>
            </div>

            {/* Shift Breakdown Panel */}
            <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                  Today&apos;s shift logs
                </p>
                <span className="text-xs font-semibold text-muted">{overview.workDate}</span>
              </div>

              {/* High-Contrast White Time Strip */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-background p-2 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">In</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">
                    {shortTime(selectedColleague.clockIn)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Lunch start</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">
                    {shortTime(selectedColleague.lunchStart)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Lunch end</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">
                    {shortTime(selectedColleague.lunchEnd)}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Out</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">
                    {shortTime(selectedColleague.clockOut)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-emerald-800">Worked duration</p>
                  <p className="mt-0.5 text-lg font-black text-emerald-950">
                    {selectedColleague.clockOut
                      ? formatHours(selectedColleague.paidHours)
                      : activeDuration(selectedColleague, tick) ?? "--"}
                  </p>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-100/70 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-700">Overtime</p>
                  <p className="mt-0.5 text-lg font-black text-slate-900">
                    {formatHours(selectedColleague.overtimeHours)}
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] font-bold uppercase text-muted">Geofence check</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex rounded border border-border bg-surface px-2.5 py-0.5 text-xs font-bold text-foreground">
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
