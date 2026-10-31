import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import type { ToolJobData } from "../jobs/types.js";
import { auditFromRequest, auditLog, isToolAuditEnabled } from "./audit.js";
import { reportError } from "./error-report.js";
import { logger } from "./logger.js";

const TOOLS_PREFIX = "/api/v1/tools/";

/**
 * Sub-routes under /api/v1/tools/:section/:toolId/* that are read-only
 * inspection/preview helpers, Phase 2 post-processing (/effects on an
 * already-audited remove-background job), or batch endpoints handled by
 * FlowProducer / emitInlineBatchAudit.
 */
const NON_INLINE_TOOL_SUB_ROUTES = new Set([
  "info",
  "preview",
  "inspect",
  "analyze",
  "effects",
  "batch",
]);

export interface ToolRequestAuditContext {
  userId: string | null;
  username: string;
  ip: string | null;
  requestId: string | null;
  toolId: string;
  subRoute: string | null;
  startTime: number;
  authorized: boolean;
  enqueued: boolean;
  audited: boolean;
  inputFileCount: number;
  totalInputSize: number;
}

const toolRequestStorage = new AsyncLocalStorage<ToolRequestAuditContext>();
const requestContextMap = new WeakMap<object, ToolRequestAuditContext>();
const wrappedPartsRequests = new WeakSet<object>();

/**
 * Extract the optional third path segment after `/api/v1/tools/<section>/<toolId>/`.
 * Returns `null` for primary tool routes (including `/api/v1/tools/image/info`).
 */
export function subRouteFromRoute(routeUrl: string | undefined): string | null {
  if (!routeUrl?.startsWith(TOOLS_PREFIX)) return null;
  const parts = routeUrl.slice(TOOLS_PREFIX.length).split("/");
  return parts[2] || null;
}

/**
 * Record an input file consumed by an inline tool route on the request's audit
 * context. Zero-byte and negative sizes are ignored.
 */
export function recordInlineInputFile(request: FastifyRequest | undefined, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const ctx =
    (request ? requestContextMap.get(request) : undefined) ?? toolRequestStorage.getStore();
  if (!ctx) return;
  ctx.inputFileCount += 1;
  ctx.totalInputSize += bytes;
}

function trackFilePartStream(request: FastifyRequest, file: unknown): void {
  if (!file || typeof file !== "object") return;
  const stream = file as {
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  const origIter = stream[Symbol.asyncIterator];
  if (typeof origIter !== "function") return;

  stream[Symbol.asyncIterator] = async function* () {
    let bytes = 0;
    const iter = origIter.call(stream);
    try {
      while (true) {
        const next = await iter.next();
        if (next.done) break;
        const chunk = next.value;
        if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
          bytes += chunk.byteLength;
        } else if (typeof chunk === "string") {
          bytes += Buffer.byteLength(chunk);
        }
        yield chunk;
      }
      recordInlineInputFile(request, bytes);
    } finally {
      await iter.return?.();
    }
  };
}

function wrapRequestPartsForAudit(request: FastifyRequest): void {
  if (wrappedPartsRequests.has(request)) return;
  const reqWithParts = request as FastifyRequest & {
    parts?: (...args: unknown[]) => AsyncIterable<unknown>;
  };
  if (typeof reqWithParts.parts !== "function") return;
  const origParts = reqWithParts.parts.bind(request);
  wrappedPartsRequests.add(request);
  reqWithParts.parts = async function* (...args: unknown[]) {
    for await (const part of origParts(...args)) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "file" &&
        "file" in part
      ) {
        trackFilePartStream(request, (part as { file: unknown }).file);
      }
      yield part;
    }
  } as typeof reqWithParts.parts;
}

/**
 * Record the tool request context for the current HTTP request.
 *
 * Must be called synchronously at the start of `toolAccessMiddleware`'s
 * `preHandler` hook (before the first `await`) so Node's `AsyncLocalStorage`
 * propagates the store across the outer hook Promise into the route handler.
 */
export function enterToolRequestAuditContext(
  request: FastifyRequest,
  init: Omit<
    ToolRequestAuditContext,
    "enqueued" | "audited" | "authorized" | "inputFileCount" | "totalInputSize"
  > & {
    authorized?: boolean;
  },
): ToolRequestAuditContext {
  const ctx: ToolRequestAuditContext = {
    ...init,
    authorized: init.authorized ?? true,
    enqueued: false,
    audited: false,
    inputFileCount: 0,
    totalInputSize: 0,
  };
  requestContextMap.set(request, ctx);
  toolRequestStorage.enterWith(ctx);
  wrapRequestPartsForAudit(request);
  return ctx;
}

