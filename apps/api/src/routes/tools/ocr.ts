import { randomUUID } from "node:crypto";
import {
  extractText,
  getOcrRuntimeCapability,
  MAX_OCR_INPUT_DIMENSION,
  MAX_OCR_INPUT_PIXELS,
  MAX_OCR_OUTPUT_BYTES,
  MAX_PDF_OCR_PAGES,
  type OcrResult,
} from "@snapotter/ai";
import {
  getOptionalBundleForTool,
  SafeError,
  TOOL_OPTIONAL_BUNDLE_MAP,
  ToolInputError,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../../config.js";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, insertToolJobAlias } from "../../jobs/enqueue.js";
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  INVALID_SAVE_MODE_ERROR,
  parseClientJobIdField,
  parseSaveModeField,
  type ToolJobData,
} from "../../jobs/types.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { asDecoderOutOfMemory, DecoderOutOfMemoryError } from "../../lib/format-decoders.js";
import { asInputErrorIfUndecodable } from "../../lib/image-error.js";
import { trackClientDisconnect } from "../../lib/ingress-disconnect.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { deleteObject } from "../../lib/object-storage.js";
import { ocrRuntimeUnavailable, resolveOcrIngressSettings } from "../../lib/ocr-capability.js";
import {
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrEncodedInputLimit,
} from "../../lib/ocr-limits.js";
import { hasPersistedJobRow, settleUnenqueuedAlias } from "../../lib/upload-cleanup.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { requireToolAccess } from "../../permissions.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.enum(["fast", "balanced", "best"]).optional(),
  language: z.enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko", "ar"]).default("auto"),
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

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

/**
 * Page count of a multi-page TIFF, or 1 for anything else.
 *
 * Sharp decodes page 1 of a TIFF unless told otherwise, so OCR on a scanned
 * multi-page TIFF used to return page 1's text and say nothing about the rest
 * (#4364). An unreadable header counts as one page: extractText decodes the
 * same buffer next and reports its own error.
 */
async function countTiffPages(buffer: Buffer): Promise<number> {
  try {
    const meta = await sharp(buffer).metadata();
    return meta.format === "tiff" ? (meta.pages ?? 1) : 1;
  } catch (err) {
    const oom = asDecoderOutOfMemory(err);
    if (oom instanceof DecoderOutOfMemoryError) throw oom;
    return 1;
  }
}

/**
 * One TIFF page as an upright PNG. The input handler checked page 1's size
 * only, and TIFF pages can each have their own, so every page gets the same
 * safety limits before OCR allocates for it.
 */
async function renderTiffPage(buffer: Buffer, page: number): Promise<Buffer> {
  const handle = sharp(buffer, { page, limitInputPixels: MAX_OCR_INPUT_PIXELS });
  const { width = 0, height = 0 } = await handle.metadata();
  if (width > MAX_OCR_INPUT_DIMENSION || height > MAX_OCR_INPUT_DIMENSION) {
    throw new ToolInputError(
      `Page ${page + 1} exceeds the ${MAX_OCR_INPUT_DIMENSION.toLocaleString("en-US")} pixel dimension safety limit (${width.toLocaleString("en-US")}x${height.toLocaleString("en-US")})`,
      { code: "IMAGE_TOO_LARGE" },
    );
  }
  return await handle.rotate().png().toBuffer();
}

/**
 * OCR every page of a multi-page TIFF, framed the way ocr-pdf frames PDF
 * pages. The page budget and the aggregate output cap are the PDF tool's and
 * the single-image tool's, so a TIFF can't fan out further than either.
 */
