"use client";

import "leaflet/dist/leaflet.css";

import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Layers, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const markerIcon = new L.Icon({
  iconAnchor: [12, 41],
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowSize: [41, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type MapType = "street" | "satellite";

type WorkstationMapProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (latitude: number, longitude: number) => void;
  onLocateSuccess?: (accuracy: number) => void;
};

function MapClickHandler({
  onChange,
}: {
  onChange: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onChange(
        Number(event.latlng.lat.toFixed(7)),
        Number(event.latlng.lng.toFixed(7)),
      );
    },
  });

  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  const prevCenterRef = useRef<[number, number]>(center);

  useEffect(() => {
    const [prevLat, prevLon] = prevCenterRef.current;
    const [newLat, newLon] = center;

    // Only pan if changed noticeably
    if (Math.abs(prevLat - newLat) > 0.000001 || Math.abs(prevLon - newLon) > 0.000001) {
      map.panTo(center, { animate: true });
      prevCenterRef.current = center;
    }
  }, [center, map]);

  return null;
}

function MapResizer() {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

export default function WorkstationMap({
  latitude,
  longitude,
  onChange,
  radiusMeters,
  onLocateSuccess,
}: WorkstationMapProps) {
  const [mapType, setMapType] = useState<MapType>("street");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const center: [number, number] = [latitude, longitude];

  function handleLocateMe() {
    if (!navigator.geolocation) {
      setLocateError("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);
    setLocateError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lon = Number(pos.coords.longitude.toFixed(7));
        onChange(lat, lon);
        if (onLocateSuccess) {
          onLocateSuccess(pos.coords.accuracy);
        }
      },
      (err) => {
        setLocating(false);
        setLocateError(err.message || "Failed to get current location.");
        setTimeout(() => setLocateError(""), 5000);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }

  return (
    <div className="relative h-[360px] overflow-hidden rounded-md border border-border bg-background">
      <MapContainer center={center} className="h-full w-full" scrollWheelZoom zoom={16}>
        {mapType === "street" ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <>
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            />
          </>
        )}
        <MapClickHandler onChange={onChange} />
        <Recenter center={center} />
        <MapResizer />
        <Circle
          center={center}
          pathOptions={{
            color: "var(--color-accent)",
            fillColor: "var(--color-accent)",
            fillOpacity: 0.16,
            weight: 2,
          }}
          radius={radiusMeters}
        />
        <Marker
          draggable
          eventHandlers={{
            dragend(event) {
              const marker = event.target as L.Marker;
              const position = marker.getLatLng();
              onChange(
                Number(position.lat.toFixed(7)),
                Number(position.lng.toFixed(7)),
              );
            },
          }}
          icon={markerIcon}
          position={center}
        >
          <Tooltip permanent={false} direction="top">
            {latitude.toFixed(6)}, {longitude.toFixed(6)} (Drag to move)
          </Tooltip>
        </Marker>
      </MapContainer>

      {locateError ? (
        <div className="absolute left-3 top-3 z-[1000] rounded-md border border-danger/40 bg-background/95 px-2.5 py-1.5 text-xs font-medium text-danger shadow-md backdrop-blur-xs">
          {locateError}
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 z-[1000] flex items-center gap-2">
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          title="Use my current GPS location"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-surface-muted disabled:opacity-50 sm:min-h-0 sm:px-2.5 sm:py-1.5"
        >
          <LocateFixed className={`size-3.5 shrink-0 text-accent ${locating ? "animate-spin" : ""}`} />
          {locating ? "Locating..." : "Locate Me"}
        </button>

        <button
          type="button"
          onClick={() => setMapType((t) => (t === "street" ? "satellite" : "street"))}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-surface-muted sm:min-h-0 sm:px-2.5 sm:py-1.5"
        >
          <Layers className="size-3.5 shrink-0" />
          {mapType === "street" ? "Satellite" : "Street"}
        </button>
      </div>
    </div>
  );
}
