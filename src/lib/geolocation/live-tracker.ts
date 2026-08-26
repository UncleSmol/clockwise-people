import type { TimeClockLocationEvent } from "@/lib/time-tracking/schema";

export const MOVEMENT_THRESHOLD_METERS = 25; // 25 meters significant movement filter

/**
 * Calculates distance between two latitude/longitude coordinates in meters using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export type LivePosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
};

export type WatcherHandle = {
  clear: () => void;
};

/**
 * Starts watching position using Capacitor Geolocation with fallback to Web Geolocation API.
 * Only executes callback when movement exceeds threshold (25m) or on initial lock.
 */
export async function startCapacitorLiveWatch(
  onSignificantMove: (pos: LivePosition, distanceMeters: number) => void,
  onError?: (err: string) => void,
  thresholdMeters: number = MOVEMENT_THRESHOLD_METERS,
): Promise<WatcherHandle> {
  let lastLat: number | null = null;
  let lastLon: number | null = null;
  let capacitorWatchId: string | null = null;
  let webWatchId: number | null = null;

  const handleNewCoords = (
    lat: number,
    lng: number,
    accuracy: number | null,
    speed: number | null,
    heading: number | null,
  ) => {
    const nowIso = new Date().toISOString();

    if (lastLat === null || lastLon === null) {
      lastLat = lat;
      lastLon = lng;
      onSignificantMove(
        {
          latitude: lat,
          longitude: lng,
          accuracy,
          speed,
          heading,
          timestamp: nowIso,
        },
        0,
      );
      return;
    }

    const dist = calculateHaversineDistanceMeters(lastLat, lastLon, lat, lng);
    if (dist >= thresholdMeters) {
      lastLat = lat;
      lastLon = lng;
      onSignificantMove(
        {
          latitude: lat,
          longitude: lng,
          accuracy,
          speed,
          heading,
          timestamp: nowIso,
        },
        dist,
      );
    }
  };

  // Try Capacitor Geolocation first
  try {
    const { Geolocation } = await import("@capacitor/geolocation");

    // Check permission
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      await Geolocation.requestPermissions();
    }

    capacitorWatchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      },
      (position, err) => {
        if (err) {
          onError?.(err.message);
          return;
        }
        if (position?.coords) {
          handleNewCoords(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy ?? null,
            position.coords.speed ?? null,
            position.coords.heading ?? null,
          );
        }
      },
    );

    return {
      clear: () => {
        if (capacitorWatchId) {
          Geolocation.clearWatch({ id: capacitorWatchId }).catch(() => {});
        }
      },
    };
  } catch {
    // Fallback to browser navigator.geolocation
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      webWatchId = navigator.geolocation.watchPosition(
        (position) => {
          handleNewCoords(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy ?? null,
            position.coords.speed ?? null,
            position.coords.heading ?? null,
          );
        },
        (err) => {
          onError?.(err.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 10000,
        },
      );

      return {
        clear: () => {
          if (webWatchId !== null) {
            navigator.geolocation.clearWatch(webWatchId);
          }
        },
      };
    }
  }

  return {
    clear: () => {},
  };
}
