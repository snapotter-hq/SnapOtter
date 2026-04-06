import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { upscale } from "@stirling-image/ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

/**
 * AI image upscaling route.
 * Uses Real-ESRGAN when available, falls back to Lanczos.
 */
export function registerUpscale(app: FastifyInstance) {
  app.post("/api/v1/tools/upscale", async (request: FastifyRequest, reply: FastifyReply) => {
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
      const scale = Number(settings.scale) || 2;
      request.log.info(
        { toolId: "upscale", imageSize: fileBuffer.length, scale },
        "Starting upscale",
      );

      // Auto-orient to fix EXIF rotation before upscaling
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

      const result = await upscale(
        fileBuffer,
        join(workspacePath, "output"),
        { scale },
        onProgress,
      );

      // Save output
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_${scale}x.png`;
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
