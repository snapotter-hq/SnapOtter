import type { AnalyticsConfig } from "@snapotter/shared";

type PostHogInstance = import("posthog-js").PostHog;

let posthog: PostHogInstance | null = null;
let initialized = false;
let consentGranted = false;

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai|Users|home)\//g;

function scrubString(str: string): string {
  return str.replace(FILE_EXT_PATTERN, ".[REDACTED]").replace(FILE_PATH_PATTERN, "/[REDACTED]/");
}

export async function initAnalytics(config: AnalyticsConfig): Promise<void> {
  if (initialized || !config.enabled) return;

  try {
    const posthogJs = (await import("posthog-js")).default;
    if (!consentGranted) {
      return;
    }
    posthog =
      posthogJs.init(config.posthogApiKey, {
        api_host: config.posthogHost,
        autocapture: false,
        capture_pageview: true,
        disable_session_recording: true,
        session_recording: {
          captureCanvas: { recordCanvas: false },
          maskAllInputs: true,
          maskTextSelector: ".file-name, .file-path, [data-file-name]",
          blockSelector: "[data-user-content]",
        },
        ip: false,
        persistence: "localStorage",
      }) ?? null;
    initialized = true;
  } catch (err) {
    console.warn("[analytics] PostHog init failed:", err);
  }

  try {
    if (config.sentryDsn) {
      const Sentry = await import("@sentry/react");
      if (!consentGranted) {
        return;
      }
      Sentry.init({
        dsn: config.sentryDsn,
        sendDefaultPii: false,
        beforeSend(event) {
          if (!consentGranted) return null;
          startErrorReplay();
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
          if (!consentGranted) return null;
          if (breadcrumb.category === "ui.click") return null;
          if (breadcrumb.category === "fetch" && breadcrumb.data?.url) {
            if (FILE_EXT_PATTERN.test(breadcrumb.data.url as string)) return null;
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

export function shutdownAnalytics(): void {
  if (posthog) {
    try {
      posthog.opt_out_capturing();
      posthog.reset();
    } catch {
      // never throw
    }
  }
  posthog = null;
  initialized = false;
  consentGranted = false;
}

export function setAnalyticsConsent(enabled: boolean): void {
  consentGranted = enabled;
  if (!enabled) {
    shutdownAnalytics();
  }
}

export function identify(instanceId: string, properties: Record<string, unknown>): void {
  if (!posthog || !consentGranted) return;
  try {
    posthog.identify(instanceId, properties);
  } catch {
    // never throw
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!posthog || !consentGranted) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // never throw
  }
}

export function startErrorReplay(): void {
  if (!posthog || !consentGranted) return;
  try {
    posthog.startSessionRecording();
  } catch {
    // never throw
  }
}
