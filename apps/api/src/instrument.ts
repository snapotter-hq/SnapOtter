import { ANALYTICS_BAKED } from "@snapotter/shared/src/analytics/baked.js";

if (ANALYTICS_BAKED.enabled && ANALYTICS_BAKED.sentryDsn) {
  try {
    const Sentry = await import("@sentry/node");
    const { APP_VERSION } = await import("@snapotter/shared");

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release: APP_VERSION,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: ANALYTICS_BAKED.sampleRate,
      sendDefaultPii: false,
      autoSessionTracking: true,
    });

    console.log("[sentry] initialized with performance tracing, release:", APP_VERSION);
  } catch {
    // @sentry/node not available
  }
}
