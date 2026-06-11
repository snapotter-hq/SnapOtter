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
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { resolveConcurrency } from "../lib/env.js";
import { getObjectBuffer, putObject } from "../lib/object-storage.js";
import { publishEphemeral, updateSingleFileProgress } from "../routes/progress.js";
import { getToolConfig, type ToolProcessCtx } from "../routes/tool-factory.js";
import { hasAiJobHandler, runAiToolJob } from "./ai-handlers.js";
import { registerCancelable, unregisterCancelable } from "./cancel.js";
import { createRedisConnection } from "./connection.js";
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
    payload.previewUrl = `/api/v1/download/${jobId}/preview.webp`;
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

    // Load input from object storage
    const inputBuffer = await getObjectBuffer(data.inputRefs[0]);

    // Progress reporter: emits both Redis pub/sub and BullMQ job progress
    const progressJobId = data.clientJobId ?? jobId;
    const report = (percent: number, stage?: string) => {
      updateSingleFileProgress({
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

    if (data.kind === "ai-tool" && hasAiJobHandler(data.toolId)) {
      const aiResult = await runAiToolJob(data, inputBuffer, ctx);
      resultBuffer = aiResult.buffer;
      resultFilename = aiResult.filename;
      resultContentType = aiResult.contentType;
      resultPayload = aiResult.resultPayload;
      extraOutputs = aiResult.extraOutputs;
    } else {
      const config = getToolConfig(data.toolId);
      if (!config) throw new Error(`No tool config for ${data.toolId}`);
      const result = await config.process(inputBuffer, data.settings, data.filename, ctx);
      resultBuffer = result.buffer;
      resultFilename = result.filename;
      resultContentType = result.contentType;
    }

    // Build output name with tool suffix and extension fixup
    const outName = buildOutputName(resultFilename, data.filename, data.toolId, resultContentType);

    // Write primary output to object storage
    const primaryKey = `outputs/${jobId}/${outName}`;
    await putObject(primaryKey, resultBuffer);
    const outputRefs: string[] = [primaryKey];

    // Write extra outputs (AI tools may produce multiple files)
    if (extraOutputs) {
      for (const extra of extraOutputs) {
        const extraKey = `outputs/${jobId}/${extra.name}`;
        await putObject(extraKey, extra.buffer);
        outputRefs.push(extraKey);
      }
    }

    // Generate preview for non-browser-previewable formats
    const previewRef = await generatePreview(resultBuffer, resultContentType, jobId, inputBuffer);

    // Auto-save to user file library
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
      originalSize: inputBuffer.length,
      processedSize: resultBuffer.length,
      previewRef,
      savedFileId,
      resultPayload,
    };

    // Update durable row to completed
    await db
      .update(schema.jobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationMs,
        bytesIn: inputBuffer.length,
        bytesOut: resultBuffer.length,
        outputRefs,
        progress: { percent: 100, stage: "complete" },
      })
      .where(eq(schema.jobs.id, jobId));

    // Emit terminal progress event with legacy result payload
    const legacyResult = buildLegacyResultPayload(jobResult, jobId);
    updateSingleFileProgress({
      jobId: progressJobId,
      phase: "complete",
      percent: 100,
      stage: "complete",
      result: legacyResult,
    });

    return jobResult;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const isTimeout = signal.aborted && signal.reason === "timeout";
    const isCanceled = signal.aborted && !isTimeout;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const finalError = isCanceled
      ? "Canceled"
      : isTimeout
        ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
        : errorMessage;

    const maxAttempts = job.opts.attempts ?? 1;
    const willRetry = !isCanceled && job.attemptsMade + 1 < maxAttempts;

    const progressJobId = data.clientJobId ?? jobId;

    // When the job will be retried, do NOT write a terminal DB row or
    // emit a terminal SSE frame. The row stays "processing" and the
    // next attempt overwrites startedAt/attempts as usual.
    if (!willRetry) {
      await db
        .update(schema.jobs)
        .set({
          status: isCanceled ? "canceled" : "failed",
          completedAt: new Date(),
          durationMs,
          error: { message: finalError },
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
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: finalError,
        });
      }
    }

    if (isCanceled) throw new UnrecoverableError("Canceled");
    if (isTimeout) throw new Error(finalError);
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
    unregisterCancelable(jobId);
    // Clean up scratch directory
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Worker pool management ─────────────────────────────────────

const workers: Worker[] = [];

export function startWorkers(): void {
  const concurrency = Math.max(1, Math.floor(resolveConcurrency(env) / 2));

  for (const pool of POOLS) {
    const workerConcurrency = pool === "system" || pool === "ai" ? 1 : concurrency;

    const processor = async (job: Job<ToolJobData>): Promise<ToolJobResult> => {
      if (pool === "system") {
        return runSystemJob(job);
      }
      return processToolJob(job);
    };

    const worker = new Worker<ToolJobData, ToolJobResult>(queueName(pool), processor, {
      connection: createRedisConnection(),
      concurrency: workerConcurrency,
      stalledInterval: 30_000,
    });

    worker.on("error", (err) => {
      console.error(`Worker error [${pool}]:`, err);
    });

    workers.push(worker);
  }

  console.log(
    `Workers started: ${POOLS.map((p) => `${p}(${p === "system" || p === "ai" ? 1 : concurrency})`).join(", ")}`,
  );
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
