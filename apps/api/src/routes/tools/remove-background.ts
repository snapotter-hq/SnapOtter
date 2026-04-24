import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { removeBackground } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { applyEffects } from "../../lib/bg-effects.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace, getWorkspacePath } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  model: z.string().optional(),
  backgroundType: z.enum(["transparent", "color", "gradient", "blur", "image"]).optional(),
  backgroundColor: z.string().optional(),
  gradientColor1: z.string().optional(),
  gradientColor2: z.string().optional(),
  gradientAngle: z.number().optional(),
  blurEnabled: z.boolean().optional(),
  blurIntensity: z.number().min(0).max(100).optional(),
  shadowEnabled: z.boolean().optional(),
  shadowOpacity: z.number().min(0).max(100).optional(),
});

/**
 * AI background removal with two-phase flow:
 *
 * Phase 1 (POST /remove-background): Python/rembg removes background.
 *   Returns transparent PNG + caches mask & original for effects re-apply.
 *   Also returns maskUrl and originalUrl for frontend CSS preview.
 *
 * Phase 2 (POST /remove-background/effects): Node.js/Sharp applies effects.
 *   Uses cached mask + original. No AI re-run. Instant response.
 *   Called when user adjusts blur/shadow/background and clicks download.
 */
export function registerRemoveBackground(app: FastifyInstance) {
  // ── Phase 1: Background removal ──────────────────────────────────
  app.post(
    "/api/v1/tools/remove-background",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "remove-background";
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
            for await (const chunk of part.file) chunks.push(chunk);
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

        request.log.info(
          { toolId: "remove-background", imageSize: fileBuffer.length, model: settings.model },
          "Starting background removal",
        );
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
                percent: Math.min(percent, 95),
              });
            }
          : undefined;

        // Phase 1: AI background removal -> transparent PNG
        const transparentResult = await removeBackground(
          fileBuffer,
          join(workspacePath, "output"),
          { model: settings.model },
          onProgress,
        );

        // Cache the mask (transparent PNG) and original for effects re-apply
        const maskFilename = `${filename.replace(/\.[^.]+$/, "")}_mask.png`;
        const originalFilename = `${filename.replace(/\.[^.]+$/, "")}_original.png`;
        await writeFile(join(workspacePath, "output", maskFilename), transparentResult);
        await writeFile(join(workspacePath, "output", originalFilename), fileBuffer);

        if (clientJobId) {
          updateSingleFileProgress({
            jobId: clientJobId,
            phase: "complete",
            percent: 100,
          });
        }

        return reply.send({
          jobId,
          // The mask (transparent PNG) is the main preview
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(maskFilename)}`,
          // Separate URLs for frontend CSS preview compositing
          maskUrl: `/api/v1/download/${jobId}/${encodeURIComponent(maskFilename)}`,
          originalUrl: `/api/v1/download/${jobId}/${encodeURIComponent(originalFilename)}`,
          originalSize: fileBuffer.length,
          processedSize: transparentResult.length,
          filename,
          model: settings.model,
        });
      } catch (err) {
        request.log.error({ err, toolId: "remove-background" }, "Background removal failed");
        return reply.status(422).send({
          error: "Background removal failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // ── Phase 2: Effects-only (no AI re-run) ─────────────────────────
  app.post(
    "/api/v1/tools/remove-background/effects",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let settingsRaw: string | null = null;
      let bgImageBuffer: Buffer | null = null;
      let bgFilename = "background";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "backgroundImage") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            bgImageBuffer = Buffer.concat(chunks);
            bgFilename = part.filename ?? "background";
          } else if (part.type === "field" && part.fieldname === "settings") {
            settingsRaw = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!settingsRaw) {
        return reply.status(400).send({ error: "No settings provided" });
      }

      const effectsSchema = z.object({
        jobId: z.string().min(1),
        filename: z.string().min(1),
        backgroundType: z.enum(["transparent", "color", "gradient", "blur", "image"]).optional(),
        backgroundColor: z.string().optional(),
        gradientColor1: z.string().optional(),
        gradientColor2: z.string().optional(),
        gradientAngle: z.number().optional(),
        blurEnabled: z.boolean().optional(),
        blurIntensity: z.number().min(0).max(100).optional(),
        shadowEnabled: z.boolean().optional(),
        shadowOpacity: z.number().min(0).max(100).optional(),
      });

      try {
        let settings: z.infer<typeof effectsSchema>;
        try {
          const parsed = JSON.parse(settingsRaw);
          const result = effectsSchema.safeParse(parsed);
          if (!result.success) {
            return reply.status(400).send({
              error: "Invalid settings",
              details: formatZodErrors(result.error.issues),
            });
          }
          settings = result.data;
        } catch {
          return reply.status(400).send({ error: "Settings must be valid JSON" });
        }

        const { jobId, filename } = settings;

        const workspacePath = getWorkspacePath(jobId);

        const baseName = filename.replace(/\.[^.]+$/, "");
        const maskPath = join(workspacePath, "output", `${baseName}_mask.png`);
        const originalPath = join(workspacePath, "output", `${baseName}_original.png`);

        const [maskBuffer, originalBuffer] = await Promise.all([
          readFile(maskPath),
          readFile(originalPath),
        ]);

        // Decode HEIC/HEIF background image if needed
        if (bgImageBuffer) {
          const bgValidation = await validateImageBuffer(bgImageBuffer, bgFilename);
          if (bgValidation.valid && bgValidation.format === "heif") {
            bgImageBuffer = await decodeHeic(bgImageBuffer);
          }
          if (bgValidation.valid && needsCliDecode(bgValidation.format)) {
            bgImageBuffer = await decodeToSharpCompat(bgImageBuffer, bgValidation.format);
          }
        }

        // Apply effects using cached mask + original
        const resultBuffer = await applyEffects(maskBuffer, originalBuffer, {
          backgroundType: settings.backgroundType,
          backgroundColor: settings.backgroundColor,
          gradientColor1: settings.gradientColor1,
          gradientColor2: settings.gradientColor2,
          gradientAngle: settings.gradientAngle,
          backgroundImageBuffer: bgImageBuffer ?? undefined,
          blurEnabled: settings.blurEnabled,
          blurIntensity: settings.blurIntensity,
          shadowEnabled: settings.shadowEnabled,
          shadowOpacity: settings.shadowOpacity,
        });

        // Save the final output
        const outputFilename = `${baseName}_nobg.png`;
        const outputPath = join(workspacePath, "output", outputFilename);
        await writeFile(outputPath, resultBuffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
          processedSize: resultBuffer.length,
        });
      } catch (err) {
        request.log.error({ err }, "Effects processing failed");
        return reply.status(422).send({
          error: "Effects processing failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // ── Pipeline/batch registry ──────────────────────────────────────
  registerToolProcessFn({
    toolId: "remove-background",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      const transparentResult = await removeBackground(
        orientedBuffer,
        join(workspacePath, "output"),
        { model: s.model },
      );

      const resultBuffer = await applyEffects(transparentResult, orientedBuffer, {
        backgroundType: s.backgroundType,
        backgroundColor: s.backgroundColor,
        gradientColor1: s.gradientColor1,
        gradientColor2: s.gradientColor2,
        gradientAngle: s.gradientAngle,
        blurEnabled: s.blurEnabled,
        blurIntensity: s.blurIntensity,
        shadowEnabled: s.shadowEnabled,
        shadowOpacity: s.shadowOpacity,
      });

      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_nobg.png`;
      return { buffer: resultBuffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
