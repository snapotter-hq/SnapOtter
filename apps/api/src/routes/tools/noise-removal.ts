import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { noiseRemoval } from "@ashim/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  tier: z.enum(["quick", "balanced", "quality", "maximum"]).default("balanced"),
  strength: z.union([z.number(), z.string()]).transform(Number).default(50),
  detailPreservation: z.union([z.number(), z.string()]).transform(Number).default(50),
  colorNoise: z.union([z.number(), z.string()]).transform(Number).default(30),
  format: z.enum(["original", "png", "jpeg", "webp"]).default("original"),
  quality: z.union([z.number(), z.string()]).transform(Number).default(90),
});

/**
 * AI noise removal route.
 * Uses the Python sidecar for multi-tier denoising.
 */
export function registerNoiseRemoval(app: FastifyInstance) {
  app.post("/api/v1/tools/noise-removal", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "noise-removal";
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
          filename = part.filename ?? "image";
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
      const parsed = settingsSchema.parse(settingsRaw ? JSON.parse(settingsRaw) : {});
      request.log.info(
        { toolId: "noise-removal", imageSize: fileBuffer.length, tier: parsed.tier },
        "Starting noise removal",
      );

      // Decode HEIC/HEIF input via system decoder
      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }

      // Auto-orient to fix EXIF rotation before processing
      fileBuffer = await autoOrient(fileBuffer);

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

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

      const result = await noiseRemoval(
        fileBuffer,
        join(workspacePath, "output"),
        {
          tier: parsed.tier,
          strength: parsed.strength,
          detailPreservation: parsed.detailPreservation,
          colorNoise: parsed.colorNoise,
          format: parsed.format,
          quality: parsed.quality,
        },
        onProgress,
      );

      const ext = result.format === "jpeg" ? "jpg" : result.format;
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_denoised.${ext}`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, result.buffer);

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
        originalSize: fileBuffer.length,
        processedSize: result.buffer.length,
      });
    } catch (err) {
      request.log.error({ err, toolId: "noise-removal" }, "Noise removal failed");
      return reply.status(422).send({
        error: "Noise removal failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "noise-removal",
    settingsSchema: z.object({
      tier: z.enum(["quick", "balanced", "quality", "maximum"]).default("balanced"),
      strength: z.union([z.number(), z.string()]).transform(Number).default(50),
      detailPreservation: z.union([z.number(), z.string()]).transform(Number).default(50),
      colorNoise: z.union([z.number(), z.string()]).transform(Number).default(30),
      format: z.enum(["original", "png", "jpeg", "webp"]).default("original"),
      quality: z.union([z.number(), z.string()]).transform(Number).default(90),
    }),
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await noiseRemoval(orientedBuffer, join(workspacePath, "output"), {
        tier: s.tier,
        strength: s.strength,
        detailPreservation: s.detailPreservation,
        colorNoise: s.colorNoise,
        format: s.format,
        quality: s.quality,
      });
      const ext = result.format === "jpeg" ? "jpg" : result.format;
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_denoised.${ext}`;
      const CONTENT_TYPES: Record<string, string> = {
        png: "image/png",
        jpeg: "image/jpeg",
        jpg: "image/jpeg",
        webp: "image/webp",
      };
      return {
        buffer: result.buffer,
        filename: outputFilename,
        contentType: CONTENT_TYPES[result.format] || "image/png",
      };
    },
  });
}
