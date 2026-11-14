import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ANALYTICS_EVENTS,
  extractErrorCode,
  getBundleForTool,
  getOptionalBundleForTool,
  isSafeMessageError,
  isToolInputError,
  ONBOARDING_FIRST_PROCESSED_KEY,
  SafeError,
  TOOLS,
} from "@snapotter/shared";
import { type Job, UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { isBinarySpawnFailure } from "../lib/binary-overrides.js";
import { classifyError, reportError, safeFormatTag } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobDuration, jobsTotal } from "../lib/metrics.js";
import { deletePrefix, putObject, putObjectStream } from "../lib/object-storage.js";
import { SCRUB_PDF_PRODUCER_TOOLS, scrubPdfProducer } from "../lib/pdf-producer.js";
import { resolveCanonicalToolId } from "../lib/pool.js";
import { setSettingIfAbsent } from "../lib/settings-helpers.js";
import { timeoutMessage } from "../lib/timeout.js";
import { emitWorkerToolAudit } from "../lib/tool-audit.js";
import {
  cancelSingleJobGuarded,
  publishEphemeral,
  updateSingleFileProgress,
  updateSingleFileProgressAtomically,
} from "../routes/progress.js";
import { getToolConfig, type ToolProcessCtx } from "../routes/tool-factory.js";
import {
  hasAiJobHandler,
  hasAiPathJobHandler,
  runAiPathToolJob,
  runAiToolJob,
} from "./ai-handlers.js";
import {
  claimFinalize,
  registerCancelable,
  releaseFinalize,
  unregisterCancelable,
  userCancelSignal,
  wasUserCanceled,
} from "./cancel.js";
import { createMonotonicReporter } from "./monotonic-progress.js";
import { resolveOutputSource } from "./output-resolve.js";
import {
  type AutoSaveTx,
  buildOutputName,
  generatePreview,
  type StagedAutoSave,
  stageAutoSaveToLibrary,
} from "./postprocess.js";
import {
  type Pool,
  queueName,
  resultPayloadKey,
  type ToolJobData,
  type ToolJobResult,
} from "./types.js";
import { loadToolInputs } from "./worker-inputs.js";
import {
  buildLegacyResultPayload,
  createJobDeadline,
  createJobProgressSink,
  failureStatus,
  jobAgeMs,
  validationErrorFields,
} from "./worker-shared.js";

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

export async function processToolJob(job: Job<ToolJobData>): Promise<ToolJobResult> {
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
    // A handler that knows how long its input needs can push this out through
    // ctx.extendDeadline (accurate PDF OCR, #4719).
    const timeoutMs = timeoutMsFor(data.pool, data.toolId);
    const deadline = createJobDeadline(timeoutMs, () => ac.abort("timeout"));

    // Per-attempt scratch directory. BullMQ re-runs a stalled job under the
    // same id while the first attempt may still be running, so a dir keyed on
    // the id alone was shared, and whichever attempt finished first removed it
    // from under the other mid-sidecar (#4217).
    const scratchDir = join(scratchRoot(), `${jobId}-${randomUUID()}`);

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
      const writeJobProgress = createJobProgressSink(job, data.toolId);
      const report = createMonotonicReporter((percent: number, stage?: string) => {
        void updateSingleFileProgress({
          jobId: progressJobId,
          phase: "processing",
          percent,
          stage,
          ...(progressJobId !== jobId && { expectedArtifactJobId: jobId }),
        });
        writeJobProgress({ percent, stage });
      });

      // Check for cancellation before dispatching
      if (signal.aborted) throw new Error("Canceled");

      // Build the process context
      const ctx: ToolProcessCtx = {
        signal,
        scratchDir,
        report,
        extendDeadline: deadline.extend,
      };

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
          { jobId, toolId: data.toolId, timeoutMs: deadline.timeoutMs(), durationMs },
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
          ? timeoutMessage(deadline.timeoutMs())
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
      deadline.clear();
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
