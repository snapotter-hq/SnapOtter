import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { autoOrient } from "../../lib/auto-orient.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { putObject } from "../../lib/object-storage.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

/**
 * Compare two images: compute a pixel-level diff and similarity score.
 */
export function registerCompare(app: FastifyInstance) {
  app.post("/api/v1/tools/image/compare", async (request, reply) => {
    let bufferA: Buffer | null = null;
    let bufferB: Buffer | null = null;

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
          } else {
            bufferB = buf;
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
      const valA = await validateImageBuffer(bufferA, "image");
      if (!valA.valid) {
        return reply.status(400).send({ error: `Invalid first image: ${valA.reason}` });
      }
      if (valA.format === "heif") {
        try {
          bufferA = await decodeHeic(bufferA);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode first image (HEIC). Ensure libheif-examples is installed.",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (needsCliDecode(valA.format)) {
        try {
          bufferA = await decodeToSharpCompat(bufferA, valA.format);
        } catch {
          try {
            await sharp(bufferA).metadata();
          } catch (err) {
            return reply.status(422).send({
              error: `Failed to decode first image (${valA.format.toUpperCase()})`,
              details: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      if (valA.format === "svg") {
        try {
          bufferA = decompressSvgz(bufferA);
          bufferA = sanitizeSvg(bufferA);
        } catch (err) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG (first image)",
          });
        }
      }
      bufferA = await autoOrient(bufferA);

      const valB = await validateImageBuffer(bufferB, "image");
      if (!valB.valid) {
        return reply.status(400).send({ error: `Invalid second image: ${valB.reason}` });
      }
      if (valB.format === "heif") {
        try {
          bufferB = await decodeHeic(bufferB);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode second image (HEIC). Ensure libheif-examples is installed.",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (needsCliDecode(valB.format)) {
        try {
          bufferB = await decodeToSharpCompat(bufferB, valB.format);
        } catch {
          try {
            await sharp(bufferB).metadata();
          } catch (err) {
            return reply.status(422).send({
              error: `Failed to decode second image (${valB.format.toUpperCase()})`,
              details: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      if (valB.format === "svg") {
        try {
          bufferB = decompressSvgz(bufferB);
          bufferB = sanitizeSvg(bufferB);
        } catch (err) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG (second image)",
          });
        }
      }
      bufferB = await autoOrient(bufferB);

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
      return reply.status(422).send({
        error: "Comparison failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
