import { ANALYTICS_EVENTS } from "@snapotter/shared";
import type { ErrorInfo } from "react";
import { isAnalyticsActive, isTelemetryEnabled, track } from "@/lib/analytics";
import { isAbortedByLeaving, LEAVING_WINDOW_MS } from "@/lib/chunk-reload";

/**
 * The one place render crashes turn into telemetry. Both boundaries that can
 * catch one (ours and react-router's) report through here, so the analytics
 * opt-out gate cannot drift between them.
 */
export function reportRenderError(error: unknown, errorInfo?: ErrorInfo): void {
  console.error("Uncaught render error:", error, errorInfo?.componentStack);
  if (isAbortedByLeaving(error)) {
    // An import the browser aborted on the way out is not a crash (#1480).
    // A document that unloads never runs this timer; one still here after
    // the window stayed (the leave was cancelled), so the failure was real.
    setTimeout(() => sendRenderError(error, errorInfo), LEAVING_WINDOW_MS);
    return;
  }
  sendRenderError(error, errorInfo);
}

function sendRenderError(error: unknown, errorInfo?: ErrorInfo): void {
  if (!isTelemetryEnabled()) return; // respect the runtime opt-out
  // Mirror the crash class only (no PII). track() and Sentry are best-effort,
  // and each needs only its own backend: an instance with a Sentry DSN and no
  // PostHog key still reports the crash to Sentry (#1115).
  if (isAnalyticsActive()) {
    track(ANALYTICS_EVENTS.TOOL_CLIENT_ERROR, {
      error_name: error instanceof Error ? error.name : typeof error,
    });
  }
  void import("@sentry/react")
    .then((Sentry) => {
      // errorInfo is absent for loader and middleware errors.
      if (errorInfo) Sentry.captureReactException(error, errorInfo);
      else Sentry.captureException(error);
    })
    .catch((importErr) => {
      // Likely when the crash itself was a failed chunk load; say so locally.
      console.warn("Could not load Sentry to report a render error:", importErr);
    });
}
