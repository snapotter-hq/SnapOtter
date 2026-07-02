import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { sanitizeFilename } from "../../lib/filename.js";
import { putObject } from "../../lib/object-storage.js";
import { InputValidationError } from "../../modality/contract.js";
import { inputHandlerFor } from "../../modality/input-handler.js";

/**
 * Compare two images: compute a pixel-level diff and similarity score.
 */
export function registerCompare(app: FastifyInstance) {
  app.post("/api/v1/tools/image/compare", async (request, reply) => {
    let bufferA: Buffer | null = null;
    let bufferB: Buffer | null = null;
    let filenameA = "first.png";
    let filenameB = "second.png";

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (!bufferA) {
            bufferA = buf;
            filenameA = sanitizeFilename(part.filename ?? filenameA);
          } else {
            bufferB = buf;
            filenameB = sanitizeFilename(part.filename ?? filenameB);
          }
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!bufferA || !bufferB) {
      return reply.status(400).send({ error: "Two image files are required for comparison" });
    }

    try {
      const imageHandler = inputHandlerFor("image");
      bufferA = (
        await imageHandler.prepare(bufferA, filenameA, {
          scratchDir: tmpdir(),
        })
      ).buffer;
      bufferB = (
        await imageHandler.prepare(bufferB, filenameB, {
          scratchDir: tmpdir(),
        })
      ).buffer;

      // Normalize both to same size for comparison
      const metaA = await sharp(bufferA).metadata();
      const metaB = await sharp(bufferB).metadata();
      const w = Math.max(metaA.width ?? 100, metaB.width ?? 100);
      const h = Math.max(metaA.height ?? 100, metaB.height ?? 100);

      const rawA = await sharp(bufferA)
        .resize(w, h, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const rawB = await sharp(bufferB)
        .resize(w, h, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer();

      // Compute pixel diff
      const diffPixels = Buffer.alloc(w * h * 4);
      let totalDiff = 0;
      const pixelCount = w * h;

      for (let i = 0; i < rawA.length; i += 4) {
        const dr = Math.abs(rawA[i] - rawB[i]);
        const dg = Math.abs(rawA[i + 1] - rawB[i + 1]);
        const db = Math.abs(rawA[i + 2] - rawB[i + 2]);
        const pixelDiff = (dr + dg + db) / 3;
        totalDiff += pixelDiff;

        // Red tint for differences, transparent for identical
        if (pixelDiff > 10) {
          diffPixels[i] = 255; // R
          diffPixels[i + 1] = 0; // G
          diffPixels[i + 2] = 0; // B
          diffPixels[i + 3] = Math.min(255, Math.round(pixelDiff * 3)); // A
        } else {
          // Slightly show original
          diffPixels[i] = rawA[i];
          diffPixels[i + 1] = rawA[i + 1];
          diffPixels[i + 2] = rawA[i + 2];
          diffPixels[i + 3] = 128;
        }
      }

      const similarity = Math.max(0, 100 - (totalDiff / (pixelCount * 255)) * 100);

      const diffBuffer = await sharp(diffPixels, {
        raw: { width: w, height: h, channels: 4 },
      })
        .png()
        .toBuffer();

      const jobId = randomUUID();
      const diffFilename = "diff.png";
      await putObject(`outputs/${jobId}/${diffFilename}`, diffBuffer);

      return reply.send({
        jobId,
        similarity: Math.round(similarity * 100) / 100,
        dimensions: { width: w, height: h },
        downloadUrl: `/api/v1/download/${jobId}/${diffFilename}`,
        originalSize: bufferA.length + bufferB.length,
        processedSize: diffBuffer.length,
      });
    } catch (err) {
      if (err instanceof InputValidationError) {
        return reply.status(err.statusCode).send({ error: err.message, details: err.details });
      }
      return reply.status(422).send({
        error: "Comparison failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
