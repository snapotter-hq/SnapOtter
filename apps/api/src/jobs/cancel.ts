/**
 * Cooperative job cancellation via Redis pub/sub.
 *
 * - Workers call registerCancelable(jobId) on start and unregister on finish.
 * - requestCancel(jobId) handles three states:
 *   1. Waiting/delayed: remove from queue, mark DB row canceled.
 *   2. Active (in a worker): publish the jobId on the cancel channel;
 *      the worker's AbortSignal fires and it cleans up.
 *   3. Terminal or absent: no-op, returns false.
 * - startCancelListener() subscribes to the cancel channel and fires
 *   registered AbortControllers.
 */

import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import { db, schema } from "../db/index.js";
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
