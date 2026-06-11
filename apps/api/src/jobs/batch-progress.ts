/**
 * Batch child outcome tracking via Redis counters.
 *
 * Children record their outcomes (success/failure) in Redis counters
 * keyed by the parent batch job ID. This drives the batch-type SSE
 * progress events that match the legacy shape exactly.
 */

import { updateJobProgress } from "../routes/progress.js";
import { sharedRedis } from "./connection.js";
import { bullPrefix } from "./types.js";

/**
 * Record a batch child outcome and emit a batch progress event.
 *
 * Called by batch-child workers (success and failure paths) and by
 * pipeline-finalize workers when they are part of a pipeline-batch.
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
  const completedFiles = error ? other : done;
  const failedFiles = error ? done : other;
  const errors: Array<{ filename: string; error: string }> = (
    await r.lrange(`${base}:errors`, 0, 99)
  ).map((e) => JSON.parse(e));
  const finished = completedFiles + failedFiles >= totalFiles;
  updateJobProgress({
    jobId: parentId,
    status: finished ? (completedFiles > 0 ? "completed" : "failed") : "processing",
    totalFiles,
    completedFiles,
    failedFiles,
    errors,
    currentFile: filename,
  });
}
