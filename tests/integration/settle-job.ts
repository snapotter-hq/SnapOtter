import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { requestCancel } from "../../apps/api/src/jobs/cancel.js";
import { waitForJob } from "../../apps/api/src/jobs/enqueue.js";
import { getQueue } from "../../apps/api/src/jobs/queues.js";
import type { Pool, ToolJobResult } from "../../apps/api/src/jobs/types.js";
import { resolveToolPool } from "../../apps/api/src/lib/pool.js";

const LIVE_DATABASE_STATUSES = new Set(["queued", "processing"]);
const TERMINAL_QUEUE_STATES = new Set(["completed", "failed"]);

export interface DownloadedJobArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
  result: ToolJobResult;
}

export class AcceptedJobTimeoutError extends Error {
  constructor(jobId: string, timeoutMs: number) {
    super(`Job ${jobId} did not finish within ${timeoutMs}ms and was canceled`);
    this.name = "AcceptedJobTimeoutError";
  }
}

/**
 * Cancel an accepted integration-test job and wait until both the durable row
 * and BullMQ agree that its worker has stopped. A 200 cancel response only
 * means the signal was sent; returning earlier can leak CPU-heavy work into
 * another test or make worker teardown time out.
 */
export async function cancelAcceptedJobAndWait(
  jobId: string,
  pool: Pool,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastDatabaseStatus = "missing";
  let lastQueueState = "missing";
  let lastCancelError: unknown;

  while (Date.now() < deadline) {
    try {
      await requestCancel(jobId);
      lastCancelError = undefined;
    } catch (error) {
      // BullMQ can move a job from waiting to active between inspection and
      // removal. Retry until either cancellation lands or the job terminates.
      lastCancelError = error;
    }

    const [row] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    lastDatabaseStatus = row?.status ?? "missing";

    const job = await getQueue(pool).getJob(jobId);
    lastQueueState = job ? await job.getState() : "missing";

    const databaseSettled = Boolean(row && !LIVE_DATABASE_STATUSES.has(row.status));
    const queueSettled = lastQueueState === "missing" || TERMINAL_QUEUE_STATES.has(lastQueueState);
    if (databaseSettled && queueSettled) return row.status;

    await delay(100);
  }

  const cancelDetails =
    lastCancelError instanceof Error ? `; last cancel error: ${lastCancelError.message}` : "";
  throw new Error(
    `Job ${jobId} did not settle after cancellation ` +
      `(database=${lastDatabaseStatus}, queue=${lastQueueState})${cancelDetails}`,
  );
}

const TERMINAL_DATABASE_STATUSES = new Set(["completed", "failed", "canceled"]);

/**
 * Settle a 202 async-fallback response, and assert the job actually finished.
 *
 * A 202 means the sync window expired while the job was still running. Tests
 * used to `return` here, which asserted nothing beyond the envelope and left
 * the job running into whatever test came next (the leak
 * `cancelAcceptedJobAndWait` exists to prevent). Because the window only
 * expires under load, that made coverage depend on how busy the runner was: on
 * CI 44 tests took this path and checked nothing, while the same tests on a dev
 * machine finished inside the window and asserted in full.
 *
 * Waits for a terminal state instead and asserts what every caller actually
 * cares about: the job finished, and if it failed it failed cleanly with a
 * message rather than crashing. A clean failure is a legitimate outcome here,
 * since the exotic-format fixtures are expected to be rejected.
 *
 * Returns true when the response was a 202 so callers keep their existing
 * early-return shape; a 202 body carries no result to assert against.
 */
export async function settleAsyncFallback(
  res: { statusCode: number; body: string },
  timeoutMs = 120_000,
): Promise<boolean> {
  if (res.statusCode !== 202) return false;

  const body = JSON.parse(res.body) as { async?: boolean; jobId?: string };
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  const jobId = body.jobId as string;

  const deadline = Date.now() + timeoutMs;
  let row: { status: string; pool: string | null; error: { message: string } | null } | undefined;

  while (Date.now() < deadline) {
    [row] = await db
      .select({ status: schema.jobs.status, pool: schema.jobs.pool, error: schema.jobs.error })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    if (row && TERMINAL_DATABASE_STATUSES.has(row.status)) break;
    await delay(100);
  }

  if (!row || !TERMINAL_DATABASE_STATUSES.has(row.status)) {
    // Never leave it running: a stuck job starves every later test in the fork.
    await cancelAcceptedJobAndWait(jobId, (row?.pool as Pool | undefined) ?? "image");
    throw new AcceptedJobTimeoutError(jobId, timeoutMs);
  }

  if (row.status === "failed") {
    expect(typeof row.error?.message, `job ${jobId} failed without a message`).toBe("string");
    expect(row.error?.message.length ?? 0).toBeGreaterThan(0);
  }

  return true;
}