/**
 * Explicitly mark a Fastify request as queue-backed so the inline `onSend`
 * hook never emits a duplicate `TOOL_EXECUTED` entry.
 */
export function markToolRequestEnqueued(request: FastifyRequest): void {
  const ctx = requestContextMap.get(request);
  if (ctx) ctx.enqueued = true;
}

/**
 * Stamp request audit metadata (`username`, `requestIp`, `requestId`) onto a
 * `ToolJobData` payload when enqueuing from a tool route, and mark the request
 * context as queue-backed so the inline-route `onSend` hook skips it.
 */
export function bindJobAuditMetadata(data: ToolJobData | undefined): void {
  const ctx = toolRequestStorage.getStore();
  if (!ctx || !ctx.authorized) return;
  ctx.enqueued = true;
  if (!data) return;
  data.username ??= ctx.username;
  if (ctx.ip) data.requestIp ??= ctx.ip;
  if (ctx.requestId) data.requestId ??= ctx.requestId;
}

/**
 * Resolve the actor username for a worker job audit entry.
 * Uses `username` from `ToolJobData` when present; otherwise looks up
 * `schema.users` by `userId` and falls back to `"system"`.
 */
export async function resolveAuditUsername(
  userId: string | null | undefined,
  username?: string | null,
): Promise<string> {
  if (username) return username;
  if (userId) {
    try {
      const rows = await db
        .select({ username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (rows[0]?.username) return rows[0].username;
    } catch (err) {
      logger.warn({ err, userId }, "Failed to resolve username for tool audit log");
    }
  }
  return "system";
}

export async function emitWorkerToolAudit(args: {
  data: ToolJobData;
  inputFileCount: number;
  totalInputSize: number;
  outputFormat: string | null;
  durationMs: number;
}): Promise<boolean> {
  const { data } = args;
  try {
    if (!(await isToolAuditEnabled())) return true;
    const username = await resolveAuditUsername(data.userId, data.username);
    await auditLog(
      logger,
      "TOOL_EXECUTED",
      {
        userId: data.userId,
        username,
        toolId: data.toolId,
        inputFileCount: args.inputFileCount,
        totalInputSize: args.totalInputSize,
        outputFormat: args.outputFormat,
        status: "success",
        durationMs: args.durationMs,
      },
      data.requestIp ?? null,
      data.requestId ?? null,
    );
    return true;
  } catch (err) {
    logger.error(
      { err, toolId: data.toolId, jobId: data.jobId },
      "Failed to emit TOOL_EXECUTED audit log",
    );
    void reportError(err, { source: "worker", subsystem: "audit" });
    return false;
  }
}

export async function emitWorkerPipelineAudit(args: {
  data: ToolJobData;
  totalSteps: number;
  steps: string[];
  totalInputSize: number;
  processedSize: number;
  durationMs: number;
}): Promise<void> {
  const { data } = args;
  try {
    if (!(await isToolAuditEnabled())) return;
    const username = await resolveAuditUsername(data.userId, data.username);
    await auditLog(
      logger,
      "PIPELINE_EXECUTED",
      {
        userId: data.userId,
        username,
        toolId: "pipeline",
        stepCount: args.totalSteps,
        steps: args.steps,
        inputFileCount: 1,
        totalInputSize: args.totalInputSize,
        processedSize: args.processedSize,
        status: "success",
        durationMs: args.durationMs,
      },
      data.requestIp ?? null,
      data.requestId ?? null,
    );
  } catch (err) {
    logger.error(
      { err, toolId: "pipeline", jobId: data.jobId },
      "Failed to emit PIPELINE_EXECUTED audit log",
    );
    void reportError(err, { source: "worker", subsystem: "audit" });
  }
}

export async function emitWorkerBatchAudit(args: {
  data: ToolJobData;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  processedSize: number;
  durationMs: number;
}): Promise<void> {
  const { data } = args;
  try {
    if (!(await isToolAuditEnabled())) return;
    const username = await resolveAuditUsername(data.userId, data.username);
    await auditLog(
      logger,
      "BATCH_EXECUTED",
      {
        userId: data.userId,
        username,
        toolId: data.toolId,
        inputFileCount: args.totalFiles,
        totalFiles: args.totalFiles,
        completedFiles: args.completedFiles,
        failedFiles: args.failedFiles,
        processedSize: args.processedSize,
        status: "success",
        durationMs: args.durationMs,
      },
      data.requestIp ?? null,
      data.requestId ?? null,
    );
  } catch (err) {
    logger.error(
      { err, toolId: data.toolId, jobId: data.jobId },
      "Failed to emit BATCH_EXECUTED audit log",
    );
    void reportError(err, { source: "worker", subsystem: "audit" });
  }
}

function parseInlineSizes(payload: unknown): {
  inputFileCount: number;
  totalInputSize: number;
} {
  if (typeof payload !== "string" || !payload.startsWith("{")) {
    return { inputFileCount: 1, totalInputSize: 0 };
  }
  try {
    const parsed = JSON.parse(payload) as {
      inputFileCount?: unknown;
      totalImages?: unknown;
      results?: unknown;
      errors?: unknown;
      originalSize?: unknown;
      fileSize?: unknown;
    };
    const count =
      typeof parsed.inputFileCount === "number" && parsed.inputFileCount > 0
        ? parsed.inputFileCount
        : typeof parsed.totalImages === "number" && parsed.totalImages > 0
          ? parsed.totalImages
          : Array.isArray(parsed.results)
            ? Math.max(
                1,
                parsed.results.length + (Array.isArray(parsed.errors) ? parsed.errors.length : 0),
              )
            : 1;
    const resultsSize = Array.isArray(parsed.results)
      ? parsed.results.reduce((sum: number, item: unknown) => {
          const itemSize =
            item && typeof item === "object"
              ? ((item as { originalSize?: unknown; fileSize?: unknown }).originalSize ??
                (item as { fileSize?: unknown }).fileSize)
              : undefined;
          return sum + (typeof itemSize === "number" && itemSize > 0 ? itemSize : 0);
        }, 0)
      : 0;
    const size =
      typeof parsed.originalSize === "number"
        ? parsed.originalSize
        : typeof parsed.fileSize === "number"
          ? parsed.fileSize
          : resultsSize;
    return { inputFileCount: count, totalInputSize: size };
  } catch {
    return { inputFileCount: 1, totalInputSize: 0 };
  }
}

/**
 * Emit `TOOL_EXECUTED` for an inline custom HTTP tool route that completed with
 * HTTP 200 without enqueuing a BullMQ job.
 */
export async function emitInlineRequestAuditIfNeeded(
  request: FastifyRequest,
  statusCode: number,
  payload?: unknown,
): Promise<void> {
  const ctx = requestContextMap.get(request) ?? toolRequestStorage.getStore();
  if (!ctx || !ctx.authorized || ctx.enqueued || ctx.audited || statusCode !== 200) return;
  if (ctx.subRoute !== null && NON_INLINE_TOOL_SUB_ROUTES.has(ctx.subRoute)) return;

  ctx.audited = true;
  try {
    if (!(await isToolAuditEnabled())) return;
    const durationMs = Date.now() - ctx.startTime;
    const parsedSizes = parseInlineSizes(payload);
    const inputFileCount = ctx.inputFileCount > 0 ? ctx.inputFileCount : parsedSizes.inputFileCount;
    const totalInputSize = ctx.totalInputSize > 0 ? ctx.totalInputSize : parsedSizes.totalInputSize;
    await auditFromRequest(request)("TOOL_EXECUTED", {
      userId: ctx.userId,
      username: ctx.username,
      toolId: ctx.toolId,
      inputFileCount,
      totalInputSize,
      outputFormat: null,
      status: "success",
      durationMs,
    });
  } catch (err) {
    request.log.error({ err, toolId: ctx.toolId }, "Failed to emit TOOL_EXECUTED audit log");
    void reportError(err, { source: "http", subsystem: "audit" });
  }
}

/**
 * Emit `BATCH_EXECUTED` for an inline custom batch route (`pdf-to-image/batch`,
 * `svg-to-raster/batch`) that streams its ZIP via `reply.hijack()`.
 */
export async function emitInlineBatchAudit(
  request: FastifyRequest,
  stats: { totalFiles: number; completedFiles: number; failedFiles: number },
): Promise<void> {
  const ctx = requestContextMap.get(request) ?? toolRequestStorage.getStore();
  if (!ctx || !ctx.authorized || ctx.audited) return;

  ctx.audited = true;
  try {
    if (!(await isToolAuditEnabled())) return;
    await auditFromRequest(request)("BATCH_EXECUTED", {
      userId: ctx.userId,
      username: ctx.username,
      toolId: ctx.toolId,
      inputFileCount: stats.totalFiles,
      totalFiles: stats.totalFiles,
      completedFiles: stats.completedFiles,
      failedFiles: stats.failedFiles,
      status: "success",
      durationMs: Date.now() - ctx.startTime,
    });
  } catch (err) {
    request.log.error({ err, toolId: ctx.toolId }, "Failed to emit BATCH_EXECUTED audit log");
    void reportError(err, { source: "http", subsystem: "audit" });
  }
}
