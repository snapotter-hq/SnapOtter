import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { restorePhoto } from "@ashim/ai";
import { getBundleForTool } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["auto", "light", "heavy"]).default("auto"),
  scratchRemoval: z.boolean().default(true),
  faceEnhancement: z.boolean().default(true),
  fidelity: z.number().min(0).max(1).default(0.7),
  denoise: z.boolean().default(true),
  denoiseStrength: z.number().min(0).max(100).default(40),
  colorize: z.boolean().default(false),
});

/**
 * AI photo restoration route.
 * Multi-step pipeline: scratch repair, face enhancement, denoising,
 * optional colorization.
 */
export function registerRestorePhoto(app: FastifyInstance) {
  app.post("/api/v1/tools/restore-photo", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isToolInstalled("restore-photo")) {
      const bundle = getBundleForTool("restore-photo");
      return reply.status(501).send({
        error: "Feature not installed",
        code: "FEATURE_NOT_INSTALLED",
        feature: "photo-restoration",
        featureName: bundle?.name ?? "Photo Restoration",
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

      request.log.info(
        { toolId: "restore-photo", imageSize: fileBuffer.length, mode: settings.mode },
        "Starting photo restoration",
      );

      // Decode HEIC/HEIF input
      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }

      // Auto-orient to fix EXIF rotation
      fileBuffer = await autoOrient(fileBuffer);

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      // Save input
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, fileBuffer);

      // Progress callback
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

      // Process with Python sidecar
      const result = await restorePhoto(
        fileBuffer,
        join(workspacePath, "output"),
        {
          mode: settings.mode,
          scratchRemoval: settings.scratchRemoval,
          faceEnhancement: settings.faceEnhancement,
          fidelity: settings.fidelity,
          denoise: settings.denoise,
          denoiseStrength: settings.denoiseStrength,
          colorize: settings.colorize,
        },
        onProgress,
      );

      // Resolve output format to match input
      const outputFormat = await resolveOutputFormat(fileBuffer, filename);
      let outputBuffer = result.buffer;

      // Convert from PNG (Python output) to target format
      if (outputFormat.format !== "png") {
        outputBuffer = await sharp(result.buffer)
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      }

      // Save output
      const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_restored.${ext}`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, outputBuffer);

      // Generate browser-compatible preview for non-previewable formats
      const BROWSER_PREVIEWABLE = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
      let previewUrl: string | undefined;
      if (!BROWSER_PREVIEWABLE.has(ext)) {
        try {
          const previewBuffer = await sharp(outputBuffer).webp({ quality: 80 }).toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal
        }
      }

      if (clientJobId) {
        updateSingleFileProgress({
          jobId: clientJobId,
          phase: "complete",
          percent: 100,
        });
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
        previewUrl,
        originalSize: fileBuffer.length,
        processedSize: outputBuffer.length,
        width: result.width,
        height: result.height,
        steps: result.steps,
        scratchCoverage: result.scratchCoverage,
        facesEnhanced: result.facesEnhanced,
        isGrayscale: result.isGrayscale,
        colorized: result.colorized,
      });
    } catch (err) {
      request.log.error({ err, toolId: "restore-photo" }, "Photo restoration failed");
      return reply.status(422).send({
        error: "Photo restoration failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "restore-photo",
    settingsSchema: z.object({
      mode: z.enum(["auto", "light", "heavy"]).default("auto"),
      scratchRemoval: z.boolean().default(true),
      faceEnhancement: z.boolean().default(true),
      fidelity: z.number().min(0).max(1).default(0.7),
      denoise: z.boolean().default(true),
      denoiseStrength: z.number().min(0).max(100).default(40),
      colorize: z.boolean().default(false),
    }),
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await restorePhoto(orientedBuffer, join(workspacePath, "output"), {
        mode: s.mode,
        scratchRemoval: s.scratchRemoval,
        faceEnhancement: s.faceEnhancement,
        fidelity: s.fidelity,
        denoise: s.denoise,
        denoiseStrength: s.denoiseStrength,
        colorize: s.colorize,
      });
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_restored.png`;
      return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
