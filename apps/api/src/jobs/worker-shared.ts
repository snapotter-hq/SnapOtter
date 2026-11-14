import {
  hasServerErrorStatus,
  isSafeMessageError,
  isToolInputError,
  SafeError,
} from "@snapotter/shared";
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
      : namedStallError(err);
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

// BullMQ's own failure for a job whose lock was lost past maxStalledCount
// (set by moveStalledJobsToWait as deferredFailure, then thrown by the worker
// run loop). maxStartedAttempts produces the "started" variant.
const BULLMQ_STALL_MESSAGE = /^job (stalled|started) more than allowable limit$/;

/**
 * Give BullMQ's cause-less stall failure a constant SafeError so the Sentry
 * event names it. The scrubber keeps only rebuilt values, and a plain BullMQ
 * error has none, so it arrived as "UnrecoverableError: UnrecoverableError"
 * (Sentry NODE-4J). Still operational and throttled, as before (NODE-27).
 */
function namedStallError(err: unknown): unknown {
  if (!(err instanceof Error) || err.name !== "UnrecoverableError") return err;
  if (!BULLMQ_STALL_MESSAGE.test(err.message)) return err;
  return new SafeError(
    "The job was interrupted more times than the queue allows. Its worker lost the job lock, usually because the process restarted or ran short of memory or CPU.",
    { kind: "operational", code: "JOB_STALLED", cause: err },
  );
}

interface ProgressTarget {
  id?: string;
  updateProgress(progress: { percent: number; stage?: string }): Promise<void>;
}

/**
 * Best-effort BullMQ progress writes for one job attempt. The job hash can
 * vanish under a running processor, and BullMQ then rejects every write with
 * "Missing key for job"; fired with `void`, each one escaped as an unhandled
 * rejection, one Sentry event per percent (Sentry NODE-AT). Clients follow the
 * pub/sub frame and the jobs row, never this hash, so the first failure is
 * logged and the rest of the attempt's writes are skipped.
 */
export function createJobProgressSink(
  job: ProgressTarget,
  toolId?: string,
): (progress: { percent: number; stage?: string }) => void {
  let failed = false;
  return (progress) => {
    if (failed) return;
    // Through a resolved promise so a synchronous throw takes the same path.
    Promise.resolve()
      .then(() => job.updateProgress(progress))
      .catch((err: unknown) => {
        if (failed) return;
        failed = true;
        logger.warn(
          { err, jobId: job.id, toolId },
          "BullMQ job progress update failed; skipping the rest of this attempt's progress writes",
        );
      });
  };
}
