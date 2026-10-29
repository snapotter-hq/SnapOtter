/**
 * In-process BullMQ worker pools.
 *
 * One Worker per processing pool (image, media, ai, docs, system).
 * Tool jobs are dispatched to the tool registry or AI handler registry;
 * system jobs are routed to the system-jobs module.
 *
 * Each tool job gets:
 *   - A per-job scratch directory (cleaned up in finally)
 *   - An AbortController registered for cooperative cancellation
 *   - A timeout guard that aborts the signal with reason "timeout"
 *   - Durable DB row updates at each lifecycle stage
 *   - Progress events via Redis pub/sub (updateSingleFileProgress)
 *
 * Timeout vs cancel: the timeout guard calls ac.abort("timeout") so
 * signal.reason === "timeout" distinguishes it from a user cancel
 * (which calls ac.abort() with no args, yielding an AbortError
 * DOMException reason). Timed-out jobs get status "failed" and are
 * retried per the queue's attempts policy; canceled jobs get status
 * "canceled" and are never retried. Terminal DB writes and SSE frames
 * are deferred until the final attempt so intermediate retries stay
 * invisible to the client. A user cancel is also recorded on its own
 * signal (cancel.ts userCancelSignal): the streamed uploads after the
 * handler combine that signal with a fresh upload timeout (#2295) and the
 * buffered writes re-check wasUserCanceled, since a cancel that lands
 * after the deadline can't re-abort the job's controller, and a deadline
 * alone must not discard a result the handler went on to return (#2144).
 */
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { configureSharpConcurrency } from "@snapotter/image-engine";
import { HW_ACCEL_FAMILIES, hwAccelStatus, softwareEncoderStatus } from "@snapotter/media-engine";
import {
  ANALYTICS_EVENTS,
  extractErrorCode,
  getBundleForTool,
  getOptionalBundleForTool,
  hasServerErrorStatus,
  IMAGE_EXT_TO_MIME,
  isSafeMessageError,
  isToolInputError,
  ONBOARDING_FIRST_PROCESSED_KEY,
  type PipelineExecutedProperties,
  SafeError,
  TOOLS,
} from "@snapotter/shared";
import archiver from "archiver";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import sharp from "sharp";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { type BatchFileNotes, pickBatchFileNotes } from "../lib/batch-file-notes.js";
import {
  binaryOverrideWarning,
  checkBinaryOverrides,
  isBinarySpawnFailure,
  probeFailureLevel,
} from "../lib/binary-overrides.js";
import { allFailedFault, type BatchFault } from "../lib/engine-unavailable.js";
import { resolveConcurrency, resolveWorkerThreads } from "../lib/env.js";
import { classifyError, reportError, safeFormatTag } from "../lib/error-report.js";
import { friendlyError, sharedFailureReason, stripInternalPaths } from "../lib/errors.js";
import { createUniqueNamer } from "../lib/filename.js";
import { logger } from "../lib/logger.js";
import { jobDuration, jobsTotal } from "../lib/metrics.js";
import { formatLimit } from "../lib/multipart-parts.js";
import {
  copyObjectToFile,
  deletePrefix,
  getObjectBuffer,
  getObjectSize,
  getObjectStream,
  isMissingObjectError,
  isStorageServiceFault,
  normalizeS3ReadFault,
  putObject,
  putObjectStream,
  verifyS3Bucket,
} from "../lib/object-storage.js";
import { OCR_MAX_ENCODED_INPUT_BYTES } from "../lib/ocr-limits.js";
import { SCRUB_PDF_PRODUCER_TOOLS, scrubPdfProducer } from "../lib/pdf-producer.js";
import { resolveCanonicalToolId } from "../lib/pool.js";
import { setSettingIfAbsent } from "../lib/settings-helpers.js";
import { timeoutMessage } from "../lib/timeout.js";
import {
  emitWorkerBatchAudit,
  emitWorkerPipelineAudit,
  emitWorkerToolAudit,
} from "../lib/tool-audit.js";
import { InputValidationError } from "../modality/contract.js";
import {
  cancelBatchJob,
  cancelSingleJobGuarded,
  completeBatchJob,
  failBatchJob,
  failSingleJobGuarded,
  publishEphemeral,
  updateSingleFileProgress,
  updateSingleFileProgressAtomically,
} from "../routes/progress.js";
import {
  getToolConfig,
  type ToolProcessCtx,
  type ToolProcessInputV2,
} from "../routes/tool-factory.js";
import {
  type AiPathJobInput,
  hasAiJobHandler,
  hasAiPathJobHandler,
  runAiPathToolJob,
  runAiToolJob,
} from "./ai-handlers.js";
import { isBatchCanceled, readBatchCounters, recordChildOutcome } from "./batch-progress.js";
import { batchChildDirs, reclaimBatchChildStorage } from "./batch-reclaim.js";
import {
  claimFinalize,
  registerCancelable,
  releaseFinalize,
  unregisterCancelable,
  userCancelSignal,
  wasUserCanceled,
} from "./cancel.js";
import { createBullMQConnection } from "./connection.js";
import { createMonotonicReporter } from "./monotonic-progress.js";
import { resolveOutputSource } from "./output-resolve.js";
import {
  type AutoSaveTx,
  buildOutputName,
  generatePreview,
  type StagedAutoSave,
  stageAutoSaveToLibrary,
} from "./postprocess.js";
import { runSystemJob, SYSTEM_JOBS } from "./system-jobs.js";
import {
  POOLS,
  type Pool,
  queueName,
  resultPayloadKey,
  type ToolJobData,
  type ToolJobResult,
} from "./types.js";

// ── Helpers ────────────────────────────────────────────────────

/** SCRATCH_PATH defaults to "" in the env schema; the empty string
 *  intentionally falls through to the OS tmpdir. */
function scratchRoot(): string {
  return env.SCRATCH_PATH || join(tmpdir(), "snapotter-scratch");
}

export function timeoutMsFor(pool: Pool, toolId?: string): number {
  const canonicalId = toolId ? resolveCanonicalToolId(toolId) : undefined;
  const tool = canonicalId ? TOOLS.find((t) => t.id === canonicalId) : undefined;
  if (pool === "ai" || pool === "media" || tool?.executionHint === "long") {
    return env.JOB_TIMEOUT_LONG_S * 1000;
  }
  return env.JOB_TIMEOUT_FAST_S * 1000;
}

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
/**
 * Which body runs a job: the path-backed AI handler, the AI job handler, or the
 * tool registry's process fn.
 *
 * Registering an AI job handler says the tool is AI-backed; it does not say the
 * handler owns every job shape. The handler is the standalone path (for
 * remove-background, Phase 1 of a two-phase flow), while the process fn owns
 * the finished job. Letting the handler win every kind is how thirteen tools
 * came to behave differently in a pipeline than on their own page (#2076).
 * ocr-pdf keeps its path-backed handler contract either way.
 */
export function selectJobDispatch(toolId: string, kind: ToolJobData["kind"]): JobDispatch {
  if (hasAiPathJobHandler(toolId)) return "ai-path";
  if ((kind === "pipeline-step" || kind === "batch-child") && getToolConfig(toolId)?.processV2) {
    return "registry";
  }
  return hasAiJobHandler(toolId) ? "ai-handler" : "registry";
}

export type JobDispatch = "ai-path" | "ai-handler" | "registry";

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

// ── Legacy result payload ──────────────────────────────────────

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

// ── Tool job processor ─────────────────────────────────────────

/**
 * Dimensions shared by both tool_used branches, kept in one place so the
 * success and failure events never drift. input_format is the safe extension
 * only (never the filename); is_batch flags a per-file batch child so batch
 * volume is distinguishable from single runs; execution_hint records the tool's
 * sync/async class.
 */
function toolUsedBaseProps(data: ToolJobData, durationMs: number): Record<string, unknown> {
  const canonicalId = resolveCanonicalToolId(data.toolId);
  const tool = TOOLS.find((t) => t.id === canonicalId);
  return {
    tool_id: data.toolId,
    duration_ms: durationMs,
    category: tool?.category ?? "unknown",
    is_ai_tool:
      getBundleForTool(canonicalId) !== null || getOptionalBundleForTool(canonicalId) !== null,
    is_batch: data.kind === "batch-child",
    input_format: safeFormatTag(data.filename) ?? "unknown",
    execution_hint: tool?.executionHint ?? "fast",
  };
}

/**
 * The machine-readable half of an InputValidationError, kept on the failed job
 * row next to the message. An ENGINE_UNAVAILABLE raised inside the worker (qpdf
 * breaking between enqueue and pickup, say) otherwise loses the code and the
 * "Check QPDF_PATH" hint the route would have sent (#1403).
 */
function validationErrorFields(err: unknown): { code?: string; details?: string } {
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
function failureStatus(err: unknown): { httpStatus?: number } {
  if (err instanceof Error && err.name === "InputValidationError") {
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    return { httpStatus: typeof statusCode === "number" ? statusCode : 400 };
  }
  // Any other error that already says it is the server's (a storage fault, a
  // failed write) keeps its status instead of reading as a bad file (#2210).
  if (hasServerErrorStatus(err)) return { httpStatus: err.statusCode };
  return isToolInputError(err) ? { httpStatus: 400 } : {};
}

const ABORT_ERROR_MESSAGE =
  /^(?:cancel+ed|aborted(?: by signal| before start)?|the operation was aborted|(?:job|python script|ffprobe|tesseract(?: ocr| language-pack preflight)?|pdf ocr) (?:was )?cancel+ed|accurate ocr runtime request was aborted|timeout)$/i;

/**
 * True when an error thrown after the job deadline is the abort signal itself
 * rather than the handler's own failure (#2294). Handlers and engine runners
 * surface a cooperative abort as an AbortError, AnimatedRemovalCanceledError,
 * the raw "timeout" abort reason from signal.throwIfAborted(), or a short
 * cancel/abort message ("Canceled", "Aborted by signal", ...).
 */
export function isTimeoutAbortError(err: unknown): boolean {
  if (err === "timeout") return true;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "AnimatedRemovalCanceledError") {
      return true;
    }
    const code = (err as { code?: unknown }).code;
    if (code === "ABORT_ERR" || code === "canceled") return true;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return ABORT_ERROR_MESSAGE.test(message.trim());
}

