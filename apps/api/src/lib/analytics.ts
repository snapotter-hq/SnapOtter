import {
  ANALYTICS_BAKED,
  ANALYTICS_EVENTS,
  APP_VERSION,
  type FeedbackErrorCategory,
  type FeedbackFrictionArea,
  type FeedbackImportantArea,
  type FeedbackInstallMethod,
  type FeedbackSentiment,
  type FeedbackSource,
  type FeedbackSurveyId,
  type FeedbackType,
  type FeedbackUsageType,
} from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { PostHog } from "posthog-node";
import { db, schema } from "../db/index.js";
import { sanitizeEventProperties } from "./analytics-allowlist.js";
import { analyticsEnabled, bakedEnabled } from "./analytics-gate.js";

let posthogClient: PostHog | null = null;

export interface FeedbackEventProperties {
  source: FeedbackSource;
  survey_id?: FeedbackSurveyId;
  prompt_variant?: string;
  sentiment?: FeedbackSentiment;
  feedback_type?: FeedbackType;
  message?: string;
  contact_ok: boolean;
  contact_email?: string;
  contact_name?: string;
  company?: string;
  tool_id?: string;
  search_query?: string;
  job_status?: "completed" | "failed";
  install_method?: FeedbackInstallMethod;
  usage_type?: FeedbackUsageType;
  important_areas?: FeedbackImportantArea[];
  friction_area?: FeedbackFrictionArea;
  error_category?: FeedbackErrorCategory;
}

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
  // Deprecated shim: route through the classified path. New code calls
  // reportError directly with a source.
  const { reportError } = await import("./error-report.js");
  await reportError(error, { source: "boot" });
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
  // ignoreSampleRate bypasses the volume sample for low-frequency, high-value
  // events (e.g. the once-per-boot instance_started census). It does NOT bypass
  // the opt-out gate or the property allowlist below.
  options?: { ignoreSampleRate?: boolean },
): Promise<void> {
  try {
    if (!analyticsEnabled() || !posthogClient) return;
    if (!options?.ignoreSampleRate && ANALYTICS_BAKED.posthogSampleRate < 1.0) {
      if (
        ANALYTICS_BAKED.posthogSampleRate <= 0.0 ||
        Math.random() >= ANALYTICS_BAKED.posthogSampleRate
      ) {
        return;
      }
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

function cleanFeedbackProperties(properties: FeedbackEventProperties): Record<string, unknown> {
  const out: Record<string, unknown> = {
    feedback_version: 1,
    app_version: APP_VERSION,
    source: properties.source,
    contact_ok: properties.contact_ok,
  };

  const copyString = (from: keyof FeedbackEventProperties, to = from) => {
    const value = properties[from];
    if (typeof value === "string" && value.length > 0) out[to] = value;
  };

  copyString("survey_id");
  copyString("prompt_variant");
  copyString("sentiment");
  copyString("feedback_type");
  copyString("message");
  copyString("contact_email");
  copyString("contact_name");
  copyString("company");
  copyString("tool_id");
  // Intentional: this is the user-typed query from a missing-tool feature request,
  // not the tool-telemetry "search query" that analytics-allowlist.ts never forwards.
  copyString("search_query");
  copyString("job_status");
  copyString("install_method");
  copyString("usage_type");
  copyString("friction_area");
  copyString("error_category");

  if (properties.important_areas?.length) {
    out.important_areas = properties.important_areas;
  }

  return out;
}

export async function captureFeedback(
  properties: FeedbackEventProperties,
  distinctId?: string,
): Promise<void> {
  try {
    if (!analyticsEnabled() || !posthogClient) return;
    posthogClient.capture({
      distinctId: distinctId ?? (await getInstanceId()),
      event: ANALYTICS_EVENTS.FEEDBACK_SUBMITTED,
      properties: cleanFeedbackProperties(properties),
    });
  } catch {
    // feedback capture must never throw
  }
}
