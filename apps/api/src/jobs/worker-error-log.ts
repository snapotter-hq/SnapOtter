import { logger } from "../lib/logger.js";
import type { Pool } from "./types.js";

/**
 * How long one pool's "Worker error" line holds back the ones after it.
 *
 * BullMQ emits "error" with no delay for a Redis reply error that isn't a
 * dropped connection (#4360): on a full disk every write comes back MISCONF,
 * the worker keeps retrying moveToActive at once, and the system pool alone
 * logged about 99,000 multi-KB lines a minute. Upstream (6.x) still does this.
 */
export const WORKER_ERROR_LOG_WINDOW_MS = 30_000;

/**
 * Builds a pool's "error" listener: the first error logs at once, later ones
 * inside the window are only counted, and the next error after the window
 * logs with `suppressed` set to how many were held back since the last line.
 */
export function createWorkerErrorLogger(
  pool: Pool,
  windowMs = WORKER_ERROR_LOG_WINDOW_MS,
): (err: Error) => void {
  let lastLoggedAt = Number.NEGATIVE_INFINITY;
  let suppressed = 0;
  return (err) => {
    const now = Date.now();
    if (now - lastLoggedAt < windowMs) {
      suppressed++;
      return;
    }
    logger.error({ err, pool, ...(suppressed > 0 && { suppressed }) }, "Worker error");
    lastLoggedAt = now;
    suppressed = 0;
  };
}
