/**
 * SSE endpoint for real-time job progress tracking.
 *
 * GET /api/v1/jobs/:jobId/progress
 *
 * Sends Server-Sent Events with progress data until the job finishes.
 *
 * Progress events are published to Redis pub/sub for cross-process
 * delivery and also persisted to the `jobs` table for durability.
 * Terminal events are cached in a Redis key (10-min TTL) so that
 * SSE reconnects can replay the final frame without polling the DB.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import { createRedisConnection, sharedRedis } from "../jobs/connection.js";
import { bullPrefix } from "../jobs/types.js";
import { getSecurityHeaders } from "../lib/csp.js";

// ── Exported interfaces (unchanged) ────────────────────────────

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

// ── Redis channels / keys ──────────────────────────────────────

const progressChannel = () => `${bullPrefix()}:progress`;
const terminalKey = (jobId: string) => `${bullPrefix()}:terminal:${jobId}`;
const TERMINAL_TTL_S = 600;

// ── DB persistence helpers ─────────────────────────────────────

/**
 * Per-job serialization queues. Fire-and-forget persist calls for the same
 * jobId must run sequentially so that the final "completed" write is never
 * overwritten by a late-arriving "processing" write.
 */
const persistQueues = new Map<string, Promise<void>>();

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
    const percent =
      progress.totalFiles > 0
        ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
        : 0;
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId));

    if (existing) {
      await db
        .update(schema.jobs)
        .set({
          status: progress.status,
          progress: { percent },
          error:
            progress.errors.length > 0
              ? { message: `${progress.errors.length} file(s) failed`, details: progress.errors }
              : null,
          completedAt:
            progress.status === "completed" || progress.status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId));
    } else {
      await db.insert(schema.jobs).values({
        id: progress.jobId,
        type: "batch",
        status: progress.status,
        progress: { percent },
        inputRefs: [],
        error:
          progress.errors.length > 0
            ? { message: `${progress.errors.length} file(s) failed`, details: progress.errors }
            : null,
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
    const progressJsonb: { percent: number; stage?: string } = { percent: progress.percent };
    if (progress.stage) progressJsonb.stage = progress.stage;
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId));

    if (existing) {
      await db
        .update(schema.jobs)
        .set({
          status,
          progress: progressJsonb,
          error: progress.error ? { message: progress.error } : null,
          completedAt: status === "completed" || status === "failed" ? new Date() : null,
        })
        .where(eq(schema.jobs.id, progress.jobId));
    } else {
      await db.insert(schema.jobs).values({
        id: progress.jobId,
        type: "single",
        status,
        progress: progressJsonb,
        inputRefs: [],
        error: progress.error ? { message: progress.error } : null,
      });
    }
  } catch {
    // Best-effort
  }
}

async function persistDurable(
  payload: (JobProgress & { type: "batch" }) | SingleFileProgress,
): Promise<void> {
  if (payload.type === "single") {
    const { type: _, ...rest } = payload;
    await persistSingleFileProgress(rest);
  } else {
    await persistJobProgress(payload);
  }
}

// ── Publish (Redis pub/sub + terminal cache + durable persist) ──

function publish(payload: (JobProgress & { type: "batch" }) | SingleFileProgress): void {
  const json = JSON.stringify(payload);
  const isTerminal =
    payload.type === "single"
      ? payload.phase === "complete" || payload.phase === "failed"
      : payload.status === "completed" || payload.status === "failed";

  // Terminal events write the replay cache BEFORE publishing, so a client
  // connecting right after the live event always finds the terminal key.
  const announce = isTerminal
    ? sharedRedis()
        .setex(terminalKey(payload.jobId), TERMINAL_TTL_S, json)
        .catch(() => {})
        .then(() => sharedRedis().publish(progressChannel(), json))
    : sharedRedis().publish(progressChannel(), json);
  void Promise.resolve(announce).catch(() => {});

  enqueuePersist(payload.jobId, () => persistDurable(payload));
}

// ── Public API (unchanged signatures) ──────────────────────────

/**
 * Create or update progress for a batch job.
 */
export function updateJobProgress(progress: JobProgress): void {
  const event = { ...progress, type: "batch" } as JobProgress & { type: "batch" };
  publish(event);
}

export function updateSingleFileProgress(progress: Omit<SingleFileProgress, "type">): void {
  const event: SingleFileProgress = { ...progress, type: "single" };
  publish(event);
}

/**
 * Publish a progress event to Redis pub/sub and set the terminal replay
 * key, but do NOT persist to the durable DB row. Used by the worker's
 * cancel path so that live SSE clients receive a terminal frame while
 * the authoritative DB row stays "canceled" (not overwritten to "failed").
 */
