import type { AnalyticsConfig } from "@snapotter/shared";

type PostHogInstance = import("posthog-js").PostHog;

let posthog: PostHogInstance | null = null;
let initialized = false;

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_EXT_TEST =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/i;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai|Users|home)\//g;

function scrubString(str: string): string {
  return str.replace(FILE_EXT_PATTERN, ".[REDACTED]").replace(FILE_PATH_PATTERN, "/[REDACTED]/");
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
        person_profiles: "always",
      }) ?? null;
    initialized = true;
  } catch (err) {
    console.warn("[analytics] PostHog init failed:", err);
  }

  if (posthog) {
    posthog.register({
      instance_id: config.instanceId,
      app_version: (await import("@snapotter/shared")).APP_VERSION,
    });
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
          if (event.user) {
            delete event.user.email;
            delete event.user.username;
          }
          if (event.exception?.values) {
            for (const ex of event.exception.values) {
              if (ex.value) ex.value = scrubString(ex.value);
              if (ex.stacktrace?.frames) {
                for (const frame of ex.stacktrace.frames) {
                  if (frame.filename) frame.filename = scrubString(frame.filename);
                  if (frame.abs_path) frame.abs_path = scrubString(frame.abs_path);
                }
              }
            }
          }
          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.category === "ui.click") return null;
          if (breadcrumb.category === "fetch" && breadcrumb.data?.url) {
            if (FILE_EXT_TEST.test(breadcrumb.data.url as string)) return null;
          }
          if (breadcrumb.message) {
            breadcrumb.message = scrubString(breadcrumb.message);
          }
          return breadcrumb;
        },
      });
    }
  } catch (err) {
    console.warn("[analytics] Sentry init failed:", err);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!posthog) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // never throw
  }
}

export function getDistinctId(): string | null {
  if (!posthog) return null;
  try {
    return posthog.get_distinct_id();
  } catch {
    return null;
  }
}
