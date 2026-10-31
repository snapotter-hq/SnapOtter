import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyBaseLogger } from "fastify";
import { validatePdfPath } from "../modality/document-input.js";
import { sanitizeFilename } from "./filename.js";
import { logger } from "./logger.js";
import { copyReadableToFile, deleteObject, putObjectStream } from "./object-storage.js";

export interface SpooledMultipartFile {
  path: string;
  filename: string;
  size: number;
}

export function configuredUploadLimit(maxUploadSizeMb: number): number | undefined {
  if (!Number.isFinite(maxUploadSizeMb) || maxUploadSizeMb <= 0) return undefined;
  return Math.floor(maxUploadSizeMb * 1024 * 1024);
}

/** Stream a multipart file to request scratch without accumulating chunks. */
export async function spoolMultipartFile(
  part: MultipartFile,
  scratchDir: string,
  index: number,
  opts: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<SpooledMultipartFile> {
  const filename = sanitizeFilename(part.filename || "file");
  const path = join(scratchDir, `${index}-${filename}`);
  const size = await copyReadableToFile(part.file, path, opts);
  return { path, filename, size };
}

/** Validate a spooled PDF by path, then stream the same bytes to its final object ref. */
export async function storeValidatedOcrPdf(
  file: SpooledMultipartFile,
  key: string,
  opts: {
    maxBytes: number;
    signal?: AbortSignal;
    beforeStore?: () => Promise<void>;
    log?: Pick<FastifyBaseLogger, "warn">;
  },
): Promise<number> {
  await validatePdfPath(file.path, {
    rejectPasswordProtected: true,
    signal: opts.signal,
  });
  await opts.beforeStore?.();
  const stream = createReadStream(file.path);
  try {
    let written: number;
    try {
      written = await putObjectStream(key, stream, opts);
    } finally {
      stream.on("error", () => {});
      if (!stream.destroyed) {
        stream.destroy();
      }
    }
    if (written !== file.size) {
      throw new Error(`OCR PDF scratch file changed size (${file.size} to ${written} bytes)`);
    }
    return written;
  } catch (error) {
    await deleteObject(key).catch((err) => {
      (opts.log ?? logger).warn({ err, key }, "Failed to delete failed OCR PDF upload");
    });
    throw error;
  }
}
