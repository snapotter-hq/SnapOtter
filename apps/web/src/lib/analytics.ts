import * as Sentry from "@sentry/react";
import type { AnalyticsConfig } from "@snapotter/shared";
import posthogJs from "posthog-js";

let posthog: import("posthog-js").PostHog | null = null;
let initialized = false;
let consentGranted = false;

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|he[ic]f?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai|Users|home)\//g;

function scrubString(str: string): string {
  return str.replace(FILE_EXT_PATTERN, ".[REDACTED]").replace(FILE_PATH_PATTERN, "/[REDACTED]/");
}

export function initAnalytics(config: AnalyticsConfig): void {
  if (initialized || !config.enabled) return;
  initialized = true;

  try {
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
  } catch {
    // SDK blocked or unavailable — use null provider
  }

  try {
    if (config.sentryDsn) {
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
  } catch {
    // Sentry blocked or unavailable
  }
}

export function setAnalyticsConsent(enabled: boolean): void {
  consentGranted = enabled;
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
