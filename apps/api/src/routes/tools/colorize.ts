import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { colorize } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
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
  intensity: z.number().min(0).max(1).default(1.0),
  model: z.enum(["auto", "ddcolor", "opencv"]).default("auto"),
});

/**
 * AI photo colorization route.
 * Converts B&W / grayscale photos to full color using DDColor,
 * with OpenCV DNN fallback.
 */
export function registerColorize(app: FastifyInstance) {
  app.post("/api/v1/tools/colorize", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "colorize";
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

      const { intensity, model } = settings;

      request.log.info(
        { toolId: "colorize", imageSize: fileBuffer.length, intensity, model },
        "Starting colorization",
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
      const result = await colorize(
        fileBuffer,
        join(workspacePath, "output"),
        { intensity, model },
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
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_colorized.${ext}`;
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

      if (model !== "auto" && result.method !== model) {
        request.log.warn(
          { toolId: "colorize", requested: model, actual: result.method },
          `Colorize model mismatch: requested ${model} but used ${result.method}`,
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
      request.log.error({ err, toolId: "colorize" }, "Colorization failed");
      return reply.status(422).send({
        error: "Colorization failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "colorize",
    settingsSchema: z.object({
      intensity: z.number().min(0).max(1).default(1.0),
      model: z.enum(["auto", "ddcolor", "opencv"]).default("auto"),
    }),
    process: async (inputBuffer, settings, filename) => {
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await colorize(orientedBuffer, join(workspacePath, "output"), {
        intensity: (settings as { intensity?: number }).intensity ?? 1.0,
        model: (settings as { model?: string }).model ?? "auto",
      });
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_colorized.png`;
      return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
