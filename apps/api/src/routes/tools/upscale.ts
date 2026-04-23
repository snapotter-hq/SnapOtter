import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { upscale } from "@ashim/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  scale: z.union([z.number(), z.string()]).transform(Number).default(2),
  model: z.string().default("auto"),
  faceEnhance: z.boolean().default(false),
  denoise: z.union([z.number(), z.string()]).transform(Number).default(0),
  format: z.string().default("png"),
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
          filename = basename(part.filename ?? "image");
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          clientJobId = part.value as string;
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

    try {
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
      const format = settings.format;
      const outputQuality = settings.quality;
      request.log.info(
        { toolId: "upscale", imageSize: fileBuffer.length, scale, model, format },
        "Starting upscale",
      );

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

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      // Save input
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, fileBuffer);

      // Determine which format the Python sidecar should produce.
      // Formats that need Node.js-side conversion (HEIC/HEIF via heif-enc,
      // AVIF via Sharp) are produced as PNG first, then converted below.
      const needsNodeConversion = ["heic", "heif", "avif"].includes(format);
      const pythonFormat = needsNodeConversion ? "png" : format;

      // Process
      const jobIdForProgress = clientJobId;
      const onProgress = jobIdForProgress
        ? (percent: number, stage: string) => {
            updateSingleFileProgress({
              jobId: jobIdForProgress,
              phase: "processing",
              stage,
              percent,
            });
          }
        : undefined;

      const result = await upscale(
        fileBuffer,
        join(workspacePath, "output"),
        { scale, model, faceEnhance, denoise, format: pythonFormat, quality: outputQuality },
        onProgress,
      );

      // Convert to final format if needed (HEIC/HEIF/AVIF)
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

      // Save output with correct extension for the chosen format
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

      // Generate browser-compatible preview for non-previewable formats
      const BROWSER_PREVIEWABLE = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
      let previewUrl: string | undefined;
      if (!BROWSER_PREVIEWABLE.has(finalFormat)) {
        try {
          // For HEIC/HEIF, decode first since Sharp can't read HEVC
          const previewInput =
            finalFormat === "heic" || finalFormat === "heif"
              ? await decodeHeic(outputBuffer)
              : outputBuffer;
          const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal - frontend will show fallback
        }
      }

      if (clientJobId) {
        updateSingleFileProgress({
          jobId: clientJobId,
          phase: "complete",
          percent: 100,
        });
      }

      if (model !== "auto" && result.method !== model) {
        request.log.warn(
          { toolId: "upscale", requested: model, actual: result.method },
          `Upscale model mismatch: requested ${model} but used ${result.method}`,
        );
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
        previewUrl,
        originalSize: fileBuffer.length,
        processedSize: outputBuffer.length,
        width: result.width,
        height: result.height,
        method: result.method,
      });
    } catch (err) {
      request.log.error({ err, toolId: "upscale" }, "Upscaling failed");
      return reply.status(422).send({
        error: "Upscaling failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
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
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_${scale}x.png`;
      return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