/**
 * Wait for an accepted job to succeed. If the observation window expires,
 * cancel and fully drain the job before failing the test so timed-out work can
 * never starve another integration fork.
 */
export async function waitForAcceptedJobOrCancel(
  jobId: string,
  pool: Pool,
  timeoutMs: number,
): Promise<ToolJobResult> {
  const result = await waitForJob(pool, jobId, timeoutMs);
  if (result) return result;

  await cancelAcceptedJobAndWait(jobId, pool);
  throw new AcceptedJobTimeoutError(jobId, timeoutMs);
}

async function downloadCompletedJobArtifact(
  app: FastifyInstance,
  token: string,
  toolId: string,
  jobId: string,
  result: ToolJobResult,
): Promise<DownloadedJobArtifact> {
  if (result.outputRefs.length === 0) {
    throw new Error(`${toolId}: completed job ${jobId} produced no downloadable artifact`);
  }
  if (!result.filename) throw new Error(`${toolId}: completed job ${jobId} has no filename`);

  const download = await app.inject({
    method: "GET",
    url: `/api/v1/download/${encodeURIComponent(jobId)}/${encodeURIComponent(result.filename)}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (download.statusCode !== 200) {
    throw new Error(
      `${toolId}: completed job ${jobId} artifact download returned ${download.statusCode}`,
    );
  }
  if (download.rawPayload.length === 0) {
    throw new Error(`${toolId}: completed job ${jobId} produced an empty artifact`);
  }
  if (result.processedSize <= 0 || download.rawPayload.length !== result.processedSize) {
    throw new Error(
      `${toolId}: completed job ${jobId} artifact size mismatch ` +
        `(worker=${result.processedSize}, downloaded=${download.rawPayload.length})`,
    );
  }

  const downloadedType = String(download.headers["content-type"] ?? "")
    .split(";", 1)[0]
    .toLowerCase();
  const workerType = result.contentType.split(";", 1)[0].toLowerCase();
  if (!downloadedType || downloadedType !== workerType) {
    throw new Error(
      `${toolId}: completed job ${jobId} artifact MIME mismatch ` +
        `(worker=${workerType}, downloaded=${downloadedType || "missing"})`,
    );
  }

  return {
    buffer: Buffer.from(download.rawPayload),
    contentType: downloadedType,
    filename: result.filename,
    result,
  };
}

/**
 * Wait for terminal success and return verified downloadable bytes. Installed
 * capability tests use this when output semantics, not queue admission, are the
 * release contract.
 */
export async function waitForDownloadedJobArtifact(
  app: FastifyInstance,
  token: string,
  toolId: string,
  jobId: string,
  timeoutMs = 120_000,
): Promise<DownloadedJobArtifact> {
  const result = await waitForAcceptedJobOrCancel(jobId, resolveToolPool(toolId), timeoutMs);
  return downloadCompletedJobArtifact(app, token, toolId, jobId, result);
}

/**
 * Resolve a generated-matrix 202 through terminal success and prove that its
 * worker result is observable as either a downloadable artifact or a
 * non-empty structured payload. Admission alone is never coverage.
 */
export async function waitForGeneratedJobArtifact(
  app: FastifyInstance,
  token: string,
  toolId: string,
  jobId: string,
  timeoutMs = 120_000,
): Promise<ToolJobResult> {
  const result = await waitForAcceptedJobOrCancel(jobId, resolveToolPool(toolId), timeoutMs);
  if (result.outputRefs.length > 0) {
    await downloadCompletedJobArtifact(app, token, toolId, jobId, result);
    return result;
  }

  const payload = result.resultPayload;
  if (!payload || Object.keys(payload).length === 0) {
    throw new Error(`${toolId}: completed job ${jobId} produced no artifact or result payload`);
  }
  if (payload.success === false || payload.error !== undefined) {
    // Carry the worker's own message. Without it every failure reads alike, and
    // a caller cannot tell a product defect from a host with no ffmpeg.
    const detail =
      typeof payload.error === "string"
        ? payload.error
        : ((payload.error as { message?: unknown } | undefined)?.message ?? "");
    const suffix = detail ? `: ${String(detail)}` : "";
    throw new Error(`${toolId}: completed job ${jobId} returned a failure payload${suffix}`);
  }
  return result;
}
