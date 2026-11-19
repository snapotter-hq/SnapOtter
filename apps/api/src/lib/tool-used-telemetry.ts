import {
  ANALYTICS_EVENTS,
  getBundleForTool,
  getOptionalBundleForTool,
  TOOLS,
} from "@snapotter/shared";
import type { FastifyRequest } from "fastify";
import { trackEvent } from "./analytics.js";
import { analyticsEnabled } from "./analytics-gate.js";
import { safeFormatTag } from "./error-report.js";
import type { ToolRequestAuditContext } from "./tool-audit.js";

/**
 * Dimensions every tool_used event carries, whether the run went through the
 * BullMQ worker or stayed inside the HTTP request, so the two never drift.
 * input_format is the safe extension only (never the filename); is_batch flags
 * a per-file batch child; execution_hint records the tool's sync/async class.
 */
export function toolUsedDimensions(args: {
  toolId: string;
  canonicalId?: string;
  durationMs: number;
  isBatch: boolean;
  filename?: string | null;
}): Record<string, unknown> {
  const canonicalId = args.canonicalId ?? args.toolId;
  const tool = TOOLS.find((t) => t.id === canonicalId);
  return {
    tool_id: args.toolId,
    duration_ms: args.durationMs,
    category: tool?.category ?? "unknown",
    is_ai_tool:
      getBundleForTool(canonicalId) !== null || getOptionalBundleForTool(canonicalId) !== null,
    is_batch: args.isBatch,
    input_format: safeFormatTag(args.filename ?? undefined) ?? "unknown",
    execution_hint: tool?.executionHint ?? "fast",
  };
}

// Route error bodies carry a machine code such as FEATURE_NOT_INSTALLED. Only a
// short identifier-shaped value is forwarded, so free text can never ride it.
const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function errorCodeFromPayload(payload: unknown, statusCode: number): string {
  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
  if (typeof text === "string" && text.startsWith("{")) {
    try {
      const code = (JSON.parse(text) as { code?: unknown }).code;
      if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) return code.toLowerCase();
    } catch {
      // Not JSON after all; fall through to the status code.
    }
  }
  return `http_${statusCode}`;
}

// A 4xx is the request's fault (bad input). 501 (an AI bundle the admin hasn't
// installed) and 503 mean the instance can't run it right now. Any other 5xx
// is our bug.
function errorKindForStatus(statusCode: number): "input" | "operational" | "bug" {
  if (statusCode < 500) return "input";
  if (statusCode === 501 || statusCode === 503) return "operational";
  return "bug";
}

/**
 * Emit `tool_used` for a tool request the worker never saw (#4819): a run on
 * an inline route (#4337), or a request turned away before it was enqueued
 * (missing AI bundle, bad input). The worker emits for every enqueued job, so
 * the two never count the same request. Without this the inline routes report
 * opens and starts but never an outcome. Sends at most one event per request.
 */
export function emitInlineToolUsed(
  request: FastifyRequest,
  ctx: ToolRequestAuditContext,
  statusCode: number,
  payload: unknown,
): void {
  if (ctx.telemetrySent) return;
  const completed = statusCode >= 200 && statusCode < 300;
  if (!completed && statusCode < 400) return;
  ctx.telemetrySent = true;
  if (!analyticsEnabled()) return;

  const distinctHeader = request.headers?.["x-posthog-distinct-id"];
  const distinctId = typeof distinctHeader === "string" ? distinctHeader : undefined;
  const base = toolUsedDimensions({
    toolId: ctx.toolId,
    durationMs: Date.now() - ctx.startTime,
    isBatch: false,
    filename: ctx.inputFilename,
  });
  const outcome = completed
    ? { status: "completed", ...(ctx.totalInputSize > 0 && { bytes_in: ctx.totalInputSize }) }
    : {
        status: "failed",
        error_code: errorCodeFromPayload(payload, statusCode),
        error_kind: errorKindForStatus(statusCode),
      };
  void trackEvent(ANALYTICS_EVENTS.TOOL_USED, { ...base, ...outcome }, distinctId);
}
