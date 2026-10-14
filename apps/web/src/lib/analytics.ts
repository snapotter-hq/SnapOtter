import {
  type AnalyticsConfig,
  httpStatusTag,
  isSafeMessageError,
  resolvePostHogClientHosts,
  SafeError,
} from "@snapotter/shared";
import { appUrl } from "./app-url";
import { discardEarlyErrors, flushEarlyErrors } from "./early-errors";

type PostHogInstance = import("posthog-js").PostHog;

let posthog: PostHogInstance | null = null;
let initialized = false;
let enabled = false; // live runtime flag; gates track() and ErrorBoundary capture
// The latest setting this tab was given. A start in flight rechecks it after
// every await, so an opt-out that lands mid-start wins (#2197).
let wanted = false;
let starting: Promise<void> | null = null;
// optOut() closes Sentry; the config is kept so a re-enable can restart it.
let sentryConfig: AnalyticsConfig | null = null;
let sentryRunning = false;
// posthog.init threw (as opposed to the chunk failing to load), reported to
// Sentry once per tab (#2217).
let posthogInitFailure: unknown = null;
let posthogInitReported = false;

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
  batch_processed: new Set(["tool_id", "file_count", "status", "reason", "total_bytes"]),
  editor_opened: new Set<string>([]),
  editor_tool_used: new Set(["editor_tool"]),
  editor_exported: new Set(["output_format", "status", "reason"]),
  pipeline_opened: new Set<string>([]),
  pipeline_step_added: new Set(["tool_id"]),
  pipeline_saved: new Set(["step_count"]),
  pipeline_template_selected: new Set(["template_id"]),
  feedback_prompt_shown: new Set(["source", "survey_id", "prompt_variant"]),
  feedback_prompt_dismissed: new Set(["source", "survey_id", "prompt_variant", "dismiss_kind"]),
  tool_run_degraded: new Set(["tool_id", "is_batch", "trigger", "had_evidence"]),
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

export function initAnalytics(config: AnalyticsConfig): Promise<void> {
  if (!config.enabled) return Promise.resolve();
  wanted = true;
  if (initialized) return Promise.resolve();
  // The instance allows telemetry, so this tab does: Sentry's beforeSend
  // reads this. Set here, for a new start and for an answer that joins one in
  // flight, since an opt-out in between cleared it. PostHog starting is a
  // separate question; tying the two made a PostHog that failed to load
  // silence Sentry too (#2217). track() checks for a live PostHog itself.
  enabled = true;
  // One start at a time: refetches build a new config object each time, so
  // without this two starts could both reach posthog.init and Sentry.init.
  starting ??= startAnalytics(config).finally(() => {
    starting = null;
  });
  return starting;
}

