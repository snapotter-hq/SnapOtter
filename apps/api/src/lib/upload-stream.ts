import type { MultipartFile } from "@fastify/multipart";
import { sanitizeFilename } from "./filename.js";
import { putObjectStream } from "./object-storage.js";

export interface ReceivedUpload {
  key: string;
  /**
   * Canonically sanitized filename (lib/filename.ts), the exact basename
   * embedded in `key`. Callers MUST use this value when building download
   * URLs or lookups; do NOT re-sanitize.
   */
  filename: string;
  size: number;
}

/**
 * Streams one multipart file part into uploads/<jobId>/<filename> without
 * buffering it in memory. maxBytes aborts mid-stream (storage cleans up).
 */
export async function receiveUpload(
  part: MultipartFile,
  jobId: string,
  opts: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<ReceivedUpload> {
  const filename = sanitizeFilename(part.filename || "upload");
  const key = `uploads/${jobId}/${filename}`;
  const size = await putObjectStream(key, part.file, {
    maxBytes: opts.maxBytes,
    signal: opts.signal,
  });
  return { key, filename, size };
}
