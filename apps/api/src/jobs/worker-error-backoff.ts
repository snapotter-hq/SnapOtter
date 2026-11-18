import type { Worker } from "bullmq";
import { logger } from "../lib/logger.js";
import type { Pool } from "./types.js";

/**
 * Redis reply errors inside one burst window that count as BullMQ spinning.
 *
 * BullMQ's main loop retries moveToActive with no delay when Redis answers
 * with a reply error that isn't a dropped connection (MISCONF on a full disk,
 * NOREPLICAS, NOPERM): retryIfFailed only waits runRetryDelay for connection
 * errors, and the worker never reaches its drained path, so it emits thousands
 * of "error" events a second (#4530, BullMQ 5.81.5 and 6.6.0).
 */
export const WORKER_ERROR_BURST = 10;
export const WORKER_ERROR_BURST_WINDOW_MS = 1_000;

/** How long a spinning worker stays paused before it tries Redis again. */
export const WORKER_ERROR_BACKOFF_MS = 5_000;

type PausableWorker = Pick<Worker, "pause" | "resume" | "isPaused" | "closing">;

/**
 * Builds a pool's second "error" listener: when Redis reply errors arrive
 * faster than a healthy worker ever sees them, it pauses the worker without waiting for
 * active jobs, then resumes it after the backoff. A worker that is still
 * refused spins for one more burst and pauses again, so a long outage costs a
 * handful of Redis calls per backoff instead of hundreds a second. Pausing is
 * what stops the loop: BullMQ checks the paused flag before every fetch and
 * stops emitting errors while paused.
 *
 * Only ReplyError counts (ioredis raises it for MISCONF, NOREPLICAS and NOPERM,
 * script errors included). Lock renewal emits one plain Error per job it
 * couldn't renew, all in one tick, so on a pool with high concurrency a single
 * event-loop stall would otherwise read as a burst and pause a healthy worker.
 */
export function createWorkerErrorBackoff(
  worker: PausableWorker,
  pool: Pool,
  backoffMs = WORKER_ERROR_BACKOFF_MS,
): (err: Error) => void {
  let burstStart = 0;
  let burstCount = 0;
  let backingOff = false;

  const resume = () => {
    backingOff = false;
    // A worker that is closing must stay down, and one somebody else resumed
    // already needs nothing from us.
    if (worker.closing || !worker.isPaused()) return;
    worker.resume();
  };

  return (err) => {
    if (backingOff || err?.name !== "ReplyError") return;
    const now = Date.now();
    if (now - burstStart >= WORKER_ERROR_BURST_WINDOW_MS) {
      burstStart = now;
      burstCount = 0;
    }
    burstCount++;
    if (burstCount < WORKER_ERROR_BURST) return;
    burstCount = 0;
    // Paused by someone else (shutdown, an operator): resuming it later would
    // undo their pause.
    if (worker.closing || worker.isPaused()) return;

    backingOff = true;
    logger.warn(
      { pool, errors: WORKER_ERROR_BURST, backoffMs },
      "Worker paused after a burst of errors",
    );
    worker.pause(true).catch((err: unknown) => {
      logger.error({ err, pool }, "Worker pause after an error burst failed");
    });
    setTimeout(resume, backoffMs).unref();
  };
}
