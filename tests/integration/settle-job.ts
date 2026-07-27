import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { requestCancel } from "../../apps/api/src/jobs/cancel.js";
import { waitForJob } from "../../apps/api/src/jobs/enqueue.js";
import { getQueue } from "../../apps/api/src/jobs/queues.js";
import type { Pool, ToolJobResult } from "../../apps/api/src/jobs/types.js";

const LIVE_DATABASE_STATUSES = new Set(["queued", "processing"]);
const TERMINAL_QUEUE_STATES = new Set(["completed", "failed"]);

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
