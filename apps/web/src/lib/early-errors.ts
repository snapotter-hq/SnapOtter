/**
 * Early-error buffer. Sentry initializes late in the web app (inside App, after
 * the analytics config round-trip), so any crash during initial bundle eval or
 * first render, often the most important ones, happens with no Sentry client
 * installed and is lost. This captures those in a small buffer from the very
 * first line of the entry, then replays them once Sentry is initialized.
 *
 * The buffer respects opt-out for free: flushEarlyErrors only sends if a Sentry
 * client exists, and Sentry is initialized only when analytics is enabled.
 */
const MAX_BUFFERED = 10;
const buffer: unknown[] = [];
let capturing = false;

function onError(e: ErrorEvent): void {
  if (e.error !== undefined && e.error !== null) push(e.error);
}
function onRejection(e: PromiseRejectionEvent): void {
  push(e.reason);
}
function push(err: unknown): void {
  if (buffer.length < MAX_BUFFERED) buffer.push(err);
}

/** Install global handlers before Sentry exists. Idempotent. */
export function startEarlyErrorCapture(): void {
  if (capturing || typeof window === "undefined") return;
  capturing = true;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}

/** Stop buffering and replay to Sentry. Called once Sentry is initialized. */
export async function flushEarlyErrors(): Promise<void> {
  if (typeof window !== "undefined" && capturing) {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  }
  capturing = false;
  if (buffer.length === 0) return;
  const pending = buffer.splice(0);
  try {
    const Sentry = await import("@sentry/react");
    if (!Sentry.getClient()) return;
    for (const err of pending) Sentry.captureException(err);
  } catch {
    // never throw from telemetry
  }
}

/** Test-only reset. */
export function resetEarlyErrorsForTests(): void {
  buffer.length = 0;
  capturing = false;
}
