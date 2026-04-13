import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { removeRedEye } from "@stirling-image/ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

/** Red eye detection and removal route. */
export function registerRedEyeRemoval(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/red-eye-removal",
    async (request: FastifyRequest, reply: FastifyReply) => {
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

      const validation = await validateImageBuffer(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      try {
        const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
        request.log.info(
          {
            toolId: "red-eye-removal",
            imageSize: fileBuffer.length,
            sensitivity: settings.sensitivity,
            strength: settings.strength,
          },
          "Starting red eye removal",
        );

        // Auto-orient to fix EXIF rotation before face detection
        fileBuffer = await autoOrient(fileBuffer);

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);

        // Save input
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);

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

        const result = await removeRedEye(
          fileBuffer,
          join(workspacePath, "output"),
          {
            sensitivity: settings.sensitivity ?? 50,
            strength: settings.strength ?? 70,
            format: settings.format,
            quality: settings.quality ?? 90,
          },
          onProgress,
        );

        // Save output
        const name = filename.replace(/\.[^.]+$/, "");
        const outputFilename = `${name}_redeye_fixed.png`;
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
          facesDetected: result.facesDetected,
          eyesCorrected: result.eyesCorrected,
        });
      } catch (err) {
        request.log.error({ err, toolId: "red-eye-removal" }, "Red eye removal failed");
        return reply.status(422).send({
          error: "Red eye removal failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
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
      const orientedBuffer = await autoOrient(inputBuffer);
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
