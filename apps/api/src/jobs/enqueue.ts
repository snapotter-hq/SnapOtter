/**
 * Job enqueueing and synchronous-wait helpers.
 *
 * enqueueToolJob() inserts the durable DB row then adds the job to
 * the appropriate BullMQ queue. waitForJob() blocks the HTTP request
 * until the worker produces a result or the sync-wait window expires.
 */
import { context, propagation } from "@opentelemetry/api";
import { FlowProducer, type Job, QueueEvents } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { createBullMQConnection } from "./connection.js";
import { getQueue } from "./queues.js";
import { POOLS, type Pool, queueName, type ToolJobData, type ToolJobResult } from "./types.js";

// ── QueueEvents (one per pool, lazy) ────────────────────────────

const queueEventsMap = new Map<Pool, QueueEvents>();

function getQueueEvents(pool: Pool): QueueEvents {
  let qe = queueEventsMap.get(pool);
  if (!qe) {
    qe = new QueueEvents(queueName(pool), {
      connection: createBullMQConnection(),
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

/**
 * Eagerly create and connect the QueueEvents consumer for every pool.
 *
 * A QueueEvents consumer reads the Redis events stream from "$" (the tail at
 * the moment its run loop starts). If it is created lazily *inside* the first
 * waitForJob() call, a fast job can publish its `completed:<id>` event before
 * the brand-new consumer positions itself at the tail -- the event is then
 * never delivered and waitUntilFinished() blocks for the full sync-wait window
 * (SYNC_WAIT_MS). Warming every consumer at spine startup, before any job is
 * enqueued, positions them at the tail up front so no completion event is ever
 * missed and the first sync request is as fast as every later one. Idempotent:
 * getQueueEvents caches one consumer per pool.
 */
export async function warmQueueEvents(): Promise<void> {
  await Promise.all(POOLS.map((pool) => getQueueEvents(pool).waitUntilReady()));
}

// ── FlowProducer (lazy singleton, used by Task 9) ───────────────

let _flowProducer: FlowProducer | null = null;

export function getFlowProducer(): FlowProducer {
  if (!_flowProducer) {
    _flowProducer = new FlowProducer({
      connection: createBullMQConnection(),
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

// ── Trace context injection ─────────────────────────────────────

/**
 * Inject the active OpenTelemetry trace context into a ToolJobData object.
 * Called from enqueueToolJob (single jobs) and from pipeline/batch routes
 * that build FlowProducer trees bypassing enqueueToolJob.
 */
export function injectTraceContext(data: ToolJobData): void {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  if (carrier.traceparent) {
    data._otel = {
      traceparent: carrier.traceparent,
      tracestate: carrier.tracestate,
    };
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
  // When dbSettings is provided, persist the redacted version instead of
  // the real settings (which may contain secrets like passwords). The
  // worker reads settings from BullMQ job data, never the DB row.
  await db.insert(schema.jobs).values({
    id: data.jobId,
    userId: data.userId,
    toolId: data.toolId,
    pool: data.pool,
    type: data.kind,
    status: "queued",
    inputRefs: data.inputRefs,
    settings: (data.dbSettings ?? data.settings) as Record<string, unknown>,
  });

  // Fire-and-forget: compute deleteAfter from team retention override
  if (data.userId) {
    void computeDeleteAfter(data.jobId, data.userId).catch(() => {});
  }

  injectTraceContext(data);

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

// ── Per-team retention override ────────────────────────────────

/**
 * Compute and set `deleteAfter` on a job row based on the owning user's
 * team retention setting. Only applies when the enterprise
 * `team_retention_overrides` feature is enabled. Fire-and-forget; failures
 * never block job creation.
 */
async function computeDeleteAfter(jobId: string, userId: string): Promise<void> {
  let isTeamRetentionEnabled = false;
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    isTeamRetentionEnabled = isFeatureEnabled("team_retention_overrides");
  } catch {}

  if (!isTeamRetentionEnabled) return;

  const userRow = await db
    .select({ team: schema.users.team })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!userRow.length || !userRow[0].team) return;

  const teamRow = await db
    .select({ retentionHours: schema.teams.retentionHours })
    .from(schema.teams)
    .where(eq(schema.teams.id, userRow[0].team))
    .limit(1);

  const retentionHours =
    teamRow.length && teamRow[0].retentionHours !== null
      ? teamRow[0].retentionHours
      : env.FILE_MAX_AGE_HOURS;

  const deleteAfter = new Date(Date.now() + retentionHours * 60 * 60 * 1000);
  await db.update(schema.jobs).set({ deleteAfter }).where(eq(schema.jobs.id, jobId));
}
