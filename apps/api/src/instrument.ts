import { ANALYTICS_BAKED } from "@snapotter/shared";
import { analyticsEnabled, gatePrimed } from "./lib/analytics-gate.js";

// Sentry inits at process load, before the gate cache is primed. Until the
// first successful read, stay silent rather than emit on the default-ON cache,
// so an opted-out instance never reports even a boot-window crash.
const sentryActive = () => gatePrimed() && analyticsEnabled();

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
    // The Docker build sets SENTRY_RELEASE to the release version so errors
    // attribute to a build; falls back to APP_VERSION for non-image runs.
    const release = process.env.SENTRY_RELEASE || APP_VERSION;

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: ANALYTICS_BAKED.sampleRate,
      sendDefaultPii: false,
      // Runtime opt-out: drop the whole transaction when analytics is off.
      tracesSampler: () => (sentryActive() ? ANALYTICS_BAKED.sampleRate : 0),
      beforeSend(event) {
        if (!sentryActive()) return null; // kill switch (covers auto-captured errors)
        // Allow-list: emit only error type + a basename-collapsed stack.
        event.message = undefined;
        event.logentry = undefined; // structured twin of message (captureMessage path)
        event.server_name = undefined; // hostname is not anonymous
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
        return sentryActive() ? event : null;
      },
    });

    console.log("[sentry] initialized, release:", release);
  } catch {
    // @sentry/node not available
  }
}
