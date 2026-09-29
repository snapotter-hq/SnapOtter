import { ANALYTICS_EVENTS } from "@snapotter/shared";
import type { ErrorInfo } from "react";
import { isAnalyticsActive, track } from "@/lib/analytics";
import { isAbortedByLeaving } from "@/lib/chunk-reload";

/**
 * The one place render crashes turn into telemetry. Both boundaries that can
 * catch one (ours and react-router's) report through here, so the analytics
 * opt-out gate cannot drift between them.
 */
export function reportRenderError(error: unknown, errorInfo?: ErrorInfo): void {
  console.error("Uncaught render error:", error, errorInfo?.componentStack);
  // An import the browser aborted on the way out is not a crash (#1480).
  if (isAbortedByLeaving(error)) return;
  if (!isAnalyticsActive()) return; // respect the runtime opt-out
  // Mirror the crash class only (no PII). track() and Sentry are best-effort.
  track(ANALYTICS_EVENTS.TOOL_CLIENT_ERROR, {
    error_name: error instanceof Error ? error.name : typeof error,
  });
  void import("@sentry/react")
    .then((Sentry) => {
      // errorInfo is absent for loader and middleware errors.
      if (errorInfo) Sentry.captureReactException(error, errorInfo);
      else Sentry.captureException(error);
    })
    .catch(() => {});
}
