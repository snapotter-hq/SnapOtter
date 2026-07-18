import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upscale } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  scale: z.union([z.number(), z.string()]).transform(Number).default(2),
  model: z.string().default("auto"),
  faceEnhance: z.boolean().default(false),
  denoise: z.union([z.number(), z.string()]).transform(Number).default(0),
  format: z.string().default("auto"),
  quality: z.union([z.number(), z.string()]).transform(Number).default(95),
});

// ── AI job handler (runs inside the BullMQ worker) ────────────────
registerAiJobHandler("upscale", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);
  const scale = settings.scale;
  const model = settings.model;
  const faceEnhance = settings.faceEnhance;
  const denoise = settings.denoise;
  let format = settings.format;
  const outputQuality = settings.quality;

  if (format === "auto") {
    const detected = await resolveOutputFormat(input, data.filename);
    format = detected.format === "jpeg" ? "jpg" : detected.format;
  }

  const needsNodeConversion = ["heic", "heif", "avif", "jxl"].includes(format);
  const pythonFormat = needsNodeConversion ? "png" : format;

  const result = await upscale(
    input,
    ctx.scratchDir,
    { scale, model, faceEnhance, denoise, format: pythonFormat, quality: outputQuality },
    (percent, stage) => ctx.report(percent, stage),
  );

  let outputBuffer = result.buffer;
  let finalFormat = result.format;
  if (needsNodeConversion) {
    if (format === "heic" || format === "heif") {
      outputBuffer = await encodeHeic(result.buffer, outputQuality);
      finalFormat = format;
    } else if (format === "jxl") {
      outputBuffer = await encodeJxl(result.buffer, outputQuality);
      finalFormat = "jxl";
    } else if (format === "avif") {
      outputBuffer = await sharp(result.buffer).avif({ quality: outputQuality }).toBuffer();
      finalFormat = "avif";
    }
  }

  const EXT_MAP: Record<string, string> = {
    jpeg: "jpg",
    jpg: "jpg",
    png: "png",
    webp: "webp",
    tiff: "tiff",
    gif: "gif",
    avif: "avif",
    heic: "heic",
    heif: "heif",
    jxl: "jxl",
  };
  const ext = EXT_MAP[finalFormat] || "png";
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_${scale}x.${ext}`;

  const CONTENT_TYPES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    tiff: "image/tiff",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    jxl: "image/jxl",
  };

  return {
    buffer: outputBuffer,
    filename: outputFilename,
    contentType: CONTENT_TYPES[finalFormat] || "image/png",
    resultPayload: {
      width: result.width,
      height: result.height,
      method: result.method,
    },
  };
});

/**
 * AI image upscaling route.
 * Uses Real-ESRGAN when available, falls back to Lanczos.
 */
export function registerUpscale(app: FastifyInstance) {
  app.post("/api/v1/tools/image/upscale", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "upscale";
    if (!isToolInstalled(toolId)) {
      const bundle = getBundleForTool(toolId);
      return reply.status(501).send({
        error: "Feature not installed",
        code: "FEATURE_NOT_INSTALLED",
        feature: TOOL_BUNDLE_MAP[toolId],
        featureName: bundle?.name ?? toolId,
        estimatedSize: bundle?.estimatedSize ?? "unknown",
      });
    }

    const userId = getAuthUser(request)?.id ?? null;
    const jobId = randomUUID();
    let fileBuffer: Buffer | null = null;
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
          const upload = await receiveUpload(part, jobId);
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
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    const saveMode = parseSaveModeField(saveModeRaw);
    if (saveMode === null) {
      return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
    }

    if (!inputKey) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    fileBuffer = await getObjectBuffer(inputKey);

    const validation = await validateImageBuffer(fileBuffer, filename);
    if (!validation.valid) {
      // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
      return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
    }

    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    try {
      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }
      fileBuffer = await autoOrient(fileBuffer);
    } catch (err) {
      request.log.error({ err, toolId: "upscale" }, "Input decoding failed");
      return reply.status(422).send({
        error: "Upscaling failed",
        details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
      });
    }

    // Write decoded input for the worker
    const decodedKey = `uploads/${jobId}/${filename}`;
    if (decodedKey !== inputKey) {
      await putObject(decodedKey, fileBuffer);
      inputKey = decodedKey;
    } else {
      await putObject(inputKey, fileBuffer);
    }

    await enqueueToolJob({
      jobId,
      toolId,
      userId,
      pool: "ai",
      inputRefs: [inputKey],
      filename,
      settings,
      clientJobId: clientJobId ?? undefined,
      fileId: fileId ?? undefined,
      saveMode,
      kind: "ai-tool",
    });

    return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
  });

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "upscale",
    settingsSchema: z.object({
      scale: z.union([z.number(), z.string()]).transform(Number).default(2),
    }),
    process: async (inputBuffer, settings, filename, ctx) => {
      const scale = Number((settings as { scale?: number }).scale) || 2;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const result = await upscale(orientedBuffer, scratchDir, { scale });
        const outputFormat = await resolveOutputFormat(inputBuffer, filename);
        let outputBuffer = result.buffer;
        if (outputFormat.format !== "png") {
          outputBuffer = await sharp(result.buffer)
            .toFormat(outputFormat.format, { quality: outputFormat.quality })
            .toBuffer();
        }
        const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_${scale}x.${ext}`;
        return {
          buffer: outputBuffer,
          filename: outputFilename,
          contentType: outputFormat.contentType,
        };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
