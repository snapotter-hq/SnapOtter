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
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ANALYTICS_EVENTS,
  extractErrorCode,
  getBundleForTool,
  getOptionalBundleForTool,
  isToolInputError,
  ONBOARDING_FIRST_PROCESSED_KEY,
  type PipelineExecutedProperties,
  TOOLS,
} from "@snapotter/shared";
import archiver from "archiver";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { resolveConcurrency } from "../lib/env.js";
import { classifyError, reportError, safeFormatTag } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { createUniqueNamer } from "../lib/filename.js";
import { logger } from "../lib/logger.js";
import { jobDuration, jobsTotal } from "../lib/metrics.js";
import {
  copyObjectToFile,
  getObjectBuffer,
  getObjectSize,
  getObjectStream,
  putObject,
  putObjectStream,
} from "../lib/object-storage.js";
import { OCR_MAX_ENCODED_INPUT_BYTES } from "../lib/ocr-limits.js";
import { SCRUB_PDF_PRODUCER_TOOLS, scrubPdfProducer } from "../lib/pdf-producer.js";
import { setSettingIfAbsent } from "../lib/settings-helpers.js";
import { timeoutMessage } from "../lib/timeout.js";
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
import { registerCancelable, unregisterCancelable } from "./cancel.js";
import { createBullMQConnection } from "./connection.js";
import { createMonotonicReporter } from "./monotonic-progress.js";
import { resolveOutputSource } from "./output-resolve.js";
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

/**
 * Dimensions shared by both tool_used branches, kept in one place so the
 * success and failure events never drift. input_format is the safe extension
 * only (never the filename); is_batch flags a per-file batch child so batch
 * volume is distinguishable from single runs; execution_hint records the tool's
 * sync/async class.
 */
