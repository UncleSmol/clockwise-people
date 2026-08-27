"use client";

import dynamic from "next/dynamic";
import { ChevronDown, MapPin, Navigation, Radar, Save, Search, Trash2, User, Users } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  assignEmployeeWorkstation,
  deactivateCompanyWorkstation,
  saveCompanyWorkstation,
} from "@/lib/geolocation/actions";
import type {
  CompanyGeolocationData,
  CompanyWorkstation,
} from "@/lib/geolocation/schema";

const WorkstationMap = dynamic(() => import("./WorkstationMap"), {
  loading: () => (
    <div className="grid h-[360px] place-items-center rounded-md border border-border bg-background text-sm font-semibold text-muted">
      Loading map...
    </div>
  ),
  ssr: false,
});

type CompanyGeolocationPanelProps = {
  data: CompanyGeolocationData;
};

const initialState = {
  ok: true,
  message: "",
};

const defaultCenter = {
  latitude: -26.2041,
  longitude: 28.0473,
};

function formatCoordinate(value: number) {
  return Number(value).toFixed(7);
}

export default function CompanyGeolocationPanel({
  data,
}: CompanyGeolocationPanelProps) {
  const [selectedWorkstationId, setSelectedWorkstationId] = useState("");
  const selectedWorkstation = useMemo(
    () => data.workstations.find((workstation) => workstation.id === selectedWorkstationId) ?? null,
    [data.workstations, selectedWorkstationId],
  );
  const [position, setPosition] = useState({
    latitude: selectedWorkstation?.latitude ?? defaultCenter.latitude,
    longitude: selectedWorkstation?.longitude ?? defaultCenter.longitude,
  });
  const [radiusMeters, setRadiusMeters] = useState(
    selectedWorkstation?.radius_meters ?? 150,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveCompanyWorkstation,
    initialState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignEmployeeWorkstation,
    initialState,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [searchResults, setSearchResults] = useState<
    { lat: string; lon: string; display_name: string }[]
  >([]);
  const [showResults, setShowResults] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  async function searchAddress() {
    const value = addressRef.current?.value.trim();
    if (!value) return;
    setGeocoding(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&countrycodes=za&addressdetails=1`,
      );
      const data = await res.json();
      if (data.length > 0) {
        setSearchResults(data);
        setShowResults(true);
      }
    } catch {
      /* ignore */
    } finally {
      setGeocoding(false);
    }
  }

  function selectResult(result: { lat: string; lon: string; display_name: string }) {
    setPosition({
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    });
    setShowResults(false);
    if (addressRef.current) {
      addressRef.current.value = result.display_name;
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      searchAddress();
    }
    if (e.key === "Escape") {
      setShowResults(false);
    }
  }

  function handleSearchBlur() {
    setTimeout(() => setShowResults(false), 200);
  }

  function selectWorkstation(workstation: CompanyWorkstation) {
    setSelectedWorkstationId(workstation.id);
    setPosition({
      latitude: workstation.latitude,
      longitude: workstation.longitude,
    });
    setRadiusMeters(workstation.radius_meters);
  }

  function startNewWorkstation() {
    setSelectedWorkstationId("");
    setPosition(defaultCenter);
    setRadiusMeters(150);
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
            Geolocation
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-foreground">Workstations</h2>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            Set a workstation pin and radius, then assign employees. Clock events capture
            the employee location and whether it was inside the assigned radius.
          </p>
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs font-medium text-foreground lg:max-w-xs shrink-0 leading-relaxed shadow-2xs">
          Browser geolocation is captured when employees clock while using the app. It is not
          background GPS tracking when the browser is closed.
        </div>
      </div>

      {(saveState.message || assignState.message) ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            saveState.message
              ? saveState.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
              : assignState.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {saveState.message || assignState.message}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px] min-w-0">
        <div className="grid min-w-0 gap-3">
          <WorkstationMap
            latitude={position.latitude}
            longitude={position.longitude}
            onChange={(latitude, longitude) => setPosition({ latitude, longitude })}
            radiusMeters={radiusMeters}
          />
          <div className="grid gap-3 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Latitude
              </p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {formatCoordinate(position.latitude)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Longitude
              </p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {formatCoordinate(position.longitude)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Radius
              </p>
              <p className="mt-1 font-semibold text-foreground">{radiusMeters}m</p>
            </div>
          </div>
        </div>

        <form action={saveAction} className="grid h-max gap-3 rounded-md border border-border bg-background p-4">
          <input name="workstation_id" type="hidden" value={selectedWorkstationId} />
          <input name="latitude" type="hidden" value={position.latitude} />
          <input name="longitude" type="hidden" value={position.longitude} />

          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground">
              {selectedWorkstation ? "Edit workstation" : "Add workstation"}
            </h3>
            {selectedWorkstation ? (
              <button
                type="button"
                onClick={startNewWorkstation}
                className="text-xs font-semibold text-accent hover:underline"
              >
                New
              </button>
            ) : null}
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <MapPin className="size-4 shrink-0 text-muted" />
              <input
                key={selectedWorkstation?.id ?? "new-name"}
                name="name"
                required
                defaultValue={selectedWorkstation?.name ?? ""}
                placeholder="Head office reception"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Address</span>
            <div className="relative flex gap-2" ref={searchRef}>
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Navigation className="size-4 shrink-0 text-muted" />
                <input
                  key={selectedWorkstation?.id ?? "new-address"}
                  ref={addressRef}
                  name="address"
                  defaultValue={selectedWorkstation?.address ?? ""}
                  placeholder="Search address then pin the location"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                  onKeyDown={handleSearchKeyDown}
                  onBlur={handleSearchBlur}
                  onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                />
              </span>
              {showResults && searchResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                  {searchResults.map((result, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => selectResult(result)}
                      className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-surface-muted"
                    >
                      {result.display_name}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                disabled={geocoding}
                onClick={searchAddress}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-60 sm:min-h-0"
              >
                <Search className="size-4 shrink-0" />
                {geocoding ? "..." : "Search"}
              </button>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Radius: {radiusMeters}m</span>
            <input
              min={25}
              max={5000}
              name="radius_meters"
              onChange={(event) => setRadiusMeters(Number(event.target.value))}
              step={25}
              type="range"
              value={radiusMeters}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-xs font-normal text-muted">
              Use a larger radius for weak GPS areas or large work sites.
            </span>
          </label>

          <button
            disabled={savePending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:min-h-0"
          >
            <Save className="size-4 shrink-0" />
            {savePending ? "Saving..." : "Save workstation"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px] min-w-0">
        <div className="min-w-0 rounded-md border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">Active workstations</h3>
          </div>
          <div className="divide-y divide-border">
            {data.workstations.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">
                No workstations configured yet.
              </div>
            ) : (
              data.workstations.map((workstation) => (
                <div
                  key={workstation.id}
                  className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <button
                    type="button"
                    onClick={() => selectWorkstation(workstation)}
                    className="grid cursor-pointer gap-1 text-left"
                  >
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <MapPin className="size-4 text-accent" />
                      {workstation.name}
                    </span>
                    <span className="text-xs text-muted">
                      {workstation.radius_meters}m ·{" "}
                      {workstation.assigned_employee_count ?? 0} assigned
                    </span>
                  </button>
                  <form action={deactivateCompanyWorkstation}>
                    <input name="workstation_id" type="hidden" value={workstation.id} />
                    <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger sm:min-h-0">
                      <Trash2 className="size-3.5 shrink-0" />
                      Deactivate
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </div>

        <form action={assignAction} className="grid h-max gap-3 rounded-md border border-border bg-background p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4 text-accent" />
              Employee assignment
            </p>
            <p className="mt-1 text-xs text-muted">
              Each employee has one active workstation for geofence checks.
            </p>
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Employee</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <User className="size-4 shrink-0 text-muted" />
              <select
                name="employee_id"
                required
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Choose employee</option>
                {data.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workstation</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <MapPin className="size-4 shrink-0 text-muted" />
              <select
                name="workstation_id"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">No workstation</option>
                {data.workstations.map((workstation) => (
                  <option key={workstation.id} value={workstation.id}>
                    {workstation.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <button
            disabled={assignPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:min-h-0"
          >
            <Radar className="size-4 shrink-0" />
            {assignPending ? "Saving..." : "Save assignment"}
          </button>

          <details className="group border-t border-border pt-2">
            <summary className="flex cursor-pointer items-center justify-between gap-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted [&::-webkit-details-marker]:hidden [&::marker]:hidden">
              <span>
                Assigned employees ({data.employees.filter((e) => e.workstation_id).length})
              </span>
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 grid gap-1.5">
              {data.employees.filter((e) => e.workstation_id).length === 0 ? (
                <p className="py-2 text-xs text-muted">No employees assigned yet.</p>
              ) : (
                data.employees
                  .filter((employee) => employee.workstation_id)
                  .map((employee) => {
                    const workstation = data.workstations.find(
                      (item) => item.id === employee.workstation_id,
                    );

                    return (
                      <p key={employee.id} className="flex items-center gap-2 text-xs text-muted">
                        <Navigation className="size-3.5 shrink-0 text-accent" />
                        <span className="truncate">
                          {employee.label} · {workstation?.name ?? "Unknown workstation"}
                        </span>
                      </p>
                    );
                  })
              )}
            </div>
          </details>
        </form>
      </div>
    </section>
  );
}