async function startAnalytics(config: AnalyticsConfig): Promise<void> {
  // Before any await, so an opt-out mid-start can't leave optIn() without it.
  if (config.sentryDsnWeb) sentryConfig = config;
  if (!config.posthogApiKey) {
    // Web-DSN-only bake: no PostHog key, so skip the PostHog SDK entirely
    // (mirrors the API guard) instead of feeding it an empty key.
    initialized = true;
  } else {
    let chunkLoaded = false;
    try {
      const posthogJs = (await import("posthog-js")).default;
      chunkLoaded = true;
      if (!wanted) return; // opted out while the SDK loaded
      // In proxy mode api_host is this instance's own /ingest (first-party, so
      // ad blockers don't drop events) and ui_host points at real PostHog;
      // otherwise both fall back to talking to PostHog directly.
      // Guard window for the node test env; proxy mode only runs in the browser,
      // where window.location.origin always exists.
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { apiHost, uiHost } = resolvePostHogClientHosts({
        posthogHost: config.posthogHost,
        posthogProxyPath: config.posthogProxyPath
          ? appUrl(config.posthogProxyPath)
          : config.posthogProxyPath,
        origin,
      });
      posthog =
        posthogJs.init(config.posthogApiKey, {
          api_host: apiHost,
          ...(uiHost ? { ui_host: uiHost } : {}),
          autocapture: false,
          // Send each event when it's captured. Batching holds events for up
          // to 3 s and flushes the batch by timer or sendBeacon on page hide
          // whether or not the tab opted out meanwhile, and posthog-js has no
          // public way to drop it (#2216). SnapOtter sends few events, so one
          // request each costs little.
          request_batching: false,
          // The app uses no feature flags, and posthog-js polls /flags every
          // 5 minutes regardless of opt-out, sending the anonymous id and the
          // raw first URL and referrer outside before_send (#2216).
          advanced_disable_feature_flags: true,
          // Unset, posthog-js obeys the PostHog project's server-side capture
          // toggles, which stay on for the public sites, so a self-hosted
          // instance would report every click and dead click (#1022). Set them
          // explicitly so the client decides: heatmaps and dead clicks off, and
          // capture_performance limited to web vitals (documented in TELEMETRY.md),
          // not network timing.
          capture_heatmaps: false,
          capture_dead_clicks: false,
          capture_performance: { web_vitals: true, network_timing: false },
          // Fire $pageview on SPA history changes, not just the initial hard
          // load, so react-router route changes (tool pages, editor, automate,
          // files) are captured. capture_pageleave gives accurate time-on-page.
          capture_pageview: "history_change",
          capture_pageleave: true,
          disable_session_recording: true,
          ip: false,
          persistence: "localStorage",
          person_profiles: "identified_only",
          // Last-line PII boundary at the SDK, independent of track()'s per-call
          // sanitize(): strip any query string / fragment from URL properties.
          // SnapOtter routes carry no PII, but pageview, survey, and other
          // SDK-generated events never pass through track()'s allowlist, so the
          // invariant is enforced here too.
          before_send: (event) => {
            // The same runtime gate Sentry's beforeSend has: once the tab is
            // opted out, nothing is captured, including the events posthog-js
            // makes on its own ($pageview, $pageleave, web vitals), even if
            // opt_out_capturing() itself failed (#2216).
            if (!enabled) return null;
            const props = event?.properties;
            if (props) {
              const strip = (u: unknown) => (typeof u === "string" ? u.replace(/[?#].*$/, "") : u);
              props.$current_url = strip(props.$current_url);
              props.$referrer = strip(props.$referrer);
              // $web_vitals_*_event objects nest their own $current_url, which
              // skips the top-level strip above, so walk them too (#1022).
              for (const key of Object.keys(props)) {
                if (!key.startsWith("$web_vitals_")) continue;
                const nested = props[key] as Record<string, unknown>;
                if (nested && typeof nested === "object" && "$current_url" in nested) {
                  nested.$current_url = strip(nested.$current_url);
                }
              }
            }
            return event;
          },
        }) ?? null;
      initialized = true;
    } catch (err) {
      // Left uninitialized, so the next answer that says on tries again.
      console.warn("[analytics] PostHog init failed:", err);
      // A chunk that won't load is the network or an ad blocker; posthog.init
      // throwing is ours, so Sentry should hear about it.
      if (chunkLoaded) posthogInitFailure = err;
    }
  }

  if (posthog) {
    // Clear any persisted opt-out from a previous disabled period. opt_out_capturing()
    // writes a localStorage flag that survives reloads, so without this a browser that
    // once opted out would stay silent even after the instance re-enables analytics.
    // captureEventName: false suppresses posthog-js's default $opt_in event, which
    // otherwise fires once per page load here (pure noise: analytics is on by
    // default with an admin opt-out, so there is no per-user consent to record).
    try {
      posthog.opt_in_capturing({ captureEventName: false });
    } catch (err) {
      // A persisted opt-out left in place keeps PostHog silent; say so.
      console.warn("[analytics] PostHog opt-in failed:", err);
    }
    // Super properties on every event. instance_id is an event PROPERTY (not an
    // identify() call), so events stay anonymous and person-less while enabling
    // fleet rollups ("how many distinct instances use tool X") via a HogQL
    // uniq(). Omitted when empty so we never register a blank value.
    try {
      const superProps: Record<string, string> = {
        app_version: (await import("@snapotter/shared")).APP_VERSION,
      };
      if (config.instanceId) superProps.instance_id = config.instanceId;
      // Registered even if an opt-out landed meanwhile: it only stores them
      // locally, and a re-enable resumes this same instance, which needs them.
      posthog.register(superProps);
    } catch (err) {
      // Events go without the rollup properties; Sentry must still start.
      console.warn("[analytics] PostHog super properties failed:", err);
    }
  }

  // startSentry() itself stops short if the tab was opted out by now.
  if (sentryConfig) await startSentry(sentryConfig);
  if (posthogInitFailure && !posthogInitReported && wanted) {
    // Once per tab: a failing init retries on every focus refetch.
    posthogInitReported = true;
    void captureHandledError(
      new SafeError("PostHog failed to start", { kind: "bug", cause: posthogInitFailure }),
    );
  }

  // Replay crashes captured before Sentry was ready. Not after an opt-out:
  // optOut() already threw the buffer away (#2197).
  if (enabled && wanted) void flushEarlyErrors();
}

/**
 * Start the web Sentry client, unless the tab was opted out while its code
 * loaded. Also restarts it on a re-enable, since optOut() closes it (#2197).
 */
async function startSentry(config: AnalyticsConfig): Promise<void> {
  try {
    const Sentry = await import("@sentry/react");
    const { buildWebBeforeSend, DENY_URLS, IGNORE_ERRORS } = await import("@/lib/sentry-scrub");
    const release =
      import.meta.env.VITE_SENTRY_RELEASE || (await import("@snapotter/shared")).APP_VERSION;
    if (!wanted || sentryRunning) return;
    // A closed client still lets breadcrumbs pile up on the shared scopes, so
    // a restart after an opt-out would send the opted-out trail with its first
    // event. Start from an empty one.
    Sentry.getIsolationScope().clearBreadcrumbs();
    Sentry.getCurrentScope().clearBreadcrumbs();
    // buildWebBeforeSend is typed on loose Record shapes so sentry-scrub.ts
    // never imports @sentry/react (this module loads the SDK lazily); cast
    // at this one boundary to the SDK callback type.
    type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
    Sentry.init({
      dsn: config.sentryDsnWeb,
      release,
      environment: "production",
      sendDefaultPii: false,
      sendClientReports: false,
      // Errors only: no tracing options, and release-health sessions are
      // dropped by removing the session integration below.
      integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
      ignoreErrors: IGNORE_ERRORS,
      denyUrls: DENY_URLS,
      // Capture the breadcrumb trail (default 100). beforeSend (sentry-scrub.ts)
      // sanitizes each breadcrumb before send: urls/paths redacted, data dropped.
      beforeSend: buildWebBeforeSend(() => enabled) as unknown as SentryOptions["beforeSend"],
    });
    sentryRunning = true;
  } catch (err) {
    console.warn("[analytics] Sentry init failed:", err);
  }
}

/**
 * Set an allowlisted Sentry tag (route / tool_id / locale / error_class /
 * status_code, see sentry-scrub.ts TAG_ALLOWLIST) so web errors become
 * filterable by which tool and route the user was on. No-op until Sentry is
 * initialized; lazy so this module keeps no static @sentry/react import.
 */
export function setSentryTag(key: string, value: string): void {
  void import("@sentry/react")
    .then((Sentry) => {
      if (Sentry.getClient()) Sentry.setTag(key, value);
    })
    .catch(() => {});
}

/**
 * Capture a handled (non-crash) error and return its Sentry event id so UI
 * copy can reference it, or null when telemetry is off (analytics disabled,
 * no web DSN baked, or opted out). Only allowlisted tags survive the scrubber
 * (see sentry-scrub.ts TAG_ALLOWLIST), and the error must carry an authored
 * SafeError message or beforeSend reduces it to its type. A SafeError's
 * `statusCode` goes on as the `status_code` tag, so its message can stay
 * constant (#1351); a caller's own valid `status_code` wins. Errors captured
 * any other way (render crashes, early errors) don't get it. Lazy import so this
 * module keeps no static @sentry/react dependency.
 */
export async function captureHandledError(
  error: Error,
  tags?: Record<string, string>,
): Promise<string | null> {
  if (!enabled) return null;
  try {
    const Sentry = await import("@sentry/react");
    if (!Sentry.getClient()) return null;
    // A caller's own status wins; one the scrubber would drop doesn't, so it
    // can't cost the report the SafeError's real status.
    const status =
      httpStatusTag(tags?.status_code) ??
      (isSafeMessageError(error) ? httpStatusTag(error.statusCode) : undefined);
    const allTags = status ? { ...tags, status_code: status } : tags;
    return Sentry.withScope((scope) => {
      if (allTags) scope.setTags(allTags);
      return Sentry.captureException(error);
    });
  } catch {
    return null;
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

/** PostHog product analytics is live: telemetry on and a PostHog key baked. */
export function isAnalyticsActive(): boolean {
  return enabled && !!posthog;
}

/**
 * Telemetry of any kind may leave this tab. False after the instance-wide
 * opt-out. Unlike isAnalyticsActive(), this is true on an instance baked with
 * a Sentry DSN and no PostHog key, where Sentry is live on its own (#1115).
 */
export function isTelemetryEnabled(): boolean {
  return enabled;
}

/**
 * Apply the instance's analytics setting as the server reports it: start
 * telemetry when it's on, stop all of it when it's off (or unknown) after
 * this tab started. Stopping keys on telemetry as a whole, so a Sentry-only
 * instance stops too (#1115).
 */
export async function applyInstanceAnalytics(config: AnalyticsConfig | null): Promise<void> {
  if (config?.enabled) {
    // A tab that started and was then opted out resumes; any other starts.
    if (initialized && !enabled) optIn();
    // Sentry failed to start earlier (a chunk that didn't load, say): retry.
    else if (initialized && sentryConfig && !sentryRunning) await startSentry(sentryConfig);
    else await initAnalytics(config);
    return;
  }
  // Off, including a start still in flight (#2197).
  if (enabled || starting) optOut();
  // Off from the start: nothing buffered may ever leave this tab. A null
  // setting is unknown (the first fetch failed), not off, so the buffer stays
  // for a later answer to decide (#2196).
  else if (config) discardEarlyErrors();
}

/** Hard runtime opt-out: stop PostHog and Sentry in this tab without a reload. */
export function optOut(): void {
  enabled = false;
  wanted = false;
  // Errors buffered so far belong to this opted-out tab; drop them (#2197).
  discardEarlyErrors();
  try {
    posthog?.opt_out_capturing();
  } catch (err) {
    // before_send still drops everything new; say why capture wasn't stopped.
    console.warn("[analytics] PostHog opt-out failed:", err);
  }
  sentryRunning = false;
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.getClient()?.close();
    })
    .catch(() => {});
}

/**
 * Reverse a prior optOut() in this tab without a reload: resume PostHog
 * capture, and start Sentry again, since optOut() closed it (#2197).
 */
export function optIn(): void {
  enabled = true;
  wanted = true;
  try {
    // captureEventName: false: resuming capture is not a per-user consent signal
    // in this product, so don't emit a noisy $opt_in event (see initAnalytics).
    posthog?.opt_in_capturing({ captureEventName: false });
  } catch (err) {
    console.warn("[analytics] PostHog opt-in failed:", err);
  }
  if (sentryConfig && !sentryRunning) void startSentry(sentryConfig);
}
