import { join } from "node:path";
import { SafeError } from "@snapotter/shared";
import { formatLimit } from "../lib/multipart-parts.js";
import {
  copyObjectToFile,
  getObjectBuffer,
  getObjectSize,
  isMissingObjectError,
  isStorageServiceFault,
  normalizeS3ReadFault,
  verifyS3Bucket,
} from "../lib/object-storage.js";
import { OCR_MAX_ENCODED_INPUT_BYTES } from "../lib/ocr-limits.js";
import { InputValidationError } from "../modality/contract.js";
import type { ToolProcessInputV2 } from "../routes/tool-factory.js";
import type { AiPathJobInput } from "./ai-handlers.js";

/**
 * Load one queued input while preserving OCR's encoded-size ceiling across
 * direct, batch, and pipeline ingress. The size check happens before the
 * object is materialized as a Buffer.
 */
export async function loadToolInputBuffer(toolId: string, ref: string): Promise<Buffer> {
  if (toolId === "ocr-pdf") {
    throw new Error("OCR PDF input must use the path-backed loader");
  }
  if (toolId === "ocr") {
    let size: number;
    try {
      size = await getObjectSize(ref);
    } catch (err) {
      if (isMissingObjectError(err)) {
        await verifyS3Bucket();
      } else if (isStorageServiceFault(err)) {
        throw normalizeS3ReadFault(err);
      }
      throw err;
    }
    if (size > OCR_MAX_ENCODED_INPUT_BYTES) {
      throw new InputValidationError(
        `OCR input exceeds the ${formatLimit(OCR_MAX_ENCODED_INPUT_BYTES)} safety limit`,
        413,
      );
    }
  }
  try {
    return await getObjectBuffer(ref);
  } catch (err) {
    if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
    throw err;
  }
}

export interface LoadedToolInputs {
  inputs: ToolProcessInputV2[];
  inputBuffer?: Buffer;
  pathInput?: AiPathJobInput;
  originalSize: number;
}

/**
 * Load a job's queued inputs. A queued input can legitimately be gone by the
 * time the job runs (the TTL sweep behind a backed-up queue, a team
 * deleteAfter deadline, a GDPR erase), and that is the environment, not our
 * code: surface it as an operational failure with a message the user can act
 * on, instead of a raw, stackless ENOENT that Sentry files as a bug (#901).
 */
export async function loadToolInputs(
  toolId: string,
  refs: string[],
  filename: string,
  scratchDir: string,
  signal: AbortSignal,
): Promise<LoadedToolInputs> {
  try {
    return await readToolInputs(toolId, refs, filename, scratchDir, signal);
  } catch (err) {
    if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
    if (!isMissingObjectError(err)) throw err;
    // The OCR PDF path also writes to scratch, where an ENOENT would be our
    // own bug. Relabel only when storage confirms a queued input is gone.
    const gone = await Promise.all(refs.map(isQueuedInputGone));
    if (!gone.includes(true)) throw err;
    await verifyS3Bucket();
    throw new SafeError("Input file is no longer available. Upload it again.", {
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      cause: err,
    });
  }
}

/** True only when storage says the object is missing; any other probe fault is not proof. */
async function isQueuedInputGone(ref: string): Promise<boolean> {
  try {
    await getObjectSize(ref);
    return false;
  } catch (err) {
    return isMissingObjectError(err);
  }
}

/** Load OCR PDFs to bounded scratch storage; all other tools remain Buffer-based. */
async function readToolInputs(
  toolId: string,
  refs: string[],
  filename: string,
  scratchDir: string,
  signal: AbortSignal,
): Promise<LoadedToolInputs> {
  if (refs.length === 0) throw new InputValidationError("No input object was queued");

  if (toolId === "ocr-pdf") {
    if (refs.length !== 1) {
      throw new InputValidationError("OCR PDF accepts exactly one input object");
    }
    const path = join(scratchDir, "input.pdf");
    try {
      const size = await copyObjectToFile(refs[0], path, {
        maxBytes: OCR_MAX_ENCODED_INPUT_BYTES,
        signal,
      });
      return { inputs: [], pathInput: { path, size }, originalSize: size };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        error.statusCode === 413
      ) {
        throw new InputValidationError(
          `OCR input exceeds the ${formatLimit(OCR_MAX_ENCODED_INPUT_BYTES)} safety limit`,
          413,
        );
      }
      throw error;
    }
  }

  const inputs: ToolProcessInputV2[] = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      buffer: await loadToolInputBuffer(toolId, ref),
      filename: ref.split("/").slice(2).join("/") || filename,
    })),
  );
  inputs[0].filename = filename;
  return {
    inputs,
    inputBuffer: inputs[0].buffer,
    originalSize: inputs[0].buffer.length,
  };
}