async function processToolJob(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;
  const { jobId } = data;
  const startTime = Date.now();

  // Extract OTel trace context if present (no-op without SDK)
  const otel = data._otel;
  const parentCtx = otel?.traceparent ? propagation.extract(ROOT_CONTEXT, otel) : ROOT_CONTEXT;
  const tracer = trace.getTracer("snapotter-worker");
  const span = otel?.traceparent
    ? tracer.startSpan(
        "job.process",
        {
          attributes: {
            "snapotter.job_id": jobId,
            "snapotter.tool_id": data.toolId,
            "snapotter.pool": data.pool,
            "snapotter.attempt_number": job.attemptsMade + 1,
            // Standard messaging semantics so Sentry (when tracing is enabled)
            // labels this as a queue-consumer span and the tracesSampler
            // recognizes a real job execution vs a poll.
            "messaging.system": "bullmq",
            "messaging.destination.name": queueName(data.pool),
          },
        },
        parentCtx,
      )
    : null;

  const runBody = async (): Promise<ToolJobResult> => {
    if (span) span.addEvent("job.active");

    // Register for cooperative cancellation
    const ac = registerCancelable(jobId);
    const signal = ac.signal;
    // Fires on a user cancel only, never on the deadline (#2144). The streamed
    // uploads combine this with a fresh upload budget once the handler returns
    // (#2295), and the library auto-save after the handler takes this signal (the
    // other buffered writes re-check wasUserCanceled instead): a handler that
    // ignored the signal and returned after the deadline has a finished result
    // worth keeping, while a user cancel still has to stop the upload.
    const userCancel = userCancelSignal(jobId);

    // Timeout guard (0 means unlimited; only arm when positive)
    const timeoutMs = timeoutMsFor(data.pool, data.toolId);
    const timeoutHandle =
      timeoutMs > 0 ? setTimeout(() => ac.abort("timeout"), timeoutMs) : undefined;

    // Per-job scratch directory
    const scratchDir = join(scratchRoot(), jobId);

    // Read by the catch below (#2144): once the handler has returned, the
    // deadline can't be the cause of a later error.
    let handlerReturned = false;
    let finalizeClaimed = false;

    try {
      await mkdir(scratchDir, { recursive: true });

      // Cooperative window cancel (#886): a cancel that landed before this
      // job reached the queue settled the alias row durably; honor it
      // before any work or status write. The pointer match keeps a stale
      // canceled alias from a previous run under a reused id from killing
      // this one (upsertToolJobAlias resets the row on re-point, so both
      // halves agree). Aborting the signal routes the throw through the
      // catch's existing cancel bookkeeping (row, metrics, frame,
      // UnrecoverableError). A fault in the read falls through to normal
      // processing, mirroring the pipeline step's skip: a failed check
      // must not wedge the job.
      if (data.clientJobId && data.clientJobId !== jobId) {
        try {
          const [alias] = await db
            .select({ status: schema.jobs.status, settings: schema.jobs.settings })
            .from(schema.jobs)
            .where(eq(schema.jobs.id, data.clientJobId));
          const pointer = (alias?.settings as { artifactJobId?: string } | null)?.artifactJobId;
          if (alias?.status === "canceled" && pointer === jobId) {
            ac.abort();
            throw new Error("Canceled");
          }
        } catch (gateErr) {
          if (signal.aborted) throw gateErr;
          logger.warn(
            { err: gateErr, jobId, clientJobId: data.clientJobId },
            "window-cancel gate read failed; processing the job normally",
          );
        }
      }

      // Mark job as processing in the durable row
      await db
        .update(schema.jobs)
        .set({
          status: "processing",
          startedAt: new Date(),
          attempts: job.attemptsMade + 1,
        })
        .where(eq(schema.jobs.id, jobId));

      const { inputs, inputBuffer, pathInput, originalSize } = await loadToolInputs(
        data.toolId,
        data.inputRefs,
        data.filename,
        scratchDir,
        signal,
      );

      // Progress reporter: emits both Redis pub/sub and BullMQ job progress.
      // Wrapped so a tool that reports from more than one source (a two-pass
      // ffmpeg run, or a sidecar with its own scale) cannot send the client's
      // progress bar backwards. One reporter per attempt, so retries restart.
      const progressJobId = data.clientJobId ?? jobId;
      const report = createMonotonicReporter((percent: number, stage?: string) => {
        void updateSingleFileProgress({
          jobId: progressJobId,
          phase: "processing",
          percent,
          stage,
          ...(progressJobId !== jobId && { expectedArtifactJobId: jobId }),
        });
        void job.updateProgress({ percent, stage });
      });

      // Check for cancellation before dispatching
      if (signal.aborted) throw new Error("Canceled");

      // Build the process context
      const ctx: ToolProcessCtx = { signal, scratchDir, report };

      // Dispatch: AI handler or standard tool registry
      let resultBuffer: Buffer | null = null;
      // Set instead of resultBuffer when the output exceeds the buffering cap
      // (Sentry NODE-2Z): the scratch file streams to storage untouched.
      let resultStreamPath: string | null = null;
      let resultSize = 0;
      let resultFilename: string;
      let resultContentType: string;
      let resultPayload: Record<string, unknown> | undefined;
      let extraOutputs:
        | Array<{ name: string; buffer?: Buffer; scratchPath?: string; contentType: string }>
        | undefined;

      const dispatch = selectJobDispatch(data.toolId, data.kind);

      if (dispatch === "ai-path") {
        if (!pathInput) throw new Error(`No path-backed input for ${data.toolId}`);
        const aiResult = await runAiPathToolJob(data, pathInput, ctx);
        handlerReturned = true;
        resultBuffer = aiResult.buffer;
        resultSize = aiResult.buffer.length;
        resultFilename = aiResult.filename;
        resultContentType = aiResult.contentType;
        resultPayload = aiResult.resultPayload;
        extraOutputs = aiResult.extraOutputs;
      } else if (dispatch === "ai-handler") {
        if (!inputBuffer) throw new Error(`No buffered input for ${data.toolId}`);
        const aiResult = await runAiToolJob(data, inputBuffer, ctx);
        handlerReturned = true;
        resultBuffer = aiResult.buffer;
        resultSize = aiResult.buffer.length;
        resultFilename = aiResult.filename;
        resultContentType = aiResult.contentType;
        resultPayload = aiResult.resultPayload;
        extraOutputs = aiResult.extraOutputs;
      } else {
        const config = getToolConfig(data.toolId);
        if (!config) throw new Error(`No tool config for ${data.toolId}`);

        // Use the resolved v2 process function (adapter or native)
        if (!config.processV2) throw new Error(`No processV2 for ${data.toolId}`);
        const result = await config.processV2({
          inputs,
          settings: data.settings,
          scratchDir,
          signal,
          report,
        });
        handlerReturned = true;

        // Resolve buffer OR scratchPath for the primary output. Over-cap
        // scratch files stay on disk and stream to storage below.
        const primary = await resolveOutputSource(
          result,
          `Tool ${data.toolId} returned neither buffer nor scratchPath`,
        );
        if (primary.kind === "buffer") {
          resultBuffer = primary.buffer;
        } else {
          resultStreamPath = primary.scratchPath;
        }
        resultSize = primary.size;
        resultFilename = result.filename;
        resultContentType = result.contentType;
        resultPayload = result.resultPayload;

        // Resolve extra outputs with the same buffer/scratchPath duality
        if (result.extraOutputs) {
          extraOutputs = await Promise.all(
            result.extraOutputs.map(async (extra) => {
              const source = await resolveOutputSource(
                extra,
                `Extra output "${extra.name}" has neither buffer nor scratchPath`,
              );
              return source.kind === "buffer"
                ? { name: extra.name, buffer: source.buffer, contentType: extra.contentType }
                : {
                    name: extra.name,
                    scratchPath: source.scratchPath,
                    contentType: extra.contentType,
                  };
            }),
          );
        }
      }

      // Build output name with tool suffix and extension fixup
      const outName = buildOutputName(
        resultFilename,
        data.filename,
        data.toolId,
        resultContentType,
      );

      // A handler that never reads the signal can still finish after a user cancel
      // landed. Settle it as canceled before metadata scrubbing or storage writes
      // (#2092, #3254). A timeout abort alone is left be: that result is finished
      // and good, and throwing here would retry the whole job.
      if (wasUserCanceled(jobId)) throw new Error("Canceled");

      // Generated PDFs carry the conversion engine's name as Producer/Creator
      // (LibreOffice, Ghostscript, pdfcpu, ...); stamp SnapOtter instead.
      // Best effort: a failed scrub keeps the original bytes. Pass userCancel
      // (never the deadline signal) so a user cancel stops doc_scrub_meta
      // without discarding a finished result on a deadline overrun (#2144, #3254).
      if (
        SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) &&
        outName.toLowerCase().endsWith(".pdf") &&
        resultBuffer
      ) {
        resultBuffer = await scrubPdfProducer(resultBuffer, { signal: userCancel });
        resultSize = resultBuffer.length;
        if (wasUserCanceled(jobId)) throw new Error("Canceled");
      }

      // Persist the tool's own resultPayload before the primary output (#1389)
      // so the deliverable artifact never exists on disk without its sidecar,
      // and stranded-job reconciliation can restore resize and target-size notes
      // when the terminal DB write is lost. orderArtifacts ignores the sidecar,
      // so a crash between the two writes still reconciles as failed.
      if (resultPayload) {
        const payloadJson = JSON.stringify(resultPayload);
        if (payloadJson !== "{}") {
          await putObject(resultPayloadKey(jobId), Buffer.from(payloadJson, "utf8"));
        }
      }

      // Give streamed output uploads a fresh budget from the moment the first
      // streamed upload begins after the handler returned (#2295). Starting this
      // before the handler would reintroduce #2144's discarded-result bug when
      // the job deadline fires under a handler that finishes anyway, and lazy
      // creation avoids arming an unused timer on buffered jobs. A tripped
      // upload budget surfaces through putObjectStream as a storage fault
      // (logged, reported, and retried).
      let uploadSignal: AbortSignal | undefined;
      const getUploadSignal = (): AbortSignal => {
        uploadSignal ??=
          timeoutMs > 0
            ? AbortSignal.any([userCancel, AbortSignal.timeout(timeoutMs)])
            : userCancel;
        return uploadSignal;
      };

      // Write primary output to object storage
      const primaryKey = `outputs/${jobId}/${outName}`;
      if (resultBuffer) {
        await putObject(primaryKey, resultBuffer);
      } else if (resultStreamPath) {
        resultSize = await putObjectStream(primaryKey, createReadStream(resultStreamPath), {
          signal: getUploadSignal(),
        });
      }
      const outputRefs: string[] = [primaryKey];

      // Write extra outputs (AI tools may produce multiple files)
      if (extraOutputs) {
        for (const extra of extraOutputs) {
          if (wasUserCanceled(jobId)) throw new Error("Canceled");
          const extraKey = `outputs/${jobId}/${extra.name}`;
          if (extra.buffer) {
            const body =
              SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) && extra.name.toLowerCase().endsWith(".pdf")
                ? await scrubPdfProducer(extra.buffer, { signal: userCancel })
                : extra.buffer;
            if (wasUserCanceled(jobId)) throw new Error("Canceled");
            await putObject(extraKey, body);
          } else if (extra.scratchPath) {
            // Over-cap extra: streamed as-is. The producer scrub needs bytes in
            // memory, and no real PDF reaches the buffering cap.
            await putObjectStream(extraKey, createReadStream(extra.scratchPath), {
              signal: getUploadSignal(),
            });
          }
          outputRefs.push(extraKey);
        }
      }

      // Generate preview for non-browser-previewable formats. A streamed
      // over-cap output ships without one: the poster pipeline needs the bytes
      // in memory, and no preview beats no result.
      const previewRef = resultBuffer
        ? await generatePreview(resultBuffer, resultContentType, jobId, data.toolId)
        : undefined;

      // Auto-save when the input came from the user's library (data.fileId is
      // set by the route when the upload referenced a library file). saveMode
      // picks between an independent new file (default) and a superseding
      // version. Without a fileId this is a no-op, so tool-first uploads are
      // not auto-saved.
      //
      // Staged here (upload blob, probe dimensions, claim finalize) and
      // committed inside updateSingleFileProgressAtomically below so a
      // completion-commit fault rolls back the version row and storage charge
      // with the job (#2350).
      let stagedSave: StagedAutoSave = {};
      if (resultBuffer) {
        // Re-check just before the library overwrite, the one write a cancel is
        // most costly to lose to (#2092). The save checks again up to its
        // finalize claim (#2143, #2349).
        if (wasUserCanceled(jobId)) throw new Error("Canceled");
        stagedSave = await stageAutoSaveToLibrary({
          fileId: data.fileId,
          saveMode: data.saveMode,
          userId: data.userId,
          buffer: resultBuffer,
          outName,
          contentType: resultContentType,
          toolId: data.toolId,
          jobId,
          userCancel,
        });
        if (stagedSave.finalizeClaimed) {
          finalizeClaimed = true;
        }
      } else if (data.fileId) {
        logger.info(
          { jobId, toolId: data.toolId, bytes: resultSize },
          "output exceeds the buffering cap; skipping library auto-save",
        );
      }

      const durationMs = Date.now() - startTime;

      // Build the result
      const jobResult: ToolJobResult = {
        outputRefs,
        filename: outName,
        contentType: resultContentType,
        originalSize,
        processedSize: resultSize,
        previewRef,
        ...(stagedSave.fileId && { savedFileId: stagedSave.fileId }),
        ...(stagedSave.error && { autoSaveError: stagedSave.error }),
        resultPayload,
      };
      const legacyResult = buildLegacyResultPayload(jobResult, jobId);

      // A library run that staged a save already claimed finalize before
      // returning (#2349). Every other run claims finalize here, right before
      // the completion commit.
      if (!finalizeClaimed) {
        if (wasUserCanceled(jobId) || !(await claimFinalize(jobId))) {
          throw new Error("Canceled");
        }
        finalizeClaimed = true;
      }

      // Commit the authoritative artifact row, any staged library version row,
      // and the client replay alias in one transaction before terminal Redis
      // publication. A crash or commit fault can no longer leave `completed`
      // durable state without the exact result payload or leave a version row
      // behind an uncommitted job (#2350).
      try {
        await updateSingleFileProgressAtomically(
          {
            jobId: progressJobId,
            phase: "complete",
            percent: 100,
            stage: "complete",
            result: legacyResult,
            ...(progressJobId !== jobId && { expectedArtifactJobId: jobId }),
          },
          async (tx) => {
            if (stagedSave.commit) {
              const committed = await stagedSave.commit(tx as AutoSaveTx);
              if (committed.fileId) {
                jobResult.savedFileId = committed.fileId;
                legacyResult.savedFileId = committed.fileId;
              }
              if (committed.error) {
                jobResult.autoSaveError = committed.error;
                legacyResult.autoSaveError = committed.error;
              }
            }
            await tx
              .update(schema.jobs)
              .set({
                status: "completed",
                completedAt: new Date(),
                durationMs,
                bytesIn: originalSize,
                bytesOut: resultSize,
                outputRefs,
                progress: { percent: 100, stage: "complete", result: legacyResult },
              })
              .where(eq(schema.jobs.id, jobId));
          },
        );
      } catch (commitErr) {
        await stagedSave.onAbort?.();
        throw commitErr;
      }
      await stagedSave.afterCommit?.();

      // The deadline fired under a handler that kept going, and the row now
      // carries the result it returned. Nothing else records the overrun, so
      // this line is what an operator tuning JOB_TIMEOUT_*_S has (#2144).
      if (signal.aborted && signal.reason === "timeout") {
        logger.warn(
          { jobId, toolId: data.toolId, timeoutMs, durationMs },
          "handler returned after the job deadline; result kept",
        );
      }

      // Record Prometheus metrics
      jobsTotal.inc({ pool: data.pool, status: "completed" });
      jobDuration.observe({ pool: data.pool }, durationMs / 1000);

      if (data.kind === "tool" || data.kind === "ai-tool") {
        const inputFileCount = inputs.length > 0 ? inputs.length : data.inputRefs.length;
        const totalInputSize =
          inputs.length > 0
            ? inputs.reduce((sum, item) => sum + item.buffer.length, 0)
            : originalSize;
        const settingsObj =
          typeof data.settings === "object" && data.settings !== null
            ? (data.settings as Record<string, unknown>)
            : null;
        const outputFormat =
          (settingsObj?.format as string | undefined) ??
          (settingsObj?.outputFormat as string | undefined) ??
          null;
        jobResult.audited = await emitWorkerToolAudit({
          data,
          inputFileCount,
          totalInputSize,
          outputFormat,
          durationMs,
        });
      }

      // Analytics: emit tool_used on success
      if (analyticsEnabled()) {
        void trackEvent(
          ANALYTICS_EVENTS.TOOL_USED,
          {
            ...toolUsedBaseProps(data, durationMs),
            status: "completed",
            output_format: safeFormatTag(outName) ?? "unknown",
            bytes_in: originalSize,
            bytes_out: resultSize,
          },
          data.analyticsDistinctId,
        );
        // Mark the instance's first successful processing so the onboarding
        // survey only appears once the admin has produced a real result
        // (shouldShowUsageSurvey gate in web feedback.ts). First-write-wins, so
        // the timestamp reflects the genuine first job and later jobs no-op.
        void setSettingIfAbsent(ONBOARDING_FIRST_PROCESSED_KEY, new Date().toISOString()).catch(
          () => {},
        );
      }

      // Record queue wait time and completion on the OTel span
      const waitedMs = jobAgeMs(job);
      if (span && waitedMs !== undefined) span.setAttribute("snapotter.queue.wait_ms", waitedMs);
      if (span) span.addEvent("job.completed");

      return jobResult;
    } catch (rawErr) {
      const durationMs = Date.now() - startTime;
      // A user cancel wins over a deadline that fired first: abort() on an already
      // aborted controller leaves the reason as "timeout".
      const isCanceled = wasUserCanceled(jobId) || (signal.aborted && signal.reason !== "timeout");
      // The deadline is the cause only while the handler was still running when
      // it fired. A handler that ignored the signal and returned anyway is
      // followed by storage and database writes whose faults carry their own
      // message, error log and report (#2144).
      const isTimeout =
        !isCanceled && !handlerReturned && signal.aborted && signal.reason === "timeout";
      const err =
        !isCanceled && !isTimeout && isBinarySpawnFailure(rawErr)
          ? new SafeError(
              "Processing is unavailable on this server because a required engine binary could not be started.",
              {
                kind: "operational",
                code: "ENGINE_UNAVAILABLE",
                statusCode: 503,
                cause: rawErr,
              },
            )
          : rawErr;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const finalError = isCanceled
        ? "Canceled"
        : isTimeout
          ? timeoutMessage(timeoutMs)
          : errorMessage;

      // Log genuine processing faults at error level (clients only ever see
      // friendlyError(finalError)). Expected validation rejections -- bad user
      // input, not a server fault -- would otherwise flood error logs, so skip
      // them here; they still reach the OTel span recorded below. A handler
      // that ignored the signal and threw its own non-abort error after the
      // deadline is still logged and handed to the failed listener with the
      // timeout message attached as context (#2294).
      const isAbort = isTimeout && isTimeoutAbortError(err);
      const isValidationError =
        err instanceof Error &&
        ((err.name === "InputValidationError" &&
          ((err as { statusCode?: number }).statusCode ?? 400) < 500) ||
          isToolInputError(err));
      if (!isCanceled && !isAbort && !isValidationError) {
        logger.error(
          { err, jobId, toolId: data.toolId, ...(isTimeout && { timeoutMessage: finalError }) },
          "tool job failed",
        );
      }

      // Record error on the OTel span, with the job age the success path
      // records too (#1414)
      if (span) {
        const waitedMs = jobAgeMs(job);
        if (waitedMs !== undefined) span.setAttribute("snapotter.queue.wait_ms", waitedMs);
        span.setStatus({ code: SpanStatusCode.ERROR, message: finalError });
        span.recordException(err instanceof Error ? err : String(err));
        span.addEvent("job.failed");
      }

      const isInputMissing = isSafeMessageError(err) && err.code === "INPUT_MISSING";
      const isEngineUnavailable =
        (isSafeMessageError(err) ||
          (err instanceof Error && err.name === "InputValidationError")) &&
        (err as { code?: unknown }).code === "ENGINE_UNAVAILABLE";
      const isUnrecoverable =
        isCanceled || isValidationError || isInputMissing || isEngineUnavailable;
      const maxAttempts = job.opts.attempts ?? 1;
      const willRetry = !isUnrecoverable && job.attemptsMade + 1 < maxAttempts;

      // A canceled job may have written its output already, in this attempt or
      // in an earlier one that lost its completion commit (output keys are per
      // job, not per attempt). The row settles with no outputRefs, but the
      // download route serves by key and job reconciliation adopts stray
      // outputs, so take the prefix back on every cancel; for a job that wrote
      // nothing it is one cheap no-op. Best effort: the terminal write below
      // must land either way (#2144).
      if (isCanceled) {
        const prefix = `outputs/${jobId}/`;
        try {
          await deletePrefix(prefix);
        } catch (cleanupErr) {
          logger.error(
            { err: cleanupErr, jobId, toolId: data.toolId, prefix },
            "canceled job output cleanup failed; outputs stay downloadable until the storage sweep",
          );
          void reportError(cleanupErr, {
            source: "worker",
            pool: data.pool,
            toolId: data.toolId,
            jobId,
          });
        }
      }

      const progressJobId = data.clientJobId ?? jobId;

      // When the job will be retried, do NOT write a terminal DB row or
      // emit a terminal SSE frame. The row stays "processing" and the
      // next attempt overwrites startedAt/attempts as usual.
      if (!willRetry) {
        // Record Prometheus metrics on final attempt only
        jobsTotal.inc({ pool: data.pool, status: isCanceled ? "canceled" : "failed" });
        jobDuration.observe({ pool: data.pool }, durationMs / 1000);

        if (isCanceled) {
          // Swallowed so the rethrow below stays authoritative, but logged:
          // for a canceled child or step this row is the only evidence the
          // finalize reads when it labels the run (#809), so a dropped write
          // here must be visible somewhere.
          await db
            .update(schema.jobs)
            .set({
              status: "canceled",
              completedAt: new Date(),
              durationMs,
              error: {
                message: friendlyError(finalError),
              },
            })
            .where(eq(schema.jobs.id, jobId))
            .catch((writeErr) => {
              logger.error(
                { err: writeErr, jobId, toolId: data.toolId },
                "terminal status write failed",
              );
              void reportError(writeErr, {
                source: "worker",
                pool: data.pool,
                toolId: data.toolId,
                jobId,
              });
            });

          let aliasWriteFaulted = false;
          if (progressJobId !== jobId) {
            // Alias dual write (#808), the finalize's #766 pattern: a
            // reconnecting client replays from the alias row, so it needs
            // the same terminal state, not just an ephemeral frame that
            // expires with the Redis key. Guarded, so a cancel racing a
            // committed completion cannot downgrade it. A failed write
            // must not replace the UnrecoverableError thrown below
            // (anything else would let BullMQ retry a canceled job), so it
            // logs at error level (a dropped terminal write is the one
            // failure a client may never recover from) and falls through
            // to the ephemeral publish, which requestCancel's repair path
            // backs up on the next cancel.
            try {
              // The pointer condition spares a channel a newer run has
              // already re-pointed (#886): this job's cancel must not
              // repaint that run's row.
              await cancelSingleJobGuarded({
                jobId: progressJobId,
                expectedArtifactJobId: jobId,
              });
            } catch (aliasErr) {
              aliasWriteFaulted = true;
              logger.error(
                { err: aliasErr, jobId, progressJobId },
                "canceled alias terminal write failed",
              );
              // Same class as the finalize's settle fault (#888): pino has
              // no Sentry transport, so the catch reports its own fault.
              void reportError(aliasErr, {
                source: "worker",
                pool: data.pool,
                jobId: progressJobId,
              });
            }
          }
          // Ephemeral terminal event for live SSE clients, published when the
          // run has no separate alias row or when the alias row's durable
          // write faulted (#888, #3408). When a separate alias row settled
          // cleanly via cancelSingleJobGuarded, that call already announced
          // the frame if the pointer still matched and skipped announcement
          // if a newer run re-pointed the channel.
          if (progressJobId === jobId || aliasWriteFaulted) {
            publishEphemeral({
              jobId: progressJobId,
              type: "single",
              phase: "failed",
              percent: 0,
              error: "Canceled",
              code: "CANCELED",
            });
          }
        } else {
          // Commit the authoritative failure row and the client replay alias
          // in one transaction before announcing (#2699). Swallowed so the
          // rethrow below stays authoritative, and so a Postgres outage never
          // caches a failed Redis replay frame over a finished output that
          // stranded-job reconciliation will recover.
          const errorFields = {
            ...(!isTimeout && validationErrorFields(err)),
            ...(!isTimeout && failureStatus(err)),
          };
          await updateSingleFileProgressAtomically(
            {
              jobId: progressJobId,
              phase: "failed",
              percent: 0,
              error: friendlyError(finalError),
              ...errorFields,
              ...(progressJobId !== jobId && { expectedArtifactJobId: jobId }),
            },
            async (tx) => {
              await tx
                .update(schema.jobs)
                .set({
                  status: "failed",
                  completedAt: new Date(),
                  durationMs,
                  error: {
                    message: friendlyError(finalError),
                    // The fault's own code and status belong on a job that failed
                    // on it; a timeout or a cancel that one raced is not that
                    // failure, and its row says so (#2210).
                    ...errorFields,
                  },
                })
                .where(eq(schema.jobs.id, jobId));
            },
          ).catch((writeErr) => {
            logger.error(
              { err: writeErr, jobId, toolId: data.toolId },
              "terminal status write failed",
            );
            void reportError(writeErr, {
              source: "worker",
              pool: data.pool,
              toolId: data.toolId,
              jobId,
            });
          });
        }
      }

      if (willRetry && finalizeClaimed) {
        await releaseFinalize(jobId).catch((releaseErr) => {
          logger.warn(
            { err: releaseErr, jobId, toolId: data.toolId },
            "failed to release finalize claim after attempt error",
          );
        });
      }

      // Analytics: emit tool_used on failure
      if (analyticsEnabled()) {
        const errorClass = isTimeout
          ? "timeout"
          : isCanceled
            ? "cancelled"
            : classifyError(err, "worker");
        void trackEvent(
          ANALYTICS_EVENTS.TOOL_USED,
          {
            ...toolUsedBaseProps(data, durationMs),
            status: "failed",
            error_code: isTimeout
              ? "timeout"
              : isCanceled
                ? "cancelled"
                : (extractErrorCode(err) ?? "processing"),
            // A coarse, low-cardinality reason bucket so "why do tools fail" is
            // answerable without leaking messages: bad input, environment, or
            // our bug (classifyError's "expected" == bad user input).
            error_kind: errorClass === "expected" ? "input" : errorClass,
          },
          data.analyticsDistinctId,
        );
      }

      if (isCanceled) throw new UnrecoverableError("Canceled");
      if (isTimeout && isAbort) throw new Error(finalError);
      const thrownErr = isTimeout
        ? Object.assign(err instanceof Error ? err : new Error(errorMessage), {
            timeoutMessage: finalError,
          })
        : err;
      if (isUnrecoverable) {
        const unrecoverable = new UnrecoverableError(errorMessage);
        if (thrownErr instanceof Error && thrownErr.stack) unrecoverable.stack = thrownErr.stack;
        throw Object.assign(unrecoverable, {
          cause: thrownErr,
          ...(isTimeout && { timeoutMessage: finalError }),
        });
      }
      throw thrownErr;
    } finally {
      if (span) span.end();
      clearTimeout(timeoutHandle);
      unregisterCancelable(jobId);
      // Clean up scratch directory
      await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  // Execute with or without active span context
  if (span) {
    const activeCtx = trace.setSpan(parentCtx, span);
    return context.with(activeCtx, runBody);
  }
  return runBody();
}

