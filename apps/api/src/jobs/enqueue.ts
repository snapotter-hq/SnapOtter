/**
 * Job enqueueing and synchronous-wait helpers.
 *
 * enqueueToolJob() inserts the durable DB row then adds the job to
 * the appropriate BullMQ queue. waitForJob() blocks the HTTP request
 * until the worker produces a result or the sync-wait window expires.
 */
import { context, propagation } from "@opentelemetry/api";
import { FlowProducer, type Job, QueueEvents } from "bullmq";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { assertAiJobQuota } from "../lib/ai-quota.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { createBullMQConnection } from "./connection.js";
import { getQueue } from "./queues.js";
import { POOLS, type Pool, queueName, type ToolJobData, type ToolJobResult } from "./types.js";

// ── QueueEvents (one per pool, lazy) ────────────────────────────

const queueEventsMap = new Map<Pool, QueueEvents>();

/**
 * Recursively strip NUL (U+0000) bytes from a value. Postgres rejects NUL in
 * text/jsonb ("invalid byte sequence for encoding UTF8: 0x00"), so a tool whose
 * settings contain a NUL (e.g. a fuzzed string field) would 500 on the jobs
 * insert. NUL is never meaningful in tool settings, so drop it.
 */
function stripNulBytes<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\0/g, "") as T;
  if (Array.isArray(value)) return value.map(stripNulBytes) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripNulBytes(v);
    return out as T;
  }
  return value;
}

/** Delay before a stopped consumer loop is started again. */
const QUEUE_EVENTS_RESTART_DELAY_MS = 1000;

function getQueueEvents(pool: Pool): QueueEvents {
  let qe = queueEventsMap.get(pool);
  if (!qe) {
    qe = new QueueEvents(queueName(pool), {
      connection: createBullMQConnection(),
      autorun: false,
    });
    // QueueEvents is an EventEmitter, and BullMQ swallows an unlistened 'error'
    // into a bare console.error of the raw object. A named line is worth more
    // when a consumer is misbehaving.
    qe.on("error", (err) => {
      console.error(`[queue-events] ${queueName(pool)} consumer error`, err);
    });
    queueEventsMap.set(pool, qe);
    void superviseQueueEvents(pool, qe);
  }
  return qe;
}

/**
 * Keep a pool's QueueEvents consumer loop running.
 *
 * BullMQ's `autorun` starts the loop from the constructor and, if it ever
 * rejects, does nothing but emit 'error': `running` is left false and nothing
 * restarts it, so that pool stops delivering completion events for the rest of
 * the process's life while every other Redis path still looks healthy. Every
 * synchronous tool request on the pool then burns the full SYNC_WAIT_MS window
 * and falls back to 202. Driving run() from here means a rejection is logged
 * and retried instead of being terminal. run() resolves only once the consumer
 * is closing, so the loop below exits exactly once, and the map identity check
 * stops a replaced consumer from being supervised twice.
 */
