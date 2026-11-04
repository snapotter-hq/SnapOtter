import { PassThrough } from "node:stream";
import { isSafeMessageError } from "@snapotter/shared";
import archiver from "archiver";
import type { Job } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { type BatchFileNotes, pickBatchFileNotes } from "../lib/batch-file-notes.js";
import { allFailedFault, allFailedInputCode, type BatchFault } from "../lib/engine-unavailable.js";
import { reportError } from "../lib/error-report.js";
import { friendlyError, sharedFailureReason, stripInternalPaths } from "../lib/errors.js";
import { createUniqueNamer } from "../lib/filename.js";
import { logger } from "../lib/logger.js";
import { jobsTotal } from "../lib/metrics.js";
import {
  getObjectSize,
  getObjectStream,
  isMissingObjectError,
  isStorageServiceFault,
  normalizeS3ReadFault,
  putObject,
  putObjectStream,
  verifyS3Bucket,
} from "../lib/object-storage.js";
import { emitWorkerBatchAudit } from "../lib/tool-audit.js";
import { cancelBatchJob, completeBatchJob, failBatchJob } from "../routes/progress.js";
import { isBatchCanceled, readBatchCounters, recordChildOutcome } from "./batch-progress.js";
import { batchChildDirs, reclaimBatchChildStorage } from "./batch-reclaim.js";
import { resultPayloadKey, type ToolJobData, type ToolJobResult } from "./types.js";
import { reportToolJobFailure } from "./worker-shared.js";
import { processToolJob } from "./worker-tool-job.js";

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
export async function processBatchChild(job: Job<ToolJobData>): Promise<ToolJobResult> {
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

// A source stream that neither errors nor ends (half-open S3 read) would
// otherwise hold the concurrency-1 system pool forever: BullMQ keeps
// renewing the lock of an "active" job, so stall detection never fires.
const BATCH_ZIP_TIMEOUT_MS = 15 * 60_000;

/**
 * Stream every successful child output through one archiver pass into a
 * durable ZIP object. A source stream that fails after opening never rejects
 * an await on its own, so both the archive and every entry stream funnel
 * failures into the PassThrough; destroying it makes putObjectStream reject
 * (and clean up its partial object).
 */
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
export async function processBatchFinalize(job: Job<ToolJobData>): Promise<ToolJobResult> {
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
    const inputCode = fault
      ? undefined
      : allFailedInputCode(
          settings.preFailureFaults,
          totalFiles - flowChildCount,
          childFaults,
          flowChildCount,
        );
    const batchCode = fault?.code ?? inputCode ?? undefined;
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
      ...(batchCode && { code: batchCode }),
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
      resultPayload: {
        manifest,
        allFailed: true,
        ...(fault && { fault }),
        ...(inputCode && { sharedCode: inputCode }),
      },
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
