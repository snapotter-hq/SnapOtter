import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { inpaint } from "@stirling-image/ai";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";

/**
 * Object eraser / inpainting route.
 * Accepts an image and a mask image, erases masked areas.
 */
export function registerEraseObject(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/erase-object",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let imageBuffer: Buffer | null = null;
      let maskBuffer: Buffer | null = null;
      let filename = "image";
      let clientJobId: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            if (part.fieldname === "mask") {
              maskBuffer = buf;
            } else {
              imageBuffer = buf;
              filename = basename(part.filename ?? "image");
            }
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

      if (!imageBuffer || imageBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }
      if (!maskBuffer || maskBuffer.length === 0) {
        return reply
          .status(400)
          .send({ error: "No mask image provided. Upload a mask as a second file with fieldname 'mask'" });
      }

      try {
        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);

        // Save input
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, imageBuffer);

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

        const resultBuffer = await inpaint(
          imageBuffer,
          maskBuffer,
          join(workspacePath, "output"),
          onProgress,
        );

        // Save output
        const outputFilename =
          filename.replace(/\.[^.]+$/, "") + "_erased.png";
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
          originalSize: imageBuffer.length,
          processedSize: resultBuffer.length,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Object erasing failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
