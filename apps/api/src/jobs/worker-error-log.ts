import { logger } from "../lib/logger.js";
import type { Pool } from "./types.js";

/**
 * How long one pool's "Worker error" lines hold back repeats of themselves.
 *
 * BullMQ emits "error" with no delay for a Redis reply error that isn't a
 * dropped connection: on a full disk every write comes back MISCONF, the
 * worker retries moveToActive at once, and the system pool alone logged
 * about 99,000 multi-KB lines a minute (#4360, BullMQ 5.81.5 and 6.6.0).
 */
export const WORKER_ERROR_LOG_WINDOW_MS = 30_000;

/** Distinct errors one window logs in full; past that, everything is counted. */
const MAX_DISTINCT_PER_WINDOW = 10;

/**
 * Builds a pool's "error" listener. The first error opens a window. Inside
 * it, each distinct error (name plus message) logs once in full, so a new
 * fault isn't hidden behind a flood of an old one, and repeats are only
 * counted. When the window closes, one "Worker errors suppressed" line
 * reports the count, so the log shows when a flood ended.
 */
export function createWorkerErrorLogger(
  pool: Pool,
  windowMs = WORKER_ERROR_LOG_WINDOW_MS,
): (err: Error) => void {
  let window: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  let suppressed = 0;

  const closeWindow = () => {
    window = undefined;
    seen.clear();
    if (suppressed > 0) {
      logger.error({ pool, suppressed, windowMs }, "Worker errors suppressed");
      suppressed = 0;
    }
  };

  return (err) => {
    if (!window) {
      window = setTimeout(closeWindow, windowMs);
      window.unref();
    }
    const signature = `${err?.name}: ${err?.message}`;
    if (seen.has(signature) || seen.size >= MAX_DISTINCT_PER_WINDOW) {
      suppressed++;
      return;
    }
    seen.add(signature);
    logger.error({ err, pool }, "Worker error");
  };
}
