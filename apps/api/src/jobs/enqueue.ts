/**
 * Job enqueueing and synchronous-wait helpers.
 *
 * enqueueToolJob() inserts the durable DB row then adds the job to
 * the appropriate BullMQ queue. waitForJob() blocks the HTTP request
 * until the worker produces a result or the sync-wait window expires.
 */
import { FlowProducer, type Job, QueueEvents } from "bullmq";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { createRedisConnection } from "./connection.js";
import { getQueue } from "./queues.js";
import { POOLS, type Pool, queueName, type ToolJobData, type ToolJobResult } from "./types.js";

// ── QueueEvents (one per pool, lazy) ────────────────────────────

const queueEventsMap = new Map<Pool, QueueEvents>();

function getQueueEvents(pool: Pool): QueueEvents {
  let qe = queueEventsMap.get(pool);
  if (!qe) {
    qe = new QueueEvents(queueName(pool), {
      connection: createRedisConnection(),
    });
    queueEventsMap.set(pool, qe);
  }
  return qe;
}

export async function closeQueueEvents(): Promise<void> {
  const promises = [...queueEventsMap.values()].map((qe) => qe.close());
  await Promise.all(promises);
  queueEventsMap.clear();
}

// ── FlowProducer (lazy singleton, used by Task 9) ───────────────

let _flowProducer: FlowProducer | null = null;

export function getFlowProducer(): FlowProducer {
  if (!_flowProducer) {
    _flowProducer = new FlowProducer({
      connection: createRedisConnection(),
    });
  }
  return _flowProducer;
}

export async function closeFlowProducer(): Promise<void> {
  if (_flowProducer) {
    await _flowProducer.close();
    _flowProducer = null;
  }
}

// ── Enqueue + wait ──────────────────────────────────────────────

/**
 * Insert a durable job row and enqueue the job in BullMQ.
 * Returns the BullMQ Job instance.
 */
export async function enqueueToolJob(data: ToolJobData): Promise<Job<ToolJobData, ToolJobResult>> {
  // Insert the durable DB row first (crash-safe: row exists even if
  // Redis add fails and the job is retried on next boot).
  await db.insert(schema.jobs).values({
    id: data.jobId,
    userId: data.userId,
    toolId: data.toolId,
    pool: data.pool,
    type: data.kind,
    status: "queued",
    inputRefs: data.inputRefs,
    settings: data.settings as Record<string, unknown>,
  });

  const queue = getQueue(data.pool);
  const job = await queue.add(data.toolId, { ...data, jobId: data.jobId }, { jobId: data.jobId });
  return job;
}

/**
 * Block until a job finishes or the sync-wait window expires.
 *
 * Returns the ToolJobResult on success, null if the window expires
 * (caller should fall back to SSE polling), or throws on real failure.
 */
export async function waitForJob(
  pool: Pool,
  jobId: string,
  windowMs: number = env.SYNC_WAIT_MS,
): Promise<ToolJobResult | null> {
  const queueEvents = getQueueEvents(pool);
  const queue = getQueue(pool);
  const job = (await queue.getJob(jobId)) as Job<ToolJobData, ToolJobResult> | undefined;
  if (!job) return null;

  try {
    const result = await job.waitUntilFinished(queueEvents, windowMs);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timed out before finishing/i.test(msg)) {
      return null; // sync-wait window expired; fall back to SSE
    }
    throw err; // real failure
  }
}
