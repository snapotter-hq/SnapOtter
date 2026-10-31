import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { cancelSingleJobGuarded } from "../routes/progress.js";
import { deletePrefix } from "./object-storage.js";

interface WarnLogger {
  warn?: (obj: object, msg: string) => void;
}

/**
 * Remove `uploads/<jobId>/` after a request is rejected before enqueue (#1690,
 * #2599). On S3, `decideExpiry` skips rowless `uploads/<jobId>/` prefixes, so
 * any upload rejected before a `jobs` row is written would stay in the bucket
 * forever unless the route deletes it.
 */
export async function discardUnenqueuedUploads(jobId: string, log?: WarnLogger): Promise<void> {
  await deletePrefix(`uploads/${jobId}/`).catch((err) => {
    log?.warn?.({ err, jobId }, "failed to discard a rejected request's uploads");
  });
}

/**
 * Settle a pre-stamped `clientJobId` alias row when a tool request exits
 * before `enqueueToolJob` commits the artifact row (#2617). Guarded on
 * `expectedArtifactJobId: jobId` so a reused `clientJobId` still pointing at
 * an earlier run is never touched.
 */
export async function settleUnenqueuedAlias(
  jobId: string,
  clientJobId: string | null | undefined,
  log?: WarnLogger,
): Promise<void> {
  if (!clientJobId || clientJobId === jobId) return;
  await cancelSingleJobGuarded({
    jobId: clientJobId,
    expectedArtifactJobId: jobId,
  }).catch((err) => {
    log?.warn?.({ err, jobId, clientJobId }, "failed to settle a rejected request's job alias");
  });
}

/**
 * Check whether `enqueueToolJob` already committed the durable `jobs` row
 * before throwing (for example, when `queue.add` fails after `db.insert`, vs
 * `assertAiJobQuota` throwing 429 before `db.insert`). When the DB read itself
 * fails, default to `true` so we never delete a queued job's input.
 */
export async function hasPersistedJobRow(jobId: string, log?: WarnLogger): Promise<boolean> {
  return db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .then((rows) => rows.length > 0)
    .catch((err) => {
      log?.warn?.(
        { err, jobId },
        "failed to check whether rejected request persisted a jobs row; keeping uploads",
      );
      return true;
    });
}
