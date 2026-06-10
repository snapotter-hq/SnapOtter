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
import { getSecurityHeaders } from "../lib/csp.js";

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

/**
 * Per-job serialization queues.  Fire-and-forget persist calls for the same
 * jobId must run sequentially so that the final "completed" write is never
 * overwritten by a late-arriving "processing" write.  Without this, the
 * async Postgres round-trips can re-order concurrent writes.
 */
// TODO(phase-2): delete when progress persistence moves to BullMQ job events.
const persistQueues = new Map<string, Promise<void>>();

/** Await any pending persist writes for a specific job (used by tests). */
export async function drainPersistQueue(jobId: string): Promise<void> {
  const pending = persistQueues.get(jobId);
  if (pending) await pending;
}

function enqueuePersist(jobId: string, fn: () => Promise<void>): void {
  const prev = persistQueues.get(jobId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run even if prior rejected
  persistQueues.set(jobId, next);
  // Clean up the map entry once the queue drains
  next.then(() => {
    if (persistQueues.get(jobId) === next) persistQueues.delete(jobId);
  });
}

async function persistJobProgress(progress: JobProgress): Promise<void> {
  try {
    const completionRatio =
      progress.totalFiles > 0 ? progress.completedFiles / progress.totalFiles : 0;
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId));

    if (existing) {
      await db
        .update(schema.jobs)
        .set({
          status: progress.status,
          progress: completionRatio,
          error: progress.errors.length > 0 ? JSON.stringify(progress.errors) : null,
          completedAt:
            progress.status === "completed" || progress.status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId));
    } else {
      await db.insert(schema.jobs).values({
        id: progress.jobId,
        type: "batch",
        status: progress.status,
        progress: completionRatio,
        inputFiles: { totalFiles: progress.totalFiles },
        error: progress.errors.length > 0 ? JSON.stringify(progress.errors) : null,
      });
    }
  } catch {
    // DB persistence is best-effort; don't break real-time SSE
  }
}

async function persistSingleFileProgress(
  progress: Omit<SingleFileProgress, "type">,
): Promise<void> {
  try {
    const status =
      progress.phase === "complete"
        ? "completed"
        : progress.phase === "failed"
          ? "failed"
          : "processing";
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId));

    if (existing) {
      await db
        .update(schema.jobs)
        .set({
          status,
          progress: progress.percent / 100,
          error: progress.error ?? null,
          completedAt: status === "completed" || status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId));
    } else {
      await db.insert(schema.jobs).values({
        id: progress.jobId,
        type: "single",
        status,
        progress: progress.percent / 100,
        inputFiles: [],
        error: progress.error ?? null,
      });
    }
  } catch {
    // Best-effort
  }
}

/**
 * Mark any jobs left in "processing" or "queued" state as failed.
 * Called once at startup to recover from unclean shutdown.
 */
export async function recoverStaleJobs(): Promise<void> {
  try {
    const result = await db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: "Server restarted while job was in progress",
        completedAt: new Date(),
      })
      .where(eq(schema.jobs.status, "processing"));
    const result2 = await db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: "Server restarted while job was queued",
        completedAt: new Date(),
      })
      .where(eq(schema.jobs.status, "queued"));
    const total = (result.rowCount ?? 0) + (result2.rowCount ?? 0);
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
  enqueuePersist(progress.jobId, () => persistJobProgress(progress));
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
  enqueuePersist(progress.jobId, () => persistSingleFileProgress(progress));

  if (progress.phase === "complete" || progress.phase === "failed") {
    if (singleFileCompletions.size >= 10_000) {
      const oldest = singleFileCompletions.keys().next().value;
      if (oldest) singleFileCompletions.delete(oldest);
    }
    singleFileCompletions.set(progress.jobId, event);
    setTimeout(() => singleFileCompletions.delete(progress.jobId), 600_000);
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

      // Disable socket timeout -- feature installs can take 30+ minutes
      // for large model downloads. Without this, Node's requestTimeout
      // kills the SSE connection mid-install.
      request.raw.socket?.setTimeout?.(0);

      // Send SSE headers via the raw Node response
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...getSecurityHeaders(),
      });

      // Helper to send an SSE message
      const sendEvent = (data: JobProgress | SingleFileProgress) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send keepalive comments every 20s to prevent reverse proxies
      // (Caddy, Nginx, ALBs) from killing idle SSE connections.
      const keepaliveInterval = setInterval(() => {
        try {
          reply.raw.write(": keepalive\n\n");
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 20_000);

      // If the job already has progress, send it immediately
      const existing = jobProgressStore.get(jobId);
      if (existing) {
        sendEvent({ ...existing, type: "batch" });
        if (existing.status === "completed" || existing.status === "failed") {
          clearInterval(keepaliveInterval);
          reply.raw.end();
          return;
        }
      }

      const existingSingle = singleFileCompletions.get(jobId);
      if (existingSingle) {
        sendEvent(existingSingle);
        clearInterval(keepaliveInterval);
        reply.raw.end();
        return;
      }

      // Subscribe to updates
      if (!listeners.has(jobId)) {
        listeners.set(jobId, new Set());
      }

      let ended = false;
      const callback = (data: JobProgress | SingleFileProgress) => {
        if (ended) return;
        sendEvent(data);
        if (
          ("status" in data && (data.status === "completed" || data.status === "failed")) ||
          ("phase" in data && (data.phase === "complete" || data.phase === "failed"))
        ) {
          ended = true;
          clearInterval(keepaliveInterval);
          const subs = listeners.get(jobId);
          if (subs) {
            subs.delete(callback);
            if (subs.size === 0) listeners.delete(jobId);
          }
          reply.raw.end();
        }
      };

      listeners.get(jobId)?.add(callback);

      // Clean up on client disconnect
      request.raw.on("close", () => {
        clearInterval(keepaliveInterval);
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
