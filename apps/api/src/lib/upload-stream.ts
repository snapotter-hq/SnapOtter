import type { MultipartFile } from "@fastify/multipart";
import { putObjectStream } from "./object-storage.js";

export interface ReceivedUpload {
  key: string;
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
  opts: { maxBytes?: number } = {},
): Promise<ReceivedUpload> {
  const filename = (part.filename || "upload").replace(/[/\\\0]/g, "_");
  const key = `uploads/${jobId}/${filename}`;
  const size = await putObjectStream(key, part.file, { maxBytes: opts.maxBytes });
  return { key, filename, size };
}