function toolUsedBaseProps(data: ToolJobData, durationMs: number): Record<string, unknown> {
  const tool = TOOLS.find((t) => t.id === data.toolId);
  return {
    tool_id: data.toolId,
    duration_ms: durationMs,
    category: tool?.category ?? "unknown",
    is_ai_tool:
      getBundleForTool(data.toolId) !== null || getOptionalBundleForTool(data.toolId) !== null,
    is_batch: data.kind === "batch-child",
    input_format: safeFormatTag(data.filename) ?? "unknown",
    execution_hint: tool?.executionHint ?? "fast",
  };
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

      if (hasAiPathJobHandler(data.toolId)) {
        if (!pathInput) throw new Error(`No path-backed input for ${data.toolId}`);
        const aiResult = await runAiPathToolJob(data, pathInput, ctx);
        resultBuffer = aiResult.buffer;
        resultSize = aiResult.buffer.length;
        resultFilename = aiResult.filename;
        resultContentType = aiResult.contentType;
        resultPayload = aiResult.resultPayload;
        extraOutputs = aiResult.extraOutputs;
      } else if (hasAiJobHandler(data.toolId)) {
        if (!inputBuffer) throw new Error(`No buffered input for ${data.toolId}`);
        const aiResult = await runAiToolJob(data, inputBuffer, ctx);
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

      // Generated PDFs carry the conversion engine's name as Producer/Creator
      // (LibreOffice, Ghostscript, pdfcpu, ...); stamp SnapOtter instead.
      // Best effort: a failed scrub keeps the original bytes.
      if (
        SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) &&
        outName.toLowerCase().endsWith(".pdf") &&
        resultBuffer
      ) {
        resultBuffer = await scrubPdfProducer(resultBuffer);
        resultSize = resultBuffer.length;
      }

      // Write primary output to object storage
      const primaryKey = `outputs/${jobId}/${outName}`;
      if (resultBuffer) {
        await putObject(primaryKey, resultBuffer);
      } else if (resultStreamPath) {
        resultSize = await putObjectStream(primaryKey, createReadStream(resultStreamPath), {
          signal,
        });
      }
      const outputRefs: string[] = [primaryKey];

      // Write extra outputs (AI tools may produce multiple files)
      if (extraOutputs) {
        for (const extra of extraOutputs) {
          const extraKey = `outputs/${jobId}/${extra.name}`;
          if (extra.buffer) {
            const body =
              SCRUB_PDF_PRODUCER_TOOLS.has(data.toolId) && extra.name.toLowerCase().endsWith(".pdf")
                ? await scrubPdfProducer(extra.buffer)
                : extra.buffer;
            await putObject(extraKey, body);
          } else if (extra.scratchPath) {
            // Over-cap extra: streamed as-is. The producer scrub needs bytes in
            // memory, and no real PDF reaches the buffering cap.
            await putObjectStream(extraKey, createReadStream(extra.scratchPath), { signal });
          }
          outputRefs.push(extraKey);
        }
      }

      // Generate preview for non-browser-previewable formats. A streamed
      // over-cap output ships without one: the poster pipeline needs the bytes
      // in memory, and no preview beats no result.
      const previewRef = resultBuffer
        ? await generatePreview(resultBuffer, resultContentType, jobId)
        : undefined;

      // Auto-save when the input came from the user's library (data.fileId is
      // set by the route when the upload referenced a library file). saveMode
      // picks between an independent new file (default) and a superseding
      // version. Without a fileId this is a no-op, so tool-first uploads are
      // not auto-saved.
      let savedFileId: string | undefined;
      if (resultBuffer) {
        savedFileId = await autoSaveToLibrary({
          fileId: data.fileId,
          saveMode: data.saveMode,
          userId: data.userId,
          buffer: resultBuffer,
          outName,
          contentType: resultContentType,
          toolId: data.toolId,
        });
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
              bytesOut: resultSize,
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
          ? timeoutMessage(timeoutMs)
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

        // Swallowed so the rethrow below stays authoritative, but logged:
        // for a canceled child or step this row is the only evidence the
        // finalize reads when it labels the run (#809), so a dropped write
        // here must be visible somewhere.
        await db
          .update(schema.jobs)
          .set({
            status: isCanceled ? "canceled" : "failed",
            completedAt: new Date(),
            durationMs,
            error: { message: friendlyError(finalError) },
          })
          .where(eq(schema.jobs.id, jobId))
          .catch((writeErr) => {
            logger.error(
              { err: writeErr, jobId, toolId: data.toolId },
              "terminal status write failed",
            );
          });

        if (isCanceled) {
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
              await cancelSingleJobGuarded({ jobId: progressJobId });
            } catch (aliasErr) {
              logger.error(
                { err: aliasErr, jobId, progressJobId },
                "canceled alias terminal write failed",
              );
            }
          }
          // Ephemeral terminal event for live SSE clients, published
          // unconditionally: liveness must not depend on the durable write
          // (which the guard also skips when a reused alias id is still
          // terminal from an earlier run). publishEphemeral sets the
          // replay key without overwriting the DB row (which stays
          // "canceled").
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

  const steps: Array<{ step: number; toolId: string; size: number }> = [];
  let firstBytesIn = 0;
  let lastOutputRef = "";
  let lastBytesOut = 0;
  let failedAtStep: number | null = null;
  let failedStepCanceled = false;
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
      failedStepCanceled = row.status === "canceled";
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
    // reconnecting client replays a live row forever.
    await cancelSingleJobGuarded({ jobId: data.jobId });
    if (progressJobId !== data.jobId) {
      await cancelSingleJobGuarded({ jobId: progressJobId });
    }

    // Batch progress (pipeline-batch only): the canceled file counts like a
    // failed one; batch-finalize turns the canceled rows into #767's
    // partial-ZIP semantics.
    if (data.parentId && data.totalFiles !== undefined) {
      await recordChildOutcome(data.parentId, data.totalFiles, data.filename, "Canceled");
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
  // land in the catch below via processToolJob's own cancel handling. The
  // guarded write cannot clobber a row another path already settled.
  if (parentId) {
    try {
      if (await isBatchCanceled(parentId)) {
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
        await recordChildOutcome(parentId, totalFiles, job.data.filename, "Canceled");
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
  const feed = (async () => {
    for (const entry of entries) {
      if (failed) break;
      const source = await getObjectStream(entry.outputRef);
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
        fail(err);
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
  const settings = (data.settings ?? {}) as {
    flowChildCount?: number;
    fileIndexMap?: number[];
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
  }> = [];

  let canceledChildren = 0;
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
      if (row.status === "canceled") canceledChildren++;
      const errorMsg = (row.error as { message?: string } | null)?.message ?? "Processing failed";
      const inputFilename = row.inputRefs?.[0]?.split("/").pop() ?? `file-${i}`;
      manifest.push({ index: i, filename: inputFilename, error: friendlyError(errorMsg) });
    }
  }

  // Deduplicate output names once, here, so the ZIP entries, the terminal
  // frame's fileResults, and the route's X-File-Results header cannot drift.
  const getUniqueName = createUniqueNamer();
  const fileResults: Record<string, string> = {};
  const successEntries: Array<{ filename: string; outputRef: string }> = [];
  for (const entry of manifest) {
    if (!entry.outputRef) continue;
    const uniqueName = getUniqueName(entry.filename);
    entry.filename = uniqueName;
    fileResults[String(fileIndexMap?.[entry.index] ?? entry.index)] = uniqueName;
    successEntries.push({ filename: uniqueName, outputRef: entry.outputRef });
  }

  const counters = await readBatchCounters(data.jobId);
  const failedFiles = Math.max(0, totalFiles - successEntries.length);

  // A canceled child row is durable proof a user cancel landed (#809):
  // every writer of that status traces back to a user cancel somewhere in
  // the run, including one scoped to a single child id. The Redis flag is
  // deliberately not read here: its 1h TTL can expire under a tail longer
  // than that, and a canceled run must settle as canceled anyway. #770's
  // too-late rule holds without it: zero canceled children means every
  // file completed first, and that batch completes normally.
  const canceled = canceledChildren > 0;

  if (canceled && successEntries.length === 0) {
    await cancelBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: [{ filename: "", error: "Canceled" }, ...counters.errors],
    });
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
    await failBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: counters.errors,
      message: "All files failed processing",
    });
    return {
      outputRefs: [],
      filename: "",
      contentType: "application/json",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { manifest, allFailed: true },
    };
  }

  const zipFilename =
    data.toolId === "pipeline-batch"
      ? `pipeline-batch-${data.jobId.slice(0, 8)}.zip`
      : `batch-${data.toolId}-${data.jobId.slice(0, 8)}.zip`;
  const zipKey = `outputs/${data.jobId}/${zipFilename}`;

  let zipSize: number;
  try {
    zipSize = await buildBatchZip(zipKey, successEntries);
  } catch (err) {
    const packagingError = "Failed to package batch results";
    // The terminal write must not displace the packaging root cause: the
    // rethrow below is what reaches the job record and Sentry.
    await failBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: [...counters.errors, { filename: "", error: packagingError }],
      message: packagingError,
    }).catch((persistErr) => {
      logger.error(
        { err: persistErr, jobId: data.jobId },
        "failed to record batch packaging failure",
      );
    });
    throw err instanceof Error ? err : new Error(String(err));
  }

  const result: Record<string, unknown> = {
    jobId: data.jobId,
    downloadUrl: `/api/v1/download/${data.jobId}/${encodeURIComponent(zipFilename)}`,
    zipFilename,
    fileResults,
    processedSize: zipSize,
  };

  if (canceled) {
    await cancelBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: counters.errors,
      outputRefs: [zipKey],
      bytesOut: zipSize,
      result,
    });
  } else {
    await completeBatchJob({
      jobId: data.jobId,
      totalFiles,
      completedFiles: totalFiles,
      failedFiles,
      errors: counters.errors,
      outputRefs: [zipKey],
      bytesOut: zipSize,
      result,
    });
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
      zip: { key: zipKey, filename: zipFilename, size: zipSize, fileResults },
    },
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
        void reportError(err, {
          source: "worker",
          pool,
          toolId: data?.toolId,
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
      // call owned. A finalize that dies inside its own cancel dual-write
      // (#771) lands here too and gets labeled a failure; once that write
      // threw, the net cannot know the run was canceled.
      if (data?.kind === "pipeline-finalize") {
        const netFail = (jobId: string) =>
          failSingleJobGuarded({ jobId, message: "Pipeline processing failed" }).catch((netErr) => {
            logger.error({ err: netErr, jobId }, "pipeline-finalize safety net failed");
            void reportError(netErr, { source: "worker", pool, jobId });
          });
        const frameId = data.clientJobId ?? data.jobId;
        void netFail(frameId);
        if (frameId !== data.jobId) void netFail(data.jobId);
      }
      const pf = (err as { pythonFrames?: unknown }).pythonFrames;
      if (Array.isArray(pf) && pf.length) {
        logger.error({ pool, jobId: job.id, pythonFrames: pf }, "sidecar failure");
      }
      void reportError(err, {
        source: "worker",
        pool,
        toolId: data?.toolId,
        jobId: job.id,
        inputFormat: safeFormatTag(data?.filename),
        settings: data?.settings,
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
