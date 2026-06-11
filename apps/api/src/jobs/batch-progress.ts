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
  if (error) await r.rpush(`${base}:errors`, JSON.stringify({ filename, error }));
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
  const finished = completedFiles >= totalFiles;
  updateJobProgress({
    jobId: parentId,
    status: finished ? (doneCount > 0 ? "completed" : "failed") : "processing",
    totalFiles,
    completedFiles,
    failedFiles,
    errors,
    currentFile: filename,
  });
}
