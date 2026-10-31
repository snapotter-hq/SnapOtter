import type { ErrorInfo } from "react";

/**
 * Early-error buffer. Sentry initializes late in the web app (inside App, after
 * the analytics config round-trip), so any crash during initial bundle eval or
 * first render, often the most important ones, happens with no Sentry client
 * installed and is lost. This captures those in a small buffer from the very
 * first line of the entry, then replays them once Sentry is initialized.
 *
 * Boundary-caught render crashes arrive through bufferRenderError(): React 19
 * does not re-dispatch them to window "error", so the listeners below never see
 * the first-paint crash that matters most (#2196).
 *
 * The buffer respects opt-out for free: flushEarlyErrors only sends if a Sentry
 * client exists, and Sentry is initialized only when analytics is enabled.
 */
const MAX_BUFFERED = 10;
type BufferedError = { error: unknown; errorInfo?: ErrorInfo };
const buffer: BufferedError[] = [];
let capturing = false;
// Incremented whenever the buffer is thrown away. A flush that is already
// awaiting the SDK rechecks it before sending, so an opt-out that lands in that
// window still keeps everything in the tab (#423, #2196).
let generation = 0;

function onError(e: ErrorEvent): void {
  if (e.error !== undefined && e.error !== null) push(e.error);
}
function onRejection(e: PromiseRejectionEvent): void {
  push(e.reason);
}
function push(error: unknown, errorInfo?: ErrorInfo): void {
  if (buffer.length < MAX_BUFFERED) buffer.push({ error, errorInfo });
}

/**
 * Hold a render crash until Sentry is ready. Carries React's component stack so
 * the replay can use captureReactException instead of a bare captureException.
 */
export function bufferRenderError(error: unknown, errorInfo?: ErrorInfo): void {
  push(error, errorInfo);
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
  const run = generation;
  try {
    const Sentry = await import("@sentry/react");
    if (run !== generation) return; // discarded while the SDK loaded
    if (!Sentry.getClient()) return;
    for (const { error, errorInfo } of pending) {
      try {
        if (errorInfo) Sentry.captureReactException(error, errorInfo);
        else Sentry.captureException(error);
      } catch (err) {
        // One bad entry must not cost the rest of the boot buffer.
        console.warn("Could not replay an early error to Sentry:", err);
      }
    }
  } catch {
    // never throw from telemetry
  }
}

/**
 * Stop buffering and throw away what was buffered. Called once telemetry is
 * known to be off: errors from an opted-out period must never be sent, even if
 * the instance turns telemetry back on later in this tab (#2197).
 */
export function discardEarlyErrors(): void {
  generation++;
  if (typeof window !== "undefined" && capturing) {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  }
  capturing = false;
  buffer.length = 0;
}

/** Test-only reset. */
export function resetEarlyErrorsForTests(): void {
  generation++;
  buffer.length = 0;
  capturing = false;
}
