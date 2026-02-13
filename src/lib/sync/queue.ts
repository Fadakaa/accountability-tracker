// Offline write queue — stores pending Supabase operations in localStorage
// When online, flush() pushes all queued ops in order.

import { supabase } from "@/lib/supabase";
import type { SyncOperation } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const QUEUE_KEY = "accountability-sync-queue";
const MAX_RETRIES = 5;

// ─── Queue CRUD ─────────────────────────────────────────

export function loadQueue(): SyncOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncOperation[];
  } catch {
    return [];
  }
}

function saveQueue(queue: SyncOperation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Add a sync operation to the pending queue */
export function enqueue(op: Omit<SyncOperation, "id" | "timestamp" | "retries">): void {
  const queue = loadQueue();
  queue.push({
    ...op,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    retries: 0,
  });
  saveQueue(queue);
}

/** Remove a completed operation from the queue */
export function dequeue(operationId: string): void {
  const queue = loadQueue().filter((op) => op.id !== operationId);
  saveQueue(queue);
}

/** Read the queue without modifying it */
export function peek(): SyncOperation[] {
  return loadQueue();
}

/** Check if there are pending operations */
export function hasPending(): boolean {
  return loadQueue().length > 0;
}

/** Clear all pending operations */
export function clearQueue(): void {
  saveQueue([]);
}

// ─── Flush: push all queued ops to Supabase ─────────────

/** Attempt to push all queued operations to Supabase in order.
 *  Returns the number of successfully synced operations. */
export async function flush(): Promise<{ synced: number; failed: number }> {
  const queue = loadQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: SyncOperation[] = [];

  for (const op of queue) {
    try {
      if (op.action === "upsert") {
        const query = sb.from(op.table).upsert(op.data, {
          onConflict: op.conflictColumn ?? "id",
        });
        const { error } = await query;
        if (error) throw error;
      } else if (op.action === "delete") {
        const id = op.data.id;
        if (id) {
          const { error } = await sb.from(op.table).delete().eq("id", id);
          if (error) throw error;
        }
      }
      synced++;
    } catch (err) {
      console.warn(`[sync-queue] Failed to sync op ${op.id} (table: ${op.table}):`, err);
      if (op.retries < MAX_RETRIES) {
        remaining.push({ ...op, retries: op.retries + 1 });
        failed++;
      } else {
        console.error(`[sync-queue] Dropping op ${op.id} after ${MAX_RETRIES} retries`);
        failed++;
      }
    }
  }

  saveQueue(remaining);
  return { synced, failed };
}
