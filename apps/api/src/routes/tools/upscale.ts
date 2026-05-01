import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { upscale } from "@snapotter/ai";
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
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  scale: z.union([z.number(), z.string()]).transform(Number).default(2),
  model: z.string().default("auto"),
  faceEnhance: z.boolean().default(false),
  denoise: z.union([z.number(), z.string()]).transform(Number).default(0),
  format: z.string().default("auto"),
  quality: z.union([z.number(), z.string()]).transform(Number).default(95),
});

/**
 * AI image upscaling route.
 * Uses Real-ESRGAN when available, falls back to Lanczos.
 */
export function registerUpscale(app: FastifyInstance) {
  app.post("/api/v1/tools/upscale", async (request: FastifyRequest, reply: FastifyReply) => {
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

    let fileBuffer: Buffer | null = null;
    let filename = "image";
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
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

    const scale = settings.scale;
    const model = settings.model;
    const faceEnhance = settings.faceEnhance;
    const denoise = settings.denoise;
    let format = settings.format;
    const outputQuality = settings.quality;

    try {
      if (format === "auto") {
        const detected = await resolveOutputFormat(fileBuffer, filename);
        format = detected.format === "jpeg" ? "jpg" : detected.format;
      }

      // Decode HEIC/HEIF input via system decoder
      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }

      // Auto-orient to fix EXIF rotation before upscaling
      fileBuffer = await autoOrient(fileBuffer);
    } catch (err) {
      request.log.error({ err, toolId: "upscale" }, "Input decoding failed");
      return reply.status(422).send({
        error: "Upscaling failed",
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
      request.log.error({ err, toolId: "upscale" }, "Workspace creation failed");
      return reply.status(422).send({
        error: "Upscaling failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }

    const log = request.log;
    log.info(
      { toolId: "upscale", imageSize: originalSize, scale, model, format },
      "Starting upscale",
    );

    // Reply immediately so the HTTP connection closes within proxy timeout limits.
    // The result will be delivered via the SSE progress channel.
    reply.status(202).send({ jobId: progressJobId, async: true });

    const needsNodeConversion = ["heic", "heif", "avif"].includes(format);
    const pythonFormat = needsNodeConversion ? "png" : format;

    const onProgress = (percent: number, stage: string) => {
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "processing",
        stage,
        percent,
      });
    };

    // Fire-and-forget: processing happens after the response is sent
    (async () => {
      const result = await upscale(
        fileBuffer,
        join(workspacePath, "output"),
        { scale, model, faceEnhance, denoise, format: pythonFormat, quality: outputQuality },
        onProgress,
      );

      let outputBuffer = result.buffer;
      let finalFormat = result.format;
      if (needsNodeConversion) {
        if (format === "heic" || format === "heif") {
          outputBuffer = await encodeHeic(result.buffer, outputQuality);
          finalFormat = format;
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
      };
      const ext = EXT_MAP[finalFormat] || "png";
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_${scale}x.${ext}`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, outputBuffer);

      const BROWSER_PREVIEWABLE = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
      let previewUrl: string | undefined;
      if (!BROWSER_PREVIEWABLE.has(finalFormat)) {
        try {
          const previewInput =
            finalFormat === "heic" || finalFormat === "heif"
              ? await decodeHeic(outputBuffer)
              : outputBuffer;
          const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal
        }
      }

      if (model !== "auto" && result.method !== model) {
        log.warn(
          { toolId: "upscale", requested: model, actual: result.method },
          `Upscale model mismatch: requested ${model} but used ${result.method}`,
        );
      }

      const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "complete",
        percent: 100,
        result: {
          jobId,
          downloadUrl,
          previewUrl,
          originalSize,
          processedSize: outputBuffer.length,
          width: result.width,
          height: result.height,
          method: result.method,
        },
      });

      log.info({ toolId: "upscale", jobId, downloadUrl }, "Upscale complete");
    })().catch((err) => {
      log.error({ err, toolId: "upscale" }, "Upscaling failed");
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "failed",
        percent: 0,
        error: err instanceof Error ? err.message : "Upscale failed",
      });
    });
  });

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "upscale",
    settingsSchema: z.object({
      scale: z.union([z.number(), z.string()]).transform(Number).default(2),
    }),
    process: async (inputBuffer, settings, filename) => {
      const scale = Number((settings as { scale?: number }).scale) || 2;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await upscale(orientedBuffer, join(workspacePath, "output"), { scale });
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
    },
  });
}
