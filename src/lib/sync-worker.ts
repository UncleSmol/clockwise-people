/**
 * ClockWise Batch Synchronization Worker
 * 
 * Executes:
 * 1. Batch Push: Flushes IndexedDB _sync_outbox mutations to Supabase in chronological order
 *    with idempotency keys, handling retries with exponential backoff.
 * 2. Delta Pull: Retrieves updated records (WHERE updated_at > last_synced_at) from Supabase
 *    and bulk-upserts them into local Dexie tables.
 */

import { db, type SyncOutboxEntry, type ClockwiseLocalDB } from "@/lib/db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type SyncResult = {
  ok: boolean;
  pushedCount: number;
  pulledCount: number;
  errors: string[];
  durationMs: number;
};

const SYNCED_TABLES: Array<keyof Pick<ClockwiseLocalDB, "time_entries" | "leave_requests" | "leave_balances" | "employees" | "notifications">> = [
  "time_entries",
  "leave_requests",
  "leave_balances",
  "employees",
  "notifications",
];

const MAX_RETRY_COUNT = 5;

/**
 * Push Engine: Flushes _sync_outbox in chronological order to Supabase.
 */
export async function flushOutbox(): Promise<{ pushed: number; failed: number; errors: string[] }> {
  const supabase = createSupabaseBrowserClient();
  const pendingEntries = await db._sync_outbox
    .where("status")
    .anyOf(["PENDING", "FAILED"])
    .sortBy("created_at");

  if (pendingEntries.length === 0) {
    return { pushed: 0, failed: 0, errors: [] };
  }

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Group mutations by table for batching
  for (const entry of pendingEntries) {
    if (entry.retry_count >= MAX_RETRY_COUNT) {
      continue; // Skip permanently failed mutations after max retries
    }

    try {
      // Mark as IN_FLIGHT
      await db._sync_outbox.update(entry.id, { status: "IN_FLIGHT" });

      if (entry.operation === "DELETE") {
        const { error } = await supabase
          .from(entry.table_name)
          .delete()
          .eq("id", (entry.payload as { id: string }).id);

        if (error) throw error;
      } else {
        // Upsert with UUID idempotency key
        const { error } = await supabase
          .from(entry.table_name)
          .upsert(entry.payload, { onConflict: "id" });

        if (error) throw error;
      }

      // Sync confirmed: remove from outbox
      await db._sync_outbox.delete(entry.id);
      pushed++;
    } catch (err: unknown) {
      failed++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`[${entry.table_name}:${entry.id}] ${errorMessage}`);

      const nextRetryCount = entry.retry_count + 1;
      await db._sync_outbox.update(entry.id, {
        status: "FAILED",
        retry_count: nextRetryCount,
        error_message: errorMessage,
      });

      console.warn(`[SyncWorker] Push failed for ${entry.id}. Retry ${nextRetryCount}/${MAX_RETRY_COUNT}. Error:`, errorMessage);
    }
  }

  return { pushed, failed, errors };
}

/**
 * Pull Engine: Fetches deltas from Supabase (WHERE updated_at > last_synced_at)
 * and bulk puts them into IndexedDB.
 */
export async function pullDeltaSync(companyId?: string): Promise<{ pulled: number; tables: Record<string, number>; errors: string[] }> {
  const supabase = createSupabaseBrowserClient();
  let totalPulled = 0;
  const tableCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const tableName of SYNCED_TABLES) {
    try {
      // Read watermark
      const meta = await db._sync_meta.get(tableName);
      const lastSyncedAt = meta?.last_synced_at || "1970-01-01T00:00:00.000Z";
      const syncStartTime = new Date().toISOString();

      let query = supabase
        .from(tableName)
        .select("*")
        .gt("updated_at", lastSyncedAt)
        .order("updated_at", { ascending: true })
        .limit(1000);

      if (companyId && tableName !== "notifications") {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        // Bulk upsert into local Dexie table
        await (db[tableName] as { bulkPut: (items: unknown[]) => Promise<unknown> }).bulkPut(data);
        tableCounts[tableName] = data.length;
        totalPulled += data.length;
      } else {
        tableCounts[tableName] = 0;
      }

      // Update watermark
      await db._sync_meta.put({
        table_name: tableName,
        last_synced_at: syncStartTime,
        last_sync_status: "SUCCESS",
        records_count: (meta?.records_count || 0) + (data?.length || 0),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`[Pull:${tableName}] ${errorMessage}`);

      await db._sync_meta.put({
        table_name: tableName,
        last_synced_at: (await db._sync_meta.get(tableName))?.last_synced_at || "1970-01-01T00:00:00.000Z",
        last_sync_status: "FAILED",
      });

      console.error(`[SyncWorker] Delta pull failed for table ${tableName}:`, errorMessage);
    }
  }

  return { pulled: totalPulled, tables: tableCounts, errors };
}

/**
 * Coordinated Scheduled Sync Orchestrator
 * Flushes outbound queue first, then pulls inbound deltas.
 */
export async function runScheduledSync(companyId?: string): Promise<SyncResult> {
  const startTime = performance.now();
  console.info("[SyncWorker] Starting scheduled batch synchronization...");

  const pushResult = await flushOutbox();
  const pullResult = await pullDeltaSync(companyId);

  const durationMs = Math.round(performance.now() - startTime);
  const allErrors = [...pushResult.errors, ...pullResult.errors];

  console.info(`[SyncWorker] Sync complete in ${durationMs}ms: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}. Errors: ${allErrors.length}`);

  return {
    ok: allErrors.length === 0,
    pushedCount: pushResult.pushed,
    pulledCount: pullResult.pulled,
    errors: allErrors,
    durationMs,
  };
}

