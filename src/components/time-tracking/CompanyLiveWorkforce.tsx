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
    worked: "Shift done",
    working: "Clocked in",
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

  const displayedColleagues = useMemo(() => {
    if (activeFilter === "all" || activeFilter === "working") {
      return workingColleagues;
    }
    return filteredEntries;
  }, [activeFilter, workingColleagues, filteredEntries]);

  return (
    <section className="grid min-w-0 gap-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Live workforce
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-foreground">
            <Users className="size-5 text-primary" />
            Today&apos;s attendance
          </h2>
          <p className="mt-1 text-xs text-muted">
            Real-time workforce presence, break status, and daily time logs.
          </p>
        </div>
        <span className="w-max rounded-full border border-border/80 bg-surface px-3.5 py-1 text-xs font-bold text-foreground shadow-soft">
          {overview.workDate}
        </span>
      </div>

      {/* Bold Segmented Stat Filter Cards */}
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0">
        {/* Total Team */}
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className={`rounded-2xl p-4 text-left transition-all min-w-0 cursor-pointer shadow-soft ${
            activeFilter === "all"
              ? "card-hero-green text-white"
              : "border border-border/80 bg-surface hover:bg-surface-muted text-foreground"
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-[0.12em] break-words leading-tight ${activeFilter === "all" ? "text-white/80" : "text-muted"}`}>
            Total team
          </p>
          <p className="mt-1.5 text-2xl font-extrabold break-words">
            {overview.totals.totalEmployees}
          </p>
        </button>

        {/* Working */}
        <button
          type="button"
          onClick={() => setActiveFilter("working")}
          className={`rounded-2xl p-4 text-left transition-all min-w-0 cursor-pointer shadow-soft ${
            activeFilter === "working"
              ? "bg-emerald-600 text-white"
              : "border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-950"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] break-words leading-tight ${activeFilter === "working" ? "text-emerald-100" : "text-emerald-800"}`}>
              Clocked in
            </p>
            <span className="flex size-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold break-words">
            {overview.totals.activeEmployees}
          </p>
        </button>

        {/* On Lunch */}
        <button
          type="button"
          onClick={() => setActiveFilter("on_lunch")}
          className={`rounded-2xl p-4 text-left transition-all min-w-0 cursor-pointer shadow-soft ${
            activeFilter === "on_lunch"
              ? "card-gold text-slate-900"
              : "border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-950"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-[0.12em] break-words leading-tight ${activeFilter === "on_lunch" ? "text-slate-800" : "text-amber-800"}`}>
              On Lunch
            </p>
            <span className="flex size-2 rounded-full bg-amber-400 shrink-0" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold break-words">
            {overview.totals.onLunch}
          </p>
        </button>

        {/* Worked */}
        <button
          type="button"
          onClick={() => setActiveFilter("worked")}
          className={`rounded-2xl p-4 text-left transition-all min-w-0 cursor-pointer shadow-soft ${
            activeFilter === "worked"
              ? "bg-slate-800 text-white"
              : "border border-slate-200 bg-slate-100/70 hover:bg-slate-200 text-slate-900"
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-[0.12em] break-words leading-tight ${activeFilter === "worked" ? "text-slate-300" : "text-slate-600"}`}>
            Shift Done
          </p>
          <p className="mt-1.5 text-2xl font-extrabold break-words">
            {overview.totals.workedToday}
          </p>
        </button>

        {/* Not Started */}
        <button
          type="button"
          onClick={() => setActiveFilter("not_started")}
          className={`rounded-2xl p-4 text-left transition-all min-w-0 cursor-pointer shadow-soft ${
            activeFilter === "not_started"
              ? "bg-zinc-700 text-white"
              : "border border-border/80 bg-background hover:bg-surface text-muted"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted break-words leading-tight">
            Not Started
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-foreground break-words">
            {overview.totals.notStarted}
          </p>
        </button>
      </div>

      {/* Real-time Workforce Avatar Strip (Responsive to selected KPI filter) */}
      {displayedColleagues.length > 0 ? (
        <div
          className={`rounded-2xl border-2 p-4 shadow-soft transition-all ${
            activeFilter === "on_lunch"
              ? "border-amber-500/30 bg-amber-50/40"
              : activeFilter === "worked"
                ? "border-slate-500/30 bg-slate-50/50"
                : activeFilter === "not_started"
                  ? "border-border bg-surface-muted/30"
                  : "border-emerald-500/30 bg-emerald-50/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {activeFilter === "all" || activeFilter === "working" ? (
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
              </span>
            ) : activeFilter === "on_lunch" ? (
              <span className="size-2.5 rounded-full bg-amber-500" />
            ) : activeFilter === "worked" ? (
              <span className="size-2.5 rounded-full bg-slate-700" />
            ) : (
              <span className="size-2.5 rounded-full bg-zinc-400" />
            )}
            <p
              className={`text-xs font-black ${
                activeFilter === "on_lunch"
                  ? "text-amber-950"
                  : activeFilter === "worked"
                    ? "text-slate-900"
                    : activeFilter === "not_started"
                      ? "text-foreground"
                      : "text-emerald-950"
              }`}
            >
              {activeFilter === "on_lunch"
                ? `Colleagues on lunch right now (${displayedColleagues.length})`
                : activeFilter === "worked"
                  ? `Colleagues completed shift (${displayedColleagues.length})`
                  : activeFilter === "not_started"
                    ? `Colleagues not started yet (${displayedColleagues.length})`
                    : `Colleagues on shift right now (${displayedColleagues.length})`}
            </p>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {displayedColleagues.map((colleague) => (
              <button
                key={colleague.employeeId}
                type="button"
                onClick={() => setSelectedColleague(colleague)}
                className="flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 pr-3 shadow-soft transition-all hover:bg-surface-muted cursor-pointer"
              >
                <div className="relative shrink-0">
                  <EmployeeAvatar
                    name={colleague.knownAs ?? colleague.fullName}
                    src={colleague.avatarUrl}
                    className={`size-7 ring-2 ${
                      colleague.status === "working"
                        ? "ring-emerald-500"
                        : colleague.status === "on_lunch"
                          ? "ring-amber-500"
                          : colleague.status === "worked"
                            ? "ring-slate-700"
                            : "ring-zinc-400"
                    }`}
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-1 ring-surface ${
                      colleague.status === "working"
                        ? "bg-emerald-500"
                        : colleague.status === "on_lunch"
                          ? "bg-amber-500"
                          : colleague.status === "worked"
                            ? "bg-slate-700"
                            : "bg-zinc-400"
                    }`}
                  />
                </div>
                <div className="min-w-0 text-left">
                  <p
                    className="max-w-[140px] break-words text-xs font-extrabold text-foreground leading-tight"
                    title={colleague.knownAs ?? colleague.fullName}
                  >
                    {colleague.knownAs ?? colleague.fullName}
                  </p>
                  <p
                    className={`text-[10px] font-semibold ${
                      colleague.status === "working"
                        ? "text-emerald-700"
                        : colleague.status === "on_lunch"
                          ? "text-amber-800"
                          : colleague.status === "worked"
                            ? "text-slate-600"
                            : "text-muted"
                    }`}
                  >
                    {colleague.status === "working" && colleague.clockIn
                      ? `In ${shortTime(colleague.clockIn)}`
                      : colleague.status === "on_lunch" && colleague.lunchStart
                        ? `Lunch ${shortTime(colleague.lunchStart)}`
                        : colleague.status === "worked" && colleague.clockOut
                          ? `Out ${shortTime(colleague.clockOut)}`
                          : "Not started"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/80 bg-surface p-6 text-center text-xs font-semibold text-muted shadow-soft">
          No colleagues match the selected status filter.
        </div>
      )}

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
              className={`flex items-center gap-3.5 rounded-2xl p-4.5 shadow-soft ${
                selectedColleague.status === "working"
                  ? "card-hero-green text-white border border-white/20"
                  : selectedColleague.status === "on_lunch"
                    ? "card-gold text-amber-950 border border-amber-300/40"
                    : selectedColleague.status === "worked"
                      ? "bg-slate-900 text-white border border-slate-700/60"
                      : selectedColleague.status === "needs_review"
                        ? "bg-rose-600 text-white border border-rose-700/60"
                        : "border border-border/80 bg-surface text-foreground shadow-soft"
              }`}
            >
              <div className="relative">
                <EmployeeAvatar
                  name={selectedColleague.knownAs ?? selectedColleague.fullName}
                  src={selectedColleague.avatarUrl}
                  className="size-14 ring-2 ring-white/90 shadow-xs"
                />
                <span
                  className={`absolute bottom-0 right-0 block size-3.5 rounded-full ring-2 ${
                    selectedColleague.status === "working"
                      ? "bg-emerald-300 ring-[#2E9B5F]"
                      : selectedColleague.status === "on_lunch"
                        ? "bg-amber-300 ring-amber-600"
                        : selectedColleague.status === "worked"
                          ? "bg-emerald-400 ring-slate-900"
                          : selectedColleague.status === "needs_review"
                            ? "bg-rose-300 ring-rose-600"
                            : "bg-zinc-400 ring-surface"
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold break-words leading-snug">
                  {selectedColleague.knownAs ?? selectedColleague.fullName}
                </h3>
                <p className={`text-xs font-medium break-words leading-tight mt-0.5 ${selectedColleague.status === "not_started" ? "text-muted" : "opacity-90"}`}>
                  {selectedColleague.jobTitle ?? "Team Member"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                      selectedColleague.status === "working"
                        ? "bg-black/20 text-white border border-white/20"
                        : selectedColleague.status === "on_lunch"
                          ? "bg-black/15 text-amber-950 border border-amber-900/20"
                          : selectedColleague.status === "worked"
                            ? "bg-emerald-950/70 text-emerald-400 border border-emerald-600/30"
                            : selectedColleague.status === "needs_review"
                              ? "bg-rose-950/50 text-white border border-rose-400/30"
                              : "bg-secondary text-muted-foreground border border-border/80"
                    }`}
                  >
                    {statusLabel(selectedColleague.status)}
                  </span>
                </div>
              </div>

            </div>

            {/* Department & Workstation Cards */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-surface p-3.5 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Department
                </p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {selectedColleague.departmentName ?? "General"}
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-surface p-3.5 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Workstation
                </p>
                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {selectedColleague.workstationName ?? "Assigned workstation"}
                </p>
              </div>
            </div>

            {/* Shift Breakdown Panel */}
            <div className="grid gap-3.5 rounded-2xl border border-border/80 bg-surface p-4.5 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">
                  Today&apos;s shift logs
                </p>
                <span className="text-xs font-semibold text-muted">{overview.workDate}</span>
              </div>

              {/* High-Contrast White Time Strip */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/80 p-2.5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">In</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground font-mono">
                    {shortTime(selectedColleague.clockIn)}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/80 p-2.5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Lunch start</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground font-mono">
                    {shortTime(selectedColleague.lunchStart)}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/80 p-2.5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Lunch end</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground font-mono">
                    {shortTime(selectedColleague.lunchEnd)}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/80 p-2.5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Out</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground font-mono">
                    {shortTime(selectedColleague.clockOut)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-primary">Worked duration</p>
                  <p className="mt-0.5 text-lg font-black text-foreground">
                    {selectedColleague.clockOut
                      ? formatHours(selectedColleague.paidHours)
                      : activeDuration(selectedColleague, tick) ?? "--"}
                  </p>
                </div>

                <div className="rounded-xl border border-border/80 bg-background/80 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-muted">Overtime</p>
                  <p className="mt-0.5 text-lg font-black text-foreground">
                    {formatHours(selectedColleague.overtimeHours)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                <p className="text-[10px] font-bold uppercase text-muted">Geofence check</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex rounded-full border border-border/80 bg-surface px-3 py-1 text-xs font-bold text-foreground">
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
