"use client";

import "leaflet/dist/leaflet.css";

import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { useEffect } from "react";

const markerIcon = new L.Icon({
  iconAnchor: [12, 41],
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowSize: [41, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type WorkstationMapProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (latitude: number, longitude: number) => void;
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

function Recenter({ center }: { center: LatLngExpression }) {
  const map = useMapEvents({});

  useEffect(() => {
    map.setView(center);
  }, [center, map]);

  return null;
}

export default function WorkstationMap({
  latitude,
  longitude,
  onChange,
  radiusMeters,
}: WorkstationMapProps) {
  const center: LatLngExpression = [latitude, longitude];

  return (
    <div className="h-[360px] overflow-hidden rounded-md border border-border bg-background">
      <MapContainer center={center} className="h-full w-full" scrollWheelZoom zoom={16}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onChange={onChange} />
        <Recenter center={center} />
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
        />
      </MapContainer>
    </div>
  );
}
