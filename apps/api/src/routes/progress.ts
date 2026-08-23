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
import { and, eq, notInArray, sql } from "drizzle-orm";
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
  /**
   * Terminal frames only: the durable batch result (downloadUrl, fileResults,
   * ...) so a client that lost its HTTP response can settle from SSE alone
   * (#750). Absent on nonterminal frames.
   */
  result?: Record<string, unknown>;
}

export interface PersistedJobProgress {
  percent: number;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  result?: Record<string, unknown>;
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

type BatchReplayRow = SingleFileReplayRow;

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

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Compute the durable jsonb for a batch parent row. Counts (not just a
 * percent) persist so a reconnecting client can be shown real batch progress,
 * and terminal frames keep their result for replay after the Redis terminal
 * key expires (#750). */
export function buildPersistedJobProgress(progress: JobProgress): PersistedJobProgress {
  return {
    percent:
      progress.totalFiles > 0
        ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
        : 0,
    totalFiles: progress.totalFiles,
    completedFiles: progress.completedFiles,
    failedFiles: progress.failedFiles,
    ...(progress.result ? { result: progress.result } : {}),
  };
}

function storedBatchErrors(error: unknown): Array<{ filename: string; error: string }> {
  if (!isRecord(error) || !Array.isArray(error.details)) return [];
  const out: Array<{ filename: string; error: string }> = [];
  for (const entry of error.details) {
    if (isRecord(entry) && typeof entry.filename === "string" && typeof entry.error === "string") {
      out.push({ filename: entry.filename, error: entry.error });
    }
  }
  return out;
}

/** Reconstruct a batch frame from the parent jobs row: nonterminal for live
 * rows (proof the batch exists, mirroring the single-file replay of #722),
 * terminal with the durable result otherwise. */
export function buildBatchReplayEvent(row: BatchReplayRow): JobProgress & { type: "batch" } {
  const progress = isRecord(row.progress) ? row.progress : {};
  const counts = {
    totalFiles: asCount(progress.totalFiles),
    completedFiles: asCount(progress.completedFiles),
    failedFiles: asCount(progress.failedFiles),
  };
  const base = { jobId: row.jobId, type: "batch" as const, ...counts };

  if (row.status === "queued" || row.status === "processing") {
    return { ...base, status: "processing", errors: [] };
  }

  const result = isRecord(progress.result) ? progress.result : undefined;
  // A canceled batch that packaged its finished files before stopping replays
  // as completed-with-result so the partial ZIP stays reachable after the
  // Redis terminal key expires (#767). Only a resultless completed row is a
  // lost result; a resultless canceled row is a full cancellation and takes
  // the failed shape below.
  if (result && (row.status === "completed" || row.status === "canceled")) {
    return { ...base, status: "completed", errors: storedBatchErrors(row.error), result };
  }
  if (row.status === "completed") {
    return {
      ...base,
      status: "failed",
      errors: [{ filename: "", error: MISSING_DURABLE_RESULT_ERROR }],
    };
  }

  const errors = storedBatchErrors(row.error);
  if (errors.length === 0) {
    const message =
      isRecord(row.error) && typeof row.error.message === "string"
        ? row.error.message
        : row.status === "canceled"
          ? "Canceled"
          : "Processing failed";
    errors.push({ filename: "", error: message });
  }
  return { ...base, status: "failed", errors };
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
    const progressJsonb = buildPersistedJobProgress(progress);
    const isTerminalFrame = progress.status === "completed" || progress.status === "failed";
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, progress.jobId));

