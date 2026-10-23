"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import {
  Clock,
  Compass,
  Footprints,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  ShieldCheck,
  X,
} from "lucide-react";
import type { TimeClockLocationEvent } from "@/lib/time-tracking/schema";

const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const goldIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const blueIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [20, 32],
  iconAnchor: [10, 32],
  popupAnchor: [1, -26],
  shadowSize: [32, 32],
});

type TimesheetRouteMapProps = {
  employeeName: string;
  workDate: string;
  locationEvents: TimeClockLocationEvent[];
  workstationLocation?: { latitude: number; longitude: number; radiusMeters?: number; name?: string } | null;
  onClose?: () => void;
};

type MapType = "street" | "satellite";

function Recenter({ center }: { center: LatLngExpression }) {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function TimesheetRouteMap({
  employeeName,
  workDate,
  locationEvents,
  workstationLocation,
  onClose,
}: TimesheetRouteMapProps) {
  const [mapType, setMapType] = useState<MapType>("street");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Filter valid coordinate events that are strictly WITHIN geofence (protect privacy outside boundary)
  const validEvents = useMemo(() => {
    return locationEvents.filter(
      (e) =>
        e.latitude != null &&
        e.longitude != null &&
        !isNaN(e.latitude) &&
        !isNaN(e.longitude) &&
        e.geofence_status !== "out_of_range",
    );
  }, [locationEvents]);

  const outOfRangeEvents = useMemo(() => {
    return locationEvents.filter((e) => e.geofence_status === "out_of_range");
  }, [locationEvents]);

  // Determine initial center
  const center: LatLngExpression = useMemo(() => {
    if (validEvents.length > 0) {
      return [validEvents[0].latitude!, validEvents[0].longitude!];
    }
    if (workstationLocation) {
      return [workstationLocation.latitude, workstationLocation.longitude];
    }
    return [-26.2041, 28.0473]; // Johannesburg fallback
  }, [validEvents, workstationLocation]);

  // Build route polyline positions
  const routePolyline: LatLngExpression[] = useMemo(() => {
    return validEvents.map((e) => [e.latitude!, e.longitude!] as LatLngExpression);
  }, [validEvents]);

  // Calculate total distance moved
  const totalDistanceMovedMeters = useMemo(() => {
    let total = 0;
    for (const e of validEvents) {
      if (e.distance_meters) {
        total += Number(e.distance_meters);
      }
    }
    return total;
  }, [validEvents]);

  const tileUrl =
    mapType === "street"
      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  const tileAttribution =
    mapType === "street"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

  if (validEvents.length === 0 && !workstationLocation) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-muted/50 p-6 text-center text-xs text-muted">
        <MapPin className="mb-2 size-6 text-muted" />
        <p className="font-extrabold text-foreground">No GPS coordinates recorded for this timesheet</p>
        <p className="mt-0.5">Location is only tracked within workstation radius during active work hours.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border-2 border-slate-900 bg-slate-950 text-white shadow-xl transition-all ${
        isFullscreen
          ? "fixed inset-3 z-[9999] h-[calc(100dvh-1.5rem)]"
          : "h-[420px] w-full"
      }`}
    >
      {/* Header Bar - Fully responsive, prevents button squashing on mobile */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Footprints className="size-4 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-white truncate">
              Location &amp; Shift Movement History · <span className="text-emerald-400">{employeeName}</span>
            </h4>
            <p className="text-[10px] text-slate-400 truncate">
              Work Date: {workDate} · {validEvents.length} in geofence
              {outOfRangeEvents.length > 0 ? ` (${outOfRangeEvents.length} outside radius)` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Layer switcher */}
          <button
            type="button"
            onClick={() => setMapType((m) => (m === "street" ? "satellite" : "street"))}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 sm:px-2.5 text-[10px] sm:text-[11px] font-bold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            title={mapType === "street" ? "Switch to Satellite map" : "Switch to Street map"}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{mapType === "street" ? "Satellite" : "Street"}</span>
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="size-7 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            title={isFullscreen ? "Minimize map" : "Expand map"}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="size-7 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white active:scale-95 transition-all cursor-pointer"
              title="Close map"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Geofence privacy notice if any out-of-range events occurred */}
      {outOfRangeEvents.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-rose-900/60 bg-rose-950/70 px-3.5 py-1 text-[10px] font-semibold text-rose-300">
          <ShieldCheck className="size-3 text-rose-400 shrink-0" />
          <span className="truncate">
            {outOfRangeEvents.length} event{outOfRangeEvents.length > 1 ? "s were" : " was"} outside geofence (hidden from map for privacy).
          </span>
        </div>
      )}

      {/* Route & Shift Metrics Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-bold text-slate-300">
            <Navigation className="size-3 text-slate-400" />
            Distance Moved:{" "}
            <span className="font-extrabold text-white">
              {totalDistanceMovedMeters >= 1000
                ? `${(totalDistanceMovedMeters / 1000).toFixed(2)} km`
                : `${totalDistanceMovedMeters} m`}
            </span>
          </span>

          <span className="hidden sm:inline text-slate-600">|</span>

          <span className="hidden sm:flex items-center gap-1 font-bold text-slate-300">
            <Compass className="size-3 text-emerald-400" />
            Waypoints: <span className="font-extrabold text-white">{validEvents.length} recorded</span>
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" /> In
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" /> Lunch
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-slate-400" /> &gt;25m Move
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rose-500" /> Out
          </span>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative min-h-0 flex-1 w-full">
        <MapContainer center={center} className="h-full w-full" scrollWheelZoom zoom={16}>
          <TileLayer attribution={tileAttribution} url={tileUrl} />
          <Recenter center={center} />

          {/* Workstation Boundary */}
          {workstationLocation && (
            <Circle
              center={[workstationLocation.latitude, workstationLocation.longitude]}
              radius={workstationLocation.radiusMeters ?? 100}
              pathOptions={{
                color: "#10b981",
                fillColor: "#10b981",
                fillOpacity: 0.12,
                weight: 2,
                dashArray: "4 4",
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-extrabold text-slate-900">
                    {workstationLocation.name ?? "Workstation Geofence"}
                  </p>
                  <p className="text-slate-600">Radius: {workstationLocation.radiusMeters ?? 100}m</p>
                </div>
              </Popup>
            </Circle>
          )}

          {/* Polyline connecting route waypoints */}
          {routePolyline.length > 1 && (
            <Polyline
              positions={routePolyline}
              pathOptions={{
                color: "#06b6d4",
                weight: 4,
                opacity: 0.85,
                dashArray: "1 6",
              }}
            />
          )}

          {/* Render Waypoint Markers */}
          {validEvents.map((evt, idx) => {
            const isClockIn = evt.event_type === "clock_in";
            const isClockOut = evt.event_type === "clock_out";
            const isLunch = evt.event_type === "lunch_start" || evt.event_type === "lunch_end";
            const icon = isClockIn ? greenIcon : isClockOut ? redIcon : isLunch ? goldIcon : blueIcon;

            return (
              <Marker
                key={`${evt.id || idx}-${evt.event_at}`}
                position={[evt.latitude!, evt.longitude!]}
                icon={icon}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-extrabold text-slate-900 uppercase tracking-wider">
                      {isClockIn
                        ? "🟢 Clock In"
                        : isClockOut
                          ? "🔴 Clock Out"
                          : isLunch
                            ? "🟡 Lunch Event"
                            : `📍 Movement Waypoint #${idx + 1}`}
                    </p>
                    <p className="mt-1 font-bold text-slate-700">
                      Time: <span className="font-normal text-slate-600">{evt.local_event_time || evt.event_at.slice(11, 19)}</span>
                    </p>
                    {evt.distance_meters ? (
                      <p className="font-bold text-slate-700">
                        Movement Delta: <span className="font-extrabold text-slate-900">+{evt.distance_meters}m</span>
                      </p>
                    ) : null}
                    {evt.accuracy_meters ? (
                      <p className="font-bold text-slate-700">
                        GPS Accuracy: <span className="font-normal text-slate-600">&plusmn;{evt.accuracy_meters}m</span>
                      </p>
                    ) : null}
                    {evt.geofence_status ? (
                      <p className="font-bold text-slate-700">
                        Geofence:{" "}
                        <span className={`font-bold ${evt.geofence_status === "in_range" ? "text-emerald-600" : "text-rose-600"}`}>
                          {evt.geofence_status === "in_range" ? "In Range" : "Out of Range"}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Footer Disclaimer */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-3.5 py-1.5 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3 text-emerald-400" />
          POPIA Compliant · Location tracked only during active shift hours while clocked in.
        </span>
        <span className="font-semibold text-slate-300">ClockWise Live Tracker</span>
      </div>
    </div>
  );
}
