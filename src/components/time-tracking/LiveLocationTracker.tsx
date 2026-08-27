"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { startCapacitorLiveWatch, type LivePosition } from "@/lib/geolocation/live-tracker";
import { recordLiveLocationBreadcrumb } from "@/lib/time-tracking/actions";

type LiveLocationTrackerProps = {
  timeEntryId: string | null;
  isClockedIn: boolean;
  isOnLunch: boolean;
};

export default function LiveLocationTracker({
  timeEntryId,
  isClockedIn,
  isOnLunch,
}: LiveLocationTrackerProps) {
  const [lastRecordedMove, setLastRecordedMove] = useState<{
    distance: number;
    time: string;
    coords: string;
  } | null>(null);
  const clearWatcherRef = useRef<(() => void) | null>(null);

  const shouldTrack = isClockedIn && !isOnLunch && Boolean(timeEntryId);

  useEffect(() => {
    if (!shouldTrack || !timeEntryId) {
      if (clearWatcherRef.current) {
        clearWatcherRef.current();
        clearWatcherRef.current = null;
      }
      return;
    }

    let isMounted = true;

    async function initTracker() {
      try {
        const watcher = await startCapacitorLiveWatch(
          async (pos: LivePosition, distanceMeters: number) => {
            if (!isMounted) return;

            setLastRecordedMove({
              distance: distanceMeters,
              time: new Intl.DateTimeFormat("en-ZA", { timeStyle: "medium" }).format(new Date()),
              coords: `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`,
            });

            // Post waypoint to server if significant move (>0 on start or >25m during shift)
            if (distanceMeters > 0 && timeEntryId) {
              const formData = new FormData();
              formData.append("time_entry_id", timeEntryId);
              formData.append("latitude", String(pos.latitude));
              formData.append("longitude", String(pos.longitude));
              if (pos.accuracy != null) formData.append("accuracy", String(pos.accuracy));
              if (pos.speed != null) formData.append("speed", String(pos.speed));
              if (pos.heading != null) formData.append("heading", String(pos.heading));
              formData.append("captured_at", pos.timestamp);
              formData.append("distance_moved", String(distanceMeters));

              try {
                await recordLiveLocationBreadcrumb(formData);
              } catch (e) {
                console.warn("Breadcrumb background post failed:", e);
              }
            }
          },
          (err) => {
            if (isMounted) {
              console.warn("Live location error:", err);
            }
          },
          25, // 25 meters threshold
        );

        if (isMounted) {
          clearWatcherRef.current = watcher.clear;
        } else {
          watcher.clear();
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.warn("Location tracking initialization failed:", err);
        }
      }
    }

    initTracker();

    return () => {
      isMounted = false;
      if (clearWatcherRef.current) {
        clearWatcherRef.current();
        clearWatcherRef.current = null;
      }
    };
  }, [shouldTrack, timeEntryId]);

  if (!isClockedIn) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/40 px-3 py-1.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5 font-bold">
          <ShieldCheck className="size-3.5 text-muted" />
          Location Monitoring Inactive (Off-shift)
        </span>
        <span className="text-[10px] text-muted">Only active when clocked in</span>
      </div>
    );
  }

  if (isOnLunch) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-1.5 text-[11px] text-amber-950">
        <span className="flex items-center gap-1.5 font-bold">
          <ShieldCheck className="size-3.5 text-amber-600" />
          Location Tracking Paused (On Lunch)
        </span>
        <span className="text-[10px] font-semibold text-amber-800">Privacy protected on break</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-emerald-400 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-950 shadow-2xs">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
        </span>
        <span className="font-black uppercase tracking-wider text-[10px] text-emerald-950">
          Live Shift Location Active
        </span>
        <span className="hidden sm:inline text-emerald-800">· Tracking &gt;25m movement</span>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-800">
        {lastRecordedMove ? (
          <span>
            Last lock: {lastRecordedMove.time}{" "}
            {lastRecordedMove.distance > 0 ? `(+${lastRecordedMove.distance}m)` : "(Shift start)"}
          </span>
        ) : (
          <span>Locking GPS coordinates...</span>
        )}
      </div>
    </div>
  );
}
