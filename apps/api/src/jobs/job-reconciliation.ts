/**
 * Stranded-job reconciliation.
 *
 * A job row is stranded when it is still `queued` or `processing` but BullMQ
 * no longer has anything that will run it. That happens whenever a terminal
 * write is lost: a Postgres outage makes the worker's UPDATE fail outright
 * (a stopped container refuses connections, so the query does not hang and
 * retry, it errors), BullMQ exhausts its attempts, and the failure path then
 * tries to persist `failed` through the same unavailable database and fails
 * too. Nothing revisits the row afterwards, so it says `queued` or
 * `processing` forever and the job's history is permanently wrong.
 *
 * Worse, the work may already be done. The worker writes the output to
 * `outputs/<jobId>/` before it writes the completed row, so a row stranded in
 * `processing` can have a perfectly good artifact on disk with `output_refs`
 * null. Those bytes are unreachable through the API and the storage TTL sweep
 * deletes them. Marking such a job failed would throw the work away a second
 * time, so this reconciler adopts the artifact and completes the row instead;
 * only a job with no recoverable output is failed.
 *
 * Correctness rests on two invariants:
 *
 *   1. Every tool, batch and pipeline row is enqueued with `jobId` set to the
 *      row id, so `jobs.id` is also the BullMQ job id and "is there still a
 *      live queue entry" is a direct lookup. Rows of type `system`
 *      (gdpr-export) are the exception, because they enqueue without a jobId
 *      and BullMQ generates its own, so they are excluded.
 *   2. Every write is guarded on the row still being non-terminal, so two
 *      reconcilers racing each other (or racing a worker that recovered)
 *      cannot double-resolve, and a genuinely canceled job is never
 *      resurrected.
 */
import { and, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { getObjectSize, listObjects, type ObjectInfo } from "../lib/object-storage.js";
import { getQueue } from "./queues.js";
import { POOLS, type Pool } from "./types.js";

/** DB statuses a reconciler may resolve. Terminal rows are never touched. */
const NON_TERMINAL = ["queued", "processing"] as const;

/**
 * BullMQ states in which the job will still be executed, or is executing.
 * Anything else (completed, failed, unknown, or no job at all) means nothing
 * will ever advance the row again.
 *
 * `active` covers a job interrupted by a crash: BullMQ's stalled-detection
 * requeues it, so it must not be reconciled out from under the retry.
 */
const LIVE_QUEUE_STATES = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

/**
 * How old a row must be before it is considered stranded. This only has to
 * cover the window between the route inserting the `queued` row and the
 * following `queue.add`, which is milliseconds in practice; a job that is
 * genuinely running is protected by the queue lookup, not by age.
 */
const DEFAULT_GRACE_MS = 60_000;

/** Cap on rows resolved per sweep so a large backlog cannot monopolise a worker. */
const DEFAULT_LIMIT = 500;

/** Reason recorded on a job whose output could not be recovered. */
export const UNRECOVERABLE_STRANDED_JOB_ERROR =
  "Processing was interrupted before it finished and no output was recovered. Please try again.";

export interface ReconcileStrandedJobsOptions {
  graceMs?: number;
  limit?: number;
}

export type StrandedJobResolution = "recovered" | "failed" | "live" | "raced";

export interface StrandedJobOutcome {
  jobId: string;
  toolId: string | null;
  previousStatus: string;
  resolution: StrandedJobResolution;
  outputRefs?: string[];
}

export interface ReconcileStrandedJobsSummary {
  scanned: number;
  recovered: number;
  failed: number;
  live: number;
  raced: number;
  outcomes: StrandedJobOutcome[];
}

/** Previews are a derived convenience file, never the job's actual result. */
function isPreviewKey(key: string): boolean {
  const name = key.slice(key.lastIndexOf("/") + 1);
  return name === "preview.webp" || name === "preview.png";
}

/**
 * Is there still a BullMQ entry that will run this job?
 *
 * The row's own `pool` is checked first (it always matches the queue the job
 * was added to); the remaining pools are only scanned if the row carries no
 * usable pool, so the common case is a single Redis round trip.
 *
 * Redis errors deliberately propagate: without an answer here we cannot tell a
 * stranded job from a running one, and guessing would either resurrect live
 * work or fail it.
 */
async function hasLiveQueueEntry(jobId: string, pool: string | null): Promise<boolean> {
  const declared = POOLS.includes(pool as Pool) ? (pool as Pool) : null;
  const order = declared ? [declared, ...POOLS.filter((p) => p !== declared)] : [...POOLS];
  for (const candidate of order) {
    const job = await getQueue(candidate).getJob(jobId);
    if (!job) continue;
    return LIVE_QUEUE_STATES.has(await job.getState());
  }
  return false;
}

/** Best-effort input size so a recovered row still reports a real size delta. */
async function resolveOriginalSize(bytesIn: number | null, inputRefs: string[] | null) {
  if (bytesIn !== null) return bytesIn;
  if (!inputRefs?.length) return 0;
  let total = 0;
  for (const ref of inputRefs) {
    total += await getObjectSize(ref).catch(() => 0);
  }
  return total;
}

/**
 * Order artifacts the way the worker wrote them: the primary output first,
 * then extra outputs. mtime is the real signal; the key breaks ties so the
 * choice is stable on backends that report no mtime.
 */
function orderArtifacts(objects: ObjectInfo[]): ObjectInfo[] {
  return objects
    .filter((object) => object.size > 0 && !isPreviewKey(object.key))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.key.localeCompare(b.key));
}

