import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { PostHog } from "posthog-node";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { getAuthUser } from "../plugins/auth.js";

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai)\//g;

let posthogClient: PostHog | null = null;
let sentryModule: typeof import("@sentry/node") | null = null;

export async function initAnalytics(): Promise<void> {
  if (!env.ANALYTICS_ENABLED || !env.POSTHOG_API_KEY) return;

  try {
    const { PostHog } = await import("posthog-node");
    posthogClient = new PostHog(env.POSTHOG_API_KEY, {
      host: env.POSTHOG_HOST,
      flushAt: 20,
      flushInterval: 30000,
    });
  } catch {
    // posthog-node not available — analytics disabled
  }

  if (env.SENTRY_DSN) {
    try {
      sentryModule = await import("@sentry/node");
      sentryModule.init({
        dsn: env.SENTRY_DSN,
        sendDefaultPii: false,
        beforeSend(event) {
          if (event.user) {
            delete event.user.email;
            delete event.user.username;
          }
          if (event.exception?.values) {
            for (const ex of event.exception.values) {
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

export function captureException(error: unknown, request?: FastifyRequest): void {
  if (!sentryModule) return;
  if (request && !isRequestOptedIn(request)) return;
  sentryModule.captureException(error);
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

function getInstanceId(): string {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "instance_id")).get();
  return row?.value ?? "unknown";
}

function isUserOptedIn(userId: string): boolean {
  if (!env.ANALYTICS_ENABLED) return false;
  if (userId === "anonymous") return false;
  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  return user?.analyticsEnabled === true;
}

function isRequestOptedIn(request: FastifyRequest): boolean {
  if (!env.ANALYTICS_ENABLED) return false;
  const user = getAuthUser(request);
  if (!user) return false;
  if (user.id === "anonymous") {
    const header = request.headers["x-analytics-consent"];
    return header === "true";
  }
  return isUserOptedIn(user.id);
}

function shouldSample(): boolean {
  if (env.ANALYTICS_SAMPLE_RATE >= 1.0) return true;
  if (env.ANALYTICS_SAMPLE_RATE <= 0.0) return false;
  return Math.random() < env.ANALYTICS_SAMPLE_RATE;
}

export function trackEvent(
  request: FastifyRequest,
  event: string,
  properties: Record<string, unknown>,
): void {
  if (!posthogClient || !isRequestOptedIn(request) || !shouldSample()) return;
  try {
    posthogClient.capture({
      distinctId: getInstanceId(),
      event,
      properties,
    });
  } catch {
    // never throw from analytics
  }
}
