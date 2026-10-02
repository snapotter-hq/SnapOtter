import { ANALYTICS_BAKED } from "@snapotter/shared";
import {
  analyticsEnabled,
  gatePrimed,
  sentryDiagnostic,
  telemetryEnvKilled,
} from "./lib/analytics-gate.js";
import { deployMode } from "./lib/deploy-mode.js";
import { buildSentryIntegrations } from "./lib/sentry-integrations.js";
import { buildBeforeSend, buildBeforeSendTransaction } from "./lib/sentry-scrub.js";
import { buildTracesSampler } from "./lib/sentry-tracing.js";
import { buildGatedTransport } from "./lib/sentry-transport.js";

// Sentry inits at process load, before the gate cache is primed. Until the
// first successful read, stay silent rather than emit on the default-ON cache,
// so an opted-out instance never reports even a boot-window crash.
const sentryActive = () => gatePrimed() && analyticsEnabled();

const dsn = process.env.SNAPOTTER_SENTRY_DSN_OVERRIDE || ANALYTICS_BAKED.sentryDsn;

if (dsn && !telemetryEnvKilled()) {
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
      dsn,
      release,
      environment: process.env.SNAPOTTER_ENV || "production",
      sendDefaultPii: false,
      // No request bodies or cookies collected (#1880); the beforeSend hooks
      // below strip query strings and auth headers. Spotlight, when an operator
      // sets SENTRY_SPOTLIGHT, sits behind the analytics gate (#1966). See
      // sentry-integrations.ts.
      integrations: buildSentryIntegrations(Sentry, tracingEnabled, sentryActive),
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
      beforeSend: buildBeforeSend(
        sentryActive,
        sentryDiagnostic(),
      ) as unknown as SentryOptions["beforeSend"],
      // Transactions skip beforeSend, so they get their own gate check and
      // request and span scrub (only reachable with SENTRY_TRACES_SAMPLE_RATE
      // set). The gate sits here, at send time, rather than in tracesSampler:
      // the sampler decides once per root span and child spans never consult
      // it, so a transaction sampled before an admin opts out would still
      // finish and send (#1898).
      beforeSendTransaction: buildBeforeSendTransaction(
        sentryActive,
        sentryDiagnostic(),
      ) as unknown as SentryOptions["beforeSendTransaction"],
      // The gate that covers everything else. Sessions (the process session
      // ends on API stop), cron check-ins, and the SDK's internal error events
      // never pass through either hook above, so the transport drops every
      // envelope while analytics is off; the hooks stay as a second line for
      // events and transactions (#1919).
      transport: buildGatedTransport(sentryActive, Sentry.makeNodeTransport),
    });

    console.log(
      tracingEnabled
        ? `[sentry] initialized (errors + traces @ ${tracesSampleRate}), release: ${release}`
        : `[sentry] initialized (errors only), release: ${release}`,
    );
  } catch (err) {
    // Fails closed (nothing is sent), but say so: a bad option here would
    // otherwise switch error reporting off without a trace.
    console.error("[sentry] init failed, error reporting is off:", err);
  }
}