// ── Pipeline step handler ─────────────────────────────────────

/**
 * Process a single pipeline step. Resolves inputRefs at run time
 * (step 0 uses the upload key; later steps read the previous step's
 * output_refs from the DB), reports pipeline-level progress, then
 * falls through to processToolJob for the actual tool work.
 *
 * Errors are caught and returned as a failure marker instead of
 * throwing so that subsequent steps and the finalize parent still
 * run (BullMQ parents do not run when children fail hard).
 */
async function processPipelineStep(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;

  // Cooperative pipeline cancel (#771): steps queued behind the cancel do
  // no work at all. The scope key is the batch parent for pipeline-batch
  // steps and the client-facing id for single runs (data.clientJobId is
  // clientJobId ?? flowId, the same key requestCancel flags). Active steps
  // are aborted over the cancel channel instead and land in the catch below
  // via processToolJob's own cancel handling. A fault here must fall through
  // to normal processing, not wedge the row (attempts: 1, and nothing else
  // revisits it); the run then finishes as a too-late cancel.
  const cancelScope = data.parentId ?? data.clientJobId;
  if (cancelScope) {
    try {
      if (await isBatchCanceled(cancelScope)) {
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date(), error: { message: "Canceled" } })
          .where(
            and(
              eq(schema.jobs.id, data.jobId),
              notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
            ),
          );
        jobsTotal.inc({ pool: data.pool, status: "canceled" });
        return {
          outputRefs: [],
          filename: data.filename,
          contentType: "",
          originalSize: 0,
          processedSize: 0,
          resultPayload: { failed: true, canceled: true, error: "Canceled" },
        };
      }
    } catch (err) {
      logger.warn(
        { err, jobId: data.jobId, cancelScope },
        "pipeline cancel skip failed; processing the step normally",
      );
    }
  }

  // Resolve inputRefs at run time: step 0 already has them from the
  // route; later steps read the previous step's output from the DB.
  if (data.stepIndex !== undefined && data.stepIndex > 0 && data.prevJobId) {
    const [prevRow] = await db
      .select({
        outputRefs: schema.jobs.outputRefs,
        status: schema.jobs.status,
        error: schema.jobs.error,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, data.prevJobId));

    if (!prevRow || prevRow.status === "failed" || !prevRow.outputRefs?.[0]) {
      // Previous step failed -- propagate the error without processing.
      const prevError = friendlyError(
        prevRow?.status === "failed"
          ? ((prevRow.error as { message?: string } | null)?.message ?? "Processing failed")
          : "Previous step has no output",
      );
      if (prevRow?.status !== "failed" && prevRow?.status !== "canceled") {
        const err = new Error(prevError);
        logger.error(
          { err, jobId: data.jobId, prevJobId: data.prevJobId },
          "pipeline step predecessor has no output",
        );
        void reportError(err, {
          source: "worker",
          pool: data.pool,
          toolId: data.toolId,
          jobId: job.id ?? data.jobId,
        });
      }
      await db
        .update(schema.jobs)
        .set({ status: "failed", completedAt: new Date(), error: { message: prevError } })
        .where(eq(schema.jobs.id, data.jobId));
      return {
        outputRefs: [],
        filename: data.filename,
        contentType: "",
        originalSize: 0,
        processedSize: 0,
        resultPayload: { failed: true, error: prevError },
      };
    }
    data.inputRefs = [prevRow.outputRefs[0]];
  }

  // Report pipeline-level progress to the pipeline's SSE channel.
  const pipelineProgressId = data.clientJobId;
  if (pipelineProgressId) {
    const stepSuffix = `-s${data.stepIndex ?? 0}`;
    const flowId = data.jobId.endsWith(stepSuffix)
      ? data.jobId.slice(0, -stepSuffix.length)
      : data.jobId;
    const percent = Math.round(((data.stepIndex ?? 0) / (data.totalSteps ?? 1)) * 90);
    const stage = `Step ${(data.stepIndex ?? 0) + 1}/${data.totalSteps}: ${data.toolId}`;
    void updateSingleFileProgress({
      jobId: pipelineProgressId,
      phase: "processing",
      percent,
      stage,
      ...(pipelineProgressId !== flowId && { expectedPipelineFlowId: flowId }),
    });
  }

  // Clear clientJobId so processToolJob's terminal SSE event goes to the
  // step's own jobId (nobody listens) instead of prematurely ending the
  // pipeline's SSE stream.
  data.clientJobId = undefined;

  try {
    return await processToolJob(job);
  } catch (err) {
    reportToolJobFailure(job, err);
    // Step failed -- return failure marker. processToolJob already
    // updated the DB row to "failed" and emitted a terminal event
    // on the step's own progress channel.
    const rawError =
      (err as { timeoutMessage?: string } | null)?.timeoutMessage ??
      (err instanceof Error ? err.message : String(err));
    const errorMsg = friendlyError(rawError);
    return {
      outputRefs: [],
      filename: data.filename,
      contentType: "",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { failed: true, error: errorMsg },
    };
  }
}

