import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeBackground } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const TOOL_ID = "transparency-fixer";
const DEFAULT_MODEL = "birefnet-hr-matting";
const FALLBACK_MODEL = "birefnet-general";

const settingsSchema = z.object({
  defringe: z.number().min(0).max(100).optional().default(30),
  outputFormat: z.enum(["png", "webp"]).optional().default("png"),
});

/**
 * Sharp-based defringe post-processing.
 *
 * Removes semi-transparent fringe pixels that rembg sometimes leaves around
 * hair, fur, and fine edges. Works by blurring the alpha channel and zeroing
 * out pixels whose alpha falls below a computed threshold.
 */
async function applyDefringe(buffer: Buffer, intensity: number): Promise<Buffer> {
  if (intensity <= 0) return buffer;

  const img = sharp(buffer);
  const { width, height, channels } = await img.metadata();
  if (!width || !height || channels !== 4) return buffer;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;

  // Extract alpha channel
  const alpha = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  // Blur the alpha channel
  const blurRadius = Math.max(0.3, Math.round(intensity / 20));
  const blurredAlphaRaw = await sharp(alpha, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .blur(blurRadius)
    .raw()
    .toBuffer();

  // Threshold: zero out fringe pixels
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

/**
 * Run transparency fix: rembg matting -> defringe -> output format.
 */
async function processTransparencyFix(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  outputDir: string,
  onProgress?: (percent: number, stage: string) => void,
): Promise<Buffer> {
  let resultBuffer: Buffer;

  try {
    resultBuffer = await removeBackground(
      inputBuffer,
      outputDir,
      { model: DEFAULT_MODEL },
      onProgress,
    );
  } catch (err) {
    const isOom = err instanceof Error && err.message.includes("out of memory");
    if (!isOom) throw err;

    // removeBackground has its own internal u2net fallback on OOM.
    // This route-level fallback provides an intermediate quality step
    // (birefnet-general) before that kicks in on a second OOM.
    onProgress?.(5, `Retrying with fallback model (${FALLBACK_MODEL})`);
    resultBuffer = await removeBackground(
      inputBuffer,
      outputDir,
      { model: FALLBACK_MODEL },
      onProgress,
    );
  }

  // Apply defringe post-processing
  resultBuffer = await applyDefringe(resultBuffer, settings.defringe);

  // Convert to output format if requested
  if (settings.outputFormat === "webp") {
    resultBuffer = await sharp(resultBuffer).webp({ lossless: true }).toBuffer();
  }

  return resultBuffer;
}

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

      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            fileBuffer = Buffer.concat(chunks);
            filename = sanitizeFilename(part.filename ?? "image");
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            const raw = part.value as string;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
              clientJobId = raw;
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

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
        // Decode HEIC/HEIF before processing
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        // Auto-orient to fix EXIF rotation
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: TOOL_ID }, "Input decoding failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const originalSize = fileBuffer.length;
      const jobId = randomUUID();
      const progressJobId = clientJobId || jobId;
      let workspacePath: string;
      try {
        workspacePath = await createWorkspace(jobId);
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: TOOL_ID }, "Workspace creation failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const log = request.log;
      log.info(
        { toolId: TOOL_ID, imageSize: originalSize, model: DEFAULT_MODEL },
        "Starting transparency fix",
      );

      // Reply immediately so the HTTP connection closes within proxy timeout limits.
      // The result will be delivered via the SSE progress channel.
      reply.status(202).send({ jobId: progressJobId, async: true });

      const onProgress = (percent: number, stage: string) => {
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "processing",
          stage,
          percent: Math.min(percent, 95),
        });
      };

      const outputExt = settings.outputFormat === "webp" ? "webp" : "png";

      // Fire-and-forget: processing happens after the response is sent
      (async () => {
        const resultBuffer = await processTransparencyFix(
          fileBuffer,
          settings,
          join(workspacePath, "output"),
          onProgress,
        );

        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
        await writeFile(join(workspacePath, "output", outputFilename), resultBuffer);

        const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;

        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "complete",
          percent: 100,
          result: {
            jobId,
            downloadUrl,
            originalSize,
            processedSize: resultBuffer.length,
            filename,
          },
        });

        log.info({ toolId: TOOL_ID, jobId, downloadUrl }, "Transparency fix complete");
      })().catch((err) => {
        log.error({ err, toolId: TOOL_ID }, "Transparency fix failed");
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: err instanceof Error ? err.message : "Transparency fix failed",
        });
      });
    },
  );

  // Pipeline/batch registry
  registerToolProcessFn({
    toolId: TOOL_ID,
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      const resultBuffer = await processTransparencyFix(
        orientedBuffer,
        s,
        join(workspacePath, "output"),
      );

      const outputExt = s.outputFormat === "webp" ? "webp" : "png";
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
      const contentType = outputExt === "webp" ? "image/webp" : "image/png";
      return { buffer: resultBuffer, filename: outputFilename, contentType };
    },
  });
}
