import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  captureFeedback,
  FEEDBACK_SOURCE_VALUES,
  FEEDBACK_SURVEY_ID_VALUES,
  type FeedbackEventProperties,
} from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { requireAuth } from "../plugins/auth.js";

const SENTIMENT_VALUES = ["great", "okay", "issue", "missing", "bug", "idea", "other"] as const;
const FEEDBACK_TYPE_VALUES = [
  "bug",
  "feature_request",
  "confusing_ux",
  "performance",
  "other",
] as const;
const INSTALL_METHOD_VALUES = ["docker", "docker_compose", "source", "cloud", "other"] as const;
const USAGE_TYPE_VALUES = [
  "personal",
  "team_internal",
  "business_workflow",
  "education",
  "evaluating",
] as const;
const IMPORTANT_AREA_VALUES = [
  "images",
  "pdf_docs",
  "video_audio",
  "batch_workflows",
  "ai_tools",
] as const;
const FRICTION_AREA_VALUES = [
  "smooth",
  "docker",
  "environment_variables",
  "auth",
  "storage",
  "workers",
  "ai_tools",
  "docs",
  "performance",
  "other",
] as const;
const ERROR_CATEGORY_VALUES = [
  "validation_error",
  "upload_error",
  "processing_error",
  "timeout",
  "unsupported_format",
  "worker_unavailable",
  "unknown",
] as const;

const toolIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,80}$/);

function stripUnsafeControlCharacters(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\n" || char === "\t" || (code >= 32 && code !== 127)) {
      out += char;
    }
  }
  return out;
}

const optionalText = (max: number) =>
  z.string().trim().max(max).transform(stripUnsafeControlCharacters).optional();

const feedbackBodySchema = z
  .object({
    source: z.enum(FEEDBACK_SOURCE_VALUES),
    surveyId: z.enum(FEEDBACK_SURVEY_ID_VALUES).optional(),
    promptVariant: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    sentiment: z.enum(SENTIMENT_VALUES).optional(),
    feedbackType: z.enum(FEEDBACK_TYPE_VALUES).optional(),
    message: optionalText(2000),
    contactOk: z.boolean().default(false),
    contactEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
    contactName: optionalText(120),
    company: optionalText(160),
    toolId: toolIdSchema.optional(),
    searchQuery: optionalText(200),
    jobStatus: z.enum(["completed", "failed"]).optional(),
    installMethod: z.enum(INSTALL_METHOD_VALUES).optional(),
    usageType: z.enum(USAGE_TYPE_VALUES).optional(),
    importantAreas: z.array(z.enum(IMPORTANT_AREA_VALUES)).max(5).optional(),
    frictionArea: z.enum(FRICTION_AREA_VALUES).optional(),
    errorCategory: z.enum(ERROR_CATEGORY_VALUES).optional(),
  })
  .superRefine((value, ctx) => {
    const hasText = Boolean(value.message?.trim());
    const hasChoice = Boolean(
      value.sentiment ||
        value.feedbackType ||
        value.installMethod ||
        value.usageType ||
        value.searchQuery,
    );
    if (!hasText && !hasChoice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Feedback must include a rating, type, or message.",
        path: ["message"],
      });
    }
  });

function toPostHogProperties(body: z.infer<typeof feedbackBodySchema>): FeedbackEventProperties {
  return {
    source: body.source,
    survey_id: body.surveyId,
    prompt_variant: body.promptVariant,
    sentiment: body.sentiment,
    feedback_type: body.feedbackType,
    message: body.message || undefined,
    contact_ok: body.contactOk,
    contact_email: body.contactOk ? body.contactEmail || undefined : undefined,
    contact_name: body.contactOk ? body.contactName || undefined : undefined,
    company: body.contactOk ? body.company || undefined : undefined,
    tool_id: body.toolId,
    search_query: body.searchQuery,
    job_status: body.jobStatus,
    install_method: body.installMethod,
    usage_type: body.usageType,
    important_areas: body.importantAreas,
    friction_area: body.frictionArea,
    error_category: body.errorCategory,
  };
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/feedback",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const parsed = feedbackBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feedback payload",
          code: "VALIDATION_ERROR",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      if (!analyticsEnabled()) {
        return reply.send({ ok: true, accepted: false });
      }

      await captureFeedback(
        toPostHogProperties(parsed.data),
        request.headers["x-posthog-distinct-id"] as string | undefined,
      );

      return reply.send({ ok: true, accepted: true });
    },
  );

  app.log.info("Feedback routes registered");
}
