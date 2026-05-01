import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";

const settingsSchema = z.object({
  threshold: z.number().min(0).max(20).default(8),
});

const THUMBNAIL_WIDTH = 200;

/**
 * Compute a 128-bit dHash (row + column) for perceptual duplicate detection.
 * Row hash: resize to 9x8 grayscale, compare adjacent horizontal pixels (64 bits).
 * Column hash: resize to 8x9 grayscale, compare adjacent vertical pixels (64 bits).
 */
async function computeDHash128(buffer: Buffer): Promise<string> {
  // Row hash: 9 wide x 8 tall
  const rowPixels = await sharp(buffer).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash += rowPixels[y * 9 + x] > rowPixels[y * 9 + x + 1] ? "1" : "0";
    }
  }

  // Column hash: 8 wide x 9 tall
  const colPixels = await sharp(buffer).resize(8, 9, { fit: "fill" }).grayscale().raw().toBuffer();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash += colPixels[y * 8 + x] > colPixels[(y + 1) * 8 + x] ? "1" : "0";
    }
  }

  return hash; // 128 characters
}

function hammingDistance(a: string, b: string): number {
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

interface FileData {
  buffer: Buffer;
  filename: string;
  originalSize: number;
}

interface FileInfo {
  filename: string;
  hash: string;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  thumbnail: string | null;
}

async function extractFileInfo(file: FileData): Promise<FileInfo> {
  const meta = await sharp(file.buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const format = meta.format ?? "unknown";

  // Generate 200px wide JPEG thumbnail as base64
  let thumbnail: string | null = null;
  try {
    const thumbBuffer = await sharp(file.buffer)
      .resize(THUMBNAIL_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    thumbnail = `data:image/jpeg;base64,${thumbBuffer.toString("base64")}`;
  } catch {
    // Non-fatal: some formats may fail thumbnail generation
  }

  return {
    filename: file.filename,
    hash: "",
    width,
    height,
    fileSize: file.originalSize,
    format,
    thumbnail,
  };
}

export function registerFindDuplicates(app: FastifyInstance) {
  app.post("/api/v1/tools/find-duplicates", async (request, reply) => {
    const files: FileData[] = [];
    let settingsRaw: string | null = null;

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
              filename: sanitizeFilename(part.filename ?? `image-${files.length}`),
              originalSize: buf.length,
            });
          }
        } else if (part.type === "field" && part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.type === "field" && part.fieldname === "threshold") {
          // Legacy: accept bare threshold field as settings
          settingsRaw = JSON.stringify({ threshold: Number(part.value) });
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // Parse and validate settings
    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    const threshold = settings.threshold;

    if (files.length < 2) {
      return reply
        .status(400)
        .send({ error: "At least 2 images are required for duplicate detection" });
    }

    try {
      // Decode HEIC/HEIF if needed, then normalize EXIF orientation
      for (const file of files) {
        file.buffer = await autoOrient(await ensureSharpCompat(file.buffer));
      }

      // Extract metadata, thumbnails, and compute hashes
      const fileInfos: FileInfo[] = [];
      for (const file of files) {
        const info = await extractFileInfo(file);
        info.hash = await computeDHash128(file.buffer);
        fileInfos.push(info);
      }

      // Group duplicates by hamming distance
      const assigned = new Set<number>();
      const groups: Array<{
        groupId: number;
        files: Array<{
          filename: string;
          similarity: number;
          width: number;
          height: number;
          fileSize: number;
          format: string;
          isBest: boolean;
          thumbnail: string | null;
        }>;
      }> = [];

      let groupCounter = 0;

      for (let i = 0; i < fileInfos.length; i++) {
        if (assigned.has(i)) continue;

        const members: Array<{ index: number; similarity: number }> = [
          { index: i, similarity: 100 },
        ];

        for (let j = i + 1; j < fileInfos.length; j++) {
          if (assigned.has(j)) continue;
          const dist = hammingDistance(fileInfos[i].hash, fileInfos[j].hash);
          if (dist <= threshold) {
            const similarity = Math.round((1 - dist / 128) * 10000) / 100;
            members.push({ index: j, similarity });
            assigned.add(j);
          }
        }

        if (members.length > 1) {
          assigned.add(i);
          groupCounter++;

          // Determine "best" image: highest pixel count, tie-break by file size
          let bestIdx = 0;
          for (let m = 1; m < members.length; m++) {
            const curr = fileInfos[members[m].index];
            const best = fileInfos[members[bestIdx].index];
            const currPixels = curr.width * curr.height;
            const bestPixels = best.width * best.height;
            if (
              currPixels > bestPixels ||
              (currPixels === bestPixels && curr.fileSize > best.fileSize)
            ) {
              bestIdx = m;
            }
          }

          groups.push({
            groupId: groupCounter,
            files: members.map((m, idx) => ({
              filename: fileInfos[m.index].filename,
              similarity: m.similarity,
              width: fileInfos[m.index].width,
              height: fileInfos[m.index].height,
              fileSize: fileInfos[m.index].fileSize,
              format: fileInfos[m.index].format,
              isBest: idx === bestIdx,
              thumbnail: fileInfos[m.index].thumbnail,
            })),
          });
        }
      }

      // Sort groups by highest similarity descending
      groups.sort((a, b) => {
        const maxA = Math.max(...a.files.map((f) => f.similarity));
        const maxB = Math.max(...b.files.map((f) => f.similarity));
        return maxB - maxA;
      });

      // Calculate space saveable (sum of non-best duplicate file sizes)
      let spaceSaveable = 0;
      for (const group of groups) {
        for (const file of group.files) {
          if (!file.isBest) spaceSaveable += file.fileSize;
        }
      }

      return reply.send({
        totalImages: files.length,
        duplicateGroups: groups,
        uniqueImages: files.length - assigned.size,
        spaceSaveable,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Duplicate detection failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
