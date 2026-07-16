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
 * invisible to the client.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ANALYTICS_EVENTS,
  getBundleForTool,
  getOptionalBundleForTool,
  isToolInputError,
  TOOLS,
} from "@snapotter/shared";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { resolveConcurrency } from "../lib/env.js";
import { reportError, safeFormatTag } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobDuration, jobsTotal } from "../lib/metrics.js";
import {
  copyObjectToFile,
  getObjectBuffer,
  getObjectSize,
  putObject,
} from "../lib/object-storage.js";
import { OCR_MAX_ENCODED_INPUT_BYTES } from "../lib/ocr-limits.js";
import { SCRUB_PDF_PRODUCER_TOOLS, scrubPdfProducer } from "../lib/pdf-producer.js";
import { InputValidationError } from "../modality/contract.js";
import {
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
import { recordChildOutcome } from "./batch-progress.js";
import { registerCancelable, unregisterCancelable } from "./cancel.js";
import { createBullMQConnection } from "./connection.js";
import { autoSaveToLibrary, buildOutputName, generatePreview } from "./postprocess.js";
import { runSystemJob } from "./system-jobs.js";
import { POOLS, type Pool, queueName, type ToolJobData, type ToolJobResult } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────

/** SCRATCH_PATH defaults to "" in the env schema; the empty string
 *  intentionally falls through to the OS tmpdir. */
function scratchRoot(): string {
  return env.SCRATCH_PATH || join(tmpdir(), "snapotter-scratch");
}

function timeoutMsFor(pool: Pool): number {
  if (pool === "ai" || pool === "media") {
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
    const size = await getObjectSize(ref);
    if (size > OCR_MAX_ENCODED_INPUT_BYTES) {
      throw new InputValidationError(
        `OCR input exceeds the ${OCR_MAX_ENCODED_INPUT_BYTES} byte safety limit`,
        413,
      );
    }
  }
  return getObjectBuffer(ref);
}

export interface LoadedToolInputs {
  inputs: ToolProcessInputV2[];
  inputBuffer?: Buffer;
  pathInput?: AiPathJobInput;
  originalSize: number;
}

/** Load OCR PDFs to bounded scratch storage; all other tools remain Buffer-based. */
export async function loadToolInputs(
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
          `OCR input exceeds the ${OCR_MAX_ENCODED_INPUT_BYTES} byte safety limit`,
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
  if (jobResult.resultPayload) {
    Object.assign(payload, jobResult.resultPayload);
  }
  return payload;
}

// ── Tool job processor ─────────────────────────────────────────

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

    // Timeout guard (0 means unlimited; only arm when positive)
    const timeoutMs = timeoutMsFor(data.pool);
    const timeoutHandle =
      timeoutMs > 0 ? setTimeout(() => ac.abort("timeout"), timeoutMs) : undefined;

    // Per-job scratch directory
    const scratchDir = join(scratchRoot(), jobId);

    try {
      await mkdir(scratchDir, { recursive: true });

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

      // Progress reporter: emits both Redis pub/sub and BullMQ job progress
      const progressJobId = data.clientJobId ?? jobId;
      const report = (percent: number, stage?: string) => {
        void updateSingleFileProgress({
          jobId: progressJobId,
          phase: "processing",
          percent,
          stage,
        });
        void job.updateProgress({ percent, stage });
      };

      // Check for cancellation before dispatching
      if (signal.aborted) throw new Error("Canceled");

      // Build the process context
      const ctx: ToolProcessCtx = { signal, scratchDir, report };

      // Dispatch: AI handler or standard tool registry
      let resultBuffer: Buffer;
      let resultFilename: string;
      let resultContentType: string;
      let resultPayload: Record<string, unknown> | undefined;
      let extraOutputs: Array<{ name: string; buffer: Buffer; contentType: string }> | undefined;

      if (hasAiPathJobHandler(data.toolId)) {
        if (!pathInput) throw new Error(`No path-backed input for ${data.toolId}`);
        const aiResult = await runAiPathToolJob(data, pathInput, ctx);
        resultBuffer = aiResult.buffer;
        resultFilename = aiResult.filename;
        resultContentType = aiResult.contentType;
        resultPayload = aiResult.resultPayload;
        extraOutputs = aiResult.extraOutputs;
      } else if (hasAiJobHandler(data.toolId)) {
        if (!inputBuffer) throw new Error(`No buffered input for ${data.toolId}`);
        const aiResult = await runAiToolJob(data, inputBuffer, ctx);
        resultBuffer = aiResult.buffer;
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

        // Resolve buffer OR scratchPath for the primary output
        if (result.buffer) {
          resultBuffer = result.buffer;
        } else if (result.scratchPath) {
          resultBuffer = await readFile(result.scratchPath);
        } else {
          throw new Error(`Tool ${data.toolId} returned neither buffer nor scratchPath`);
        }
        resultFilename = result.filename;
        resultContentType = result.contentType;
        resultPayload = result.resultPayload;

        // Resolve extra outputs with the same buffer/scratchPath duality
        if (result.extraOutputs) {
          extraOutputs = await Promise.all(
            result.extraOutputs.map(async (extra) => {
              let buf: Buffer;
              if (extra.buffer) {
                buf = extra.buffer;
              } else if (extra.scratchPath) {
                buf = await readFile(extra.scratchPath);
              } else {
                throw new Error(`Extra output "${extra.name}" has neither buffer nor scratchPath`);
              }
              return { name: extra.name, buffer: buf, contentType: extra.contentType };
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

      // Generated PDFs carry the conversion engine's name as Producer/Creator
      // (LibreOffice, Ghostscript, pdfcpu, ...); stamp SnapOtter instead.
      // Best effort: a failed scrub keeps the original bytes.
      if (SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) && outName.toLowerCase().endsWith(".pdf")) {
        resultBuffer = await scrubPdfProducer(resultBuffer);
      }

      // Write primary output to object storage
      const primaryKey = `outputs/${jobId}/${outName}`;
      await putObject(primaryKey, resultBuffer);
      const outputRefs: string[] = [primaryKey];

      // Write extra outputs (AI tools may produce multiple files)
      if (extraOutputs) {
        for (const extra of extraOutputs) {
          const extraKey = `outputs/${jobId}/${extra.name}`;
          const body =
            SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) && extra.name.toLowerCase().endsWith(".pdf")
              ? await scrubPdfProducer(extra.buffer)
              : extra.buffer;
          await putObject(extraKey, body);
          outputRefs.push(extraKey);
        }
      }

      // Generate preview for non-browser-previewable formats
      const previewRef = await generatePreview(resultBuffer, resultContentType, jobId, inputBuffer);

      // Auto-save a new version when the input came from the user's library
      // (data.fileId is set by tool-factory when the upload referenced a
      // library file). Without a fileId this is a no-op, so tool-first uploads
      // are not auto-saved.
      const savedFileId = await autoSaveToLibrary({
        fileId: data.fileId,
        userId: data.userId,
        buffer: resultBuffer,
        outName,
        contentType: resultContentType,
        toolId: data.toolId,
      });

      const durationMs = Date.now() - startTime;

      // Build the result
      const jobResult: ToolJobResult = {
        outputRefs,
        filename: outName,
        contentType: resultContentType,
        originalSize,
        processedSize: resultBuffer.length,
        previewRef,
        savedFileId,
        resultPayload,
      };
      const legacyResult = buildLegacyResultPayload(jobResult, jobId);

      // Commit the authoritative artifact row and client replay alias in one
      // transaction before terminal Redis publication. A crash can no longer
      // leave `completed` durable state without the exact result payload.
      await updateSingleFileProgressAtomically(
        {
          jobId: progressJobId,
          phase: "complete",
          percent: 100,
          stage: "complete",
          result: legacyResult,
        },
        async (tx) => {
          await tx
            .update(schema.jobs)
            .set({
              status: "completed",
              completedAt: new Date(),
              durationMs,
              bytesIn: originalSize,
              bytesOut: resultBuffer.length,
              outputRefs,
              progress: { percent: 100, stage: "complete", result: legacyResult },
            })
            .where(eq(schema.jobs.id, jobId));
        },
      );

      // Record Prometheus metrics
      jobsTotal.inc({ pool: data.pool, status: "completed" });
      jobDuration.observe({ pool: data.pool }, durationMs / 1000);

      // Analytics: emit tool_used on success
      if (analyticsEnabled()) {
        const tool = TOOLS.find((t) => t.id === data.toolId);
        void trackEvent(
          ANALYTICS_EVENTS.TOOL_USED,
          {
            tool_id: data.toolId,
            status: "completed",
            duration_ms: durationMs,
            category: tool?.category ?? "unknown",
            is_ai_tool:
              getBundleForTool(data.toolId) !== null ||
              getOptionalBundleForTool(data.toolId) !== null,
          },
          data.analyticsDistinctId,
        );
      }

      // Record queue wait time and completion on the OTel span
      if (span && job.processedOn) {
        span.setAttribute("snapotter.queue.wait_ms", job.processedOn - job.timestamp);
      }
      if (span) span.addEvent("job.completed");

      return jobResult;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const isTimeout = signal.aborted && signal.reason === "timeout";
      const isCanceled = signal.aborted && !isTimeout;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const finalError = isCanceled
        ? "Canceled"
        : isTimeout
          ? `Timed out after ${Math.round(timeoutMs / 1000)}s. On the first run the background-removal model may still be downloading; the image may be too large for CPU inference; or the worker may be busy or unavailable. Retry once the model has downloaded, or try a smaller image.`
          : errorMessage;

      // Log genuine processing faults at error level (clients only ever see
      // friendlyError(finalError)). Expected validation rejections -- bad user
      // input, not a server fault -- would otherwise flood error logs, so skip
      // them here; they still reach the OTel span recorded below.
      const isValidationError =
        err instanceof Error && (err.name === "InputValidationError" || isToolInputError(err));
      if (!isCanceled && !isTimeout && !isValidationError) {
        logger.error({ err, jobId, toolId: data.toolId }, "tool job failed");
      }

      // Record error on the OTel span
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: finalError });
        span.recordException(err instanceof Error ? err : String(err));
        span.addEvent("job.failed");
      }

      const maxAttempts = job.opts.attempts ?? 1;
      const willRetry = !isCanceled && job.attemptsMade + 1 < maxAttempts;

      const progressJobId = data.clientJobId ?? jobId;

      // When the job will be retried, do NOT write a terminal DB row or
      // emit a terminal SSE frame. The row stays "processing" and the
      // next attempt overwrites startedAt/attempts as usual.
      if (!willRetry) {
        // Record Prometheus metrics on final attempt only
        jobsTotal.inc({ pool: data.pool, status: isCanceled ? "canceled" : "failed" });
        jobDuration.observe({ pool: data.pool }, durationMs / 1000);

        await db
          .update(schema.jobs)
          .set({
            status: isCanceled ? "canceled" : "failed",
            completedAt: new Date(),
            durationMs,
            error: { message: friendlyError(finalError) },
          })
          .where(eq(schema.jobs.id, jobId))
          .catch(() => {});

        if (isCanceled) {
          // Ephemeral terminal event for live SSE clients. Uses
          // publishEphemeral so the replay key is set without
          // overwriting the DB row (which stays "canceled").
          publishEphemeral({
            jobId: progressJobId,
            type: "single",
            phase: "failed",
            percent: 0,
            error: "Canceled",
          });
        } else {
          await updateSingleFileProgress({
            jobId: progressJobId,
            phase: "failed",
            percent: 0,
            error: friendlyError(finalError),
          });
        }
      }

      // Analytics: emit tool_used on failure
      if (analyticsEnabled()) {
        const tool = TOOLS.find((t) => t.id === data.toolId);
        void trackEvent(
          ANALYTICS_EVENTS.TOOL_USED,
          {
            tool_id: data.toolId,
            status: "failed",
            duration_ms: durationMs,
            category: tool?.category ?? "unknown",
            is_ai_tool:
              getBundleForTool(data.toolId) !== null ||
              getOptionalBundleForTool(data.toolId) !== null,
            error_code: isTimeout ? "timeout" : isCanceled ? "cancelled" : "processing",
          },
          data.analyticsDistinctId,
        );
      }

      if (isCanceled) throw new UnrecoverableError("Canceled");
      if (isTimeout) throw new Error(finalError);
      throw err;
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
    const percent = Math.round(((data.stepIndex ?? 0) / (data.totalSteps ?? 1)) * 90);
    const stage = `Step ${(data.stepIndex ?? 0) + 1}/${data.totalSteps}: ${data.toolId}`;
    void updateSingleFileProgress({
      jobId: pipelineProgressId,
      phase: "processing",
      percent,
      stage,
    });
  }

  // Clear clientJobId so processToolJob's terminal SSE event goes to the
  // step's own jobId (nobody listens) instead of prematurely ending the
  // pipeline's SSE stream.
  data.clientJobId = undefined;

  try {
    return await processToolJob(job);
  } catch (err) {
    // Step failed -- return failure marker. processToolJob already
    // updated the DB row to "failed" and emitted a terminal event
    // on the step's own progress channel.
    const errorMsg = friendlyError(err instanceof Error ? err.message : String(err));
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
function contentTypeForFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

async function processPipelineFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;
  const startTime = Date.now();
  const totalSteps = data.totalSteps ?? 0;

  const steps: Array<{ step: number; toolId: string; size: number }> = [];
  let firstBytesIn = 0;
  let lastOutputRef = "";
  let lastBytesOut = 0;
  let failedAtStep: number | null = null;
  let failError = "";

  for (let i = 0; i < totalSteps; i++) {
    const stepId = `${data.jobId}-s${i}`;
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, stepId));

    if (!row) {
      failedAtStep = i;
      failError = `Step ${i + 1} row not found`;
      break;
    }

    if (row.status !== "completed") {
      failedAtStep = i;
      failError = (row.error as { message?: string } | null)?.message ?? `Step ${i + 1} failed`;
      break;
    }

    steps.push({
      step: i + 1,
      toolId: row.toolId ?? "unknown",
      size: Number(row.bytesOut ?? 0),
    });

    if (i === 0) firstBytesIn = Number(row.bytesIn ?? 0);
    if (i === totalSteps - 1) {
      lastOutputRef = row.outputRefs?.[0] ?? "";
      lastBytesOut = Number(row.bytesOut ?? 0);
    }
  }

  const progressJobId = data.clientJobId ?? data.jobId;

  // ── Failure path ────────────────────────────────────────────
  if (failedAtStep !== null) {
    const errorMsg = `Step ${failedAtStep + 1}: ${friendlyError(failError)}`;

    await db
      .update(schema.jobs)
      .set({ status: "failed", completedAt: new Date(), error: { message: errorMsg } })
      .where(eq(schema.jobs.id, data.jobId));

    await updateSingleFileProgress({
      jobId: progressJobId,
      phase: "failed",
      percent: 0,
      error: errorMsg,
    });

    // Batch progress (pipeline-batch only)
    if (data.parentId && data.totalFiles !== undefined) {
      await recordChildOutcome(data.parentId, data.totalFiles, data.filename, errorMsg);
    }

    // Analytics: emit pipeline_executed on failure
    if (analyticsEnabled()) {
      void trackEvent(
        ANALYTICS_EVENTS.PIPELINE_EXECUTED,
        {
          step_count: totalSteps,
          tool_ids: steps.map((s) => s.toolId),
          is_batch: data.kind === "batch-finalize",
          duration_ms: Date.now() - startTime,
          status: "failed",
        },
        data.analyticsDistinctId,
      );
    }

    return {
      outputRefs: [],
      filename: data.filename,
      contentType: "",
      originalSize: firstBytesIn,
      processedSize: 0,
      resultPayload: {
        error: errorMsg,
        stepsCompleted: steps.length,
        steps,
      },
    };
  }

  // ── Success path ────────────────────────────────────────────
  if (!lastOutputRef) throw new Error("Last step has no output");

  // Copy last step's output to outputs/<pipelineJobId>/<filename> so
  // the legacy download URL /api/v1/download/<pipelineJobId>/... works.
  const lastOutputBuffer = await getObjectBuffer(lastOutputRef);
  const outFilename = lastOutputRef.split("/").pop() ?? "output";
  const parentKey = `outputs/${data.jobId}/${outFilename}`;
  await putObject(parentKey, lastOutputBuffer);

  // Modality-aware preview of the final output (video poster / pdf first page /
  // image thumb) so the pipeline result carries a previewUrl like single-tool
  // results do. Content type is derived from the output extension.
  const contentType = contentTypeForFilename(outFilename);
  const previewRef = await generatePreview(lastOutputBuffer, contentType, data.jobId);

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

  await updateSingleFileProgressAtomically(
    {
      jobId: progressJobId,
      phase: "complete",
      percent: 100,
      stage: "complete",
      result: legacyResult,
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

  // Batch progress (pipeline-batch only)
  if (data.parentId && data.totalFiles !== undefined) {
    await recordChildOutcome(data.parentId, data.totalFiles, outFilename);
  }

  // Analytics: emit pipeline_executed on success
  if (analyticsEnabled()) {
    void trackEvent(
      ANALYTICS_EVENTS.PIPELINE_EXECUTED,
      {
        step_count: totalSteps,
        tool_ids: steps.map((s) => s.toolId),
        is_batch: data.kind === "batch-finalize",
        duration_ms: Date.now() - startTime,
        status: "completed",
      },
      data.analyticsDistinctId,
    );
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
  try {
    const result = await processToolJob(job);
    await recordChildOutcome(parentId, totalFiles, job.data.filename);
    return result;
  } catch (err) {
    const error = friendlyError(err instanceof Error ? err.message : String(err));
    await recordChildOutcome(parentId, totalFiles, job.data.filename, error);
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
}

// ── Batch finalize handler ────────────────────────────────────

/**
 * Assembles the ordered manifest from child DB rows after all batch
 * children have completed. Runs on the system pool (concurrency 1)
 * and does only lightweight DB reads -- no heavy processing.
 *
 * The manifest `[{index, filename, outputRef?, error?}]` is returned
 * as the job result so the HTTP route can stream the ZIP.
 */
async function processBatchFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
  const data = job.data;
  const flowChildCount =
    (data.settings as { flowChildCount?: number } | null)?.flowChildCount ?? data.totalFiles ?? 0;

  const manifest: Array<{
    index: number;
    filename: string;
    outputRef?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < flowChildCount; i++) {
    const childId = `${data.jobId}-f${i}`;
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, childId));

    if (!row) {
      manifest.push({ index: i, filename: `file-${i}`, error: "Child job row not found" });
      continue;
    }

    if (row.status === "completed" && row.outputRefs?.[0]) {
      const outFilename = row.outputRefs[0].split("/").pop() ?? "output";
      manifest.push({ index: i, filename: outFilename, outputRef: row.outputRefs[0] });
    } else {
      const errorMsg = (row.error as { message?: string } | null)?.message ?? "Processing failed";
      const inputFilename = row.inputRefs?.[0]?.split("/").pop() ?? `file-${i}`;
      manifest.push({ index: i, filename: inputFilename, error: friendlyError(errorMsg) });
    }
  }

  // Update parent row
  await db
    .update(schema.jobs)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(schema.jobs.id, data.jobId));

  return {
    outputRefs: [],
    filename: "",
    contentType: "application/json",
    originalSize: 0,
    processedSize: 0,
    resultPayload: { manifest },
  };
}

// ── Worker pool management ─────────────────────────────────────

const workers: Worker[] = [];

export function startWorkers(): void {
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
        void reportError(err, {
          source: "worker",
          pool,
          toolId: (job.data as ToolJobData | undefined)?.toolId,
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
      void reportError(err, {
        source: "worker",
        pool,
        toolId: (job.data as ToolJobData | undefined)?.toolId,
        inputFormat: safeFormatTag((job.data as ToolJobData | undefined)?.filename),
      });
    });

    workers.push(worker);
  }

  logger.info(
    `Workers started: ${POOLS.map((p) => `${p}(${p === "system" || p === "ai" ? 1 : concurrency})`).join(", ")}`,
  );
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
