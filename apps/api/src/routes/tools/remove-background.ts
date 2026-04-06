import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { removeBackground } from "@stirling-image/ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

/**
 * AI background removal route.
 * Uses Python + rembg under the hood.
 */
export function registerRemoveBackground(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/remove-background",
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
          { toolId: "remove-background", imageSize: fileBuffer.length, model: settings.model },
          "Starting background removal",
        );
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

        const resultBuffer = await removeBackground(
          fileBuffer,
          join(workspacePath, "output"),
          { model: settings.model, backgroundColor: settings.backgroundColor },
          onProgress,
        );

        // Save output
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_nobg.png`;
        const outputPath = join(workspacePath, "output", outputFilename);
        await writeFile(outputPath, resultBuffer);

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
          processedSize: resultBuffer.length,
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

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "remove-background",
    settingsSchema: z.object({
      model: z.string().optional(),
      backgroundColor: z.string().optional(),
    }),
    process: async (inputBuffer, settings, filename) => {
      const s = settings as { model?: string; backgroundColor?: string };
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const resultBuffer = await removeBackground(inputBuffer, join(workspacePath, "output"), {
        model: s.model,
        backgroundColor: s.backgroundColor,
      });
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_nobg.png`;
      return { buffer: resultBuffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
