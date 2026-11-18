import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { InputValidationError } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";
import { reportEngineUnavailable } from "./engine-unavailable.js";
import { getObjectBuffer, isStorageServiceFault, normalizeS3ReadFault } from "./object-storage.js";

export interface MediaRejection {
  status: number;
  body: Record<string, string>;
}

/**
 * Runs the media ingress checks createToolRoute applies to video and audio
 * tools (ffprobe parse, stream type, operator duration and bitrate caps) on an
 * upload a hand-written route has already staged to object storage. Returns
 * the 4xx/5xx answer to send, or null when the file may be enqueued (#4290).
 */
export async function validateStagedMedia(opts: {
  key: string;
  filename: string;
  kind: "video" | "audio";
  toolId: string;
  jobId: string;
  log: FastifyBaseLogger;
}): Promise<MediaRejection | null> {
  let buffer: Buffer;
  try {
    buffer = await getObjectBuffer(opts.key);
  } catch (err) {
    if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
    throw err;
  }

  // Same "-prep" suffix as the factory: the worker's scratch dir is
  // <scratchRoot>/<jobId>-<attempt uuid>, and this one is removed as soon as we answer.
  const scratchDir = join(tmpdir(), "snapotter-scratch", `${opts.jobId}-prep`);
  await mkdir(scratchDir, { recursive: true });
  try {
    await inputHandlerFor(opts.kind).prepare(buffer, opts.filename, { scratchDir });
    return null;
  } catch (err) {
    if (!(err instanceof InputValidationError)) throw err;
    reportEngineUnavailable(err, opts.toolId, opts.log);
    const body: Record<string, string> = { error: err.message };
    if (err.details) body.details = err.details;
    if (err.code) body.code = err.code;
    return { status: err.statusCode, body };
  } finally {
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}
