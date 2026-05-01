/**
 * SSE endpoint for real-time job progress tracking.
 *
 * GET /api/v1/jobs/:jobId/progress
 *
 * Sends Server-Sent Events with progress data until the job finishes.
 *
 * Progress is held in-memory for real-time SSE delivery and also
 * persisted to the `jobs` table so that state survives container restarts.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";

export interface JobProgress {
  jobId: string;
  type?: "batch";
  status: "processing" | "completed" | "failed";
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  /** Names of files that failed, with error messages. */
  errors: Array<{ filename: string; error: string }>;
  /** Current file being processed (if any). */
  currentFile?: string;
}

export interface SingleFileProgress {
  jobId: string;
  type: "single";
  phase: "processing" | "complete" | "failed";
  stage?: string;
  percent: number;
  error?: string;
  result?: Record<string, unknown>;
}

/** In-memory store of job progress, keyed by jobId. */
const jobProgressStore = new Map<string, JobProgress>();

/** Terminal single-file events kept for SSE reconnect replay. */
const singleFileCompletions = new Map<string, SingleFileProgress>();

/** SSE listeners waiting for updates, keyed by jobId. */
const listeners = new Map<string, Set<(data: JobProgress | SingleFileProgress) => void>>();

// ── DB persistence helpers ──────────────────────────────────────────

function persistJobProgress(progress: JobProgress): void {
  try {
    const completionRatio =
      progress.totalFiles > 0 ? progress.completedFiles / progress.totalFiles : 0;
    const existing = db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId))
      .get();

    if (existing) {
      db.update(schema.jobs)
        .set({
          status: progress.status,
          progress: completionRatio,
          error: progress.errors.length > 0 ? JSON.stringify(progress.errors) : null,
          completedAt:
            progress.status === "completed" || progress.status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId))
        .run();
    } else {
      db.insert(schema.jobs)
        .values({
          id: progress.jobId,
          type: "batch",
          status: progress.status,
          progress: completionRatio,
          inputFiles: JSON.stringify({ totalFiles: progress.totalFiles }),
          error: progress.errors.length > 0 ? JSON.stringify(progress.errors) : null,
        })
        .run();
    }
  } catch {
    // DB persistence is best-effort; don't break real-time SSE
  }
}

function persistSingleFileProgress(progress: Omit<SingleFileProgress, "type">): void {
  try {
    const status =
      progress.phase === "complete"
        ? "completed"
        : progress.phase === "failed"
          ? "failed"
          : "processing";
    const existing = db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId))
      .get();

    if (existing) {
      db.update(schema.jobs)
        .set({
          status,
          progress: progress.percent / 100,
          error: progress.error ?? null,
          completedAt: status === "completed" || status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId))
        .run();
    } else {
      db.insert(schema.jobs)
        .values({
          id: progress.jobId,
          type: "single",
          status,
          progress: progress.percent / 100,
          inputFiles: "[]",
          error: progress.error ?? null,
        })
        .run();
    }
  } catch {
    // Best-effort
  }
}

/**
 * Mark any jobs left in "processing" or "queued" state as failed.
 * Called once at startup to recover from unclean shutdown.
 */
export function recoverStaleJobs(): void {
  try {
    const result = db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: "Server restarted while job was in progress",
        completedAt: new Date(),
      })
      .where(eq(schema.jobs.status, "processing"))
      .run();
    const result2 = db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: "Server restarted while job was queued",
        completedAt: new Date(),
      })
      .where(eq(schema.jobs.status, "queued"))
      .run();
    const total = result.changes + result2.changes;
    if (total > 0) {
      console.log(`Recovered ${total} stale jobs from previous run`);
    }
  } catch {
    // DB not ready
  }
}

// ── Public API (unchanged signatures) ───────────────────────────────

/**
 * Create or update progress for a job.
 */
export function updateJobProgress(progress: JobProgress): void {
  jobProgressStore.set(progress.jobId, progress);
  persistJobProgress(progress);
  // Notify all SSE listeners (add type: "batch" so the frontend can distinguish
  // batch events from single-file events in the shared SSE stream)
  const subs = listeners.get(progress.jobId);
  if (subs) {
    const event = { ...progress, type: "batch" } as JobProgress & { type: "batch" };
    for (const cb of subs) {
      cb(event);
    }
    // If the job is done, clean up listeners after a brief delay
    if (progress.status === "completed" || progress.status === "failed") {
      setTimeout(() => {
        listeners.delete(progress.jobId);
        jobProgressStore.delete(progress.jobId);
      }, 5000);
    }
  }
}

export function updateSingleFileProgress(progress: Omit<SingleFileProgress, "type">): void {
  const event: SingleFileProgress = { ...progress, type: "single" };
  persistSingleFileProgress(progress);

  if (progress.phase === "complete" || progress.phase === "failed") {
    if (singleFileCompletions.size >= 10_000) {
      const oldest = singleFileCompletions.keys().next().value;
      if (oldest) singleFileCompletions.delete(oldest);
    }
    singleFileCompletions.set(progress.jobId, event);
    setTimeout(() => singleFileCompletions.delete(progress.jobId), 120_000);
  }

  const subs = listeners.get(progress.jobId);
  if (subs) {
    for (const cb of subs) {
      cb(event);
    }
    if (progress.phase === "complete" || progress.phase === "failed") {
      setTimeout(() => {
        listeners.delete(progress.jobId);
      }, 5000);
    }
  }
}

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/jobs/:jobId/progress",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const { jobId } = request.params;

      // Take over the response from Fastify for SSE streaming
      reply.hijack();

      // Send SSE headers via the raw Node response
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Helper to send an SSE message
      const sendEvent = (data: JobProgress | SingleFileProgress) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // If the job already has progress, send it immediately
      const existing = jobProgressStore.get(jobId);
      if (existing) {
        sendEvent({ ...existing, type: "batch" });
        if (existing.status === "completed" || existing.status === "failed") {
          reply.raw.end();
          return;
        }
      }

      const existingSingle = singleFileCompletions.get(jobId);
      if (existingSingle) {
        sendEvent(existingSingle);
        reply.raw.end();
        return;
      }

      // Subscribe to updates
      if (!listeners.has(jobId)) {
        listeners.set(jobId, new Set());
      }

      const callback = (data: JobProgress | SingleFileProgress) => {
        sendEvent(data);
        if (
          ("status" in data && (data.status === "completed" || data.status === "failed")) ||
          ("phase" in data && (data.phase === "complete" || data.phase === "failed"))
        ) {
          reply.raw.end();
        }
      };

      listeners.get(jobId)?.add(callback);

      // Clean up on client disconnect
      request.raw.on("close", () => {
        const subs = listeners.get(jobId);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) {
            listeners.delete(jobId);
          }
        }
      });
    },
  );
}
