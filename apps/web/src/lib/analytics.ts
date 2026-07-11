import type { AnalyticsConfig } from "@snapotter/shared";

type PostHogInstance = import("posthog-js").PostHog;

let posthog: PostHogInstance | null = null;
let initialized = false;
let enabled = false; // live runtime flag; gates track() and ErrorBoundary capture

// Only these keys may leave the browser per event, and only as primitives.
const ALLOWED: Record<string, ReadonlySet<string>> = {
  tool_opened: new Set(["tool_id", "category", "modality"]),
  file_added: new Set(["tool_id", "count", "file_count"]),
  tool_started: new Set(["tool_id", "is_batch", "file_count"]),
  tool_client_error: new Set(["error_name"]),
  result_downloaded: new Set(["tool_id"]),
  result_saved: new Set(["tool_id"]),
  search: new Set(["results_count", "clicked_tool_id"]),
  ai_bundle_prompted: new Set(["bundle_id"]),
  batch_processed: new Set(["tool_id", "file_count", "status"]),
};

function sanitize(event: string, properties?: Record<string, unknown>): Record<string, unknown> {
  const allow = ALLOWED[event];
  if (!allow || !properties) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    const t = typeof v;
    if (allow.has(k) && (t === "string" || t === "number" || t === "boolean")) out[k] = v;
  }
  return out;
}

export async function initAnalytics(config: AnalyticsConfig): Promise<void> {
  if (initialized || !config.enabled) return;

  if (!config.posthogApiKey) {
    // Web-DSN-only bake: no PostHog key, so skip the PostHog SDK entirely
    // (mirrors the API guard) instead of feeding it an empty key. Still mark
    // the module live so the Sentry beforeSend gate below stays active.
    initialized = true;
    enabled = true;
  } else {
    try {
      const posthogJs = (await import("posthog-js")).default;
      posthog =
        posthogJs.init(config.posthogApiKey, {
          api_host: config.posthogHost,
          autocapture: false,
          capture_pageview: true,
          disable_session_recording: true,
          ip: false,
          persistence: "localStorage",
          person_profiles: "identified_only",
        }) ?? null;
      initialized = true;
      enabled = true;
    } catch (err) {
      console.warn("[analytics] PostHog init failed:", err);
    }
  }

  if (posthog) {
    // Clear any persisted opt-out from a previous disabled period. opt_out_capturing()
    // writes a localStorage flag that survives reloads, so without this a browser that
    // once opted out would stay silent even after the instance re-enables analytics.
    try {
      posthog.opt_in_capturing();
    } catch {
      // ignore
    }
    // app_version only; no instance_id, so plain events stay person-less.
    posthog.register({ app_version: (await import("@snapotter/shared")).APP_VERSION });
  }

  try {
    if (config.sentryDsnWeb) {
      const Sentry = await import("@sentry/react");
      const { buildWebBeforeSend, DENY_URLS, IGNORE_ERRORS } = await import("@/lib/sentry-scrub");
      // buildWebBeforeSend is typed on loose Record shapes so sentry-scrub.ts
      // never imports @sentry/react (this module loads the SDK lazily); cast
      // at this one boundary to the SDK callback type.
      type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
      Sentry.init({
        dsn: config.sentryDsnWeb,
        release:
          import.meta.env.VITE_SENTRY_RELEASE || (await import("@snapotter/shared")).APP_VERSION,
        environment: "production",
        sendDefaultPii: false,
        sendClientReports: false,
        // Errors only: no tracing options, and release-health sessions are
        // dropped by removing the session integration below.
        integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
        ignoreErrors: IGNORE_ERRORS,
        denyUrls: DENY_URLS,
        maxBreadcrumbs: 0,
        beforeBreadcrumb: () => null,
        beforeSend: buildWebBeforeSend(() => enabled) as unknown as SentryOptions["beforeSend"],
      });
    }
  } catch (err) {
    console.warn("[analytics] Sentry init failed:", err);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!enabled || !posthog) return;
  try {
    posthog.capture(event, sanitize(event, properties));
  } catch {
    // never throw
  }
}

export function getDistinctId(): string | null {
  if (!enabled || !posthog) return null;
  try {
    return posthog.get_distinct_id();
  } catch {
    return null;
  }
}

export function isAnalyticsActive(): boolean {
  return enabled && !!posthog;
}

/** Hard runtime opt-out: stop PostHog and Sentry in this tab without a reload. */
export function optOut(): void {
  enabled = false;
  try {
    posthog?.opt_out_capturing();
  } catch {
    // ignore
  }
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.getClient()?.close();
    })
    .catch(() => {});
}

/** Reverse a prior optOut() in this tab: resume PostHog capture without a reload. */
export function optIn(): void {
  enabled = true;
  try {
    posthog?.opt_in_capturing();
  } catch {
    // ignore
  }
}
