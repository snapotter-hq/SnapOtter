/**
 * BullMQ queue instances, one per processing pool.
 *
 * Queues are created lazily on first access and share the pool's
 * default job options (retry policy, TTL-based cleanup).
 */
import { Queue } from "bullmq";
import { createRedisConnection } from "./connection.js";
import { POOLS, type Pool, queueName, type ToolJobData, type ToolJobResult } from "./types.js";

const queues = new Map<Pool, Queue<ToolJobData, ToolJobResult>>();

/** Get (or lazily create) the BullMQ Queue for a pool. */
export function getQueue(pool: Pool): Queue<ToolJobData, ToolJobResult> {
  let q = queues.get(pool);
  if (!q) {
    q = new Queue<ToolJobData, ToolJobResult>(queueName(pool), {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: pool === "ai" ? 1 : 2,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 24 * 3600, count: 5000 },
      },
    });
    queues.set(pool, q);
  }
  return q;
}

/** Close all queue connections. */
export async function closeQueues(): Promise<void> {
  const promises = [...queues.values()].map((q) => q.close());
  await Promise.all(promises);
  queues.clear();
}

/** Aggregate counts across all pools. */
export async function queueCounts(): Promise<{
  active: number;
  waiting: number;
  delayed: number;
}> {
  let active = 0;
  let waiting = 0;
  let delayed = 0;
  for (const pool of POOLS) {
    const q = queues.get(pool);
    if (!q) continue;
    const counts = await q.getJobCounts("active", "waiting", "delayed");
    active += counts.active ?? 0;
    waiting += counts.waiting ?? 0;
    delayed += counts.delayed ?? 0;
  }
  return { active, waiting, delayed };
}

/** Per-pool job counts (for Prometheus metrics). */
export async function perPoolCounts(): Promise<Record<Pool, { active: number; waiting: number }>> {
  const result: Record<string, { active: number; waiting: number }> = {};
  for (const pool of POOLS) {
    const q = queues.get(pool);
    if (!q) {
      result[pool] = { active: 0, waiting: 0 };
      continue;
    }
    const counts = await q.getJobCounts("active", "waiting");
    result[pool] = { active: counts.active ?? 0, waiting: counts.waiting ?? 0 };
  }
  return result;
}
