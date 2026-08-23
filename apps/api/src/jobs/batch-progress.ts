/**
 * Batch child outcome tracking via Redis counters.
 *
 * Children record their outcomes (success/failure) in Redis counters
 * keyed by the parent batch job ID. This drives the batch-type SSE
 * progress events that match the legacy (1.x p-queue) wire format:
 *
 *   completedFiles = total finished (successes + failures)
 *   failedFiles    = failures only (a subset of completedFiles)
 *   finished       = completedFiles >= totalFiles
 *   terminal status: "completed" when at least one success (done > 0),
 *                    "failed" only when every file failed
 */

import { stripInternalPaths } from "../lib/errors.js";
import { updateJobProgress } from "../routes/progress.js";
import { sharedRedis } from "./connection.js";
import { bullPrefix } from "./types.js";

/**
 * Record a batch child outcome and emit a batch progress event.
 *
 * Called by batch-child workers (success and failure paths) and by
 * pipeline-finalize workers when they are part of a pipeline-batch.
 *
 * Wire format matches the legacy 1.x batch SSE frames:
 *   completedFiles = done + failed (total finished)
 *   failedFiles    = failed count only
 *   terminal status: "completed" when done > 0, else "failed"
 */
export async function recordChildOutcome(
  parentId: string,
  totalFiles: number,
  filename: string,
  error?: string,
): Promise<void> {
  const r = sharedRedis();
  const base = `${bullPrefix()}:batch:${parentId}`;
  const done = await r.incr(`${base}:${error ? "failed" : "done"}`);
  const other = Number((await r.get(`${base}:${error ? "done" : "failed"}`)) ?? 0);
  if (error)
    await r.rpush(`${base}:errors`, JSON.stringify({ filename, error: stripInternalPaths(error) }));
  await r.expire(`${base}:done`, 3600);
  await r.expire(`${base}:failed`, 3600);
  await r.expire(`${base}:errors`, 3600);

  // Resolve per-counter values regardless of which counter was just bumped
  const doneCount = error ? other : done;
  const failedCount = error ? done : other;

  // Legacy semantics: completedFiles = total finished (successes + failures)
  const completedFiles = doneCount + failedCount;
  const failedFiles = failedCount;

  // SSE errors list is capped at 100 entries to bound frame size; failedFiles counter stays accurate
  const errors: Array<{ filename: string; error: string }> = (
    await r.lrange(`${base}:errors`, 0, 99)
  ).map((e) => JSON.parse(e));
  // Child outcomes are always nonterminal (#750): the terminal frame belongs
  // to batch-finalize, which publishes it only after the durable ZIP and its
  // download URL exist. Emitting "completed" here would close client SSE
  // streams before the result they need to settle a degraded run is ready.
  updateJobProgress({
    jobId: parentId,
    status: "processing",
    totalFiles,
    completedFiles,
    failedFiles,
    errors,
    currentFile: filename,
  });
}

const canceledKey = (parentId: string) => `${bullPrefix()}:batch:${parentId}:canceled`;

/** Flag a batch as canceled (#767). Children consult the flag before doing
 * any work; the TTL matches the outcome counters above. */
export async function markBatchCanceled(parentId: string): Promise<void> {
  await sharedRedis().setex(canceledKey(parentId), 3600, "1");
}

/** Whether a cooperative batch cancel was requested. A Redis read fault
 * reports false: keep-working is the safe direction, and a Redis outage has
 * already stopped the queues themselves. The swallowed error is still
 * logged. Only the queued-work skips read this flag (#809 moved the
 * finalize's terminal label onto durable canceled rows), so a false here
 * means the child or step processes normally and the run settles as a
 * too-late cancel. */
export async function isBatchCanceled(parentId: string): Promise<boolean> {
  try {
    return (await sharedRedis().exists(canceledKey(parentId))) === 1;
  } catch (err) {
    console.error("batch cancel flag read failed", parentId, err);
    return false;
  }
}

export interface BatchCounters {
  done: number;
  failed: number;
  errors: Array<{ filename: string; error: string }>;
}

/** Read the accumulated child outcomes for a batch parent (errors capped at
 * 100, same bound the SSE frames use). Used by batch-finalize to build the
 * terminal frame. */
export async function readBatchCounters(parentId: string): Promise<BatchCounters> {
  const r = sharedRedis();
  const base = `${bullPrefix()}:batch:${parentId}`;
  const [done, failed, rawErrors] = await Promise.all([
    r.get(`${base}:done`),
    r.get(`${base}:failed`),
    r.lrange(`${base}:errors`, 0, 99),
  ]);
  return {
    done: Number(done ?? 0),
    failed: Number(failed ?? 0),
    errors: rawErrors.map((e) => JSON.parse(e)),
  };
}
