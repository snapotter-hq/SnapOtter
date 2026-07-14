import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import { validatePdfPath } from "../modality/document-input.js";
import { sanitizeFilename } from "./filename.js";
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
  opts: { maxBytes: number; signal?: AbortSignal },
): Promise<number> {
  await validatePdfPath(file.path, {
    rejectPasswordProtected: true,
    signal: opts.signal,
  });
  try {
    const written = await putObjectStream(key, createReadStream(file.path), opts);
    if (written !== file.size) {
      throw new Error(`OCR PDF scratch file changed size (${file.size} to ${written} bytes)`);
    }
    return written;
  } catch (error) {
    await deleteObject(key).catch(() => {});
    throw error;
  }
}
