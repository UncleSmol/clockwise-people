"use client";

import { MapPin, Navigation, Radar, Save, Trash2, Users } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  assignEmployeeWorkstation,
  deactivateCompanyWorkstation,
  saveCompanyWorkstation,
} from "@/lib/geolocation/actions";
import type {
  CompanyGeolocationData,
  CompanyWorkstation,
} from "@/lib/geolocation/schema";
import type { Branch } from "@/lib/foundation/schema";
import WorkstationMap from "./WorkstationMap";

type CompanyGeolocationPanelProps = {
  branches: Branch[];
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
  branches,
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
    <section className="premium-card grid gap-5 rounded-md p-4 sm:p-6">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Geolocation
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Workstations</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Set a workstation pin and radius, then assign employees. Clock events capture
            the employee location and whether it was inside the assigned radius.
          </p>
        </div>
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning lg:max-w-sm">
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-3">
          <WorkstationMap
            latitude={position.latitude}
            longitude={position.longitude}
            onChange={(latitude, longitude) => setPosition({ latitude, longitude })}
            radiusMeters={radiusMeters}
          />
          <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Latitude
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCoordinate(position.latitude)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Longitude
              </p>
              <p className="mt-1 font-semibold text-foreground">
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

        <form action={saveAction} className="grid gap-3 rounded-md border border-border bg-background p-4">
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

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Name
            <input
              key={selectedWorkstation?.id ?? "new-name"}
              name="name"
              required
              defaultValue={selectedWorkstation?.name ?? ""}
              placeholder="Head office reception"
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Branch
            <select
              key={selectedWorkstation?.id ?? "new-branch"}
              name="branch_id"
              defaultValue={selectedWorkstation?.branch_id ?? ""}
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            >
              <option value="">Company-wide</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Address
            <input
              key={selectedWorkstation?.id ?? "new-address"}
              name="address"
              defaultValue={selectedWorkstation?.address ?? ""}
              placeholder="Optional display address"
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Radius: {radiusMeters}m
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
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Save className="size-4" />
            {savePending ? "Saving..." : "Save workstation"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="rounded-md border border-border bg-background">
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
                    className="grid gap-1 text-left"
                  >
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <MapPin className="size-4 text-accent" />
                      {workstation.name}
                    </span>
                    <span className="text-xs text-muted">
                      {workstation.branch_name ?? "Company-wide"} · {workstation.radius_meters}m ·{" "}
                      {workstation.assigned_employee_count ?? 0} assigned
                    </span>
                  </button>
                  <form action={deactivateCompanyWorkstation}>
                    <input name="workstation_id" type="hidden" value={workstation.id} />
                    <button className="inline-flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                      <Trash2 className="size-3.5" />
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

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Employee
            <select
              name="employee_id"
              required
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            >
              <option value="">Choose employee</option>
              {data.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Workstation
            <select
              name="workstation_id"
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            >
              <option value="">No workstation</option>
              {data.workstations.map((workstation) => (
                <option key={workstation.id} value={workstation.id}>
                  {workstation.name}
                </option>
              ))}
            </select>
          </label>

          <button
            disabled={assignPending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Radar className="size-4" />
            {assignPending ? "Saving..." : "Save assignment"}
          </button>

          <div className="grid gap-2 border-t border-border pt-3">
            {data.employees
              .filter((employee) => employee.workstation_id)
              .map((employee) => {
                const workstation = data.workstations.find(
                  (item) => item.id === employee.workstation_id,
                );

                return (
                  <p key={employee.id} className="flex items-center gap-2 text-xs text-muted">
                    <Navigation className="size-3.5 text-accent" />
                    <span className="truncate">
                      {employee.label} · {workstation?.name ?? "Unknown workstation"}
                    </span>
                  </p>
                );
              })}
          </div>
        </form>
      </div>
    </section>
  );
}
