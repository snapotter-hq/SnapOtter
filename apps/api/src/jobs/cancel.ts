/**
 * Cooperative job cancellation via Redis pub/sub.
 *
 * - Workers call registerCancelable(jobId) on start and unregister on finish.
 * - requestCancel(jobId) handles six states:
 *   1. Batch parent (plain or pipeline-batch): flag the batch canceled and
 *      publish every runnable child id on the cancel channel; batch-finalize
 *      commits terminal state (#767, #771).
 *   2. Pipeline flow row: flag the run under the id its steps carry and
 *      publish the step ids; pipeline-finalize commits terminal state (#771).
 *   3. Pipeline SSE alias: resolve the settings.pipelineFlowId pointer the
 *      route stamped, then cancel the flow the same way (#771).
 *   4. Waiting/delayed: remove from queue, mark DB row canceled.
 *   5. Active (in a worker): publish the jobId on the cancel channel;
 *      the worker's AbortSignal fires and it cleans up.
 *   6. Terminal or absent: no-op, returns false.
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

/** Cancel metadata the routes stamp into jobs.settings at enqueue time. */
interface CancelRowSettings {
  flowChildCount?: number;
  stepCount?: number;
  clientJobId?: string;
  pipelineFlowId?: string;
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** Best-effort abort accelerant for active jobs; the cooperative flag is the
 * durable mechanism, so one failed publish must not 500 a cancel that
 * already committed. */
async function publishCancel(id: string): Promise<void> {
  await sharedRedis()
    .publish(CANCEL_CHANNEL(), id)
    .catch((err) => {
      console.error("cancel publish failed", id, err);
    });
}

/**
 * Attempt to cancel a job.
 *
 * Returns true if the job was removed (waiting/delayed), a cancel signal
 * was published (active), or a cooperative flag was committed (batch and
 * pipeline runs). Returns false if the job is already terminal or not
 * found in any queue.
 */
export async function requestCancel(jobId: string): Promise<boolean> {
  // Batch and pipeline parents never match the single-job states below:
  // they sit in waiting-children while their children run, so a cancel
  // against the parent id used to cancel nothing (#767, #771). Cancel them
  // cooperatively instead: flag the run (steps and children consult the
  // flag before doing any work), abort active jobs over the cancel channel,
  // and let the finalize commit the canceled terminal state. Keyed off the
  // DB row, not the queue job, so a cancel landing between the row insert
  // and the flow enqueue still takes effect.
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
    // Custom batch sub-routes (pdf-to-image, svg-to-raster) process inline
    // and only publish progress frames; their rows are implicit inserts with
    // no settings and nothing reads the flag. Claiming canceled: true for
    // them would be a lie. Real batch parents write settings (with
    // flowChildCount) at insert time, before the enqueue window.
    if (!row.settings) return false;
    if (isTerminal(row.status)) return false;
    await markBatchCanceled(jobId);
    const settings = row.settings as CancelRowSettings;
    const flowChildCount = settings.flowChildCount ?? 0;
    if (row.toolId === "pipeline-batch") {
      // Pipeline-batch children are per-file pipeline finalizes, which never
      // register as cancelables; the abortable jobs are their steps (#771).
      const stepCount = settings.stepCount ?? 0;
      for (let i = 0; i < flowChildCount; i++) {
        for (let j = 0; j < stepCount; j++) {
          await publishCancel(`${jobId}-f${i}-s${j}`);
        }
      }
    } else {
      for (let i = 0; i < flowChildCount; i++) {
        await publishCancel(`${jobId}-f${i}`);
      }
    }
    return true;
  }

  // Single-run pipeline flow row (#771). The cooperative flag must be keyed
  // by the id the steps carry in data.clientJobId (the client-facing id,
  // stamped into settings at enqueue); rows from before the stamp existed
  // can only be no-alias runs, where that id is the flow id itself.
  if (row?.type === "pipeline") {
    if (isTerminal(row.status)) return false;
    const settings = (row.settings ?? {}) as CancelRowSettings;
    await markBatchCanceled(settings.clientJobId ?? jobId);
    const stepCount = settings.stepCount ?? 0;
    for (let j = 0; j < stepCount; j++) {
      await publishCancel(`${jobId}-s${j}`);
    }
    return true;
  }

  // Pipeline SSE alias (#771): the row the client-facing id lands on. The
  // route stamps settings.pipelineFlowId at insert, before the flow rows
  // exist, so a cancel in that window still commits the flag (the alias id
  // is exactly the scope key the steps will consult). Plain single rows
  // have no pointer and fall through to the queue scan unchanged.
  if (row?.type === "single") {
    const settings = (row.settings ?? {}) as CancelRowSettings;
    if (settings.pipelineFlowId) {
      if (isTerminal(row.status)) return false;
      await markBatchCanceled(jobId);
      const [flowRow] = await db
        .select({ settings: schema.jobs.settings })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, settings.pipelineFlowId));
      const stepCount = ((flowRow?.settings ?? {}) as CancelRowSettings).stepCount ?? 0;
      for (let j = 0; j < stepCount; j++) {
        await publishCancel(`${settings.pipelineFlowId}-s${j}`);
      }
      return true;
    }
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
