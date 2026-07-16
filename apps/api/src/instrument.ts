import { ANALYTICS_BAKED } from "@snapotter/shared";
import { analyticsEnabled, gatePrimed, telemetryEnvKilled } from "./lib/analytics-gate.js";
import { deployMode } from "./lib/deploy-mode.js";
import { buildBeforeSend } from "./lib/sentry-scrub.js";
import { buildTracesSampler } from "./lib/sentry-tracing.js";

// Sentry inits at process load, before the gate cache is primed. Until the
// first successful read, stay silent rather than emit on the default-ON cache,
// so an opted-out instance never reports even a boot-window crash.
const sentryActive = () => gatePrimed() && analyticsEnabled();

if (ANALYTICS_BAKED.sentryDsn && !telemetryEnvKilled()) {
  try {
    const Sentry = await import("@sentry/node");
    const { APP_VERSION } = await import("@snapotter/shared");
    // The Docker build sets SENTRY_RELEASE to the release version so errors
    // attribute to a build; falls back to APP_VERSION for non-image runs.
    const release = process.env.SENTRY_RELEASE || APP_VERSION;

    // buildBeforeSend is typed on loose Record shapes so sentry-scrub.ts never
    // imports @sentry/node; cast at this one boundary to the SDK callback type.
    type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

    // Performance tracing is OFF by default. The July 2026 quota incident was
    // the default redis + postgres integrations turning BullMQ blocking polls
    // and pg idle pings into transactions. Opt in with a positive
    // SENTRY_TRACES_SAMPLE_RATE (e.g. 0.05): a tracesSampler then zeroes every
    // standalone db/redis/queue-poll root span and the Redis integration is
    // dropped, so that poll storm can never recur.
    const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0;
    const tracingEnabled = tracesSampleRate > 0 && tracesSampleRate <= 1;

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release,
      environment: process.env.SNAPOTTER_ENV || "production",
      sendDefaultPii: false,
      // With tracing on, use the function form to DROP the default Redis
      // integration (the array form is additive and would keep it). With
      // tracing off, the array form is fine: no sampler means the defaults
      // never start a transaction, so they stay inert.
      integrations: tracingEnabled
        ? (defaults) =>
            defaults
              .filter((i) => i.name !== "Redis")
              .concat(Sentry.httpIntegration({ trackIncomingRequestsAsSessions: false }))
        : [Sentry.httpIntegration({ trackIncomingRequestsAsSessions: false })],
      ...(tracingEnabled
        ? {
            tracesSampler: buildTracesSampler(
              tracesSampleRate,
            ) as unknown as SentryOptions["tracesSampler"],
          }
        : {}),
      sendClientReports: false,
      // Capture the breadcrumb trail (default 100). beforeSend (sentry-scrub.ts)
      // sanitizes each breadcrumb before send: urls/paths redacted, data dropped.
      initialScope: { tags: { deploy_mode: deployMode() } },
      beforeSend: buildBeforeSend(sentryActive) as unknown as SentryOptions["beforeSend"],
    });

    console.log(
      tracingEnabled
        ? `[sentry] initialized (errors + traces @ ${tracesSampleRate}), release: ${release}`
        : `[sentry] initialized (errors only), release: ${release}`,
    );
  } catch {
    // @sentry/node not available
  }
}