export function publishEphemeral(
  payload: (JobProgress & { type: "batch" }) | SingleFileProgress,
): void {
  const json = JSON.stringify(payload);
  const isTerminal =
    payload.type === "single"
      ? payload.phase === "complete" || payload.phase === "failed"
      : payload.status === "completed" || payload.status === "failed";

  const announce = isTerminal
    ? sharedRedis()
        .setex(terminalKey(payload.jobId), TERMINAL_TTL_S, json)
        .catch(() => {})
        .then(() => sharedRedis().publish(progressChannel(), json))
    : sharedRedis().publish(progressChannel(), json);
  void Promise.resolve(announce).catch(() => {});
}

// ── SSE subscriber (module-level, shared across all connections) ─

type FrameCallback = (json: string) => void;
const sseListeners = new Map<string, Set<FrameCallback>>();
let sseSubscriber: ReturnType<typeof createRedisConnection> | null = null;

function ensureSubscriber(): void {
  if (sseSubscriber) return;
  sseSubscriber = createRedisConnection();
  // ioredis auto-resubscribes after reconnects; the handler keeps connection
  // errors observable without crashing (ioredis silentEmits, but be explicit).
  sseSubscriber.on("error", (err) => {
    console.error("SSE progress subscriber error", err);
  });
  void sseSubscriber.subscribe(progressChannel());
  sseSubscriber.on("message", (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as { jobId?: string };
      if (!parsed.jobId) return;
      const subs = sseListeners.get(parsed.jobId);
      if (subs) {
        for (const cb of subs) {
          cb(message);
        }
      }
    } catch {
      // Malformed message; ignore
    }
  });
}

// ── SSE endpoint ───────────────────────────────────────────────

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  // Ensure the Redis subscriber is running when routes are registered
  ensureSubscriber();

  app.get(
    "/api/v1/jobs/:jobId/progress",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
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

      // Helper to send an SSE frame
      const sendFrame = (json: string) => {
        reply.raw.write(`data: ${json}\n\n`);
      };

      // Keepalive comments every 20s
      const keepaliveInterval = setInterval(() => {
        try {
          reply.raw.write(": keepalive\n\n");
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 20_000);

      // ── Replay on connect ────────────────────────────────────
      // 1. Check the terminal cache in Redis
      try {
        const cached = await sharedRedis().get(terminalKey(jobId));
        if (cached) {
          sendFrame(cached);
          clearInterval(keepaliveInterval);
          reply.raw.end();
          return;
        }
      } catch {
        // Redis may be unavailable; fall through to DB
      }

      // 2. Check the durable DB row for terminal state
      try {
        const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
        if (
          row &&
          (row.status === "completed" || row.status === "failed" || row.status === "canceled")
        ) {
          // Synthesize a legacy event from the DB row
          let syntheticJson: string;
          if (row.type === "single") {
            const phase = row.status === "completed" ? "complete" : "failed";
            const errorMsg = (row.error as { message?: string } | null)?.message;
            syntheticJson = JSON.stringify({
              jobId,
              type: "single",
              phase,
              percent: phase === "complete" ? 100 : 0,
              ...(errorMsg ? { error: errorMsg } : {}),
            });
          } else {
            syntheticJson = JSON.stringify({
              jobId,
              type: "batch",
              status: row.status === "canceled" ? "failed" : row.status,
              totalFiles: 0,
              completedFiles: 0,
              failedFiles: 0,
              errors: [],
            });
          }
          sendFrame(syntheticJson);
          clearInterval(keepaliveInterval);
          reply.raw.end();
          return;
        }
      } catch {
        // DB unavailable; fall through to live stream
      }

      // 3. Live-stream: subscribe to updates for this jobId
      let ended = false;

      const callback: FrameCallback = (json: string) => {
        if (ended) return;
        sendFrame(json);

        // End the stream on terminal events
        try {
          const parsed = JSON.parse(json) as {
            type?: string;
            status?: string;
            phase?: string;
          };
          const isTerminal =
            (parsed.type === "single" &&
              (parsed.phase === "complete" || parsed.phase === "failed")) ||
            (parsed.type === "batch" &&
              (parsed.status === "completed" || parsed.status === "failed"));
          if (isTerminal) {
            ended = true;
            clearInterval(keepaliveInterval);
            const subs = sseListeners.get(jobId);
            if (subs) {
              subs.delete(callback);
              if (subs.size === 0) sseListeners.delete(jobId);
            }
            reply.raw.end();
          }
        } catch {
          // Parse failure; keep streaming
        }
      };

      if (!sseListeners.has(jobId)) {
        sseListeners.set(jobId, new Set());
      }
      sseListeners.get(jobId)?.add(callback);

      // Clean up on client disconnect
      request.raw.on("close", () => {
        ended = true;
        clearInterval(keepaliveInterval);
        const subs = sseListeners.get(jobId);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) sseListeners.delete(jobId);
        }
      });
    },
  );
}