// ── Pipeline finalize handler ─────────────────────────────────

/**
 * Assemble the pipeline result after all steps have completed.
 *
 * Reads all step DB rows, copies the last step's output to
 * `outputs/<pipelineJobId>/<filename>` so the legacy download URL
 * works, and returns the pipeline envelope payload.
 *
 * When part of a pipeline-batch (parentId is set), also records the
 * child outcome for batch progress tracking.
 */
/** Best-effort content type from a filename extension (for preview dispatch). */
export function contentTypeForFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odp: "application/vnd.oasis.opendocument.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    zip: "application/zip",
    srt: "application/x-subrip",
    vtt: "text/vtt",
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    "3gp": "video/3gpp",
    flv: "video/x-flv",
    wmv: "video/x-ms-wmv",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
    ts: "video/mp2t",
    mts: "video/mp2t",
    m2ts: "video/mp2t",
    ogv: "video/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/opus",
    wma: "audio/x-ms-wma",
    aiff: "audio/aiff",
    amr: "audio/amr",
    ac3: "audio/ac3",
  };
  return map[ext] ?? IMAGE_EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/**
 * Build the pipeline_executed analytics payload. Shared by the success and
 * failure paths so is_batch and file_count are derived in one place. file_count
 * is the batch size for a batch-finalize job, otherwise 1 for a single-file
 * pipeline run.
 */
export function pipelineExecutedProps(
  data: Pick<ToolJobData, "kind" | "totalFiles">,
  totalSteps: number,
  toolIds: string[],
  durationMs: number,
  status: "completed" | "failed" | "canceled",
) {
  // `satisfies` (not a return-type annotation) validates the shape against
  // PipelineExecutedProperties while keeping the inferred anonymous type, which
  // stays assignable to trackEvent's Record<string, unknown> param (a named
  // interface would not be).
  return {
    step_count: totalSteps,
    tool_ids: toolIds,
    is_batch: data.kind === "batch-finalize",
    file_count: data.totalFiles ?? 1,
    duration_ms: durationMs,
    status,
  } satisfies PipelineExecutedProperties;
}

