import { isToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { reportError, safeFormatTag } from "../../lib/error-report.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { asInputErrorIfUndecodable } from "../../lib/image-error.js";
import { logger } from "../../lib/logger.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

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
  } catch (err) {
    // Non-fatal: the UI shows the entry without a preview. Info rather than
    // debug, since it fires once per file and only on failure, and the default
    // LOG_LEVEL would hide a debug line.
    logger.info(
      { err, filename: file.filename, format },
      "find-duplicates: thumbnail failed, returning null",
    );
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
  app.post("/api/v1/tools/image/find-duplicates", async (request, reply) => {
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
      const failure = multipartFailure(err);
      return reply.status(failure.status).send(failure.body);
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
      const skippedFiles: Array<{ filename: string; reason: string }> = [];
      const processableFiles: FileData[] = [];

      for (const file of files) {
        const validation = await validateImageBuffer(file.buffer, file.filename);
        if (!validation.valid) {
          skippedFiles.push({ filename: file.filename, reason: validation.reason });
          continue;
        }
        if (validation.format === "heif") {
          try {
            file.buffer = await decodeHeic(file.buffer);
          } catch (err) {
            // A missing decoder is the operator's problem, not this file's:
            // the outer catch rethrows it so the request answers 503.
            if (isDecoderUnavailable(err)) throw err;
            logger.warn(
              { err, filename: file.filename, format: validation.format },
              "find-duplicates: skipping file, HEIC decode failed",
            );
            skippedFiles.push({ filename: file.filename, reason: "Failed to decode HEIC" });
            continue;
          }
        }
        if (needsCliDecode(validation.format)) {
          try {
            const fileExt = file.filename.split(".").pop()?.toLowerCase();
            file.buffer = await decodeToSharpCompat(file.buffer, validation.format, fileExt);
          } catch (decodeErr) {
            // Sharp reads some of these formats itself (DNG is a TIFF), so the
            // decoder's failure only matters once that fallback fails too.
            try {
              await sharp(file.buffer).metadata();
            } catch (err) {
              if (isDecoderUnavailable(decodeErr)) throw decodeErr;
              // pino serializes only the `err` key as an Error, so the decoder's
              // failure goes in as its message or it would land as `{}`.
              logger.warn(
                {
                  err,
                  decodeErr: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
                  filename: file.filename,
                  format: validation.format,
                },
                "find-duplicates: skipping file, decode failed",
              );
              skippedFiles.push({
                filename: file.filename,
                reason: `Failed to decode ${validation.format.toUpperCase()}`,
              });
              continue;
            }
          }
        }
        if (validation.format === "svg") {
          try {
            file.buffer = decompressSvgz(file.buffer);
            file.buffer = sanitizeSvg(file.buffer);
          } catch (err) {
            logger.warn(
              { err, filename: file.filename, format: validation.format },
              "find-duplicates: skipping file, SVG sanitize failed",
            );
            skippedFiles.push({ filename: file.filename, reason: "Invalid SVG" });
            continue;
          }
        }
        // autoOrient never throws: it logs and returns the input when the
        // rotation fails, and the hash step below is what rejects a buffer
        // Sharp can't decode.
        file.buffer = await autoOrient(file.buffer);
        processableFiles.push(file);
      }

      if (processableFiles.length < 2) {
        return reply.status(400).send({
          error:
            processableFiles.length === 0
              ? "No supported images found"
              : "At least 2 processable images are required for duplicate detection",
          skippedFiles,
        });
      }

      // Extract metadata, thumbnails, and compute hashes
      const fileInfos: FileInfo[] = [];
      for (const file of processableFiles) {
        try {
          const info = await extractFileInfo(file);
          info.hash = await computeDHash128(file.buffer);
          fileInfos.push(info);
        } catch (err) {
          // This is where a buffer Sharp can't decode gets rejected. The probe
          // in asInputErrorIfUndecodable tells a corrupt upload (expected: the
          // user is told, info line, no Sentry) from a hash failure on an image
          // Sharp can decode (a real fault: error line and a report). It logs
          // the probe result itself; the line here adds the filename.
          const classified = await asInputErrorIfUndecodable(file.buffer, err);
          if (isToolInputError(classified)) {
            logger.info(
              { err, filename: file.filename, reason: classified.message },
              "find-duplicates: skipping undecodable file",
            );
            skippedFiles.push({ filename: file.filename, reason: classified.message });
          } else {
            logger.error(
              { err, filename: file.filename },
              "find-duplicates: hash failed on a decodable image",
            );
            void reportError(err, {
              source: "http",
              toolId: "find-duplicates",
              inputFormat: safeFormatTag(file.filename),
            });
            skippedFiles.push({ filename: file.filename, reason: "Failed to compute image hash" });
          }
        }
      }

      if (fileInfos.length < 2) {
        return reply.status(400).send({
          error:
            fileInfos.length === 0
              ? "No images could be analyzed"
              : "At least 2 processable images are required for duplicate detection",
          skippedFiles,
        });
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
        totalImages: fileInfos.length,
        duplicateGroups: groups,
        uniqueImages: fileInfos.length - assigned.size,
        spaceSaveable,
        skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
      });
    } catch (err) {
      // Let the global handler answer a missing decoder as 503 and report it,
      // the way the other custom routes do (#795, #1428).
      if (isDecoderUnavailable(err)) throw err;
      return reply.status(422).send({
        error: "Duplicate detection failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
