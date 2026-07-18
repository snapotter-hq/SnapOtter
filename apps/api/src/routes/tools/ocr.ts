import { randomUUID } from "node:crypto";
import {
  extractText,
  getOcrRuntimeCapability,
  MAX_OCR_INPUT_DIMENSION,
  MAX_OCR_INPUT_PIXELS,
} from "@snapotter/ai";
import { getOptionalBundleForTool, TOOL_OPTIONAL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { deleteObject } from "../../lib/object-storage.js";
import { resolveOcrIngressSettings } from "../../lib/ocr-capability.js";
import {
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrEncodedInputLimit,
} from "../../lib/ocr-limits.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { requireToolAccess } from "../../permissions.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.enum(["fast", "balanced", "best"]).optional(),
  language: z.enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko"]).default("auto"),
  enhance: z.boolean().optional(),
  // Backward compat: old "engine" param still accepted
  engine: z.enum(["tesseract", "paddleocr"]).optional(),
});

type OcrSettings = z.infer<typeof settingsSchema>;

function resolveWorkerQuality(settings: OcrSettings): "fast" | "balanced" | "best" {
  const quality =
    settings.quality ??
    (settings.engine ? (settings.engine === "tesseract" ? "fast" : "balanced") : undefined);
  if (quality) return quality;
  const capability = getOcrRuntimeCapability();
  return capability.available && capability.qualities.includes("best") ? "best" : "fast";
}

async function processOcrJob(
  input: Buffer,
  settingsValue: unknown,
  filename: string,
  ctx: {
    scratchDir: string;
    signal: AbortSignal;
    report: (percent: number, stage?: string) => void;
  },
) {
  const settings = settingsSchema.parse(settingsValue);
  const quality = resolveWorkerQuality(settings);
  if (quality !== "fast") {
    const capability = getOcrRuntimeCapability();
    if (!capability.available || !capability.qualities.includes(quality)) {
      throw new Error(`OCR ${quality} runtime is no longer available`);
    }
  }

  ctx.signal.throwIfAborted();
  ctx.report(2, "Validating image");
  const prepared = await inputHandlerFor("image").prepare(input, filename, {
    scratchDir: ctx.scratchDir,
    maxDimension: MAX_OCR_INPUT_DIMENSION,
    maxPixels: MAX_OCR_INPUT_PIXELS,
    signal: ctx.signal,
  });
  ctx.signal.throwIfAborted();
  ctx.report(10, "Preparing OCR");

  const result = await extractText(
    prepared.buffer,
    ctx.scratchDir,
    {
      quality,
      language: settings.language,
      enhance: settings.enhance ?? quality === "best",
      signal: ctx.signal,
    },
    (percent, stage) => ctx.report(10 + Math.max(0, Math.min(100, percent)) * 0.9, stage),
  );
  if (result.requestedQuality !== quality || result.actualQuality !== quality) {
    throw new Error(
      `OCR runtime tier mismatch: requested ${quality}, reported ${result.requestedQuality}/${result.actualQuality}`,
    );
  }

  const base = prepared.filename.replace(/\.[^.]+$/, "");
  return {
    buffer: Buffer.from(result.text, "utf-8"),
    filename: `${base}_ocr.txt`,
    contentType: "text/plain",
    resultPayload: { ...result },
  };
}

registerAiJobHandler("ocr", async (input, data, ctx) =>
  processOcrJob(input, data.settings, data.filename, ctx),
);

registerToolProcessFn({
  toolId: "ocr",
  settingsSchema,
  process: async (input, settings, filename, ctx) => {
    if (!ctx) throw new Error("OCR processing context is required");
    const result = await processOcrJob(input, settings, filename, ctx);
    return {
      buffer: result.buffer,
      filename: result.filename,
      contentType: result.contentType,
    };
  },
});

/**
 * OCR / text extraction route.
 * Accepts the long-running job immediately; the terminal SSE result contains
 * both extracted text metadata and the generated text artifact URL.
 */
export function registerOcr(app: FastifyInstance) {
  app.post("/api/v1/tools/image/ocr", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "ocr";
    const authUser = await requireToolAccess(request, reply, toolId);
    if (!authUser) return;
    const userId = authUser.id;
    const jobId = randomUUID();
    let filename = "image";
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;
    let fileId: string | null = null;
    let saveModeRaw: string | null = null;
    let inputKey: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          if (inputKey) throw new Error("Only one image file may be uploaded");
          const upload = await receiveUpload(part, jobId, {
            maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
          });
          inputKey = upload.key;
          filename = upload.filename;
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          const raw = part.value as string;
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
            clientJobId = raw;
          }
        } else if (part.fieldname === "fileId") {
          fileId = part.value as string;
        } else if (part.fieldname === "saveMode") {
          saveModeRaw = part.value as string;
        }
      }
    } catch (err) {
      if (inputKey) await deleteObject(inputKey).catch(() => {});
      const statusCode = ocrUploadErrorStatus(err);
      return reply.status(statusCode).send({
        error: ocrUploadErrorMessage(statusCode),
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    const saveMode = parseSaveModeField(saveModeRaw);
    if (saveMode === null) {
      if (inputKey) await deleteObject(inputKey).catch(() => {});
      return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
    }

    if (!inputKey) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    let settings: OcrSettings;
    let requestedSettings: unknown;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      requestedSettings = parsed;
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        await deleteObject(inputKey).catch(() => {});
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(result.error.issues),
        });
      }
      settings = result.data;
    } catch {
      await deleteObject(inputKey).catch(() => {});
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    const ocrResolution = resolveOcrIngressSettings(toolId, settings, { requestedSettings });
    if (!ocrResolution.ok) {
      await deleteObject(inputKey).catch(() => {});
      const bundleId = TOOL_OPTIONAL_BUNDLE_MAP[toolId];
      const bundle = getOptionalBundleForTool(toolId);
      return reply.status(501).send({
        error:
          ocrResolution.code === "FEATURE_INCOMPATIBLE"
            ? "Feature incompatible"
            : "Feature not installed",
        code: ocrResolution.code,
        feature: bundleId,
        featureName: bundle?.name ?? toolId,
        estimatedSize: bundle?.estimatedSize ?? "unknown",
        requestedQuality: ocrResolution.requestedQuality,
        compatibilityReason: ocrResolution.reason,
        ...(ocrResolution.guidance && { guidance: ocrResolution.guidance }),
      });
    }
    settings = ocrResolution.settings as OcrSettings;
    const quality = settings.quality as "fast" | "balanced" | "best";

    const { engine: _legacyEngine, ...normalizedSettings } = settings;
    try {
      await enqueueToolJob({
        jobId,
        toolId,
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings: { ...normalizedSettings, quality },
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        saveMode,
        kind: "ai-tool",
        analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
      });
    } catch (err) {
      await deleteObject(inputKey).catch(() => {});
      request.log.error({ err, toolId, jobId }, "Failed to enqueue OCR");
      return reply.status(503).send({
        error: "Failed to queue OCR",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
  });
}