async function superviseQueueEvents(pool: Pool, qe: QueueEvents): Promise<void> {
  while (queueEventsMap.get(pool) === qe) {
    try {
      await qe.run();
      return;
    } catch (err) {
      console.error(`[queue-events] ${queueName(pool)} consumer stopped; restarting`, err);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, QUEUE_EVENTS_RESTART_DELAY_MS).unref();
      });
    }
  }
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
 * Insert the client-facing SSE alias row before validation starts (#886).
 *
 * The tool factory calls this right after multipart parse, ahead of the
 * first progress write, so a cancel landing in the validation window has a
 * durable pointer to resolve. Insert-only: at this point the lazy persist
 * layer cannot have created the row yet, so a conflict can only be a
 * reused id, and the previous run's state (its terminal result included)
 * must survive until this run proves viable at enqueue, where
 * upsertToolJobAlias claims and re-points it. Resetting here would leave
 * the channel replaying a live run forever if this run then dies in
 * validation.
 */
export async function insertToolJobAlias(args: {
  jobId: string;
  clientJobId: string;
  userId: string | null;
  pool: Pool;
}): Promise<void> {
  await db
    .insert(schema.jobs)
    .values({
      id: args.clientJobId,
      userId: args.userId,
      pool: args.pool,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { artifactJobId: args.jobId },
    })
    .onConflictDoNothing();
}

/**
 * Upsert the client-facing SSE alias row for a single-tool run (#808).
 *
 * The web client cancels by the id it generated (clientJobId); the queue
 * job lives under the server jobId. The pointer stamped here lets
 * requestCancel resolve one to the other, and the owner lets the cancel
 * route authorize the run's own starter. The tool factory calls this right
 * after multipart parse (#886), before validation, so a cancel landing in
 * the validation window already has a durable pointer; enqueueToolJob
 * calls it again as the catch-all for custom routes.
 *
 * Conflict semantics: the lazy persist layer may have created this row
 * first (ownerless), so ownerless rows are claimed; a row another user
 * owns is left alone so a reused id cannot transfer it or strip their
 * cancel authorization; and only type "single" rows are claimable, so a
 * colliding batch parent or pipeline row keeps its own cancel metadata
 * (batch parent ids ARE client-supplied, so that collision is reachable).
 *
 * When the stored pointer differs from this run's jobId (a new run reusing
 * an old channel), the row's status resets to "queued" so a stale terminal
 * state from the previous run neither replays as this run's outcome nor
 * trips the worker's canceled-alias gate (#886). When the pointer is
 * unchanged (this run's own second stamp), the status is preserved, so a
 * cancel that already settled the alias survives the re-stamp.
 */
export async function upsertToolJobAlias(args: {
  jobId: string;
  clientJobId: string;
  userId: string | null;
  pool: Pool;
}): Promise<void> {
  const aliasSettings = { artifactJobId: args.jobId };
  const claimableOwner = args.userId
    ? or(isNull(schema.jobs.userId), eq(schema.jobs.userId, args.userId))
    : isNull(schema.jobs.userId);
  const isRepoint = sql`${schema.jobs.settings}->>'artifactJobId' is distinct from ${args.jobId}`;
  const res = await db
    .insert(schema.jobs)
    .values({
      id: args.clientJobId,
      userId: args.userId,
      pool: args.pool,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: aliasSettings,
    })
    .onConflictDoUpdate({
      target: schema.jobs.id,
      set: {
        settings: aliasSettings,
        userId: args.userId,
        status: sql`CASE WHEN ${isRepoint} THEN 'queued' ELSE ${schema.jobs.status} END`,
        completedAt: sql`CASE WHEN ${isRepoint} THEN NULL ELSE ${schema.jobs.completedAt} END`,
        error: sql`CASE WHEN ${isRepoint} THEN NULL ELSE ${schema.jobs.error} END`,
        progress: sql`CASE WHEN ${isRepoint} THEN NULL ELSE ${schema.jobs.progress} END`,
      },
      setWhere: and(eq(schema.jobs.type, "single"), claimableOwner),
    });
  if (((res as { rowCount?: number | null })?.rowCount ?? 0) === 0) {
    // The claim was skipped (foreign owner or non-alias collision). The
    // run proceeds, but its starter cannot cancel through this id; make
    // that debuggable instead of a silent 404 months later.
    console.warn(
      `alias claim skipped for clientJobId ${args.clientJobId} (job ${args.jobId}); cancel by this id will not resolve`,
    );
  }
}

/**
 * Insert a durable job row and enqueue the job in BullMQ.
 * Returns the BullMQ Job instance.
 */
export async function enqueueToolJob(data: ToolJobData): Promise<Job<ToolJobData, ToolJobResult>> {
  // Per-user concurrency cap for single-file AI jobs (kind "ai-tool"). Checked
  // before the row insert so a rejected request leaves no job behind. Batch and
  // pipeline AI use other kinds and are intentionally not capped here.
  if (data.kind === "ai-tool") {
    await assertAiJobQuota(data.userId);
  }

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
    settings: stripNulBytes((data.dbSettings ?? data.settings) as Record<string, unknown>),
  });

  // Client-facing SSE alias row (#808), re-stamped here as the catch-all
  // for routes that never call upsertToolJobAlias themselves (the custom
  // AI routes). The tool factory also stamps it right after multipart
  // parse (#886), so for factory runs this second upsert is an idempotent
  // re-point of the same values.
  if (data.clientJobId && data.clientJobId !== data.jobId) {
    await upsertToolJobAlias({
      jobId: data.jobId,
      clientJobId: data.clientJobId,
      userId: data.userId,
      pool: data.pool,
    });
  }

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
  const isTeamRetentionEnabled = await isEnterpriseFeatureEnabled(
    "team_retention_overrides",
    "worker",
  );

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