async function processPipelineFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;
  const startTime = Date.now();
  const totalSteps = data.totalSteps ?? 0;

  const steps: Array<{ step: number; toolId: string; size: number; notes?: BatchFileNotes }> = [];
  let firstBytesIn = 0;
  let lastOutputRef = "";
  let lastBytesOut = 0;
  let failedAtStep: number | null = null;
  let failedStepCanceled = false;
  let failError = "";
  // The failed step's status, code and hint, kept on this file's row so a
  // pipeline batch can tell one engine fault behind every file (#1627).
  let failFault: { code?: string; details?: string; httpStatus?: number } = {};

  for (let i = 0; i < totalSteps; i++) {
    const stepId = `${data.jobId}-s${i}`;
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, stepId));

    if (!row) {
      failedAtStep = i;
      failError = `Step ${i + 1} row not found`;
      const err = new Error(failError);
      logger.error({ err, jobId: data.jobId, stepId }, "pipeline step row not found");
      void reportError(err, {
        source: "worker",
        pool: data.pool,
        toolId: data.toolId,
        jobId: job.id ?? data.jobId,
      });
      break;
    }

    if (row.status !== "completed") {
      failedAtStep = i;
      failedStepCanceled = row.status === "canceled";
      const stepError = row.error as {
        message?: string;
        code?: string;
        details?: string;
        httpStatus?: number;
      } | null;
      failError = stepError?.message ?? `Step ${i + 1} failed`;
      failFault = {
        ...(stepError?.code && { code: stepError.code }),
        ...(stepError?.details && { details: stepError.details }),
        ...(stepError?.httpStatus !== undefined && { httpStatus: stepError.httpStatus }),
      };
      break;
    }

    // What the step's own single run would have reported (#1303), such as a
    // Deep Enhance that didn't run or a resize to fit, on the step record a
    // single-file pipeline returns.
    const notes = pickBatchFileNotes(
      (row.progress as { result?: Record<string, unknown> } | null)?.result,
    );
    steps.push({
      step: i + 1,
      toolId: row.toolId ?? "unknown",
      size: Number(row.bytesOut ?? 0),
      ...(notes ? { notes } : {}),
    });

    if (i === 0) firstBytesIn = Number(row.bytesIn ?? 0);
    if (i === totalSteps - 1) {
      lastOutputRef = row.outputRefs?.[0] ?? "";
      lastBytesOut = Number(row.bytesOut ?? 0);
    }
  }

  const progressJobId = data.clientJobId ?? data.jobId;

  // ── Cancel path (#771) ──────────────────────────────────────
  // A canceled step row is durable proof a user cancel landed (#809):
  // every writer of that status (the flag skip, requestCancel's queued-job
  // removal, the cancel-channel abort) traces back to a user cancel
  // somewhere in the run, including one scoped to a single step id. The
  // Redis flag is deliberately not read here: its 1h TTL can expire under
  // a tail longer than that, and a canceled run must settle as canceled
  // regardless of how long the tail took. #770's too-late rule holds
  // without the flag: zero canceled steps means every step completed
  // first, and that pipeline completes normally below. Intermediate step
  // outputs are internal artifacts (a half-processed frame is not a
  // deliverable), so a canceled pipeline returns nothing.
  const canceled = failedAtStep !== null && failedStepCanceled;

  if (canceled) {
    // Guarded dual write (#766): the SSE channel (clientJobId) and the
    // authoritative flow row can differ; both must settle canceled or a
    // reconnecting client replays a live row forever. Each write catches
    // its own fault (#888): a thrown write used to fail the whole
    // finalize, turning the user's cancel into a generic pipeline failure
    // and dropping the terminal frame with it. The fault is logged AND
    // reported (pino has no Sentry transport, and a dropped terminal
    // write is the one failure a client may never recover from);
    // requestCancel's pipeline-alias heal converges the row on a later
    // cancel, off the canceled flow row this finalize still commits.
    const settleGuarded = async (
      rowId: string,
      expectedPipelineFlowId?: string,
    ): Promise<boolean> => {
      try {
        await cancelSingleJobGuarded({
          jobId: rowId,
          ...(expectedPipelineFlowId && { expectedPipelineFlowId }),
        });
        return false;
      } catch (err) {
        logger.error(
          { err, jobId: data.jobId, target: rowId },
          "canceled pipeline terminal write failed",
        );
        void reportError(err, { source: "worker", pool: data.pool, jobId: rowId });
        return true;
      }
    };
    const flowWriteFaulted = await settleGuarded(data.jobId);
    const progressWriteFaulted =
      progressJobId !== data.jobId
        ? await settleGuarded(progressJobId, data.jobId)
        : flowWriteFaulted;
    // Ephemeral terminal event for live SSE clients, published when the run has
    // no separate alias row or when the alias row's durable write faulted
    // (#888). When a separate alias row settled cleanly via
    // cancelSingleJobGuarded, that call already announced the frame if the
    // pointer still matched and skipped announcement if a newer run re-pointed
    // the channel (#2741). Pipeline-batch per-file finalizes report through
    // the parent batch channel instead.
    if (!data.parentId && (progressJobId === data.jobId || progressWriteFaulted)) {
      publishEphemeral({
        jobId: progressJobId,
        type: "single",
        phase: "failed",
        percent: 0,
        error: "Canceled",
        code: "CANCELED",
      });
    }

    // Batch progress (pipeline-batch only): the canceled file counts like a
    // failed one; batch-finalize turns the canceled rows into #767's
    // partial-ZIP semantics. Caught like settleGuarded (#836): a Redis blip
    // on the batch counters after the terminal writes must not fail the
    // finalize job or drop its canceled analytics and result payload.
    if (data.parentId && data.totalFiles !== undefined) {
      try {
        await recordChildOutcome(data.parentId, data.totalFiles, data.filename, "Canceled");
      } catch (err) {
        logger.error(
          { err, jobId: data.jobId, parentId: data.parentId },
          "canceled pipeline batch outcome write failed",
        );
        void reportError(err, { source: "worker", pool: data.pool, jobId: data.jobId });
      }
    }

    if (analyticsEnabled()) {
      void trackEvent(
        ANALYTICS_EVENTS.PIPELINE_EXECUTED,
        pipelineExecutedProps(
          data,
          totalSteps,
          steps.map((s) => s.toolId),
          Date.now() - startTime,
          "canceled",
        ),
        data.analyticsDistinctId,
      );
    }

    return {
      outputRefs: [],
      filename: data.filename,
      contentType: "",
      originalSize: firstBytesIn,
      processedSize: 0,
      resultPayload: { error: "Canceled", canceled: true, stepsCompleted: steps.length, steps },
    };
  }

  // ── Failure path ────────────────────────────────────────────
  if (failedAtStep !== null) {
    const errorMsg = `Step ${failedAtStep + 1}: ${friendlyError(failError)}`;

    // Commit the authoritative pipeline row and clientJobId replay row in one
    // transaction before announcing (#3167). For a pipeline-batch child
    // (parentId set), catch a terminal write fault so recordChildOutcome and
    // the returned failure marker still complete for batch-finalize; a
    // single-file pipeline rethrows so the worker failed-handler safety net can
    // settle both rows.
    try {
      await updateSingleFileProgressAtomically(
        {
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: errorMsg,
          ...failFault,
          ...(progressJobId !== data.jobId && { expectedPipelineFlowId: data.jobId }),
        },
        async (tx) => {
          await tx
            .update(schema.jobs)
            .set({
              status: "failed",
              completedAt: new Date(),
              error: { message: errorMsg, ...failFault },
            })
            .where(eq(schema.jobs.id, data.jobId));
        },
      );
    } catch (err) {
      if (!data.parentId) throw err;
      logger.error(
        { err, jobId: data.jobId, parentId: data.parentId },
        "failed pipeline terminal write failed",
      );
      void reportError(err, { source: "worker", pool: data.pool, jobId: data.jobId });
    }

    // Batch progress (pipeline-batch only): guarded like the cancel branch
    // (#836, #2620) so a Redis counter blip after the terminal write does not
    // fail the finalize job or drop its analytics and result payload.
    if (data.parentId && data.totalFiles !== undefined) {
      try {
        await recordChildOutcome(data.parentId, data.totalFiles, data.filename, errorMsg);
      } catch (err) {
        logger.error(
          { err, jobId: data.jobId, parentId: data.parentId },
          "failed pipeline batch outcome write failed",
        );
        void reportError(err, { source: "worker", pool: data.pool, jobId: data.jobId });
      }
    }

    // Analytics: emit pipeline_executed on failure
    if (analyticsEnabled()) {
      void trackEvent(
        ANALYTICS_EVENTS.PIPELINE_EXECUTED,
        pipelineExecutedProps(
          data,
          totalSteps,
          steps.map((s) => s.toolId),
          Date.now() - startTime,
          "failed",
        ),
        data.analyticsDistinctId,
      );
    }

    return {
      outputRefs: [],
      filename: data.filename,
      contentType: "",
      originalSize: firstBytesIn,
      processedSize: 0,
      // The failed step's status, code and hint ride along so the sync route
      // can answer a server fault with its own status (#2179).
      resultPayload: {
        error: errorMsg,
        ...failFault,
        stepsCompleted: steps.length,
        steps,
      },
    };
  }

  // ── Success path ────────────────────────────────────────────
  if (!lastOutputRef) throw new Error("Last step has no output");

  // Copy last step's output to outputs/<pipelineJobId>/<filename> so
  // the legacy download URL /api/v1/download/<pipelineJobId>/... works.
  const outFilename = lastOutputRef.split("/").pop() ?? "output";
  const parentKey = `outputs/${data.jobId}/${outFilename}`;
  let lastOutputBuffer: Buffer;
  try {
    try {
      lastOutputBuffer = await getObjectBuffer(lastOutputRef);
    } catch (err) {
      if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
      throw err;
    }
    await putObject(
      resultPayloadKey(data.jobId),
      Buffer.from(JSON.stringify({ stepsCompleted: totalSteps, steps }), "utf8"),
    );
    await putObject(parentKey, lastOutputBuffer);
  } catch (err) {
    // Settle the durable row (and batch outcome for pipeline-batch children)
    // before rethrowing so POST /api/v1/pipeline/execute and processBatchFinalize
    // read the 503 storage status and code instead of falling back to 500 or a
    // generic message (#3479).
    const isServerSafeFault = isSafeMessageError(err) && hasServerErrorStatus(err);
    const errorMsg = isServerSafeFault ? friendlyError(err.message) : "Pipeline processing failed";
    const errorFields = isServerSafeFault
      ? {
          ...validationErrorFields(err),
          ...failureStatus(err),
        }
      : {};
    try {
      await updateSingleFileProgressAtomically(
        {
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: errorMsg,
          ...errorFields,
          ...(progressJobId !== data.jobId && { expectedPipelineFlowId: data.jobId }),
        },
        async (tx) => {
          await tx
            .update(schema.jobs)
            .set({
              status: "failed",
              completedAt: new Date(),
              error: { message: errorMsg, ...errorFields },
            })
            .where(eq(schema.jobs.id, data.jobId));
        },
      );
    } catch (writeErr) {
      logger.error(
        { err: writeErr, jobId: data.jobId, ...(data.parentId && { parentId: data.parentId }) },
        "failed pipeline terminal write failed",
      );
      void reportError(writeErr, { source: "worker", pool: data.pool, jobId: data.jobId });
    }

    if (data.parentId && data.totalFiles !== undefined) {
      try {
        await recordChildOutcome(data.parentId, data.totalFiles, data.filename, errorMsg);
      } catch (outcomeErr) {
        logger.error(
          { err: outcomeErr, jobId: data.jobId, parentId: data.parentId },
          "failed pipeline batch outcome write failed",
        );
        void reportError(outcomeErr, { source: "worker", pool: data.pool, jobId: data.jobId });
      }
    }

    if (analyticsEnabled()) {
      void trackEvent(
        ANALYTICS_EVENTS.PIPELINE_EXECUTED,
        pipelineExecutedProps(
          data,
          totalSteps,
          steps.map((s) => s.toolId),
          Date.now() - startTime,
          "failed",
        ),
        data.analyticsDistinctId,
      );
    }

    throw err;
  }

  // Modality-aware preview of the final output (video poster / pdf first page /
  // image thumb) so the pipeline result carries a previewUrl like single-tool
  // results do. Content type is derived from the output extension.
  const contentType = contentTypeForFilename(outFilename);
  const previewRef = await generatePreview(
    lastOutputBuffer,
    contentType,
    data.jobId,
    steps.at(-1)?.toolId ?? "pipeline",
  );

  const result: ToolJobResult = {
    outputRefs: [parentKey],
    filename: outFilename,
    contentType,
    originalSize: firstBytesIn,
    processedSize: lastBytesOut,
    previewRef,
    resultPayload: {
      stepsCompleted: totalSteps,
      steps,
    },
  };
  const legacyResult = buildLegacyResultPayload(result, data.jobId);

  try {
    await updateSingleFileProgressAtomically(
      {
        jobId: progressJobId,
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: legacyResult,
        ...(progressJobId !== data.jobId && { expectedPipelineFlowId: data.jobId }),
      },
      async (tx) => {
        await tx
          .update(schema.jobs)
          .set({
            status: "completed",
            completedAt: new Date(),
            outputRefs: [parentKey],
            bytesIn: firstBytesIn,
            bytesOut: lastBytesOut,
            progress: { percent: 100, stage: "complete", result: legacyResult },
          })
          .where(eq(schema.jobs.id, data.jobId));
      },
    );
  } catch (err) {
    if (!data.parentId) throw err;
    logger.error(
      { err, jobId: data.jobId, parentId: data.parentId },
      "completed pipeline terminal write failed",
    );
    void reportError(err, { source: "worker", pool: data.pool, jobId: data.jobId });
  }

  // Batch progress (pipeline-batch only): guarded (#2620) so a Redis counter
  // blip after the atomic completion write does not fail the finalize job or
  // drop its completed analytics and result payload.
  if (data.parentId && data.totalFiles !== undefined) {
    try {
      await recordChildOutcome(data.parentId, data.totalFiles, outFilename);
    } catch (err) {
      logger.error(
        { err, jobId: data.jobId, parentId: data.parentId },
        "completed pipeline batch outcome write failed",
      );
      void reportError(err, { source: "worker", pool: data.pool, jobId: data.jobId });
    }
  }

  // Analytics: emit pipeline_executed on success
  if (analyticsEnabled()) {
    void trackEvent(
      ANALYTICS_EVENTS.PIPELINE_EXECUTED,
      pipelineExecutedProps(
        data,
        totalSteps,
        steps.map((s) => s.toolId),
        Date.now() - startTime,
        "completed",
      ),
      data.analyticsDistinctId,
    );
  }

  if (!data.parentId) {
    await emitWorkerPipelineAudit({
      data,
      totalSteps,
      steps: steps.map((s) => s.toolId),
      totalInputSize: firstBytesIn,
      processedSize: lastBytesOut,
      durationMs: Date.now() - startTime,
    });
  }

  return result;
}

// ── Batch child handler ───────────────────────────────────────

/**
 * Wraps processToolJob for batch-child jobs. On success, records the
 * outcome in the batch progress counters. On failure, catches the
 * error and returns a failure marker *instead of throwing* so the
 * parent batch-finalize job still runs. A hard throw would prevent
 * BullMQ from advancing the parent.
 *
 * Each child records exactly once: the success path calls
 * recordChildOutcome after processToolJob returns; the failure path
 * calls it in the catch block. Flow children are enqueued with
 * attempts: 1 (set in batch.ts / pipeline.ts), so every failure is
 * final and processToolJob always writes the terminal DB row before
 * rethrowing. If attempts were ever raised above 1, non-final
 * failures would skip the DB write and leave the row "processing".
 */
async function processBatchChild(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const parentId = job.data.parentId ?? "";
  const totalFiles = job.data.totalFiles ?? 0;
  // Cooperative batch cancel (#767): children queued behind the cancel do no
  // work at all. Active children are aborted through the cancel channel and
  // land in the catch below via processToolJob's own cancel handling. Record
  // the batch outcome before flipping the durable row or bumping jobsTotal
  // (#1347): if the outcome write throws and falls through to normal
  // processing, the row never transiently settles as canceled and the file is
  // not counted twice. The guarded write cannot clobber a row another path
  // already settled.
  if (parentId) {
    try {
      if (await isBatchCanceled(parentId)) {
        await recordChildOutcome(parentId, totalFiles, job.data.filename, "Canceled");
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date(), error: { message: "Canceled" } })
          .where(
            and(
              eq(schema.jobs.id, job.data.jobId),
              notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
            ),
          );
        jobsTotal.inc({ pool: job.data.pool, status: "canceled" });
        return {
          outputRefs: [],
          filename: job.data.filename,
          contentType: "",
          originalSize: 0,
          processedSize: 0,
          resultPayload: { failed: true, canceled: true, error: "Canceled" },
        };
      }
    } catch (err) {
      // The skip must stay inside this function's no-throw contract: a hard
      // failure here would leave the child row non-terminal forever
      // (attempts: 1, and nothing else revisits it). Fall through and
      // process normally instead; the file becomes a too-late cancel.
      logger.warn(
        { err, jobId: job.data.jobId, parentId },
        "batch cancel skip failed; processing the child normally",
      );
    }
  }
  let result: ToolJobResult;
  try {
    result = await processToolJob(job);
  } catch (err) {
    reportToolJobFailure(job, err);
    const rawError =
      (err as { timeoutMessage?: string } | null)?.timeoutMessage ??
      (err instanceof Error ? err.message : String(err));
    const error = friendlyError(rawError);
    try {
      await recordChildOutcome(parentId, totalFiles, job.data.filename, error);
    } catch (outcomeErr) {
      logger.error(
        { err: outcomeErr, jobId: job.data.jobId, parentId, toolId: job.data.toolId },
        "batch child failure outcome write failed",
      );
      void reportError(outcomeErr, {
        source: "worker",
        pool: job.data.pool,
        toolId: job.data.toolId,
        jobId: job.data.jobId,
      });
    }
    // Return a completed job with a failure marker so the parent runs.
    return {
      outputRefs: [],
      filename: job.data.filename,
      contentType: "",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { failed: true, error },
    };
  }
  // Recorded outside processToolJob's try/catch (#2620) so a counter fault
  // after the child row settled as completed cannot enter the failure catch
  // block, record the succeeded file as failed, or return failed: true.
  try {
    await recordChildOutcome(parentId, totalFiles, job.data.filename);
  } catch (err) {
    logger.error(
      { err, jobId: job.data.jobId, parentId, toolId: job.data.toolId },
      "batch child outcome write failed",
    );
    void reportError(err, {
      source: "worker",
      pool: job.data.pool,
      toolId: job.data.toolId,
      jobId: job.data.jobId,
    });
  }
  return result;
}

