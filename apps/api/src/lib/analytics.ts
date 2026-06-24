import { ANALYTICS_BAKED } from "@snapotter/shared/src/analytics/baked.js";
import { eq } from "drizzle-orm";
import type { PostHog } from "posthog-node";
import { db, schema } from "../db/index.js";

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai)\//g;

let posthogClient: PostHog | null = null;
let sentryModule: typeof import("@sentry/node") | null = null;

export async function initAnalytics(): Promise<void> {
  if (!ANALYTICS_BAKED.enabled) return;

  if (ANALYTICS_BAKED.posthogApiKey) {
    try {
      const { PostHog } = await import("posthog-node");
      posthogClient = new PostHog(ANALYTICS_BAKED.posthogApiKey, {
        host: ANALYTICS_BAKED.posthogHost,
        flushAt: 20,
        flushInterval: 30000,
      });
    } catch {
      // posthog-node not available
    }
  }

  if (ANALYTICS_BAKED.sentryDsn) {
    try {
      sentryModule = await import("@sentry/node");
      sentryModule.init({
        dsn: ANALYTICS_BAKED.sentryDsn,
        sendDefaultPii: false,
        beforeSend(event) {
          if (event.user) {
            delete event.user.email;
            delete event.user.username;
          }
          if (event.exception?.values) {
            for (const ex of event.exception.values) {
              if (
                ex.value &&
                (ex.value.includes("Rate limit exceeded") ||
                  ex.value.includes("Body cannot be empty") ||
                  ex.value.includes("Unsupported Media Type") ||
                  ex.value.includes("Request body size did not match") ||
                  ex.value.includes("Premature close"))
              ) {
                return null;
              }
              if (ex.value) {
                ex.value = ex.value
                  .replace(FILE_EXT_PATTERN, ".[REDACTED]")
                  .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
              }
              if (ex.stacktrace?.frames) {
                for (const frame of ex.stacktrace.frames) {
                  if (frame.filename) {
                    frame.filename = frame.filename
                      .replace(FILE_EXT_PATTERN, ".[REDACTED]")
                      .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
                  }
                }
              }
            }
          }
          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.message) {
            breadcrumb.message = breadcrumb.message
              .replace(FILE_EXT_PATTERN, ".[REDACTED]")
              .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
          }
          return breadcrumb;
        },
      });
    } catch {
      // @sentry/node not available
    }
  }
}

export async function captureException(error: unknown): Promise<void> {
  try {
    if (!sentryModule) return;
    sentryModule.captureException(error);
  } catch {
    // analytics must never throw
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }

  if (sentryModule) {
    await sentryModule.close(2000);
    sentryModule = null;
  }
}

async function getInstanceId(): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "instance_id"));
  return row?.value ?? "unknown";
}

export async function trackEvent(
  event: string,
  properties: Record<string, unknown>,
  distinctId?: string,
): Promise<void> {
  try {
    if (!ANALYTICS_BAKED.enabled || !posthogClient) return;
    if (ANALYTICS_BAKED.sampleRate < 1.0) {
      if (ANALYTICS_BAKED.sampleRate <= 0.0 || Math.random() >= ANALYTICS_BAKED.sampleRate) return;
    }
    posthogClient.capture({
      distinctId: distinctId ?? (await getInstanceId()),
      event,
      properties,
    });
  } catch {
    // analytics must never throw
  }
}
