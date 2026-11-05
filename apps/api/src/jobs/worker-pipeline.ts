import {
  ANALYTICS_EVENTS,
  hasServerErrorStatus,
  IMAGE_EXT_TO_MIME,
  isSafeMessageError,
  type PipelineExecutedProperties,
} from "@snapotter/shared";
import type { Job } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { type BatchFileNotes, pickBatchFileNotes } from "../lib/batch-file-notes.js";
import { reportError } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobsTotal } from "../lib/metrics.js";
import {
  getObjectBuffer,
  isStorageServiceFault,
  normalizeS3ReadFault,
  putObject,
} from "../lib/object-storage.js";
import { emitWorkerPipelineAudit } from "../lib/tool-audit.js";
import {
  cancelSingleJobGuarded,
  publishEphemeral,
  updateSingleFileProgress,
  updateSingleFileProgressAtomically,
} from "../routes/progress.js";
import { isBatchCanceled, recordChildOutcome } from "./batch-progress.js";
import { generatePreview } from "./postprocess.js";
import { resultPayloadKey, type ToolJobData, type ToolJobResult } from "./types.js";
import {
  buildLegacyResultPayload,
  failureStatus,
  reportToolJobFailure,
  validationErrorFields,
} from "./worker-shared.js";
import { processToolJob } from "./worker-tool-job.js";

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
export async function processPipelineStep(job: Job<ToolJobData>): Promise<ToolJobResult> {
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
export async function processPipelineFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
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

/**
 * Whether a pipeline flow's durable step rows show that the first
 * non-completed step was canceled (#836). Mirrors processPipelineFinalize's
 * own step scan so the failed-handler safety net and the finalize agree on
 * #770's too-late rule without reading the expiring Redis cancel flag.
 */
export async function isCanceledPipelineFlow(jobId: string, totalSteps: number): Promise<boolean> {
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
