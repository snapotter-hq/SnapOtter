/**
 * SSE endpoint for real-time job progress tracking.
 *
 * GET /api/v1/jobs/:jobId/progress
 *
 * Sends Server-Sent Events with progress data until the job finishes.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface JobProgress {
  jobId: string;
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
}

/** In-memory store of job progress, keyed by jobId. */
const jobProgressStore = new Map<string, JobProgress>();

/** SSE listeners waiting for updates, keyed by jobId. */
const listeners = new Map<
  string,
  Set<(data: JobProgress | SingleFileProgress) => void>
>();

/**
 * Create or update progress for a job.
 */
export function updateJobProgress(progress: JobProgress): void {
  jobProgressStore.set(progress.jobId, progress);
  // Notify all SSE listeners
  const subs = listeners.get(progress.jobId);
  if (subs) {
    for (const cb of subs) {
      cb(progress);
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

export function updateSingleFileProgress(
  progress: Omit<SingleFileProgress, "type">,
): void {
  const event: SingleFileProgress = { ...progress, type: "single" };
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

export async function registerProgressRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/v1/jobs/:jobId/progress",
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const { jobId } = request.params;

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
        sendEvent(existing);
        if (
          existing.status === "completed" ||
          existing.status === "failed"
        ) {
          reply.raw.end();
          return;
        }
      }

      // Subscribe to updates
      if (!listeners.has(jobId)) {
        listeners.set(jobId, new Set());
      }

      const callback = (data: JobProgress | SingleFileProgress) => {
        sendEvent(data);
        if (
          ("status" in data &&
            (data.status === "completed" || data.status === "failed")) ||
          ("phase" in data &&
            (data.phase === "complete" || data.phase === "failed"))
        ) {
          reply.raw.end();
        }
      };

      listeners.get(jobId)!.add(callback);

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