async function extractTiffPages(
  buffer: Buffer,
  pageCount: number,
  options: Parameters<typeof extractText>[2],
  ctx: {
    scratchDir: string;
    signal: AbortSignal;
    report: (percent: number, stage?: string) => void;
  },
): Promise<OcrResult> {
  const pagesToRead = Math.min(pageCount, MAX_PDF_OCR_PAGES);
  const share = 90 / pagesToRead;
  const pageTexts: string[] = [];
  const warnings = new Set<string>();
  let first: OcrResult | undefined;
  let degraded = false;
  let outputBytes = 0;

  for (let page = 0; page < pagesToRead; page++) {
    ctx.signal.throwIfAborted();
    const pageStart = 10 + share * page;
    let pageResult: OcrResult;
    try {
      const pageBuffer = await renderTiffPage(buffer, page);
      pageResult = await extractText(pageBuffer, ctx.scratchDir, options, (percent, stage) =>
        ctx.report(pageStart + (clampPercent(percent) / 100) * share, stage),
      );
    } catch (err) {
      throw await asInputErrorIfUndecodable(buffer, err);
    }

    const pageText = `${pageTexts.length === 0 ? "" : "\n\n"}--- Page ${page + 1} ---\n\n${pageResult.text.trim()}`;
    outputBytes += Buffer.byteLength(pageText, "utf8");
    if (outputBytes > MAX_OCR_OUTPUT_BYTES) {
      throw new SafeError(
        `OCR output exceeds the ${MAX_OCR_OUTPUT_BYTES.toLocaleString("en-US")} byte safety limit`,
        { kind: "operational", code: "OCR_OUTPUT_TOO_LARGE", statusCode: 500 },
      );
    }
    pageTexts.push(pageText);
    first ??= pageResult;
    degraded ||= pageResult.degraded;
    for (const warning of pageResult.warnings) warnings.add(warning);
  }

  if (pageCount > pagesToRead) {
    warnings.add(`Only the first ${pagesToRead} of ${pageCount} pages were read.`);
  }
  // pagesToRead is at least 2 here, so the loop assigned first.
  return {
    ...(first as OcrResult),
    text: pageTexts.join(""),
    degraded,
    warnings: [...warnings],
  };
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
      throw ocrRuntimeUnavailable(quality);
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

  const ocrOptions = {
    quality,
    language: settings.language,
    enhance: settings.enhance ?? quality === "best",
    signal: ctx.signal,
  };
  const pageCount = await countTiffPages(prepared.buffer);
  let result: OcrResult;
  if (pageCount > 1) {
    result = await extractTiffPages(prepared.buffer, pageCount, ocrOptions, ctx);
  } else {
    try {
      result = await extractText(prepared.buffer, ctx.scratchDir, ocrOptions, (percent, stage) =>
        ctx.report(10 + clampPercent(percent) * 0.9, stage),
      );
    } catch (err) {
      throw await asInputErrorIfUndecodable(prepared.buffer, err);
    }
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
      resultPayload: result.resultPayload,
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
    if (!authUser) return reply;
    const userId = authUser.id;
    const jobId = randomUUID();
    let filename = "image";
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;
    let clientJobIdRaw: string | null = null;
    let fileId: string | null = null;
    let saveModeRaw: string | null = null;
    let inputKey: string | null = null;
    let enqueued = false;
    let aliasStamped = false;
    const disconnect = trackClientDisconnect(request, reply);
    const discardUpload = (key: string) =>
      deleteObject(key).catch((err) => {
        request.log.warn?.({ err, jobId, key }, "Failed to delete rejected upload");
      });

    try {
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
            clientJobIdRaw = part.value as string;
          } else if (part.fieldname === "fileId") {
            fileId = part.value as string;
          } else if (part.fieldname === "saveMode") {
            saveModeRaw = part.value as string;
          }
        }
      } catch (err) {
        if (inputKey) await discardUpload(inputKey);
        const statusCode = ocrUploadErrorStatus(err);
        if (statusCode === 413) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        }
        return reply.status(statusCode).send({
          error: ocrUploadErrorMessage(statusCode),
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      const clientJobIdField = parseClientJobIdField(clientJobIdRaw);
      if (clientJobIdField === null) {
        if (inputKey) await discardUpload(inputKey);
        return reply.status(400).send({ error: INVALID_CLIENT_JOB_ID_ERROR });
      }
      clientJobId = clientJobIdField ?? null;

      // Stamp the client-facing alias before any pre-enqueue work (#892): a
      // cancel landing between parse and enqueueToolJob needs a durable pointer
      // to resolve. Insert-only; enqueueToolJob re-points it at enqueue (#886).
      if (clientJobId && clientJobId !== jobId) {
        try {
          aliasStamped =
            (await insertToolJobAlias({ jobId, clientJobId, userId, pool: "ai" })) !== false;
        } catch (err) {
          if (inputKey) await discardUpload(inputKey);
          throw err;
        }
      }

      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        if (inputKey) await discardUpload(inputKey);
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
          await discardUpload(inputKey);
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(result.error.issues),
          });
        }
        settings = result.data;
      } catch {
        await discardUpload(inputKey);
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      const ocrResolution = resolveOcrIngressSettings(toolId, settings, { requestedSettings });
      if (!ocrResolution.ok) {
        await discardUpload(inputKey);
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

      if (disconnect.clientGone()) {
        await disconnect.settleAbandoned({
          jobId,
          clientJobId,
          uploadKeys: [inputKey],
          log: request.log,
        });
        aliasStamped = false;
        return;
      }

      enqueued = true;
      const { engine: _legacyEngine, ...normalizedSettings } = settings;
      const jobData: ToolJobData = {
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
      };
      try {
        await enqueueToolJob(jobData);
        clientJobId = jobData.clientJobId ?? null;
      } catch (err) {
        const jobPersisted = await hasPersistedJobRow(jobId, request.log);
        if (!jobPersisted) {
          enqueued = false;
        }
        if (disconnect.clientGone()) {
          await disconnect.settleAbandoned({
            jobId,
            clientJobId,
            uploadKeys: jobPersisted ? [] : [inputKey],
            log: request.log,
          });
          aliasStamped = false;
          return;
        }
        if (!jobPersisted) {
          await discardUpload(inputKey);
        }
        if ((err as { statusCode?: number } | null)?.statusCode === 429) {
          throw err;
        }
        request.log.error({ err, toolId, jobId }, "Failed to enqueue OCR");
        return reply.status(503).send({
          error: "Failed to queue OCR",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      if (await disconnect.armCancelAfterEnqueue(jobId, request.log)) {
        return;
      }

      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    } finally {
      disconnect.release();
      if (!enqueued && aliasStamped) {
        await settleUnenqueuedAlias(jobId, clientJobId, request.log);
      }
    }
  });
}
