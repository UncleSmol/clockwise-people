/**
 * ClockWise Local-First Persistence Layer (IndexedDB via Dexie.js)
 * 
 * Provides instantaneous reads and optimistic writes with zero network latency.
 * All offline mutations are staged in _sync_outbox for scheduled batch synchronization.
 */

import Dexie, { type EntityTable } from "dexie";

export type SyncOperation = "INSERT" | "UPDATE" | "DELETE";
export type SyncStatus = "PENDING" | "IN_FLIGHT" | "FAILED";

export interface SyncOutboxEntry {
  id: string; // Client-generated UUID (Idempotency key)
  table_name: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  created_at: string;
  status: SyncStatus;
  retry_count: number;
  error_message?: string;
}

export interface SyncMetaEntry {
  table_name: string;
  last_synced_at: string;
  last_sync_status: "SUCCESS" | "FAILED" | "IN_PROGRESS";
  next_scheduled_sync?: string;
  records_count?: number;
}

export interface LocalTimeEntry {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  workstation_id?: string | null;
  clock_in?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  clock_out?: string | null;
  gross_hours?: number;
  lunch_hours?: number;
  paid_hours?: number;
  normal_hours?: number;
  overtime_hours?: number;
  status: string;
  warning_notes?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LocalLeaveRequest {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LocalLeaveBalance {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  opening_balance_hours: number;
  accrued_hours: number;
  taken_hours: number;
  closing_balance_hours: number;
  updated_at?: string;
}

export interface LocalEmployee {
  id: string;
  company_id: string;
  employee_number?: string | null;
  full_name: string;
  known_as?: string | null;
  avatar_url?: string | null;
  workstation_id?: string | null;
  department_id?: string | null;
  employment_status: string;
  updated_at?: string;
}

export interface LocalNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_url?: string | null;
  created_at: string;
  updated_at?: string;
}

export class ClockwiseLocalDB extends Dexie {
  _sync_outbox!: EntityTable<SyncOutboxEntry, "id">;
  _sync_meta!: EntityTable<SyncMetaEntry, "table_name">;
  time_entries!: EntityTable<LocalTimeEntry, "id">;
  leave_requests!: EntityTable<LocalLeaveRequest, "id">;
  leave_balances!: EntityTable<LocalLeaveBalance, "id">;
  employees!: EntityTable<LocalEmployee, "id">;
  notifications!: EntityTable<LocalNotification, "id">;

  constructor() {
    super("ClockwisePeopleDB");

    this.version(1).stores({
      _sync_outbox: "id, table_name, status, created_at, retry_count",
      _sync_meta: "table_name, last_synced_at, next_scheduled_sync",
      time_entries: "id, company_id, employee_id, work_date, status, updated_at, [work_date+employee_id]",
      leave_requests: "id, company_id, employee_id, start_date, end_date, status, updated_at",
      leave_balances: "id, company_id, employee_id, leave_type_id, updated_at, [company_id+employee_id]",
      employees: "id, company_id, employee_number, full_name, workstation_id, updated_at",
      notifications: "id, user_id, is_read, created_at, updated_at",
    });
  }
}

// Singleton database instance
export const db = new ClockwiseLocalDB();

/**
 * Optimistic Mutation Helper (Outbox Pattern)
 * 
 * 1. Writes immediately to local IndexedDB table for 0ms instantaneous UI feedback.
 * 2. Appends mutation to _sync_outbox with UUID idempotency key for scheduled batch push.
 */
export async function queueOptimisticMutation<T extends Record<string, unknown>>(
  tableName: keyof Pick<ClockwiseLocalDB, "time_entries" | "leave_requests" | "leave_balances" | "employees" | "notifications">,
  operation: SyncOperation,
  payload: T,
  recordId?: string
): Promise<{ id: string; outboxId: string }> {
  const id = recordId || (payload.id as string) || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `loc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const outboxId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `out_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const recordWithId = {
    ...payload,
    id,
    updated_at: now,
  };

  await db.transaction("rw", [db._sync_outbox, db[tableName]], async () => {
    // 1. Local Persistence (Instantaneous)
    if (operation === "DELETE") {
      await db[tableName].delete(id);
    } else {
      await db[tableName].put(recordWithId as never);
    }

    // 2. Outbox Staging (Persistent Queue)
    await db._sync_outbox.put({
      id: outboxId,
      table_name: tableName,
      operation,
      payload: recordWithId,
      created_at: now,
      status: "PENDING",
      retry_count: 0,
    });
  });

  return { id, outboxId };
}

