import { ANALYTICS_BAKED } from "@snapotter/shared";
import { analyticsEnabled } from "./lib/analytics-gate.js";

// Collapse any absolute path in a stack frame filename to its basename, so
// even our own source paths never carry a workspace or job directory.
function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

if (ANALYTICS_BAKED.sentryDsn) {
  try {
    const Sentry = await import("@sentry/node");
    const { APP_VERSION } = await import("@snapotter/shared");

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release: APP_VERSION,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: ANALYTICS_BAKED.sampleRate,
      sendDefaultPii: false,
      // Runtime opt-out: drop the whole transaction when analytics is off.
      tracesSampler: () => (analyticsEnabled() ? ANALYTICS_BAKED.sampleRate : 0),
      beforeSend(event) {
        if (!analyticsEnabled()) return null; // kill switch (covers auto-captured errors)
        // Allow-list: emit only error type + a basename-collapsed stack.
        event.message = undefined;
        event.logentry = undefined; // structured twin of message (captureMessage path)
        event.request = undefined;
        event.extra = undefined;
        event.contexts = undefined;
        event.breadcrumbs = undefined;
        event.user = undefined;
        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            ex.value = ex.type; // never the raw message body
            if (ex.stacktrace?.frames) {
              for (const frame of ex.stacktrace.frames) {
                if (frame.filename) frame.filename = basename(frame.filename);
                frame.abs_path = undefined;
                frame.vars = undefined;
              }
            }
          }
        }
        return event;
      },
      beforeBreadcrumb() {
        return null; // breadcrumbs can carry URLs/messages with content; drop them
      },
      beforeSendTransaction(event) {
        return analyticsEnabled() ? event : null;
      },
    });

    console.log("[sentry] initialized, release:", APP_VERSION);
  } catch {
    // @sentry/node not available
  }
}