    if (existing) {
      await db
        .update(schema.jobs)
        .set({
          status: progress.status,
          progress: progressJsonb,
          error:
            progress.errors.length > 0
              ? { message: `${progress.errors.length} file(s) failed`, details: progress.errors }
              : null,
          completedAt: isTerminalFrame ? new Date() : null,
        })
        // Same resurrect guard as the single-file persist: child outcomes are
        // published fire and forget, so a late nonterminal frame must not
        // overwrite the terminal state the finalize already committed.
        .where(
          isTerminalFrame
            ? eq(schema.jobs.id, progress.jobId)
            : and(
                eq(schema.jobs.id, progress.jobId),
                notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
              ),
        );
    } else {
      await db.insert(schema.jobs).values({
        id: progress.jobId,
        type: "batch",
        status: progress.status,
        progress: progressJsonb,
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
    const isTerminalFrame = status === "completed" || status === "failed";
    await executor
      .update(schema.jobs)
      .set({
        status,
        progress: progressJsonb,
        error: progress.error ? { message: progress.error } : null,
        completedAt: isTerminalFrame ? new Date() : null,
      })
      // Progress is published fire and forget, so a nonterminal frame can still
      // be in flight when the job finishes, is cancelled or fails. Without this
      // guard a late frame resurrects the row: status back to processing,
      // completedAt and error wiped, and nothing ever revisits it. The worker's
      // cancel and failure writes go straight to the DB instead of through the
      // per-job persist queue, so they cannot rely on ordering the way the
      // completion path does.
      .where(
        isTerminalFrame
          ? eq(schema.jobs.id, progress.jobId)
          : and(
              eq(schema.jobs.id, progress.jobId),
              notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
            ),
      );
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
  // A dropped TERMINAL announcement is the one failure a waiting client may
  // never recover from on its own, so it must at least reach the logs;
  // nonterminal drops stay quiet (they would spam every frame of an outage).
  const publishPromise = isTerminal
    ? sharedRedis()
        .setex(terminalKey(payload.jobId), TERMINAL_TTL_S, json)
        .catch((err) => {
          console.error("terminal replay key write failed", payload.jobId, err);
        })
        .then(() => sharedRedis().publish(progressChannel(), json))
    : sharedRedis().publish(progressChannel(), json);
  void Promise.resolve(publishPromise).catch((err) => {
    if (isTerminal) console.error("terminal progress publish failed", payload.jobId, err);
  });
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

export interface CompleteBatchJobArgs {
  jobId: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  errors: Array<{ filename: string; error: string }>;
  outputRefs: string[];
  bytesOut: number;
  result: Record<string, unknown>;
}

/**
 * Commit the authoritative batch completion (row status, outputRefs, durable
 * progress with the result) and only then announce the terminal frame, so a
 * replay can never observe the frame without the durable state behind it.
 * Runs through the per-job persist queue: earlier fire-and-forget child
 * frames land first and cannot overwrite this write afterwards.
 *
 * Guarded since #767: with real batch cancel, cancelBatchJob commits
 * "canceled" from the same finalize, so nothing may overwrite an existing
 * terminal state (the remaining writer conflict is a stall-evicted zombie
 * finalize double-writing). A call that lost the transition announces
 * nothing, so a duplicate frame can never contradict the committed outcome.
 */
export async function completeBatchJob(args: CompleteBatchJobArgs): Promise<void> {
  const frame: JobProgress & { type: "batch" } = {
    jobId: args.jobId,
    type: "batch",
    status: "completed",
    totalFiles: args.totalFiles,
    completedFiles: args.completedFiles,
    failedFiles: args.failedFiles,
    errors: args.errors,
    result: args.result,
  };
  let applied = false;
  await enqueuePersist(args.jobId, async () => {
    const res = await db
      .update(schema.jobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        outputRefs: args.outputRefs,
        bytesOut: args.bytesOut,
        progress: buildPersistedJobProgress(frame),
        error:
          args.errors.length > 0
            ? { message: `${args.errors.length} file(s) failed`, details: args.errors }
            : null,
      })
      .where(
        and(
          eq(schema.jobs.id, args.jobId),
          notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
        ),
      );
    applied = ((res as { rowCount?: number | null } | undefined)?.rowCount ?? 0) > 0;
  });
  if (applied) announce(frame);
}

export interface CancelBatchJobArgs {
  jobId: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  errors: Array<{ filename: string; error: string }>;
  outputRefs?: string[];
  bytesOut?: number;
  result?: Record<string, unknown>;
}

/**
 * Terminal batch cancellation (#767). The authoritative row becomes
 * "canceled" either way; the announced frame reuses the existing wire
 * vocabulary so clients need no new terminal type: completed-with-result
 * when finished files were packaged (the client settles on the partial ZIP),
 * failed with a leading blank-name "Canceled" entry when nothing survived.
 * Guarded like failBatchJob: never downgrades a committed terminal state and
 * announces only a transition it owned.
 */
export async function cancelBatchJob(args: CancelBatchJobArgs): Promise<void> {
  const base = {
    jobId: args.jobId,
    type: "batch" as const,
    totalFiles: args.totalFiles,
    completedFiles: args.completedFiles,
    failedFiles: args.failedFiles,
    errors: args.errors,
  };
  const frame: JobProgress & { type: "batch" } = args.result
    ? { ...base, status: "completed", result: args.result }
    : { ...base, status: "failed" };
  let applied = false;
  await enqueuePersist(args.jobId, async () => {
    const res = await db
      .update(schema.jobs)
      .set({
        status: "canceled",
        completedAt: new Date(),
        ...(args.outputRefs ? { outputRefs: args.outputRefs } : {}),
        ...(args.bytesOut !== undefined ? { bytesOut: args.bytesOut } : {}),
        progress: buildPersistedJobProgress(frame),
        error: { message: "Canceled", details: args.errors },
      })
      .where(
        and(
          eq(schema.jobs.id, args.jobId),
          notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
        ),
      );
    applied = ((res as { rowCount?: number | null } | undefined)?.rowCount ?? 0) > 0;
  });
  if (applied) announce(frame);
}

export interface FailBatchJobArgs {
  jobId: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  errors: Array<{ filename: string; error: string }>;
  message: string;
}

/**
 * Terminal batch failure. Guarded so a late safety-net call (the worker's
 * failed handler) can never downgrade an already-committed completion; the
 * frame is only announced when this call actually owned the transition.
 */
export async function failBatchJob(args: FailBatchJobArgs): Promise<void> {
  const frame: JobProgress & { type: "batch" } = {
    jobId: args.jobId,
    type: "batch",
    status: "failed",
    totalFiles: args.totalFiles,
    completedFiles: args.completedFiles,
    failedFiles: args.failedFiles,
    errors: args.errors,
  };
  let applied = false;
  await enqueuePersist(args.jobId, async () => {
    const res = await db
      .update(schema.jobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        progress: buildPersistedJobProgress(frame),
        error: {
          message: args.message,
          ...(args.errors.length > 0 ? { details: args.errors } : {}),
        },
      })
      .where(
        and(
          eq(schema.jobs.id, args.jobId),
          notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
        ),
      );
    applied = ((res as { rowCount?: number | null } | undefined)?.rowCount ?? 0) > 0;
  });
  if (applied) announce(frame);
}

export interface FailSingleJobArgs {
  jobId: string;
  message: string;
}

/**
 * Terminal single-run failure with failBatchJob's guarantees (#766): the
 * guarded write never downgrades a committed completion, and the frame is
 * announced only when this call owned the transition. Used by the worker's
 * pipeline-finalize safety net, where the SSE channel id (clientJobId) and
 * the authoritative flow row can differ; call it per row id.
 */
export async function failSingleJobGuarded(args: FailSingleJobArgs): Promise<void> {
  const frame: SingleFileProgress = {
    jobId: args.jobId,
    type: "single",
    phase: "failed",
    percent: 0,
    error: args.message,
  };
  let applied = false;
  await enqueuePersist(args.jobId, async () => {
    const res = await db
      .update(schema.jobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        progress: { percent: 0 },
        error: { message: args.message },
      })
      .where(
        and(
          eq(schema.jobs.id, args.jobId),
          notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
        ),
      );
    applied = ((res as { rowCount?: number | null } | undefined)?.rowCount ?? 0) > 0;
  });
  if (applied) announce(frame);
}

export interface CancelSingleJobArgs {
  jobId: string;
  /**
   * When set, the guarded write additionally requires the row's
   * settings.artifactJobId to still equal this id. A single-tool cancel
   * resolves the pointer before it settles; if a new run re-pointed the
   * channel in between, the row belongs to a run the user never canceled
   * and must be left alone (#886). Alias-less callers (pipeline finalize)
   * omit it.
   */
  expectedArtifactJobId?: string;
}

/**
 * Terminal single-run cancellation (#771), failSingleJobGuarded's sibling.
 * The authoritative row becomes "canceled"; the announced frame reuses the
 * failed-with-"Canceled" wire vocabulary the worker's single-run cancel path
 * already speaks, so clients need no new terminal type. Used by the pipeline
 * finalize, where the SSE channel id (clientJobId) and the authoritative
 * flow row can differ; call it per row id.
 */
export async function cancelSingleJobGuarded(args: CancelSingleJobArgs): Promise<void> {
  const frame: SingleFileProgress = {
    jobId: args.jobId,
    type: "single",
    phase: "failed",
    percent: 0,
    error: "Canceled",
  };
  let applied = false;
  await enqueuePersist(args.jobId, async () => {
    const res = await db
      .update(schema.jobs)
      .set({
        status: "canceled",
        completedAt: new Date(),
        progress: { percent: 0 },
        error: { message: "Canceled" },
      })
      .where(
        and(
          eq(schema.jobs.id, args.jobId),
          notInArray(schema.jobs.status, ["completed", "failed", "canceled"]),
          args.expectedArtifactJobId
            ? sql`${schema.jobs.settings}->>'artifactJobId' = ${args.expectedArtifactJobId}`
            : undefined,
        ),
      );
    applied = ((res as { rowCount?: number | null } | undefined)?.rowCount ?? 0) > 0;
  });
  if (applied) announce(frame);
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
        .catch((err) => {
          console.error("terminal replay key write failed", payload.jobId, err);
        })
        .then(() => sharedRedis().publish(progressChannel(), json))
    : sharedRedis().publish(progressChannel(), json);
  void Promise.resolve(announce).catch((err) => {
    if (isTerminal) console.error("terminal progress publish failed", payload.jobId, err);
  });
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
        // A live (queued/processing) single-file row replays a nonterminal
        // frame: a reconnecting client must be able to tell "the job exists
        // and is working" apart from "no such job", and heartbeats carry no
        // evidence. Queued jobs publish nothing until the worker picks them
        // up, so without this replay a busy pool looks identical to a job
        // that never existed, and a client that degraded a dead upload
        // socket to the async path gives up on it (#722).
        if (
          row &&
          row.type !== "batch" &&
          (row.status === "queued" || row.status === "processing")
        ) {
          const progress: Record<string, unknown> = isRecord(row.progress) ? row.progress : {};
          const storedPercent = progress.percent;
          const synthetic: SingleFileProgress = {
            jobId,
            type: "single",
            phase: "processing",
            percent:
              typeof storedPercent === "number" && Number.isFinite(storedPercent)
                ? storedPercent
                : 0,
            ...(typeof progress.stage === "string" ? { stage: progress.stage } : {}),
          };
          sendFrame(JSON.stringify(synthetic));
        }
        // Live batch parents replay a nonterminal frame for the same reason
        // the single path does (#722): a client that degraded a dead batch
        // POST needs proof the batch exists, and heartbeats carry none. The
        // finalize can also take a while after the last child (ZIP packaging),
        // where this replay is the only evidence available (#750).
        if (
          row &&
          row.type === "batch" &&
          (row.status === "queued" || row.status === "processing")
        ) {
          sendFrame(
            JSON.stringify(
              buildBatchReplayEvent({
                jobId,
                status: row.status,
                progress: row.progress,
                error: row.error,
              }),
            ),
          );
        }
        if (
          row &&
          (row.status === "completed" || row.status === "failed" || row.status === "canceled")
        ) {
          const replayEvent =
            row.type !== "batch"
              ? buildSingleFileReplayEvent({
                  jobId,
                  status: row.status,
                  progress: row.progress,
                  error: row.error,
                })
              : buildBatchReplayEvent({
                  jobId,
                  status: row.status,
                  progress: row.progress,
                  error: row.error,
                });
          callback(JSON.stringify(replayEvent));
        }
      } catch {
        // DB unavailable; the listener continues with live updates.
      }
    },
  );
}
