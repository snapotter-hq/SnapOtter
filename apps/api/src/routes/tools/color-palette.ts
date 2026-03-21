import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { basename } from "node:path";

/**
 * Simple k-means-like color quantization to extract dominant colors.
 */
function extractColors(pixels: Buffer, channelCount: number, maxColors: number): string[] {
  // Build frequency map of quantized colors
  const colorMap = new Map<string, number>();

  for (let i = 0; i < pixels.length; i += channelCount) {
    // Quantize to reduce noise (round to nearest 16)
    const r = Math.round(pixels[i] / 16) * 16;
    const g = Math.round(pixels[i + 1] / 16) * 16;
    const b = Math.round(pixels[i + 2] / 16) * 16;
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
  }

  // Sort by frequency and pick top colors
  const sorted = [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Filter similar colors (merge colors within distance 40)
  const results: Array<{ r: number; g: number; b: number; count: number }> = [];
  for (const [key, count] of sorted) {
    const [r, g, b] = key.split(",").map(Number);
    const tooClose = results.some(
      (c) =>
        Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b) < 48,
    );
    if (!tooClose) {
      results.push({ r, g, b, count });
    }
    if (results.length >= maxColors) break;
  }

  return results.map(({ r, g, b }) => {
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return hex;
  });
}

export function registerColorPalette(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/color-palette",
    async (request, reply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";

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
        // Resize to small image for analysis
        const raw = await sharp(fileBuffer)
          .resize(50, 50, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer();

        const colors = extractColors(raw, 3, 8);

        return reply.send({
          filename,
          colors,
          count: colors.length,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Color extraction failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