// ── Batch finalize handler ────────────────────────────────────

/**
 * Stream every successful child output through one archiver pass into a
 * durable ZIP object. A source stream that fails after opening never rejects
 * an await on its own, so both the archive and every entry stream funnel
 * failures into the PassThrough; destroying it makes putObjectStream reject
 * (and clean up its partial object).
 */
// A source stream that neither errors nor ends (half-open S3 read) would
// otherwise hold the concurrency-1 system pool forever: BullMQ keeps
// renewing the lock of an "active" job, so stall detection never fires.
const BATCH_ZIP_TIMEOUT_MS = 15 * 60_000;

async function buildBatchZip(
  zipKey: string,
  entries: Array<{ filename: string; outputRef: string }>,
): Promise<number> {
  const archive = archiver("zip", { zlib: { level: 5 } });
  const passthrough = new PassThrough();
  // fail() can destroy the passthrough before putObjectStream's pipeline has
  // attached its consumer; an 'error' event in that window has no listener
  // and would be process-fatal. The upload's rejection is the real signal.
  passthrough.on("error", () => {});
  const opened: NodeJS.ReadableStream[] = [];
  let failed = false;
  const fail = (err: Error) => {
    if (failed) return;
    failed = true;
    archive.abort();
    // Destroying the passthrough is what makes the upload reject (and clean
    // up its partial object); abort() alone leaves it waiting for an end
    // that never comes.
    passthrough.destroy(err);
    // The aborted archive never reads its queued entries, so already-opened
    // sources would idle with buffered data and hold their descriptors.
    for (const stream of opened) {
      (stream as unknown as { destroy?: (e?: Error) => void }).destroy?.();
    }
  };
  archive.on("error", fail);
  archive.pipe(passthrough);
  const upload = putObjectStream(zipKey, passthrough);
  const normalizeSourceError = (err: unknown): Error => {
    const normalized = isStorageServiceFault(err) ? normalizeS3ReadFault(err) : err;
    return normalized instanceof Error ? normalized : new Error(String(normalized));
  };
  const feed = (async () => {
    for (const entry of entries) {
      if (failed) break;
      let source: NodeJS.ReadableStream;
      try {
        source = await getObjectStream(entry.outputRef);
      } catch (err) {
        throw normalizeSourceError(err);
      }
      if (failed) {
        // fail() ran while this open was in flight; its cleanup loop cannot
        // have seen this stream.
        (source as unknown as { destroy?: () => void }).destroy?.();
        break;
      }
      opened.push(source);
      // Never hand archiver a stream that can emit 'error': it re-emits the
      // error on an internal listener-less stream, which is process-fatal.
      // The wrapper ends quietly instead; fail() has already destroyed the
      // passthrough by then, so the truncated entry can never be mistaken
      // for a complete archive.
      const entryStream = new PassThrough();
      source.on("error", (err: Error) => {
        fail(normalizeSourceError(err));
        entryStream.end();
      });
      source.pipe(entryStream);
      archive.append(entryStream, { name: entry.filename });
    }
    await archive.finalize();
  })();
  // The upload is the one promise that settles in every outcome: it resolves
  // when the archive ends the passthrough and rejects when fail() destroys
  // it. finalize() after an abort is not guaranteed to settle, so the feed
  // is observed but never awaited unguarded.
  feed.catch((err: unknown) => fail(err instanceof Error ? err : new Error(String(err))));
  const watchdog = setTimeout(
    () => fail(new Error("Batch ZIP packaging timed out")),
    BATCH_ZIP_TIMEOUT_MS,
  );
  try {
    return await upload;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    // The upload can reject without fail() having run (the local capacity
    // check rejects before consuming); fail() owns all teardown.
    fail(error);
    throw error;
  } finally {
    clearTimeout(watchdog);
  }
}

type JobErrorPayload = {
  message?: string;
  code?: string;
  details?: string;
  httpStatus?: number;
};

/**
 * Reconstruct a pipeline-batch child's error and cancel state from its
 * `${childId}-s<step>` rows when the child `pipeline-finalize` row's terminal
 * DB write rolled back or never ran (#3189). Mirrors processPipelineFinalize's
 * step scan so manifest, childFaults, and canceledChildren match a committed
 * child finalize row.
 */
async function fallbackPipelineChildError(
  childId: string,
  stepCount?: number,
): Promise<{
  error: JobErrorPayload | null;
  canceled: boolean;
  step0InputRef?: string;
  completedOutputRef?: string;
  missingStep?: { stepId: string; message: string };
}> {
  const maxSteps =
    typeof stepCount === "number" && stepCount > 0
      ? stepCount
      : env.MAX_PIPELINE_STEPS > 0
        ? env.MAX_PIPELINE_STEPS
        : 20;
  let step0InputRef: string | undefined;
  let lastStepOutputRef: string | undefined;
  for (let s = 0; s < maxSteps; s++) {
    const stepId = `${childId}-s${s}`;
    const [stepRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, stepId));
    if (!stepRow) {
      if (typeof stepCount === "number" && stepCount > 0) {
        return {
          error: { message: `Step ${s + 1}: Step ${s + 1} row not found` },
          canceled: false,
          step0InputRef,
          missingStep: {
            stepId,
            message: `Step ${s + 1} row not found`,
          },
        };
      }
      break;
    }
    if (s === 0) {
      step0InputRef = stepRow.inputRefs?.[0];
    }
    if (stepRow.status !== "completed") {
      if (stepRow.status === "canceled") {
        return {
          error: { message: "Canceled" },
          canceled: true,
          step0InputRef,
        };
      }
      const stepError = stepRow.error as JobErrorPayload | null;
      const failError = stepError?.message ?? `Step ${s + 1} failed`;
      return {
        error: {
          message: `Step ${s + 1}: ${friendlyError(failError)}`,
          ...(stepError?.code && { code: stepError.code }),
          ...(stepError?.details && { details: stepError.details }),
          ...(stepError?.httpStatus !== undefined && { httpStatus: stepError.httpStatus }),
        },
        canceled: false,
        step0InputRef,
      };
    }
    lastStepOutputRef = stepRow.outputRefs?.[0];
  }
  let completedOutputRef: string | undefined;
  if (lastStepOutputRef) {
    const outFilename = lastStepOutputRef.split("/").pop() ?? "output";
    const parentKey = `outputs/${childId}/${outFilename}`;
    try {
      const size = await getObjectSize(parentKey);
      if (typeof size === "number" && size > 0) {
        completedOutputRef = parentKey;
      }
    } catch (err) {
      if (!isMissingObjectError(err)) {
        if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
        throw err;
      }
      await verifyS3Bucket();
      // Child finalize did not finish writing its output artifact before failing.
    }
  }
  return { error: null, canceled: false, step0InputRef, completedOutputRef };
}

/**
 * Assembles the ordered manifest from child DB rows after all batch
 * children have completed, packages the successful outputs into a durable
 * ZIP under outputs/<parentId>/, commits the terminal parent-row state, and
 * publishes the terminal batch SSE frame carrying the download URL (#750).
 * Runs on the system pool (concurrency 1); the HTTP route streams the
 * stored ZIP instead of re-archiving.
 *
 * The manifest `[{index, filename, outputRef?, error?}]` is returned in the
 * job result alongside the zip descriptor so the HTTP route can build its
 * response without recomputing either.
 */
