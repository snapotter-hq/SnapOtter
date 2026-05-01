import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeRedEye } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic, ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  sensitivity: z.number().min(0).max(100).default(50),
  strength: z.number().min(0).max(100).default(70),
  format: z.string().optional(),
  quality: z.number().min(1).max(100).default(90),
});

/** Red eye detection and removal route. */
export function registerRedEyeRemoval(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/red-eye-removal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "red-eye-removal";
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

      const { sensitivity, strength, format: outputFormat, quality } = settings;

      try {
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
        }

        // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
        }

        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: "red-eye-removal" }, "Input decoding failed");
        return reply.status(422).send({
          error: "Red eye removal failed",
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
        request.log.error({ err, toolId: "red-eye-removal" }, "Workspace creation failed");
        return reply.status(422).send({
          error: "Red eye removal failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const log = request.log;
      log.info(
        { toolId: "red-eye-removal", imageSize: originalSize, sensitivity, strength },
        "Starting red eye removal",
      );

      // Reply immediately so the HTTP connection closes within proxy timeout limits.
      // The result will be delivered via the SSE progress channel.
      reply.status(202).send({ jobId: progressJobId, async: true });

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
        const result = await removeRedEye(
          fileBuffer,
          join(workspacePath, "output"),
          {
            sensitivity,
            strength,
            format: outputFormat,
            quality,
          },
          onProgress,
        );

        // Save output
        const name = filename.replace(/\.[^.]+$/, "");
        const outputFilename = `${name}_redeye_fixed.png`;
        const outputPath = join(workspacePath, "output", outputFilename);
        await writeFile(outputPath, result.buffer);

        const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "complete",
          percent: 100,
          result: {
            jobId,
            downloadUrl,
            originalSize,
            processedSize: result.buffer.length,
            facesDetected: result.facesDetected,
            eyesCorrected: result.eyesCorrected,
          },
        });

        log.info({ toolId: "red-eye-removal", jobId, downloadUrl }, "Red eye removal complete");
      })().catch((err) => {
        log.error({ err, toolId: "red-eye-removal" }, "Red eye removal failed");
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: err instanceof Error ? err.message : "Red eye removal failed",
        });
      });
    },
  );

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "red-eye-removal",
    settingsSchema: z.object({
      sensitivity: z.number().min(0).max(100).default(50),
      strength: z.number().min(0).max(100).default(70),
      format: z.string().optional(),
      quality: z.number().min(1).max(100).default(90),
    }),
    process: async (inputBuffer, settings, filename) => {
      const s = settings as {
        sensitivity?: number;
        strength?: number;
        format?: string;
        quality?: number;
      };
      const orientedBuffer = await autoOrient(await ensureSharpCompat(inputBuffer));
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await removeRedEye(orientedBuffer, join(workspacePath, "output"), {
        sensitivity: s.sensitivity ?? 50,
        strength: s.strength ?? 70,
        format: s.format,
        quality: s.quality ?? 90,
      });
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_redeye_fixed.png`;
      return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
