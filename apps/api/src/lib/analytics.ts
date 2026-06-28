import { ANALYTICS_BAKED } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { PostHog } from "posthog-node";
import { db, schema } from "../db/index.js";
import { sanitizeEventProperties } from "./analytics-allowlist.js";
import { analyticsEnabled, bakedEnabled } from "./analytics-gate.js";

let posthogClient: PostHog | null = null;

export async function initAnalytics(): Promise<void> {
  if (!bakedEnabled()) return;

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
}

export async function captureException(error: unknown): Promise<void> {
  try {
    if (!analyticsEnabled()) return;
    const Sentry = await import("@sentry/node");
    Sentry.captureException(error);
  } catch {
    // analytics must never throw
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
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
    if (!analyticsEnabled() || !posthogClient) return;
    if (ANALYTICS_BAKED.sampleRate < 1.0) {
      if (ANALYTICS_BAKED.sampleRate <= 0.0 || Math.random() >= ANALYTICS_BAKED.sampleRate) return;
    }
    posthogClient.capture({
      distinctId: distinctId ?? (await getInstanceId()),
      event,
      properties: sanitizeEventProperties(event, properties),
    });
  } catch {
    // analytics must never throw
  }
}
