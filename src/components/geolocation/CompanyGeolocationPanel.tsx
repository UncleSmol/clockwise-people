"use client";

import dynamic from "next/dynamic";
import {
  ChevronDown,
  Compass,
  Edit3,
  MapPin,
  Navigation,
  Plus,
  Radar,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  assignEmployeeWorkstation,
  deactivateCompanyWorkstation,
  resolveMapLocationUrl,
  reverseGeocodeLocation,
  saveCompanyWorkstation,
  searchGeocodedLocations,
  type ActionState,
  type GeocodeSearchResult,
} from "@/lib/geolocation/actions";
import {
  isValidCoordinate,
  parseCoordinates,
  parseLocationInput,
} from "@/lib/geolocation/location-parser";
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

const initialState: ActionState = {
  ok: true,
  message: "",
  workstationId: null,
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
  // Determine default workstation (user's assigned workstation, or first company workstation)
  const initialDefaultWorkstation = useMemo(() => {
    if (data.userAssignedWorkstationId) {
      const assigned = data.workstations.find((w) => w.id === data.userAssignedWorkstationId);
      if (assigned) return assigned;
    }
    return data.workstations[0] ?? null;
  }, [data.userAssignedWorkstationId, data.workstations]);

  const [selectedWorkstationId, setSelectedWorkstationId] = useState<string>(
    () => initialDefaultWorkstation?.id ?? "",
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveCompanyWorkstation,
    initialState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignEmployeeWorkstation,
    initialState,
  );

  const effectiveWorkstationId =
    selectedWorkstationId === "new"
      ? ""
      : selectedWorkstationId || (saveState.ok && saveState.workstationId ? saveState.workstationId : (initialDefaultWorkstation?.id ?? ""));

  const selectedWorkstation = useMemo(
    () => data.workstations.find((w) => w.id === effectiveWorkstationId) ?? null,
    [data.workstations, effectiveWorkstationId],
  );

  const [position, setPosition] = useState(() => ({
    latitude: initialDefaultWorkstation?.latitude ?? defaultCenter.latitude,
    longitude: initialDefaultWorkstation?.longitude ?? defaultCenter.longitude,
  }));

  const [latInput, setLatInput] = useState(() => formatCoordinate(position.latitude));
  const [lngInput, setLngInput] = useState(() => formatCoordinate(position.longitude));
  const [radiusMeters, setRadiusMeters] = useState(
    () => initialDefaultWorkstation?.radius_meters ?? 150,
  );

  // Deletion & removal transition state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  // Address search & quick location parser state
  const [geocoding, setGeocoding] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("");
  const [reversingAddress, setReversingAddress] = useState(false);
  const [quickLocationInput, setQuickLocationInput] = useState("");
  const [parsingLocation, startParsingLocation] = useTransition();
  const [locationNotice, setLocationNotice] = useState("");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const addressRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Coordinate change handler from map (drag or click)
  function handleMapPositionChange(newLat: number, newLon: number) {
    setPosition({ latitude: newLat, longitude: newLon });
    setLatInput(formatCoordinate(newLat));
    setLngInput(formatCoordinate(newLon));
    setLocationNotice("");
  }

  // Handle manual typing in Latitude
  function handleLatInputChange(val: string) {
    setLatInput(val);
    const num = Number(val);
    if (!isNaN(num) && num >= -90 && num <= 90) {
      setPosition((prev) => ({ ...prev, latitude: num }));
    }
  }

  // Handle manual typing in Longitude
  function handleLngInputChange(val: string) {
    setLngInput(val);
    const num = Number(val);
    if (!isNaN(num) && num >= -180 && num <= 180) {
      setPosition((prev) => ({ ...prev, longitude: num }));
    }
  }

  // Reverse geocode to get street address from the current map pin
  async function handleReverseGeocode() {
    setReversingAddress(true);
    setLocationNotice("");
    try {
      const res = await reverseGeocodeLocation(position.latitude, position.longitude);
      if (res.ok && res.address) {
        if (addressRef.current) {
          addressRef.current.value = res.address;
        }
        setLocationNotice("Address updated from map pin.");
      } else {
        setLocationNotice("Could not determine street address for these coordinates.");
      }
    } catch {
      setLocationNotice("Address lookup failed.");
    } finally {
      setReversingAddress(false);
    }
  }

  // Unified Address Search using multi-engine geocoder
  async function handleSearch() {
    const value = addressRef.current?.value.trim();
    if (!value) return;
    setGeocoding(true);
    setSearchResults([]);
    setShowResults(false);
    setSearchFeedback("");

    try {
      // Check if user pasted coordinates directly into address search
      const inputType = parseLocationInput(value);
      if (inputType.type === "coordinates" && inputType.latitude !== undefined && inputType.longitude !== undefined) {
        handleMapPositionChange(inputType.latitude, inputType.longitude);
        setLocationNotice(`Detected coordinates: ${inputType.latitude}, ${inputType.longitude}`);
        return;
      }

      if (inputType.type === "map_url" && inputType.latitude !== undefined && inputType.longitude !== undefined) {
        handleMapPositionChange(inputType.latitude, inputType.longitude);
        setLocationNotice(`Extracted coordinates from map link: ${inputType.latitude}, ${inputType.longitude}`);
        handleReverseGeocode();
        return;
      }

      const res = await searchGeocodedLocations(value);
      if (res.ok && res.results.length > 0) {
        setSearchResults(res.results);
        setShowResults(true);
      } else {
        setSearchFeedback(
          "No address match found. You can enter exact coordinates below, paste a Google Maps link, or click directly on the map.",
        );
      }
    } catch {
      setSearchFeedback("Search request failed. Please check your connection or use coordinate entry.");
    } finally {
      setGeocoding(false);
    }
  }

  function selectSearchResult(result: GeocodeSearchResult) {
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (isValidCoordinate(lat, lon)) {
      handleMapPositionChange(lat, lon);
      setShowResults(false);
      if (addressRef.current) {
        addressRef.current.value = result.display_name;
      }
      setLocationNotice(`Pinned location: ${result.display_name}`);
    }
  }

  // Quick Map URL or Coordinate Parser
  function handleApplyQuickLocation() {
    const input = quickLocationInput.trim();
    if (!input) return;

    setLocationNotice("");
    startParsingLocation(async () => {
      // Direct coordinate parsing
      const coords = parseCoordinates(input);
      if (coords) {
        handleMapPositionChange(coords.latitude, coords.longitude);
        setLocationNotice(`Loaded coordinates: ${coords.latitude}, ${coords.longitude}`);
        setQuickLocationInput("");
        handleReverseGeocode();
        return;
      }

      // Map URL or short link resolution via server
      const res = await resolveMapLocationUrl(input);
      if (res.ok && res.latitude !== undefined && res.longitude !== undefined) {
        handleMapPositionChange(res.latitude, res.longitude);
        if (res.address && addressRef.current) {
          addressRef.current.value = res.address;
        }
        setLocationNotice(
          `Extracted location: ${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}${
            res.address ? ` (${res.address})` : ""
          }`,
        );
        setQuickLocationInput("");
      } else {
        setLocationNotice(res.message || "Could not parse map URL or coordinates.");
      }
    });
  }

  function selectWorkstation(workstation: CompanyWorkstation) {
    setSelectedWorkstationId(workstation.id);
    handleMapPositionChange(workstation.latitude, workstation.longitude);
    setRadiusMeters(workstation.radius_meters);
    if (addressRef.current) {
      addressRef.current.value = workstation.address ?? "";
    }
    setLocationNotice("");
    setSearchFeedback("");
  }

  function startNewWorkstation() {
    setSelectedWorkstationId("new");
    handleMapPositionChange(defaultCenter.latitude, defaultCenter.longitude);
    setRadiusMeters(150);
    if (addressRef.current) {
      addressRef.current.value = "";
    }
    setLocationNotice("");
    setSearchFeedback("");
    setGpsAccuracy(null);
  }

  function handleRemoveWorkstation(workstationId: string, name: string) {
    if (
      !window.confirm(
        `Are you sure you want to remove workstation "${name}"? This will deactivate the workstation and unassign any linked employees.`,
      )
    ) {
      return;
    }

    setDeletingId(workstationId);
    startDeleteTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("workstation_id", workstationId);
        await deactivateCompanyWorkstation(formData);
        setLocationNotice(`Workstation "${name}" was successfully removed.`);
        if (effectiveWorkstationId === workstationId) {
          startNewWorkstation();
        }
      } catch (err) {
        setLocationNotice(
          err instanceof Error ? err.message : "Failed to remove workstation.",
        );
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
            Geolocation
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-foreground">Workstations &amp; Geofencing</h2>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            Configure workstation locations using exact coordinates, Google Maps URLs, or interactive map pinning.
            Assigned employees are verified against the workstation radius when clocking.
          </p>
          {data.userAssignedWorkstationId ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success">
              <MapPin className="size-3.5 shrink-0" />
              <span>
                Map defaulted to your assigned workstation:{" "}
                <strong className="underline underline-offset-2">
                  {data.workstations.find((w) => w.id === data.userAssignedWorkstationId)?.name ?? "Assigned"}
                </strong>
              </span>
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs font-medium text-foreground lg:max-w-xs shrink-0 leading-relaxed shadow-2xs">
          Tip: You can paste a Google Maps link or enter exact coordinates to achieve pin-point accuracy for large sites.
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

      {locationNotice ? (
        <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">
          <Sparkles className="size-4 shrink-0" />
          <span>{locationNotice}</span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_390px] min-w-0">
        <div className="grid min-w-0 gap-3">
          <WorkstationMap
            latitude={position.latitude}
            longitude={position.longitude}
            onChange={handleMapPositionChange}
            radiusMeters={radiusMeters}
            onLocateSuccess={(acc) => {
              setGpsAccuracy(acc);
              setLocationNotice(`Current location captured via GPS (±${Math.round(acc)}m accuracy).`);
              handleReverseGeocode();
            }}
          />

          {/* Quick Location & Map URL Fallback Bar */}
          <div className="rounded-md border border-border bg-surface p-3 text-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Compass className="size-4 text-accent" />
                Define via Coordinates or Map URL
              </span>
              <span className="text-[11px] text-muted">
                Supports Google Maps (including short links), Apple Maps, OSM, or lat/lon
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={quickLocationInput}
                onChange={(e) => setQuickLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyQuickLocation();
                  }
                }}
                placeholder="Paste URL (e.g. https://maps.app.goo.gl/...) or coords (-26.2041, 28.0473)"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleApplyQuickLocation}
                disabled={parsingLocation || !quickLocationInput.trim()}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
              >
                {parsingLocation ? "Extracting..." : "Apply"}
              </button>
            </div>
          </div>

          {/* Direct Coordinate Readouts & Live GPS Info */}
          <div className="grid gap-3 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Current Latitude
              </p>
              <p className="mt-1 truncate font-mono font-semibold text-foreground">
                {formatCoordinate(position.latitude)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Current Longitude
              </p>
              <p className="mt-1 truncate font-mono font-semibold text-foreground">
                {formatCoordinate(position.longitude)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Geofence Radius
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {radiusMeters}m
                {gpsAccuracy !== null ? (
                  <span className="ml-2 text-xs font-normal text-muted">
                    (GPS ±{Math.round(gpsAccuracy)}m)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        {/* Workstation Form */}
        <form action={saveAction} className="grid h-max gap-3.5 rounded-md border border-border bg-background p-4">
          <input name="workstation_id" type="hidden" value={effectiveWorkstationId} />

          <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground">
                  {selectedWorkstation ? "Edit workstation" : "Add workstation"}
                </h3>
                {selectedWorkstation ? (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                    Active selection
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                {selectedWorkstation ? "Update location coordinates or radius" : "Create a new geofence boundary"}
              </p>
            </div>

            {selectedWorkstation ? (
              <button
                type="button"
                onClick={startNewWorkstation}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface-muted"
              >
                <Plus className="size-3" />
                New
              </button>
            ) : null}
          </div>

          {/* Workstation Name */}
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workstation Name</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <MapPin className="size-4 shrink-0 text-muted" />
              <input
                key={selectedWorkstation?.id ?? "new-name"}
                name="name"
                required
                defaultValue={selectedWorkstation?.name ?? ""}
                placeholder="e.g. Head Office, Site A, Warehouse"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>

          {/* Editable Coordinates: Latitude and Longitude */}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Latitude (-90 to 90)
              </span>
              <input
                name="latitude"
                type="number"
                step="any"
                required
                value={latInput}
                onChange={(e) => handleLatInputChange(e.target.value)}
                placeholder="-26.204100"
                className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Longitude (-180 to 180)
              </span>
              <input
                name="longitude"
                type="number"
                step="any"
                required
                value={lngInput}
                onChange={(e) => handleLngInputChange(e.target.value)}
                placeholder="28.047300"
                className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-accent"
              />
            </label>
          </div>

          {/* Address Search & Reverse Geocoding */}
          <label className="grid gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Address / Landmark</span>
              <button
                type="button"
                onClick={handleReverseGeocode}
                disabled={reversingAddress}
                title="Lookup street address for current latitude & longitude pin"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
              >
                <RotateCcw className={`size-3 ${reversingAddress ? "animate-spin" : ""}`} />
                {reversingAddress ? "Resolving..." : "Get address from pin"}
              </button>
            </div>
            <div className="relative flex gap-2" ref={searchRef}>
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Navigation className="size-4 shrink-0 text-muted" />
                <input
                  key={selectedWorkstation?.id ?? "new-address"}
                  ref={addressRef}
                  name="address"
                  defaultValue={selectedWorkstation?.address ?? ""}
                  placeholder="Search street, building, or paste coordinates/URL"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch();
                    }
                    if (e.key === "Escape") {
                      setShowResults(false);
                    }
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowResults(true);
                  }}
                />
              </span>
              <button
                type="button"
                disabled={geocoding}
                onClick={handleSearch}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-60"
              >
                <Search className="size-4 shrink-0" />
                {geocoding ? "..." : "Search"}
              </button>

              {showResults && searchResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-surface shadow-xl">
                  {searchResults.map((result, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => selectSearchResult(result)}
                      className="w-full border-b border-border/50 px-3 py-2 text-left text-xs text-foreground last:border-0 hover:bg-surface-muted"
                    >
                      <p className="font-semibold">{result.display_name}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {Number(result.lat).toFixed(6)}, {Number(result.lon).toFixed(6)}
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {searchFeedback ? (
              <p className="mt-1 text-xs text-warning leading-relaxed">{searchFeedback}</p>
            ) : null}
          </label>

          {/* Radius Slider */}
          <label className="grid gap-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <span>Geofence Radius</span>
              <span className="font-mono text-sm text-foreground">{radiusMeters}m</span>
            </div>
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
            <span className="text-[11px] text-muted">
              Standard office: 100m–150m. Large industrial/farm or weak GPS area: 250m–500m.
            </span>
          </label>

          {/* Submit / Remove Buttons */}
          {selectedWorkstation ? (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savePending || isPendingDelete}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Save className="size-4 shrink-0" />
                {savePending ? "Saving workstation..." : "Save changes"}
              </button>

              <button
                type="button"
                disabled={isPendingDelete || savePending}
                onClick={() => handleRemoveWorkstation(selectedWorkstation.id, selectedWorkstation.name)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/20 disabled:opacity-60"
                title="Remove this workstation"
              >
                <Trash2 className="size-4 shrink-0" />
                {deletingId === selectedWorkstation.id ? "Removing..." : "Remove"}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={savePending || isPendingDelete}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Save className="size-4 shrink-0" />
              {savePending ? "Saving workstation..." : "Create workstation"}
            </button>
          )}
        </form>
      </div>

      {/* Active Workstations & Employee Assignment */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px] min-w-0">
        <div className="min-w-0 rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">
              Configured Workstations ({data.workstations.length})
            </h3>
            <span className="text-xs text-muted">Click any workstation to view or edit</span>
          </div>

          <div className="divide-y divide-border">
            {data.workstations.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">
                No workstations configured yet. Add your first location above.
              </div>
            ) : (
              data.workstations.map((workstation) => {
                const isSelected = workstation.id === effectiveWorkstationId;
                const isUserAssigned = workstation.id === data.userAssignedWorkstationId;
                return (
                  <div
                    key={workstation.id}
                    className={`grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center transition-colors ${
                      isSelected ? "bg-accent/10 border-l-4 border-l-accent" : "hover:bg-surface-muted/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectWorkstation(workstation)}
                      className="grid cursor-pointer gap-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                        <MapPin className="size-4 text-accent shrink-0" />
                        <span>{workstation.name}</span>
                        {isUserAssigned ? (
                          <span className="rounded border border-success/30 bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">
                            Your assigned workstation
                          </span>
                        ) : null}
                        {isSelected ? (
                          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                            Editing
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="font-mono">
                          {workstation.latitude.toFixed(5)}, {workstation.longitude.toFixed(5)}
                        </span>
                        <span>·</span>
                        <span>Radius: {workstation.radius_meters}m</span>
                        <span>·</span>
                        <span>{workstation.assigned_employee_count ?? 0} assigned</span>
                        {workstation.address ? (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-xs">{workstation.address}</span>
                          </>
                        ) : null}
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectWorkstation(workstation)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted"
                      >
                        <Edit3 className="size-3 text-accent" />
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={deletingId === workstation.id || isPendingDelete}
                        onClick={() => handleRemoveWorkstation(workstation.id, workstation.name)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
                        title="Remove workstation"
                      >
                        <Trash2 className="size-3.5 shrink-0" />
                        {deletingId === workstation.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Employee Assignment Panel */}
        <form action={assignAction} className="grid h-max gap-3 rounded-md border border-border bg-background p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4 text-accent" />
              Employee workstation assignment
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
