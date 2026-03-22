import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { extractText } from "@stirling-image/ai";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";

/**
 * OCR / text extraction route.
 * Returns JSON with extracted text rather than an image.
 */
export function registerOcr(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/ocr",
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

        const result = await extractText(
          fileBuffer,
          workspacePath,
          {
            engine: settings.engine,
            language: settings.language,
          },
          onProgress,
        );

        if (clientJobId) {
          updateSingleFileProgress({
            jobId: clientJobId,
            phase: "complete",
            percent: 100,
          });
        }

        return reply.send({
          jobId,
          filename,
          text: result.text,
          engine: result.engine,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "OCR failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
