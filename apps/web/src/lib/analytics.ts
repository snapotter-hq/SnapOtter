import type { AnalyticsConfig } from "@snapotter/shared";

type PostHogInstance = import("posthog-js").PostHog;

let posthog: PostHogInstance | null = null;
let initialized = false;
let enabled = false; // live runtime flag; gates track() and ErrorBoundary capture

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

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

  if (posthog) {
    // app_version only; no instance_id, so plain events stay person-less.
    posthog.register({ app_version: (await import("@snapotter/shared")).APP_VERSION });
  }

  try {
    if (config.sentryDsn) {
      const Sentry = await import("@sentry/react");
      Sentry.init({
        dsn: config.sentryDsn,
        release: (await import("@snapotter/shared")).APP_VERSION,
        environment: "production",
        tracesSampleRate: config.sampleRate,
        sendDefaultPii: false,
        integrations: [Sentry.browserTracingIntegration()],
        beforeSend(event) {
          if (!enabled) return null;
          event.message = undefined;
          event.logentry = undefined;
          event.request = undefined;
          event.extra = undefined;
          event.contexts = undefined;
          event.breadcrumbs = undefined;
          event.user = undefined;
          if (event.exception?.values) {
            for (const ex of event.exception.values) {
              ex.value = ex.type;
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
          return null;
        },
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
