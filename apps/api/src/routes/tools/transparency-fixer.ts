import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeBackground } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { registerToolProcessFn } from "../tool-factory.js";

const TOOL_ID = "transparency-fixer";
const DEFAULT_MODEL = "birefnet-hr-matting";
const FALLBACK_MODEL = "birefnet-general";

const settingsSchema = z.object({
  defringe: z.number().min(0).max(100).optional().default(30),
  outputFormat: z.enum(["png", "webp"]).optional().default("png"),
  removeWatermark: z.boolean().optional().default(false),
});

/**
 * Sharp-based defringe post-processing.
 */
async function applyDefringe(buffer: Buffer, intensity: number): Promise<Buffer> {
  if (intensity <= 0) return buffer;

  const img = sharp(buffer);
  const { width, height, channels } = await img.metadata();
  if (!width || !height || channels !== 4) return buffer;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;

  const alpha = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const blurRadius = Math.max(0.3, Math.round(intensity / 20));
  const blurredAlphaRaw = await sharp(alpha, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .blur(blurRadius)
    .raw()
    .toBuffer();

  const threshold = Math.round(128 + (intensity / 100) * 80);
  const result = Buffer.from(data);
  for (let i = 0; i < pixelCount; i++) {
    if (alpha[i] > 0 && blurredAlphaRaw[i] < threshold) {
      result[i * 4] = 0;
      result[i * 4 + 1] = 0;
      result[i * 4 + 2] = 0;
      result[i * 4 + 3] = 0;
    }
  }

  return sharp(result, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function removeWatermarkMedian(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).median(5).toBuffer();
}

/**
 * Run transparency fix: rembg matting -> defringe -> output format.
 */
async function processTransparencyFix(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  outputDir: string,
  onProgress?: (percent: number, stage: string) => void,
): Promise<Buffer> {
  let workingBuffer = inputBuffer;

  if (settings.removeWatermark) {
    onProgress?.(2, "Removing watermark...");
    workingBuffer = await removeWatermarkMedian(workingBuffer);
  }

  let resultBuffer: Buffer;

  try {
    resultBuffer = await removeBackground(
      workingBuffer,
      outputDir,
      { model: DEFAULT_MODEL },
      onProgress,
    );
  } catch (err) {
    const isOom = err instanceof Error && err.message.includes("out of memory");
    if (!isOom) throw err;

    onProgress?.(5, `Retrying with fallback model (${FALLBACK_MODEL})`);
    resultBuffer = await removeBackground(
      workingBuffer,
      outputDir,
      { model: FALLBACK_MODEL },
      onProgress,
    );
  }

  resultBuffer = await applyDefringe(resultBuffer, settings.defringe);

  if (settings.outputFormat === "webp") {
    resultBuffer = await sharp(resultBuffer).webp({ lossless: true }).toBuffer();
  }

  return resultBuffer;
}

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler("transparency-fixer", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  const resultBuffer = await processTransparencyFix(
    input,
    settings,
    ctx.scratchDir,
    (percent, stage) => ctx.report(Math.min(percent, 95), stage),
  );

  const outputExt = settings.outputFormat === "webp" ? "webp" : "png";
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
  const contentType = outputExt === "webp" ? "image/webp" : "image/png";

  return {
    buffer: resultBuffer,
    filename: outputFilename,
    contentType,
    resultPayload: {
      filename: data.filename,
    },
  };
});

export function registerTransparencyFixer(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/transparency-fixer",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isToolInstalled(TOOL_ID)) {
        const bundle = getBundleForTool(TOOL_ID);
        return reply.status(501).send({
          error: "Feature not installed",
          code: "FEATURE_NOT_INSTALLED",
          feature: TOOL_BUNDLE_MAP[TOOL_ID],
          featureName: bundle?.name ?? TOOL_ID,
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
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      fileBuffer = await getObjectBuffer(inputKey);

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
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
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: TOOL_ID }, "Input decoding failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }

      const decodedKey = `uploads/${jobId}/${filename}`;
      if (decodedKey !== inputKey) {
        await putObject(decodedKey, fileBuffer);
        inputKey = decodedKey;
      } else {
        await putObject(inputKey, fileBuffer);
      }

      const progressJobId = clientJobId || jobId;

      await enqueueToolJob({
        jobId,
        toolId: TOOL_ID,
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings,
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        kind: "ai-tool",
      });

      return reply.status(202).send({ jobId: progressJobId, async: true });
    },
  );

  // Pipeline/batch registry
  registerToolProcessFn({
    toolId: TOOL_ID,
    settingsSchema,
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const resultBuffer = await processTransparencyFix(orientedBuffer, s, scratchDir);

        const outputExt = s.outputFormat === "webp" ? "webp" : "png";
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
        const contentType = outputExt === "webp" ? "image/webp" : "image/png";
        return { buffer: resultBuffer, filename: outputFilename, contentType };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
