import { hasServerErrorStatus, isSafeMessageError, isToolInputError } from "@snapotter/shared";
import type { Job } from "bullmq";
import { reportError, safeFormatTag } from "../lib/error-report.js";
import { logger } from "../lib/logger.js";
import type { ToolJobData, ToolJobResult } from "./types.js";

export interface LegacyResultPayload {
  jobId: string;
  downloadUrl: string;
  previewUrl?: string;
  originalSize: number;
  processedSize: number;
  savedFileId?: string;
  autoSaveError?: string;
  [key: string]: unknown;
}

export function buildLegacyResultPayload(
  jobResult: ToolJobResult,
  jobId: string,
): LegacyResultPayload {
  const outName = jobResult.filename;
  const payload: LegacyResultPayload = {
    jobId,
    downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    originalSize: jobResult.originalSize,
    processedSize: jobResult.processedSize,
  };
  if (jobResult.previewRef) {
    const previewFilename = jobResult.previewRef.split("/").pop();
    payload.previewUrl = `/api/v1/download/${jobId}/${previewFilename}`;
  }
  if (jobResult.savedFileId) {
    payload.savedFileId = jobResult.savedFileId;
  }
  if (jobResult.autoSaveError) {
    payload.autoSaveError = jobResult.autoSaveError;
  }
  if (jobResult.resultPayload) {
    Object.assign(payload, jobResult.resultPayload);
  }
  return payload;
}

/**
 * The machine-readable half of an InputValidationError, kept on the failed job
 * row next to the message. An ENGINE_UNAVAILABLE raised inside the worker (qpdf
 * breaking between enqueue and pickup, say) otherwise loses the code and the
 * "Check QPDF_PATH" hint the route would have sent (#1403).
 */
export function validationErrorFields(err: unknown): { code?: string; details?: string } {
  // A storage fault raised as a SafeError (the workspace cap, a full or
  // unwritable volume) keeps its code too, so a route reading the row answers
  // it as the fault it is (#2210).
  if (isSafeMessageError(err) && hasServerErrorStatus(err)) {
    return typeof err.code === "string" ? { code: err.code } : {};
  }
  if (!(err instanceof Error) || err.name !== "InputValidationError") return {};
  const { code, details } = err as { code?: unknown; details?: unknown };
  return {
    ...(typeof code === "string" && { code }),
    ...(typeof details === "string" && { details }),
  };
}

/**
 * The HTTP status a failed job deserves, kept on the failed job row so a
 * route waiting on the job answers it instead of a generic 422 (#1742). The
 * error itself doesn't survive the queue, so the row is the only carrier, and
 * the failed progress frame rewrites that row, so it has to carry it too.
 */
export function failureStatus(err: unknown): { httpStatus?: number } {
  if (err instanceof Error && err.name === "InputValidationError") {
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    return { httpStatus: typeof statusCode === "number" ? statusCode : 400 };
  }
  // Any other error that already says it is the server's (a storage fault, a
  // failed write) keeps its status instead of reading as a bad file (#2210).
  if (hasServerErrorStatus(err)) return { httpStatus: err.statusCode };
  return isToolInputError(err) ? { httpStatus: 400 } : {};
}

/** Enqueue to latest-attempt start; undefined if the job never became active. */
export function jobAgeMs(job: Job): number | undefined {
  return job.processedOn ? job.processedOn - job.timestamp : undefined;
}

/**
 * Report a tool job failure to Sentry (and log Python sidecar frames when
 * present). Shared by the worker's `failed` listener (single-file tool jobs
 * and hard-failed finalizes) and by `processPipelineStep` / `processBatchChild`,
 * which catch `processToolJob` rejections and return failure markers so their
 * BullMQ parent flows still settle (#951).
 */
export function reportToolJobFailure(
  job: Job<ToolJobData>,
  err: unknown,
  poolFallback?: string,
): void {
  const data = job.data as ToolJobData | undefined;
  const pool = poolFallback ?? data?.pool;
  const jobId = job.id ?? data?.jobId;
  const failedErr =
    err instanceof Error && err.name === "UnrecoverableError" && err.cause instanceof Error
      ? err.cause
      : err;
  const pf = (failedErr as { pythonFrames?: unknown } | null)?.pythonFrames;
  if (Array.isArray(pf) && pf.length) {
    logger.error({ pool, jobId, pythonFrames: pf }, "sidecar failure");
  }
  void reportError(failedErr, {
    source: "worker",
    pool,
    toolId: data?.toolId,
    jobId,
    inputFormat: safeFormatTag(data?.inputRefs?.[0]) ?? safeFormatTag(data?.filename),
    settings: data?.settings,
    jobAgeMs: jobAgeMs(job),
  });
}
