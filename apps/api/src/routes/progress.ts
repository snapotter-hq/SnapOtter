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
import { createRedisSubscriberConnection, sharedRedis } from "../jobs/connection.js";
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

export interface PersistedSingleFileProgress {
  percent: number;
  stage?: string;
  result?: Record<string, unknown>;
}

interface SingleFileReplayRow {
  jobId: string;
  status: string;
  progress: unknown;
  error: unknown;
}

const MISSING_DURABLE_RESULT_ERROR = "Completed result is no longer available. Run the job again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildPersistedSingleFileProgress(
  progress: Omit<SingleFileProgress, "type">,
): PersistedSingleFileProgress {
  return {
    percent: progress.percent,
    ...(progress.stage ? { stage: progress.stage } : {}),
    ...(progress.result ? { result: progress.result } : {}),
  };
}

/** Reconstruct the terminal frame after Redis's short-lived replay key expires. */
export function buildSingleFileReplayEvent(row: SingleFileReplayRow): SingleFileProgress {
  const progress = isRecord(row.progress) ? row.progress : {};
  const storedPercent = progress.percent;
  const percent =
    typeof storedPercent === "number" && Number.isFinite(storedPercent) ? storedPercent : 0;

  if (row.status === "completed") {
    const result = isRecord(progress.result) ? progress.result : undefined;
    if (!result) {
      return {
        jobId: row.jobId,
        type: "single",
        phase: "failed",
        percent: 100,
        error: MISSING_DURABLE_RESULT_ERROR,
      };
    }
    const stage = typeof progress.stage === "string" ? progress.stage : undefined;
    return {
      jobId: row.jobId,
      type: "single",
      phase: "complete",
      percent: 100,
      ...(stage ? { stage } : {}),
      result,
    };
  }

  const error =
    isRecord(row.error) && typeof row.error.message === "string"
      ? row.error.message
      : row.status === "canceled"
        ? "Canceled"
        : "Processing failed";
  return {
    jobId: row.jobId,
    type: "single",
    phase: "failed",
    percent,
    error,
  };
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

function enqueuePersist(jobId: string, fn: () => Promise<void>): Promise<void> {
  const prev = persistQueues.get(jobId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run even if prior rejected
  persistQueues.set(jobId, next);
  // Clean up the map entry once the queue drains
  const cleanup = () => {
    if (persistQueues.get(jobId) === next) persistQueues.delete(jobId);
  };
  void next.then(cleanup, cleanup);
  return next;
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
  executor: Pick<typeof db, "select" | "insert" | "update"> = db,
): Promise<void> {
  const status =
    progress.phase === "complete"
      ? "completed"
      : progress.phase === "failed"
        ? "failed"
        : "processing";
  const progressJsonb = buildPersistedSingleFileProgress(progress);
  const [existing] = await executor
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, progress.jobId));

  if (existing) {
    await executor
      .update(schema.jobs)
      .set({
        status,
        progress: progressJsonb,
        error: progress.error ? { message: progress.error } : null,
        completedAt: status === "completed" || status === "failed" ? new Date() : null,
      })
      .where(eq(schema.jobs.id, progress.jobId));
  } else {
    await executor.insert(schema.jobs).values({
      id: progress.jobId,
      type: "single",
      status,
      progress: progressJsonb,
      inputRefs: [],
      error: progress.error ? { message: progress.error } : null,
    });
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

function announce(payload: (JobProgress & { type: "batch" }) | SingleFileProgress): void {
  const json = JSON.stringify(payload);
  const isTerminal =
    payload.type === "single"
      ? payload.phase === "complete" || payload.phase === "failed"
      : payload.status === "completed" || payload.status === "failed";

  // Terminal events write the replay cache BEFORE publishing, so a client
  // connecting right after the live event always finds the terminal key.
  const publishPromise = isTerminal
    ? sharedRedis()
        .setex(terminalKey(payload.jobId), TERMINAL_TTL_S, json)
        .catch(() => {})
        .then(() => sharedRedis().publish(progressChannel(), json))
    : sharedRedis().publish(progressChannel(), json);
  void Promise.resolve(publishPromise).catch(() => {});
}

function publish(payload: (JobProgress & { type: "batch" }) | SingleFileProgress): Promise<void> {
  announce(payload);

  const durable = enqueuePersist(payload.jobId, () => persistDurable(payload));
  // Nonterminal producers intentionally ignore best-effort persistence. Attach
  // a rejection observer so those calls never become unhandled; terminal
  // producers can still await the original promise and fail closed.
  void durable.catch(() => {});
  return durable;
}

// ── Public API (unchanged signatures) ──────────────────────────

/**
 * Create or update progress for a batch job.
 */
export function updateJobProgress(progress: JobProgress): void {
  const event = { ...progress, type: "batch" } as JobProgress & { type: "batch" };
  void publish(event);
}

/** Publish progress and resolve after its best-effort durable DB write settles. */
export function updateSingleFileProgress(
  progress: Omit<SingleFileProgress, "type">,
): Promise<void> {
  const event: SingleFileProgress = { ...progress, type: "single" };
  return publish(event);
}

type ProgressTransaction = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Atomically commit an authoritative job mutation and its client-facing replay
 * row before announcing terminal success. The per-job queue also waits for all
 * earlier nonterminal writes, so late progress cannot overwrite completion.
 */
export async function updateSingleFileProgressAtomically(
  progress: Omit<SingleFileProgress, "type">,
  mutateAuthoritative: (tx: ProgressTransaction) => Promise<void>,
): Promise<void> {
  const event: SingleFileProgress = { ...progress, type: "single" };
  const { type: _, ...persisted } = event;
  await enqueuePersist(progress.jobId, () =>
    db.transaction(async (tx) => {
      const executor = tx as unknown as ProgressTransaction;
      await mutateAuthoritative(executor);
      await persistSingleFileProgress(persisted, executor);
    }),
  );
  announce(event);
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
let sseSubscriber: ReturnType<typeof createRedisSubscriberConnection> | null = null;

function ensureSubscriber(): void {
  if (sseSubscriber) return;
  sseSubscriber = createRedisSubscriberConnection();
  // ioredis auto-resubscribes after reconnects; the handler keeps connection
  // errors observable without crashing (ioredis silentEmits, but be explicit).
  sseSubscriber.on("error", (err) => {
    console.error("SSE progress subscriber error", err);
  });
  void sseSubscriber.subscribe(progressChannel()).catch((err) => {
    console.error("SSE progress subscribe failed", err);
  });
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

      // Send a data heartbeat rather than an SSE comment. EventSource does not
      // expose comments to clients, so queued jobs would otherwise look idle
      // and trip the browser's five-minute no-progress timeout.
      const keepaliveInterval = setInterval(() => {
        try {
          sendFrame(JSON.stringify({ type: "heartbeat" }));
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 20_000);

      // Subscribe before replaying Redis/DB state. Otherwise a terminal event
      // published after the cache read but before listener registration can be
      // missed forever even though both transport layers behaved correctly.
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
            removeListener();
            reply.raw.end();
          }
        } catch {
          // Parse failure; keep streaming
        }
      };

      function removeListener() {
        const subs = sseListeners.get(jobId);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) sseListeners.delete(jobId);
        }
      }

      if (!sseListeners.has(jobId)) {
        sseListeners.set(jobId, new Set());
      }
      sseListeners.get(jobId)?.add(callback);

      // Clean up on client disconnect
      request.raw.on("close", () => {
        ended = true;
        clearInterval(keepaliveInterval);
        removeListener();
      });

      // ── Replay on connect ────────────────────────────────────
      // 1. Check the terminal cache in Redis. A concurrent live event may
      // settle the response while this await is in flight, so re-check ended.
      try {
        const cached = await sharedRedis().get(terminalKey(jobId));
        if (ended) return;
        if (cached) {
          callback(cached);
          if (ended) return;
        }
      } catch {
        // Redis may be unavailable; fall through to DB/live updates.
      }

      // 2. Check the durable DB row for terminal state. The listener remains
      // active throughout, closing both replay/live race windows.
      try {
        const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
        if (ended) return;
        if (
          row &&
          (row.status === "completed" || row.status === "failed" || row.status === "canceled")
        ) {
          let syntheticJson: string;
          if (row.type !== "batch") {
            syntheticJson = JSON.stringify(
              buildSingleFileReplayEvent({
                jobId,
                status: row.status,
                progress: row.progress,
                error: row.error,
              }),
            );
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
          callback(syntheticJson);
        }
      } catch {
        // DB unavailable; the listener continues with live updates.
      }
    },
  );
}