type StrandedRow = {
  id: string;
  toolId: string | null;
  pool: string | null;
  status: string;
  bytesIn: number | null;
  inputRefs: string[] | null;
};

async function recoverFromOutputs(
  row: StrandedRow,
  artifacts: ObjectInfo[],
  objects: ObjectInfo[],
): Promise<StrandedJobOutcome> {
  const primary = artifacts[0];
  const filename = primary.key.slice(primary.key.lastIndexOf("/") + 1);
  const preview = objects.find((object) => isPreviewKey(object.key));
  const originalSize = await resolveOriginalSize(row.bytesIn, row.inputRefs);
  const outputRefs = artifacts.map((artifact) => artifact.key);

  const result: Record<string, unknown> = {
    jobId: row.id,
    downloadUrl: `/api/v1/download/${row.id}/${encodeURIComponent(filename)}`,
    originalSize,
    processedSize: primary.size,
    // Marks the row as resolved after the fact rather than by the worker, so
    // the distinction survives into job history and support questions.
    reconciled: true,
  };
  if (preview) {
    result.previewUrl = `/api/v1/download/${row.id}/${preview.key.slice(preview.key.lastIndexOf("/") + 1)}`;
  }

  const updated = await db
    .update(schema.jobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      outputRefs,
      bytesIn: originalSize || null,
      bytesOut: primary.size,
      progress: { percent: 100, stage: "complete", result },
    })
    .where(and(eq(schema.jobs.id, row.id), inArray(schema.jobs.status, NON_TERMINAL)))
    .returning({ id: schema.jobs.id });

  if (updated.length === 0) {
    return { jobId: row.id, toolId: row.toolId, previousStatus: row.status, resolution: "raced" };
  }
  return {
    jobId: row.id,
    toolId: row.toolId,
    previousStatus: row.status,
    resolution: "recovered",
    outputRefs,
  };
}

async function failWithoutOutput(row: StrandedRow): Promise<StrandedJobOutcome> {
  const updated = await db
    .update(schema.jobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: { message: UNRECOVERABLE_STRANDED_JOB_ERROR },
    })
    .where(and(eq(schema.jobs.id, row.id), inArray(schema.jobs.status, NON_TERMINAL)))
    .returning({ id: schema.jobs.id });

  if (updated.length === 0) {
    return { jobId: row.id, toolId: row.toolId, previousStatus: row.status, resolution: "raced" };
  }
  return { jobId: row.id, toolId: row.toolId, previousStatus: row.status, resolution: "failed" };
}

/**
 * Resolve every job row that is non-terminal but has no live queue entry.
 *
 * Runs at boot and on a repeatable system job, so a database that was
 * unreachable when the terminal write happened gets reconciled within one
 * sweep interval of coming back. Idempotent: a second sweep finds nothing to
 * do because the first one made every row terminal.
 */
export async function reconcileStrandedJobs(
  options: ReconcileStrandedJobsOptions = {},
): Promise<ReconcileStrandedJobsSummary> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const candidates = await db
    .select({
      id: schema.jobs.id,
      toolId: schema.jobs.toolId,
      pool: schema.jobs.pool,
      status: schema.jobs.status,
      bytesIn: schema.jobs.bytesIn,
      inputRefs: schema.jobs.inputRefs,
    })
    .from(schema.jobs)
    .where(
      and(
        inArray(schema.jobs.status, NON_TERMINAL),
        // A row with no tool_id is an SSE-progress placeholder that was never
        // enqueued. Those are reconciled at startup by their own narrow path in
        // apps/api/src/index.ts; the two sets are deliberately disjoint.
        isNotNull(schema.jobs.toolId),
        ne(schema.jobs.toolId, ""),
        // gdpr-export enqueues without a jobId, so its row id is not a BullMQ
        // job id and the queue lookup below would wrongly report it dead.
        ne(schema.jobs.type, "system"),
        lt(schema.jobs.createdAt, new Date(Date.now() - graceMs)),
      ),
    )
    .orderBy(schema.jobs.createdAt)
    .limit(limit);

  const summary: ReconcileStrandedJobsSummary = {
    scanned: candidates.length,
    recovered: 0,
    failed: 0,
    live: 0,
    raced: 0,
    outcomes: [],
  };

  for (const row of candidates) {
    if (await hasLiveQueueEntry(row.id, row.pool)) {
      summary.live += 1;
      summary.outcomes.push({
        jobId: row.id,
        toolId: row.toolId,
        previousStatus: row.status,
        resolution: "live",
      });
      continue;
    }

    const objects = await listObjects(`outputs/${row.id}/`);
    const artifacts = orderArtifacts(objects);
    const outcome =
      artifacts.length > 0
        ? await recoverFromOutputs(row, artifacts, objects)
        : await failWithoutOutput(row);

    summary[outcome.resolution] += 1;
    summary.outcomes.push(outcome);
  }

  if (summary.recovered > 0 || summary.failed > 0) {
    logger.warn(
      {
        recovered: summary.recovered,
        failed: summary.failed,
        jobIds: summary.outcomes
          .filter(
            (outcome) => outcome.resolution === "recovered" || outcome.resolution === "failed",
          )
          .map((outcome) => outcome.jobId),
      },
      "Reconciled stranded job rows with no live queue entry",
    );
  }

  return summary;
}
