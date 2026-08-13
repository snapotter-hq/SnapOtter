/**
 * Cooperative job cancellation via Redis pub/sub.
 *
 * - Workers call registerCancelable(jobId) on start and unregister on finish.
 * - requestCancel(jobId) handles four states:
 *   1. Batch parent: flag the batch canceled and publish every flow child
 *      id on the cancel channel; batch-finalize commits terminal state (#767).
 *   2. Waiting/delayed: remove from queue, mark DB row canceled.
 *   3. Active (in a worker): publish the jobId on the cancel channel;
 *      the worker's AbortSignal fires and it cleans up.
 *   4. Terminal or absent: no-op, returns false.
 * - startCancelListener() subscribes to the cancel channel and fires
 *   registered AbortControllers.
 */

import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import { db, schema } from "../db/index.js";
import { markBatchCanceled } from "./batch-progress.js";
import { createRedisSubscriberConnection, sharedRedis } from "./connection.js";
import { getQueue } from "./queues.js";
import { bullPrefix, POOLS } from "./types.js";

// ── Per-worker cancel registry ──────────────────────────────────

const cancelables = new Map<string, AbortController>();

export function registerCancelable(jobId: string): AbortController {
  const ac = new AbortController();
  cancelables.set(jobId, ac);
  return ac;
}

export function unregisterCancelable(jobId: string): void {
  cancelables.delete(jobId);
}

// ── Pub/sub listener ────────────────────────────────────────────

const CANCEL_CHANNEL = () => `${bullPrefix()}:cancel`;

let subscriber: Redis | null = null;

export async function startCancelListener(): Promise<void> {
  subscriber = createRedisSubscriberConnection();
  subscriber.on("error", (err) => {
    console.error("Cancel listener subscriber error", err);
  });
  await subscriber.subscribe(CANCEL_CHANNEL());
  subscriber.on("message", (_channel: string, message: string) => {
    const ac = cancelables.get(message);
    if (ac) {
      ac.abort();
      cancelables.delete(message);
    }
  });
}

export async function stopCancelListener(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe(CANCEL_CHANNEL());
    await subscriber.quit();
    subscriber = null;
  }
}

// ── Cancel request ──────────────────────────────────────────────

/**
 * Attempt to cancel a job.
 *
 * Returns true if the job was removed (waiting/delayed) or a cancel
 * signal was published (active). Returns false if the job is already
 * terminal or not found in any queue.
 */
export async function requestCancel(jobId: string): Promise<boolean> {
  // Batch parents never match the single-job states below: they sit in
  // waiting-children while their <parentId>-fN children run, so a cancel
  // against the parent id used to cancel nothing (#767). Cancel them
  // cooperatively instead: flag the batch (children consult the flag before
  // doing any work), abort active children over the cancel channel, and let
  // batch-finalize commit the canceled terminal state. Keyed off the DB row,
  // not the queue job, so a cancel landing between the parent row insert and
  // the flow enqueue still takes effect.
  const [row] = await db
    .select({
      type: schema.jobs.type,
      toolId: schema.jobs.toolId,
      status: schema.jobs.status,
      settings: schema.jobs.settings,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));
  if (row?.type === "batch") {
    // Pipeline-batch children are pipeline flows without a cooperative
    // check; a flag would report canceled while every step keeps running.
    if (row.toolId === "pipeline-batch") return false;
    // Custom batch sub-routes (pdf-to-image, svg-to-raster) process inline
    // and only publish progress frames; their rows are implicit inserts with
    // no settings and nothing reads the flag. Claiming canceled: true for
    // them would be a lie. Real batch parents write settings (with
    // flowChildCount) at insert time, before the enqueue window.
    if (!row.settings) return false;
    if (row.status === "completed" || row.status === "failed" || row.status === "canceled") {
      return false;
    }
    await markBatchCanceled(jobId);
    const flowChildCount =
      (row.settings as { flowChildCount?: number } | null)?.flowChildCount ?? 0;
    for (let i = 0; i < flowChildCount; i++) {
      // Best-effort accelerant for active children; the flag above is the
      // durable mechanism, so one failed publish must not 500 a cancel that
      // already committed.
      await sharedRedis()
        .publish(CANCEL_CHANNEL(), `${jobId}-f${i}`)
        .catch((err) => {
          console.error("batch child cancel publish failed", `${jobId}-f${i}`, err);
        });
    }
    return true;
  }

  for (const pool of POOLS) {
    const queue = getQueue(pool);
    const job = await queue.getJob(jobId);
    if (!job) continue;

    const state = await job.getState();

    // Waiting or delayed: remove from queue and mark DB row
    if (state === "waiting" || state === "delayed") {
      await job.remove();
      await db
        .update(schema.jobs)
        .set({ status: "canceled", completedAt: new Date() })
        .where(eq(schema.jobs.id, jobId));
      return true;
    }

    // Active: publish cancel signal for the worker
    if (state === "active") {
      await sharedRedis().publish(CANCEL_CHANNEL(), jobId);
      return true;
    }

    // Terminal (completed, failed): no-op
    return false;
  }

  // Not found in any pool
  return false;
}