async function processBatchFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;
  const startTime = Date.now();
  const settings = (data.settings ?? {}) as {
    flowChildCount?: number;
    fileIndexMap?: number[];
    stepCount?: number;
    preFailureFaults?: unknown;
  };
  const flowChildCount = settings.flowChildCount ?? data.totalFiles ?? 0;
  // Flow index -> original upload index. Pre-failed uploads never became flow
  // children, so without this map every index after a pre-failure would pair
  // a result with the wrong file (#645's alignment contract). Absent on jobs
  // enqueued before this field existed; identity is correct for those unless
  // a pre-failure occurred, matching the old route behavior.
  const fileIndexMap = Array.isArray(settings.fileIndexMap) ? settings.fileIndexMap : null;
  const totalFiles = data.totalFiles ?? flowChildCount;

  const manifest: Array<{
    index: number;
    filename: string;
    outputRef?: string;
    error?: string;
    code?: string;
    notes?: BatchFileNotes;
  }> = [];
  // Each failed child's status and code as its row kept them, so one engine
  // fault behind every file can answer like the upload-time path (#1627).
  const childFaults: BatchFault[] = [];

  let canceledChildren = 0;
  let parentStepCount: number | undefined | null = null;
  // Every key the child rows name, so the cleanup below finds step and flow
  // directories without listing the workspace.
  const childKeys: string[] = [];
  for (let i = 0; i < flowChildCount; i++) {
    const childId = `${data.jobId}-f${i}`;
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, childId));
    if (row) childKeys.push(...(row.inputRefs ?? []), ...(row.outputRefs ?? []));

    if (!row) {
      const err = new Error("Child job row not found");
      logger.error({ err, jobId: data.jobId, childId }, "batch child job row not found");
      void reportError(err, {
        source: "worker",
        pool: data.pool,
        toolId: data.toolId,
        jobId: job.id ?? data.jobId,
      });
      manifest.push({ index: i, filename: `file-${i}`, error: "Child job row not found" });
      // Counted without a code, so it can't be folded into a shared fault.
      childFaults.push({ error: "Child job row not found" });
      continue;
    }

    if (row.status === "completed" && row.outputRefs?.[0]) {
      const outFilename = row.outputRefs[0].split("/").pop() ?? "output";
      const notes = pickBatchFileNotes(
        (row.progress as { result?: Record<string, unknown> } | null)?.result,
      );
      manifest.push({
        index: i,
        filename: outFilename,
        outputRef: row.outputRefs[0],
        ...(notes ? { notes } : {}),
      });
    } else {
      let rowError = row.error as JobErrorPayload | null;
      let stepFallback: Awaited<ReturnType<typeof fallbackPipelineChildError>> | null = null;
      if (!rowError && row.type === "pipeline-finalize") {
        let childStepCount =
          (row.settings as { stepCount?: number } | null)?.stepCount ?? settings.stepCount;
        if (childStepCount === undefined) {
          if (parentStepCount === null) {
            const [parentRow] = await db
              .select({ settings: schema.jobs.settings })
              .from(schema.jobs)
              .where(eq(schema.jobs.id, data.jobId));
            parentStepCount = (parentRow?.settings as { stepCount?: number } | null)?.stepCount;
          }
          childStepCount = parentStepCount;
        }
        stepFallback = await fallbackPipelineChildError(childId, childStepCount);
        if (stepFallback.completedOutputRef) {
          const outFilename = stepFallback.completedOutputRef.split("/").pop() ?? "output";
          manifest.push({
            index: i,
            filename: outFilename,
            outputRef: stepFallback.completedOutputRef,
          });
          continue;
        }
        rowError = stepFallback.error;
      }
      if (stepFallback?.missingStep) {
        const err = new Error(stepFallback.missingStep.message);
        logger.error(
          { err, jobId: data.jobId, childId, stepId: stepFallback.missingStep.stepId },
          "pipeline step row not found",
        );
        void reportError(err, {
          source: "worker",
          pool: data.pool,
          toolId: data.toolId,
          jobId: job.id ?? data.jobId,
        });
      } else if (row.status === "completed") {
        const err = new Error("Completed child job has no output");
        logger.error(
          { err, jobId: data.jobId, childId },
          "completed batch child job has no output",
        );
        void reportError(err, {
          source: "worker",
          pool: data.pool,
          toolId: data.toolId,
          jobId: job.id ?? data.jobId,
        });
      }
      if (row.status === "canceled" || stepFallback?.canceled) canceledChildren++;
      const errorMsg = rowError?.message ?? "Processing failed";
      let inputRef = row.inputRefs?.[0] ?? stepFallback?.step0InputRef;
      if (!inputRef && row.type === "pipeline-finalize" && !stepFallback) {
        const [step0] = await db
          .select({ inputRefs: schema.jobs.inputRefs })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, `${childId}-s0`));
        inputRef = step0?.inputRefs?.[0];
      }
      const inputFilename = inputRef?.split("/").pop() ?? `file-${i}`;
      const error = friendlyError(errorMsg);
      manifest.push({
        index: i,
        filename: inputFilename,
        error,
        ...(rowError?.code && { code: rowError.code }),
      });
      childFaults.push({
        error,
        ...(rowError?.httpStatus !== undefined && { statusCode: rowError.httpStatus }),
        ...(rowError?.code && { code: rowError.code }),
        ...(rowError?.details && { details: rowError.details }),
      });
    }
  }

  // Deduplicate output names once, here, so the ZIP entries, the terminal
  // frame's fileResults, and the route's X-File-Results header cannot drift.
  const getUniqueName = createUniqueNamer();
  const fileResults: Record<string, string> = {};
  // Per-file notes a single run shows (#1292), keyed exactly like fileResults
  // so they land on the same upload after the flow-to-upload remap.
  const fileNotes: Record<string, BatchFileNotes> = {};
  const successEntries: Array<{ filename: string; outputRef: string }> = [];
  for (const entry of manifest) {
    if (!entry.outputRef) continue;
    const uniqueName = getUniqueName(entry.filename);
    entry.filename = uniqueName;
    const uploadIndex = String(fileIndexMap?.[entry.index] ?? entry.index);
    fileResults[uploadIndex] = uniqueName;
    if (entry.notes) fileNotes[uploadIndex] = entry.notes;
    successEntries.push({ filename: uniqueName, outputRef: entry.outputRef });
  }

  const counters = await readBatchCounters(data.jobId);
  const failedFiles = Math.max(0, totalFiles - successEntries.length);
  const allErrors = resolveBatchErrors(
    counters.errors,
    manifest,
    totalFiles,
    flowChildCount,
    fileIndexMap,
    settings.preFailureFaults,
  );
  const batchErrors = allErrors.slice(0, 100);

  // A canceled child row is durable proof a user cancel landed (#809):
  // every writer of that status traces back to a user cancel somewhere in
  // the run, including one scoped to a single child id. The Redis flag is
  // deliberately not read here: its 1h TTL can expire under a tail longer
  // than that, and a canceled run must settle as canceled anyway. #770's
  // too-late rule holds without it: zero canceled children means every
  // file completed first, and that batch completes normally.
  const canceled = canceledChildren > 0;

  // Once the batch is terminal nothing reads a child's input or output: the
  // ZIP is what downloads serve. Freeing them here keeps one large batch from
  // holding the workspace cap for FILE_MAX_AGE_HOURS (#1241).
  const reclaimNow = async () => {
    let stepCount = settings.stepCount ?? parentStepCount ?? undefined;
    if (stepCount === undefined && data.toolId === "pipeline-batch") {
      const [parentRow] = await db
        .select({ settings: schema.jobs.settings })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, data.jobId))
        .catch(() => []);
      stepCount = (parentRow?.settings as { stepCount?: number } | null)?.stepCount;
    }
    await reclaimBatchChildStorage({
      parentId: data.jobId,
      userId: data.userId,
      dirs: batchChildDirs(data.jobId, flowChildCount, stepCount, childKeys),
    });
  };
  // Started, not awaited: the ZIP and the terminal frame are already settled,
  // and a sync client or the single-slot system pool should not sit through
  // thousands of deletes. A miss is left to the storage sweep (#4184).
  const reclaimChildStorage = () => {
    void reclaimNow().catch((err) => {
      logger.warn({ err, jobId: data.jobId }, "batch child storage cleanup failed");
    });
  };

  if (canceled && successEntries.length === 0) {
    await cancelBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: [{ filename: "", error: "Canceled" }, ...batchErrors],
    });
    reclaimChildStorage();
    return {
      outputRefs: [],
      filename: "",
      contentType: "application/json",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { manifest, canceled: true, allFailed: true },
    };
  }

  if (successEntries.length === 0) {
    // Every file failing on one engine fault (the same 5xx code) is the
    // batch's failure: its status, code and hint lead, the same answer the
    // route gives when that fault strikes at upload time (#1432, #1627).
    // The pre-failures count only when the route sent every one of them.
    const fault = allFailedFault(
      settings.preFailureFaults,
      totalFiles - flowChildCount,
      childFaults,
      flowChildCount,
    );
    // Otherwise one shared reason (the workspace cap on every output write)
    // becomes the batch's own message and a blank-name entry the client reads
    // as the run's error, appended after the per-file entries like the
    // packaging failure's; a mixed bag keeps the generic summary (#1161).
    const shared = fault
      ? fault.details
        ? `${fault.error}: ${fault.details}`
        : fault.error
      : allErrors.length >= failedFiles
        ? sharedFailureReason(allErrors)
        : null;
    const applied = await failBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: shared ? [...batchErrors, { filename: "", error: shared }] : batchErrors,
      message: fault?.error ?? shared ?? "All files failed processing",
      ...(fault && { code: fault.code }),
      ...(fault?.details && { details: fault.details }),
    });
    if (!applied) {
      logger.warn(
        { jobId: data.jobId },
        "batch-finalize progress row was missing or already terminal; no terminal frame announced",
      );
    }
    reclaimChildStorage();
    return {
      outputRefs: [],
      filename: "",
      contentType: "application/json",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { manifest, allFailed: true, ...(fault && { fault }) },
    };
  }

  const zipFilename =
    data.toolId === "pipeline-batch"
      ? `pipeline-batch-${data.jobId.slice(0, 8)}.zip`
      : `batch-${data.toolId}-${data.jobId.slice(0, 8)}.zip`;
  const zipKey = `outputs/${data.jobId}/${zipFilename}`;

  let zipSize: number;
  try {
    await putObject(
      resultPayloadKey(data.jobId),
      Buffer.from(
        JSON.stringify({
          zipFilename,
          fileResults,
          fileNotes,
          totalFiles,
          completedFiles: totalFiles,
          failedFiles,
          errors: batchErrors,
        }),
        "utf8",
      ),
    );
    zipSize = await buildBatchZip(zipKey, successEntries);
  } catch (err) {
    // A SafeError's message names what to do (the workspace cap is the one
    // that fills after a large batch, #1161); it still goes through the same
    // sanitizer as every other worker error, since the AI bridge's SafeErrors
    // carry sidecar output. The generic sentence is for faults with no
    // user-safe message.
    const packagingError = isSafeMessageError(err)
      ? friendlyError(err.message)
      : "Failed to package batch results";
    const packagingCode = isSafeMessageError(err) ? err.code : undefined;
    // The terminal write must not displace the packaging root cause: the
    // rethrow below is what reaches the job record and Sentry.
    await failBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: [...batchErrors, { filename: "", error: packagingError }],
      message: packagingError,
      code: packagingCode,
    })
      .then((applied) => {
        if (!applied) {
          logger.warn(
            { jobId: data.jobId },
            "batch-finalize progress row was missing or already terminal; no terminal frame announced",
          );
        }
      })
      .catch((persistErr) => {
        logger.error(
          { err: persistErr, jobId: data.jobId },
          "failed to record batch packaging failure",
        );
      });
    // The failed batch has no ZIP, so its child outputs are unreachable;
    // keeping them is what leaves the next request on a full workspace.
    reclaimChildStorage();
    throw err instanceof Error ? err : new Error(String(err));
  }

  const result: Record<string, unknown> = {
    jobId: data.jobId,
    downloadUrl: `/api/v1/download/${data.jobId}/${encodeURIComponent(zipFilename)}`,
    zipFilename,
    fileResults,
    fileNotes,
    processedSize: zipSize,
  };

  if (canceled) {
    await cancelBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: batchErrors,
      outputRefs: [zipKey],
      bytesOut: zipSize,
      result,
    });
    reclaimChildStorage();
  } else {
    await completeBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: batchErrors,
      outputRefs: [zipKey],
      bytesOut: zipSize,
      result,
    });
    await emitWorkerBatchAudit({
      data,
      totalFiles,
      completedFiles: successEntries.length,
      failedFiles,
      processedSize: zipSize,
      durationMs: Date.now() - startTime,
    });
    reclaimChildStorage();
  }

  return {
    outputRefs: [zipKey],
    filename: zipFilename,
    contentType: "application/zip",
    originalSize: 0,
    processedSize: zipSize,
    resultPayload: {
      manifest,
      ...(canceled ? { canceled: true } : {}),
      zip: { key: zipKey, filename: zipFilename, size: zipSize, fileResults, fileNotes },
    },
  };
}

/**
 * Reconcile the Redis outcome errors with the durable child manifest and any
 * upload-time preFailureFaults (#2629). When `recordChildOutcome` missed a
 * write (#836, #2620) or the 1-hour Redis counter TTL expired on a long batch,
 * `counterErrors` has fewer entries than `expectedFailed`; backfilling from
 * the durable rows and pre-failure faults keeps per-file errors and
 * `sharedFailureReason` intact.
 */
function resolveBatchErrors(
  counterErrors: Array<{ filename: string; error: string }>,
  manifest: Array<{ index: number; filename: string; outputRef?: string; error?: string }>,
  totalFiles: number,
  flowChildCount: number,
  fileIndexMap: number[] | null,
  preFailureFaults: unknown,
): Array<{ filename: string; error: string }> {
  const manifestErrors = manifest
    .filter((m) => !m.outputRef)
    .map((m) => ({
      filename: m.filename,
      error: stripInternalPaths(m.error ?? "Processing failed"),
    }));
  const preFailedCount = Math.max(0, totalFiles - flowChildCount);
  const expectedFailed = preFailedCount + manifestErrors.length;
  if (expectedFailed <= 100 && counterErrors.length >= expectedFailed) {
    return counterErrors;
  }

  const preFaults = Array.isArray(preFailureFaults) ? (preFailureFaults as BatchFault[]) : [];
  const flowUploadSet = fileIndexMap ? new Set(fileIndexMap) : null;
  const preFailedUploadIndices: number[] = [];
  if (flowUploadSet) {
    for (let i = 0; i < totalFiles; i++) {
      if (!flowUploadSet.has(i)) preFailedUploadIndices.push(i);
    }
  }
  const remainingPreErrors: Array<{ filename: string; error: string }> = [];
  for (let k = 0; k < Math.min(preFailedCount, preFaults.length); k++) {
    const pf = preFaults[k];
    const fallbackIdx = preFailedUploadIndices[k] ?? k;
    const filename =
      typeof pf?.filename === "string" && pf.filename.length > 0
        ? pf.filename
        : `file-${fallbackIdx}`;
    remainingPreErrors.push({
      filename,
      error: stripInternalPaths(pf?.error ?? "Processing failed"),
    });
  }

  const remainingManifest = [...manifestErrors];
  let unaccountedPreCount = Math.max(0, preFailedCount - remainingPreErrors.length);
  for (const ce of counterErrors) {
    const exactPreIdx = remainingPreErrors.findIndex(
      (p) => p.filename === ce.filename && p.error === ce.error,
    );
    if (exactPreIdx !== -1) {
      remainingPreErrors.splice(exactPreIdx, 1);
      continue;
    }
    const exactManifestIdx = remainingManifest.findIndex(
      (m) => m.filename === ce.filename && m.error === ce.error,
    );
    if (exactManifestIdx !== -1) {
      remainingManifest.splice(exactManifestIdx, 1);
      continue;
    }
    const preIdx = remainingPreErrors.findIndex(
      (p) => p.error === ce.error && /^file-\d+$/.test(p.filename),
    );
    if (preIdx !== -1) {
      remainingPreErrors.splice(preIdx, 1);
      continue;
    }
    if (unaccountedPreCount > 0) {
      unaccountedPreCount--;
      continue;
    }
    const fallbackManifestIdx = remainingManifest.findIndex(
      (m) => m.error === ce.error && /^file-\d+$/.test(m.filename),
    );
    if (fallbackManifestIdx !== -1) {
      remainingManifest.splice(fallbackManifestIdx, 1);
    }
  }

  return [...counterErrors, ...remainingPreErrors, ...remainingManifest];
}

