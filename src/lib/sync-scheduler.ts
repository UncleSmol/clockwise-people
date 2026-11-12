/**
 * ClockWise Scheduled Batch Synchronization Engine
 * 
 * Manages deterministic sync triggers locked to 7 daily slots:
 * 07:30, 12:00, 15:00, 19:00, 00:00, 03:00, and 05:00.
 * 
 * Features:
 * - Deterministic next-slot calculation
 * - Startup / reboot missed-window catch-up detector
 * - Active tab timer loop + Service Worker Periodic Sync fallback
 */

import { db } from "@/lib/db";

export const SCHEDULED_SLOTS = [
  { hours: 0, minutes: 0, label: "00:00" },
  { hours: 3, minutes: 0, label: "03:00" },
  { hours: 5, minutes: 0, label: "05:00" },
  { hours: 7, minutes: 30, label: "07:30" },
  { hours: 12, minutes: 0, label: "12:00" },
  { hours: 15, minutes: 0, label: "15:00" },
  { hours: 19, minutes: 0, label: "19:00" },
] as const;

const META_SCHEDULER_KEY = "_global_scheduler";

/**
 * Calculates the exact Date of the next scheduled sync slot from a given reference point.
 */
export function getNextScheduledSlot(reference: Date = new Date()): Date {
  const currentYear = reference.getFullYear();
  const currentMonth = reference.getMonth();
  const currentDate = reference.getDate();

  for (const slot of SCHEDULED_SLOTS) {
    const candidate = new Date(currentYear, currentMonth, currentDate, slot.hours, slot.minutes, 0, 0);
    if (candidate.getTime() > reference.getTime()) {
      return candidate;
    }
  }

  // If no slots remain today, the next slot is the first slot of tomorrow (00:00)
  const firstSlot = SCHEDULED_SLOTS[0];
  return new Date(currentYear, currentMonth, currentDate + 1, firstSlot.hours, firstSlot.minutes, 0, 0);
}

/**
 * Checks whether the device was powered off or offline during a previously scheduled sync window.
 * Returns true if a catch-up sync is required.
 */
export async function detectMissedSyncWindow(): Promise<boolean> {
  try {
    const meta = await db._sync_meta.get(META_SCHEDULER_KEY);
    if (!meta || !meta.next_scheduled_sync) {
      return false;
    }

    const nextScheduledTime = new Date(meta.next_scheduled_sync).getTime();
    const now = Date.now();

    // If current time has passed the scheduled window by more than 1 minute, it was missed
    if (now > nextScheduledTime + 60 * 1000) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Persists the next upcoming scheduled sync timestamp into IndexedDB.
 */
export async function recordNextScheduledSync(nextDate: Date): Promise<void> {
  try {
    await db._sync_meta.put({
      table_name: META_SCHEDULER_KEY,
      last_synced_at: new Date().toISOString(),
      last_sync_status: "SUCCESS",
      next_scheduled_sync: nextDate.toISOString(),
    });
  } catch (err) {
    console.error("[SyncScheduler] Failed to persist next scheduled sync:", err);
  }
}

/**
 * Registers Service Worker Periodic Background Sync if available in supported browsers.
 */
export async function registerPeriodicBackgroundSync(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("periodicSync" in registration) {
      const status = await (navigator.permissions as unknown as { query: (params: { name: string }) => Promise<{ state: string }> }).query({
        name: "periodic-background-sync",
      });

      if (status.state === "granted") {
        await (registration as unknown as { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync.register("clockwise-scheduled-sync", {
          minInterval: 2 * 60 * 60 * 1000, // 2 hours minimum browser interval
        });
      }
    }
  } catch (e) {
    // Graceful fallback to tab-based timer
    console.debug("[SyncScheduler] Periodic background sync not supported, using foreground timer fallback", e);
  }
}

/**
 * Initializes the deterministic background scheduler.
 * Runs missed-window catch-up on boot/reconnection and maintains precision timers.
 * 
 * Returns a cleanup unsubscribe callback.
 */
export function startDeterministicSyncScheduler(
  syncExecutor: () => Promise<void>,
  onStatusChange?: (status: { nextSync: Date; isCatchUp: boolean }) => void
): () => void {
  let timerId: NodeJS.Timeout | null = null;
  let isStopped = false;

  async function scheduleCycle() {
    if (isStopped) return;

    // 1. Detect missed window on startup / cycle start
    const wasMissed = await detectMissedSyncWindow();
    if (wasMissed) {
      console.info("[SyncScheduler] Detected missed sync window during downtime/offline. Running immediate catch-up sync...");
      try {
        await syncExecutor();
      } catch (err) {
        console.error("[SyncScheduler] Catch-up sync failed:", err);
      }
    }

    // 2. Compute exact next slot
    const now = new Date();
    const nextSlot = getNextScheduledSlot(now);
    const delayMs = Math.max(1000, nextSlot.getTime() - now.getTime());

    await recordNextScheduledSync(nextSlot);
    onStatusChange?.({ nextSync: nextSlot, isCatchUp: wasMissed });

    console.info(`[SyncScheduler] Next scheduled sync at ${nextSlot.toLocaleTimeString()} (in ${Math.round(delayMs / 60000)} mins)`);

    // 3. Set precise timer for next slot
    timerId = setTimeout(async () => {
      if (isStopped) return;
      console.info(`[SyncScheduler] Triggering scheduled batch sync for slot: ${nextSlot.toLocaleTimeString()}`);
      try {
        await syncExecutor();
      } catch (err) {
        console.error("[SyncScheduler] Scheduled sync run error:", err);
      }
      void scheduleCycle();
    }, delayMs);
  }

  // Handle browser online reconnection event
  function handleOnline() {
    console.info("[SyncScheduler] Network reconnected. Checking for missed sync window...");
    void scheduleCycle();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    void registerPeriodicBackgroundSync();
  }

  void scheduleCycle();

  return () => {
    isStopped = true;
    if (timerId) clearTimeout(timerId);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
    }
  };
}

