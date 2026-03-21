import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { basename } from "node:path";

/**
 * Compute a dHash (difference hash) for perceptual duplicate detection.
 * Resize to 9x8 grayscale, compare adjacent pixels to create 64-bit hash.
 */
async function computeDHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      hash += left > right ? "1" : "0";
    }
  }
  return hash;
}

/**
 * Compute hamming distance between two 64-bit hash strings.
 */
function hammingDistance(a: string, b: string): number {
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

export function registerFindDuplicates(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/find-duplicates",
    async (request, reply) => {
      const files: Array<{ buffer: Buffer; filename: string }> = [];

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            if (buf.length > 0) {
              files.push({
                buffer: buf,
                filename: basename(part.filename ?? `image-${files.length}`),
              });
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (files.length < 2) {
        return reply.status(400).send({ error: "At least 2 images are required for duplicate detection" });
      }

      try {
        // Compute hashes for all images
        const hashes: Array<{ filename: string; hash: string }> = [];
        for (const file of files) {
          const hash = await computeDHash(file.buffer);
          hashes.push({ filename: file.filename, hash });
        }

        // Compare all pairs, group duplicates
        const threshold = 10; // Hamming distance threshold for "similar"
        const groups: Array<{
          files: Array<{ filename: string; similarity: number }>;
        }> = [];
        const assigned = new Set<number>();

        for (let i = 0; i < hashes.length; i++) {
          if (assigned.has(i)) continue;

          const group: Array<{ filename: string; similarity: number }> = [
            { filename: hashes[i].filename, similarity: 100 },
          ];

          for (let j = i + 1; j < hashes.length; j++) {
            if (assigned.has(j)) continue;
            const dist = hammingDistance(hashes[i].hash, hashes[j].hash);
            if (dist <= threshold) {
              const similarity = Math.round((1 - dist / 64) * 10000) / 100;
              group.push({ filename: hashes[j].filename, similarity });
              assigned.add(j);
            }
          }

          if (group.length > 1) {
            assigned.add(i);
            groups.push({ files: group });
          }
        }

        return reply.send({
          totalImages: files.length,
          duplicateGroups: groups,
          uniqueImages: files.length - assigned.size,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Duplicate detection failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