// ── Worker pool management ─────────────────────────────────────

const workers: Worker[] = [];

/** Enqueue to latest-attempt start; undefined if the job never became active. */
function jobAgeMs(job: Job): number | undefined {
  return job.processedOn ? job.processedOn - job.timestamp : undefined;
}

/**
 * Report a tool job failure to Sentry (and log Python sidecar frames when
 * present). Shared by the worker's `failed` listener (single-file tool jobs
 * and hard-failed finalizes) and by `processPipelineStep` / `processBatchChild`,
 * which catch `processToolJob` rejections and return failure markers so their
 * BullMQ parent flows still settle (#951).
 */
function reportToolJobFailure(job: Job<ToolJobData>, err: unknown, poolFallback?: string): void {
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

/**
 * Whether a pipeline flow's durable step rows show that the first
 * non-completed step was canceled (#836). Mirrors processPipelineFinalize's
 * own step scan so the failed-handler safety net and the finalize agree on
 * #770's too-late rule without reading the expiring Redis cancel flag.
 */
async function isCanceledPipelineFlow(jobId: string, totalSteps: number): Promise<boolean> {
  for (let i = 0; i < totalSteps; i++) {
    const [row] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, `${jobId}-s${i}`));
    if (row?.status !== "completed") {
      return row?.status === "canceled";
    }
  }
  return false;
}

export function startWorkers(): void {
  const workerThreads = resolveWorkerThreads(env);
  sharp.concurrency(workerThreads);
  configureSharpConcurrency(workerThreads);
  const concurrency = Math.max(1, Math.floor(resolveConcurrency(env) / 2));

  for (const pool of POOLS) {
    const workerConcurrency = pool === "system" || pool === "ai" ? 1 : concurrency;

    if (pool === "system") {
      // System pool returns heterogeneous results: batch-finalize yields
      // ToolJobResult; cron system jobs yield domain-specific values.
      // Result generic is unknown to avoid casting lies.
      const systemProcessor = async (job: Job<ToolJobData>): Promise<unknown> => {
        if (job.data?.kind === "batch-finalize") return processBatchFinalize(job);
        return runSystemJob(job);
      };

      const worker = new Worker<ToolJobData, unknown>(queueName(pool), systemProcessor, {
        connection: createBullMQConnection(),
        concurrency: workerConcurrency,
        stalledInterval: 30_000,
      });

      worker.on("error", (err) => {
        logger.error({ err, pool }, "Worker error");
      });

      worker.on("failed", (job, err) => {
        if (!job) return;
        const data = job.data as ToolJobData | undefined;
        // Safety net for a finalize that died without reaching its own
        // terminal write (crash, stall eviction): a degraded client is
        // waiting on the terminal batch frame and nothing else will send
        // one. failBatchJob is guarded, so a finalize that already
        // committed terminal state is left untouched.
        if (data?.kind === "batch-finalize") {
          void failBatchJob({
            jobId: data.jobId,
            totalFiles: data.totalFiles ?? 0,
            completedFiles: data.totalFiles ?? 0,
            failedFiles: data.totalFiles ?? 0,
            // The blank-name entry is the synthetic-error contract the client
            // displays; without it the frame reads as "all files failed" for
            // a batch whose files all succeeded.
            errors: [{ filename: "", error: "Failed to package batch results" }],
            message: "Failed to package batch results",
          }).catch((netErr) => {
            // The net itself failing means a degraded client may hang on a
            // row that never goes terminal; that must reach the operator.
            logger.error({ err: netErr, jobId: data.jobId }, "batch-finalize safety net failed");
            void reportError(netErr, { source: "worker", pool, jobId: data.jobId });
          });
        }
        // When a GDPR export exhausts its retry budget, settle the durable row
        // with the sanitized reason and log the full error (#1495). Waiting for
        // the final attempt keeps the row non-terminal while a retry is still
        // pending so isExportJobLive() does not mistake the first failure for a
        // cancel. Stranded-job reconciliation stays as the backstop for stall
        // eviction or a lost database write.
        if (
          job.name === SYSTEM_JOBS.gdprExport &&
          (Boolean(job.finishedOn) || (job.attemptsMade ?? 1) >= (job.opts?.attempts ?? 1))
        ) {
          const exportData = job.data as { userId?: string; jobId?: string } | undefined;
          const exportJobId = exportData?.jobId ?? job.id;
          logger.error(
            {
              err,
              jobId: exportJobId,
              ...(exportData?.userId ? { userId: exportData.userId } : {}),
            },
            "gdpr export job failed",
          );
          if (exportJobId) {
            const rawMessage = err instanceof Error ? err.message : String(err);
            const message = friendlyError(rawMessage) || "Export failed";
            void db
              .update(schema.jobs)
              .set({
                status: "failed",
                completedAt: new Date(),
                error: { message },
              })
              .where(
                and(
                  eq(schema.jobs.id, exportJobId),
                  notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
                ),
              )
              .catch((netErr) => {
                logger.error(
                  { err: netErr, jobId: exportJobId },
                  "gdpr-export failure status write failed",
                );
                void reportError(netErr, {
                  source: "worker",
                  pool,
                  toolId: "gdpr-export",
                  jobId: exportJobId,
                });
              });
          }
        }
        void reportError(err, {
          source: "worker",
          pool,
          toolId: data?.toolId ?? (job.name === SYSTEM_JOBS.gdprExport ? "gdpr-export" : undefined),
          jobId: job.id,
        });
      });

      workers.push(worker);
      continue;
    }

    const processor = async (job: Job<ToolJobData>): Promise<ToolJobResult> => {
      const kind = job.data.kind;
      if (kind === "pipeline-step") return processPipelineStep(job);
      if (kind === "pipeline-finalize") return processPipelineFinalize(job);
      if (kind === "batch-child") return processBatchChild(job);
      return processToolJob(job);
    };

    const worker = new Worker<ToolJobData, ToolJobResult>(queueName(pool), processor, {
      connection: createBullMQConnection(),
      concurrency: workerConcurrency,
      stalledInterval: 30_000,
    });

    worker.on("error", (err) => {
      logger.error({ err, pool }, "Worker error");
    });

    worker.on("failed", (job, err) => {
      if (!job) return;
      const data = job.data as ToolJobData | undefined;
      // Safety net, the pipeline twin of the batch-finalize net (#766): a
      // finalize that died without reaching its own terminal write (hard
      // throw in the output copy or preview, stall eviction) leaves a
      // degraded or 202 client riding the SSE with nothing ever coming. The
      // SSE channel (clientJobId) and the authoritative flow row can differ,
      // so both get the guarded write; a committed completion is never
      // downgraded, and the frame is announced only for a transition this
      // call owned. Step rows decide the label (#836): if the first
      // non-completed step is canceled, both ids settle through
      // cancelSingleJobGuarded rather than failSingleJobGuarded, matching the
      // finalize's own too-late rule. Pipeline-batch children (parentId set)
      // report through batch-finalize instead of single-file progress (#3190).
      const failedErr =
        err.name === "UnrecoverableError" && err.cause instanceof Error ? err.cause : err;
      if (data?.kind === "pipeline-finalize" && !data.parentId) {
        const isServerSafeFault = isSafeMessageError(failedErr) && hasServerErrorStatus(failedErr);
        const finalizeErrorMsg = isServerSafeFault
          ? friendlyError(failedErr.message)
          : "Pipeline processing failed";
        const finalizeErrorFields = isServerSafeFault
          ? {
              ...validationErrorFields(failedErr),
              ...failureStatus(failedErr),
            }
          : {};
        void isCanceledPipelineFlow(data.jobId, data.totalSteps ?? 0)
          .catch((probeErr) => {
            logger.error(
              { err: probeErr, jobId: data.jobId },
              "pipeline-finalize safety net step probe failed; falling back to failed label",
            );
            void reportError(probeErr, { source: "worker", pool, jobId: data.jobId });
            return false;
          })
          .then((canceled) => {
            const netSettle = (jobId: string, expectedPipelineFlowId?: string) =>
              (canceled
                ? cancelSingleJobGuarded({
                    jobId,
                    ...(expectedPipelineFlowId && { expectedPipelineFlowId }),
                  })
                : failSingleJobGuarded({
                    jobId,
                    message: finalizeErrorMsg,
                    ...finalizeErrorFields,
                    ...(expectedPipelineFlowId && { expectedPipelineFlowId }),
                  })
              ).catch((netErr) => {
                logger.error({ err: netErr, jobId }, "pipeline-finalize safety net failed");
                void reportError(netErr, { source: "worker", pool, jobId });
              });
            const frameId = data.clientJobId ?? data.jobId;
            void netSettle(frameId, frameId !== data.jobId ? data.jobId : undefined);
            if (frameId !== data.jobId) void netSettle(data.jobId);
          });
      }
      reportToolJobFailure(job, failedErr, pool);
    });

    workers.push(worker);
  }

  logger.info(
    `Workers started: ${POOLS.map((p) => `${p}(${p === "system" || p === "ai" ? 1 : concurrency})`).join(", ")}`,
  );
  logBinaryOverrides();
  logHwAccel();
  logMissingSoftwareEncoders();
}

/**
 * Name every *_PATH override that does not point at an executable file, so
 * the admin learns it at boot rather than from a masked 500 on the first
 * upload (#1310). The resolvers return the override unchecked, so nothing
 * falls back: every job that needs the binary fails until it is fixed.
 */
function logBinaryOverrides(): void {
  for (const problem of checkBinaryOverrides(process.env)) {
    logger.warn({ variable: problem.variable, path: problem.path }, binaryOverrideWarning(problem));
  }
}

/**
 * Name the software encoders a custom FFMPEG_PATH build lacks, so an admin
 * learns it at boot rather than from the first failed job (#1092). A failed
 * probe is info for the image's own binary: jobs fail open on it, so nothing
 * breaks, but the check is off for the life of the process and that should
 * leave a trace. With an explicit FFMPEG_PATH it is a misconfiguration and
 * goes out at warn, where production log filters still show it (#1310).
 */
function logMissingSoftwareEncoders(): void {
  const { missing, probeError } = softwareEncoderStatus();
  if (probeError) {
    logger[probeFailureLevel(process.env.FFMPEG_PATH)](
      { probeError, ffmpegPath: process.env.FFMPEG_PATH },
      `Could not read the ffmpeg encoder list (${probeError}); software encoders will not be checked before use`,
    );
    return;
  }
  if (missing.length === 0) return;
  logger.warn(
    { missing },
    `This ffmpeg build lacks software encoders ${missing.join(", ")}; media tools that need them will fail until a full ffmpeg build is installed`,
  );
}

/**
 * Say what SNAPOTTER_HW_ACCEL actually does on this host. Without it a wrong
 * value is invisible: encoding silently stays on software and the only symptom
 * is that nothing got faster (#1054).
 *
 * `hwAccelStatus` trial-encodes a frame per listed hardware encoder (#1089),
 * so `active` only names encoders that actually ran on this host.
 */
export function logHwAccel(): void {
  const status = hwAccelStatus();
  if (!status.requested) return;

  const softwareNote =
    status.unmapped.length > 0 ? `; ${status.unmapped.join(", ")} always use software` : "";

  if (!status.recognized) {
    logger.warn(
      { requested: status.requested, supported: HW_ACCEL_FAMILIES },
      `SNAPOTTER_HW_ACCEL="${status.requested}" is not a recognised encoder family (${HW_ACCEL_FAMILIES.join(", ")}); using software encoders`,
    );
    return;
  }

  if (status.active.length === 0) {
    const why =
      status.probeError ??
      (status.unusable.length > 0
        ? `trial encode failed for ${status.unusable.join(", ")}`
        : "this ffmpeg build lists none of them");
    logger.warn(
      {
        requested: status.requested,
        missing: status.missing,
        unusable: status.unusable,
        probeError: status.probeError,
      },
      `SNAPOTTER_HW_ACCEL="${status.requested}" was requested but ${why}; using software encoders`,
    );
    return;
  }

  const fallback = [...status.missing, ...status.unusable];
  if (fallback.length > 0) {
    logger.warn(
      {
        requested: status.requested,
        active: status.active,
        missing: status.missing,
        unusable: status.unusable,
      },
      `SNAPOTTER_HW_ACCEL="${status.requested}" is partly available; ${fallback.join(", ")} fall back to software${softwareNote}`,
    );
    return;
  }

  logger.info(
    { requested: status.requested, active: status.active, unmapped: status.unmapped },
    `Hardware encoders enabled: ${status.active.join(", ")}${softwareNote}`,
  );
}

export async function closeWorkers(): Promise<void> {
  const entries = workers.splice(0);
  await Promise.all(entries.map((w) => w.close()));
}
