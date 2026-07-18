import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { extractPdfText, getOcrRuntimeCapability } from "@snapotter/ai";
import { getOptionalBundleForTool, TOOL_OPTIONAL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { registerAiPathJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { copyObjectToFile, deleteObject } from "../../lib/object-storage.js";
import { resolveOcrIngressSettings } from "../../lib/ocr-capability.js";
import {
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrEncodedInputLimit,
} from "../../lib/ocr-limits.js";
import { withRouteScratch } from "../../lib/route-scratch.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { InputValidationError } from "../../modality/contract.js";
import { validatePdfPath } from "../../modality/document-input.js";
import { requireToolAccess } from "../../permissions.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.enum(["fast", "balanced", "best"]).optional(),
  language: z.enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko"]).default("auto"),
  pages: z.string().max(100).default("all"),
  enhance: z.boolean().optional(),
  // Backward compat with the image OCR contract.
  engine: z.enum(["tesseract", "paddleocr"]).optional(),
});

type OcrPdfSettings = z.infer<typeof settingsSchema>;

function resolveWorkerQuality(settings: OcrPdfSettings): "fast" | "balanced" | "best" {
  const quality =
    settings.quality ??
    (settings.engine ? (settings.engine === "tesseract" ? "fast" : "balanced") : undefined);
  if (quality) return quality;
  const capability = getOcrRuntimeCapability();
  return capability.available && capability.qualities.includes("best") ? "best" : "fast";
}

// -- AI job handler (runs inside the BullMQ worker) --
registerAiPathJobHandler("ocr-pdf", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);
  const quality = resolveWorkerQuality(settings);

  if (quality !== "fast") {
    const capability = getOcrRuntimeCapability();
    if (!capability.available || !capability.qualities.includes(quality)) {
      throw new Error(`OCR ${quality} runtime is no longer available`);
    }
  }

  ctx.report(5, "Preparing PDF");
  ctx.signal.throwIfAborted();
  await validatePdfPath(input.path, {
    rejectPasswordProtected: true,
    signal: ctx.signal,
  });

  ctx.report(10, "Extracting text from PDF");

  const result = await extractPdfText(
    input.path,
    {
      quality,
      language: settings.language,
      pages: settings.pages,
      enhance: settings.enhance ?? quality === "best",
      signal: ctx.signal,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  const base = data.filename.replace(/\.[^.]+$/, "");
  const outName = `${base}_ocr.txt`;

  if (result.requestedQuality !== quality || result.actualQuality !== quality) {
    throw new Error(
      `OCR runtime tier mismatch: requested ${quality}, reported ${result.requestedQuality}/${result.actualQuality}`,
    );
  }

  return {
    buffer: Buffer.from(result.text, "utf-8"),
    filename: outName,
    contentType: "text/plain",
    resultPayload: {
      pages: result.pages,
      engine: result.engine,
      requestedQuality: result.requestedQuality,
      actualQuality: result.actualQuality,
      device: result.device,
      provider: result.provider,
      degraded: result.degraded,
      warnings: result.warnings,
      runtimeVersion: result.runtimeVersion,
      modelVersion: result.modelVersion,
    },
  };
});

registerToolProcessFn({
  toolId: "ocr-pdf",
  settingsSchema,
  process: async () => {
    throw new Error("OCR PDF requires the path-backed worker input contract");
  },
});

export function registerOcrPdf(app: FastifyInstance) {
  app.post("/api/v1/tools/pdf/ocr-pdf", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "ocr-pdf";
    const authUser = await requireToolAccess(request, reply, toolId);
    if (!authUser) return;
    const userId = authUser.id;
    const jobId = randomUUID();
    let filename = "document.pdf";
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;
    let fileId: string | null = null;
    let saveModeRaw: string | null = null;
    let inputKey: string | null = null;
    const ingressAbort = new AbortController();
    const abortIngress = () => ingressAbort.abort();
    request.raw.once("aborted", abortIngress);
    if (request.raw.aborted) ingressAbort.abort();

    try {
      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            if (inputKey) throw new Error("Only one PDF file may be uploaded");
            const upload = await receiveUpload(part, jobId, {
              maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
              signal: ingressAbort.signal,
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
        return reply.status(400).send({ error: "No PDF file provided" });
      }
      const uploadedInputKey = inputKey;

      let settings: z.infer<typeof settingsSchema>;
      let requestedSettings: unknown;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        requestedSettings = parsed;
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          await deleteObject(uploadedInputKey).catch(() => {});
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(result.error.issues),
          });
        }
        settings = result.data;
      } catch {
        await deleteObject(uploadedInputKey).catch(() => {});
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      const ocrResolution = resolveOcrIngressSettings(toolId, settings, { requestedSettings });
      if (!ocrResolution.ok) {
        await deleteObject(uploadedInputKey).catch(() => {});
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
      settings = ocrResolution.settings as z.infer<typeof settingsSchema>;
      const quality = settings.quality as "fast" | "balanced" | "best";

      try {
        await withRouteScratch("ocr-pdf-validation", async (validationScratch) => {
          const validationPath = join(validationScratch, "input.pdf");
          await copyObjectToFile(uploadedInputKey, validationPath, {
            maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
            signal: ingressAbort.signal,
          });
          await validatePdfPath(validationPath, {
            rejectPasswordProtected: true,
            signal: ingressAbort.signal,
          });
        });
      } catch (err) {
        await deleteObject(uploadedInputKey).catch(() => {});
        if (err instanceof InputValidationError) {
          return reply.status(err.statusCode).send({
            error: err.message,
            ...(err.details && { details: err.details }),
          });
        }
        const statusCode = ocrUploadErrorStatus(err);
        if (statusCode === 413 || statusCode === 503) {
          return reply.status(statusCode).send({
            error: ocrUploadErrorMessage(statusCode),
            details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
          });
        }
        throw err;
      }

      const { engine: _legacyEngine, ...normalizedSettings } = settings;
      try {
        ingressAbort.signal.throwIfAborted();
        await enqueueToolJob({
          jobId,
          toolId,
          userId,
          pool: "ai",
          inputRefs: [uploadedInputKey],
          filename,
          settings: { ...normalizedSettings, quality },
          clientJobId: clientJobId ?? undefined,
          fileId: fileId ?? undefined,
          saveMode,
          kind: "ai-tool",
        });
      } catch (err) {
        await deleteObject(uploadedInputKey).catch(() => {});
        request.log.error({ err, toolId, jobId }, "Failed to enqueue PDF OCR");
        return reply.status(503).send({
          error: "Failed to queue PDF OCR",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    } finally {
      request.raw.removeListener("aborted", abortIngress);
    }
  });
}
