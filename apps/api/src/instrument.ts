import { existsSync } from "node:fs";
import { ANALYTICS_BAKED } from "@snapotter/shared";
import { analyticsEnabled, gatePrimed, telemetryEnvKilled } from "./lib/analytics-gate.js";
import { buildBeforeSend } from "./lib/sentry-scrub.js";

// Sentry inits at process load, before the gate cache is primed. Until the
// first successful read, stay silent rather than emit on the default-ON cache,
// so an opted-out instance never reports even a boot-window crash.
const sentryActive = () => gatePrimed() && analyticsEnabled();

// All-in-one detection: docker/entrypoint.sh exports EMBEDDED_MODE=1 before
// exec'ing s6-overlay, and the snapotter service run script is with-contenv,
// so the marker reaches this process. URL absence is not a usable signal:
// embedded mode sets loopback DATABASE_URL/REDIS_URL before boot, and native
// dev commonly leaves DATABASE_URL unset (config.ts defaults it).
function deployMode(): string {
  if (process.env.EMBEDDED_MODE) return "embedded";
  if (existsSync("/.dockerenv")) return "external";
  return "native";
}

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

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release,
      environment: process.env.SNAPOTTER_ENV || "production",
      sendDefaultPii: false,
      // Errors only. No traces options are set at all, so the SDK never
      // starts traces and BullMQ/pg idle polling can't become transactions
      // again (the July 2026 quota incident).
      integrations: [Sentry.httpIntegration({ trackIncomingRequestsAsSessions: false })],
      sendClientReports: false,
      maxBreadcrumbs: 0,
      beforeBreadcrumb: () => null,
      initialScope: { tags: { deploy_mode: deployMode() } },
      beforeSend: buildBeforeSend(sentryActive) as unknown as SentryOptions["beforeSend"],
    });

    console.log("[sentry] initialized (errors only), release:", release);
  } catch {
    // @sentry/node not available
  }
}
