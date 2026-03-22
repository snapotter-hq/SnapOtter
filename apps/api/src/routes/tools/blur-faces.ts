import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { blurFaces } from "@stirling-image/ai";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";

/**
 * Face detection and blurring route.
 * Uses MediaPipe for detection, PIL for blurring.
 */
export function registerBlurFaces(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/blur-faces",
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

      try {
        const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);

        // Save input
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);

        // Process
        const onProgress = clientJobId
          ? (percent: number, stage: string) => {
              updateSingleFileProgress({
                jobId: clientJobId!,
                phase: "processing",
                stage,
                percent,
              });
            }
          : undefined;

        const result = await blurFaces(
          fileBuffer,
          join(workspacePath, "output"),
          {
            blurRadius: settings.blurRadius ?? 30,
            sensitivity: settings.sensitivity ?? 0.5,
          },
          onProgress,
        );

        // Save output
        const outputFilename =
          filename.replace(/\.[^.]+$/, "") + "_blurred.png";
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
          faces: result.faces,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Face blur failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
