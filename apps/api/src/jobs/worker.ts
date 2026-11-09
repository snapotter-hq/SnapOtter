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
import { configureSharpConcurrency } from "@snapotter/image-engine";
import { hasServerErrorStatus, isSafeMessageError } from "@snapotter/shared";
import { type Job, Worker } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import sharp from "sharp";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { resolveConcurrency, resolveWorkerThreads } from "../lib/env.js";
import { reportError } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { cancelSingleJobGuarded, failBatchJob, failSingleJobGuarded } from "../routes/progress.js";
import { createBullMQConnection } from "./connection.js";
import { runSystemJob, SYSTEM_JOBS } from "./system-jobs.js";
import { POOLS, queueName, type ToolJobData, type ToolJobResult } from "./types.js";
import { processBatchChild, processBatchFinalize } from "./worker-batch.js";
import { createWorkerErrorBackoff } from "./worker-error-backoff.js";
import { createWorkerErrorLogger } from "./worker-error-log.js";
import {
  isCanceledPipelineFlow,
  processPipelineFinalize,
  processPipelineStep,
} from "./worker-pipeline.js";
import { failureStatus, reportToolJobFailure, validationErrorFields } from "./worker-shared.js";
import {
  logBinaryOverrides,
  logHwAccel,
  logMissingSoftwareEncoders,
} from "./worker-startup-checks.js";
import { processToolJob } from "./worker-tool-job.js";

export { type LoadedToolInputs, loadToolInputBuffer, loadToolInputs } from "./worker-inputs.js";
export { contentTypeForFilename, pipelineExecutedProps } from "./worker-pipeline.js";
export { buildLegacyResultPayload, type LegacyResultPayload } from "./worker-shared.js";
export { logHwAccel } from "./worker-startup-checks.js";
export {
  isTimeoutAbortError,
  type JobDispatch,
  selectJobDispatch,
  timeoutMsFor,
} from "./worker-tool-job.js";

const workers: Worker[] = [];

const ON_DEMAND_SYSTEM_JOBS: ReadonlySet<string> = new Set([SYSTEM_JOBS.gdprExport]);
const SCHEDULED_SYSTEM_JOBS: ReadonlySet<string> = new Set(
  Object.values(SYSTEM_JOBS).filter((name) => !ON_DEMAND_SYSTEM_JOBS.has(name)),
);

// An allowlist, not "everything but the exports": the system pool also carries
// user-triggered batch-finalize and pipeline-finalize jobs (#4213).
function isScheduledSystemJob(name: string | undefined): boolean {
  return name !== undefined && SCHEDULED_SYSTEM_JOBS.has(name);
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

      worker.on("error", createWorkerErrorLogger(pool));
      worker.on("error", createWorkerErrorBackoff(worker, pool));

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
          // Scheduler ticks repeat the same environmental fault forever. The
          // system pool also runs on-demand jobs a user triggered (a GDPR export,
          // batch and pipeline finalizes), which keep the hourly rule.
          periodic: isScheduledSystemJob(job.name),
          job: job.name,
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

    worker.on("error", createWorkerErrorLogger(pool));
    worker.on("error", createWorkerErrorBackoff(worker, pool));

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

export async function closeWorkers(): Promise<void> {
  const entries = workers.splice(0);
  await Promise.all(entries.map((w) => w.close()));
}
