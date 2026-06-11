import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANALYTICS_EVENTS, getBundleForTool, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { env } from "../config.js";
import { enqueueToolJob, waitForJob } from "../jobs/enqueue.js";
import { trackEvent } from "../lib/analytics.js";
import { formatZodErrors, stripInternalPaths } from "../lib/errors.js";
import { isToolInstalled } from "../lib/feature-status.js";
import { getObjectBuffer, putObject } from "../lib/object-storage.js";
import { resolveToolPool, shouldSkipSyncWindow } from "../lib/pool.js";
import { receiveUpload } from "../lib/upload-stream.js";
import { InputValidationError } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";
import { getAuthUser } from "../plugins/auth.js";
import { updateSingleFileProgress } from "./progress.js";

/** Context passed to tool process functions for cooperative cancellation, scratch storage, and progress. */
export interface ToolProcessCtx {
  signal: AbortSignal;
  scratchDir: string;
  report: (percent: number, stage?: string) => void;
}

// ── V2 process contract (ref-based, multi-input) ──────────────

export interface ToolProcessInputV2 {
  buffer: Buffer;
  filename: string;
  ref: string;
}

export interface ToolProcessCtxV2 {
  inputs: ToolProcessInputV2[];
  settings: unknown;
  scratchDir: string;
  signal: AbortSignal;
  report: (percent: number, stage?: string) => void;
}

export interface ToolProcessResultV2 {
  /** Exactly one of buffer | scratchPath must be set. */
  buffer?: Buffer;
  scratchPath?: string;
  filename: string;
  contentType: string;
  resultPayload?: Record<string, unknown>;
  extraOutputs?: Array<{
    name: string;
    buffer?: Buffer;
    scratchPath?: string;
    contentType: string;
  }>;
}

export type ToolProcessV2 = (ctx: ToolProcessCtxV2) => Promise<ToolProcessResultV2>;

// ── Tool route config ─────────────────────────────────────────

export interface ToolRouteConfig<T> {
  /** Unique tool identifier, used as the URL path segment. */
  toolId: string;
  /** Zod schema that validates the settings JSON from the request. */
  settingsSchema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** The processing function: takes input buffer + validated settings, returns output. */
  process: (
    inputBuffer: Buffer,
    settings: T,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => Promise<{ buffer: Buffer; filename: string; contentType: string }>;
  /** Optional v2 process function. When set, the worker calls this instead of the legacy process. */
  processV2?: ToolProcessV2;
}

/** Type-erased config stored in the registry (settings type is widened to avoid variance issues). */
export interface AnyToolRouteConfig {
  toolId: string;
  settingsSchema: z.ZodType<unknown, z.ZodTypeDef, unknown>;
  process: (
    inputBuffer: Buffer,
    settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => Promise<{ buffer: Buffer; filename: string; contentType: string }>;
  processV2?: ToolProcessV2;
}

// ── Legacy adapter ────────────────────────────────────────────

/**
 * Wraps a legacy process function as a ToolProcessV2. The first input
 * is forwarded as the primary buffer/filename; extra inputs are ignored
 * (legacy tools accept only one input).
 */
function adaptLegacyProcess(config: AnyToolRouteConfig): ToolProcessV2 {
  return async (ctx) => {
    const primary = ctx.inputs[0];
    const result = await config.process(primary.buffer, ctx.settings, primary.filename, {
      signal: ctx.signal,
      scratchDir: ctx.scratchDir,
      report: ctx.report,
    });
    return { buffer: result.buffer, filename: result.filename, contentType: result.contentType };
  };
}

/**
 * In-memory registry of all tool configs, keyed by toolId.
 * Populated by createToolRoute() calls; used by batch processing.
 */
const toolRegistry = new Map<string, AnyToolRouteConfig>();

/**
 * Retrieve a registered tool config by its ID.
 */
export function getToolConfig(toolId: string): AnyToolRouteConfig | undefined {
  return toolRegistry.get(toolId);
}

/**
 * Return the IDs of all tools in the pipeline/batch registry.
 */
export function getRegisteredToolIds(): string[] {
  return [...toolRegistry.keys()];
}

/**
 * Register a tool's process function in the pipeline/batch registry
 * without creating an HTTP route. Use this for tools that have their
 * own custom HTTP route but should still be usable in pipelines.
 *
 * Resolves processV2: uses the config's processV2 when provided,
 * otherwise wraps the legacy process function via adaptLegacyProcess.
 */
export function registerToolProcessFn(config: AnyToolRouteConfig): void {
  const resolved = { ...config, processV2: config.processV2 ?? adaptLegacyProcess(config) };
  toolRegistry.set(config.toolId, resolved);
}

/**
 * Factory that registers a POST /api/v1/tools/:toolId route.
 *
 * The route accepts multipart with:
 *   - A file part (the image to process)
 *   - A "settings" field containing a JSON string
 *
 * The factory handles:
 *   - Multipart parsing (streamed to object storage via receiveUpload)
 *   - File validation + decode chain (HEIC, CLI, SVG, AVIF)
 *   - Settings validation via Zod
 *   - Enqueue to BullMQ + sync-wait for the worker result
 *   - Error handling
 *   - Response formatting (legacy envelope)
 */
export function createToolRoute<T>(app: FastifyInstance, config: ToolRouteConfig<T>): void {
  // Register a resolved copy in the tool registry for batch processing.
  // Spread avoids mutating the caller's config object.
  const erased = config as AnyToolRouteConfig;
  const resolved: AnyToolRouteConfig = {
    ...erased,
    processV2: erased.processV2 ?? adaptLegacyProcess(erased),
  };
  toolRegistry.set(config.toolId, resolved);

  app.post(
    `/api/v1/tools/${config.toolId}`,
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const jobId = randomUUID();
      let filename = "image";
      let settingsRaw: string | null = null;
      let fileId: string | null = null;
      let clientJobId: string | null = null;
      let fileCount = 0;
      let inputKey: string | null = null;

      // Parse multipart parts (file parts stream to object storage)
      try {
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === "file") {
            fileCount++;
            if (fileCount > 1) {
              // Drain remaining parts to avoid hanging the connection
              for await (const _ of part.file) {
                /* drain */
              }
              continue;
            }
            const upload = await receiveUpload(part, jobId, {
              maxBytes:
                env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : undefined,
            });
            inputKey = upload.key;
            filename = upload.filename;
          } else {
            // Field part
            if (part.fieldname === "settings") {
              settingsRaw = part.value as string;
            }
            if (part.fieldname === "fileId") {
              fileId = part.value as string;
            }
            if (part.fieldname === "clientJobId") {
              const raw = part.value as string;
              if (typeof raw === "string" && raw.length > 0 && raw.length <= 128) {
                clientJobId = raw;
              }
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      if (fileCount > 1) {
        return reply.status(400).send({
          error: `This endpoint processes one image at a time. Use /api/v1/tools/${config.toolId}/batch for multiple files.`,
        });
      }

      // Require a file
      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      // Read back the uploaded file for validation/decode chain
      let fileBuffer = await getObjectBuffer(inputKey);
      const originalBuffer = fileBuffer;

      const reportProgress = (percent: number, stage?: string) => {
        if (!clientJobId) return;
        updateSingleFileProgress({
          jobId: clientJobId,
          phase: "processing",
          percent,
          stage,
        });
      };

      reportProgress(5, "Validating...");

      // Resolve the tool's modality (default "image" for registry-only test tools)
      const toolMeta = TOOLS.find((t) => t.id === config.toolId);
      const modality = toolMeta?.modality ?? "image";

      // Per-request scratch dir for handlers that need temp files
      const scratchDir = join(tmpdir(), "snapotter-scratch", jobId);
      await mkdir(scratchDir, { recursive: true });
      try {
        // Modality-specific input validation and normalization
        try {
          const prepared = await inputHandlerFor(modality).prepare(fileBuffer, filename, {
            scratchDir,
          });
          fileBuffer = prepared.buffer;
          filename = prepared.filename;
        } catch (err) {
          if (err instanceof InputValidationError) {
            const body: Record<string, string> = { error: err.message };
            if (err.details) body.details = err.details;
            return reply.status(err.statusCode).send(body);
          }
          throw err;
        }

        reportProgress(15, "Preparing...");

        // Parse and validate settings
        if (settingsRaw && settingsRaw.length > 65536) {
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(400).send({ error: "Settings payload too large (max 64KB)" });
        }
        let settings: T;
        try {
          const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
          const result = config.settingsSchema.safeParse(parsed);
          if (!result.success) {
            // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
            return reply.status(400).send({
              error: "Invalid settings",
              details: formatZodErrors(result.error.issues),
            });
          }
          settings = result.data;
        } catch {
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(400).send({ error: "Settings must be valid JSON" });
        }

        // Guard: check if the tool's AI feature bundle is installed
        const bundleId = TOOL_BUNDLE_MAP[config.toolId];
        if (bundleId && !isToolInstalled(config.toolId)) {
          const bundle = getBundleForTool(config.toolId);
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(501).send({
            error: "Feature not installed",
            code: "FEATURE_NOT_INSTALLED",
            feature: bundleId,
            featureName: bundle?.name ?? bundleId,
            estimatedSize: bundle?.estimatedSize ?? "unknown",
          });
        }

        // If decode/orient transformed the buffer or changed the filename,
        // write the final version so the worker processes the correct data.
        // Skip re-upload when the buffer is reference-identical to the
        // originally streamed bytes and the filename hasn't changed.
        const decodedName = filename;
        const decodedKey = `uploads/${jobId}/${decodedName}`;
        if (decodedKey !== inputKey) {
          await putObject(decodedKey, fileBuffer);
          inputKey = decodedKey;
        } else if (fileBuffer !== originalBuffer) {
          await putObject(inputKey, fileBuffer);
        }

        const startTime = Date.now();
        const pool = resolveToolPool(config.toolId);

        // Enqueue for the BullMQ worker
        await enqueueToolJob({
          jobId,
          toolId: config.toolId,
          userId: getAuthUser(request)?.id ?? null,
          pool,
          inputRefs: [inputKey],
          filename,
          settings,
          fileId: fileId ?? undefined,
          clientJobId: clientJobId ?? undefined,
          kind: "tool",
        });

        // Long tools never block the HTTP request (spec 4.5): straight to SSE.
        if (shouldSkipSyncWindow(toolMeta?.executionHint)) {
          return reply.status(202).send({ jobId: clientJobId || jobId, async: true });
        }

        try {
          const result = await waitForJob(pool, jobId);
          if (result) {
            trackEvent(request, ANALYTICS_EVENTS.TOOL_USED, {
              tool_id: config.toolId,
              status: "completed",
              duration_ms: Date.now() - startTime,
              category: TOOLS.find((t) => t.id === config.toolId)?.category ?? "unknown",
              is_ai_tool: getBundleForTool(config.toolId) !== null,
            });

            return reply.send({
              jobId,
              downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
              previewUrl: result.previewRef
                ? `/api/v1/download/${jobId}/${result.previewRef.split("/").pop()}`
                : undefined,
              originalSize: result.originalSize,
              processedSize: result.processedSize,
              savedFileId: result.savedFileId,
            });
          }
          return reply.status(202).send({ jobId: clientJobId || jobId, async: true });
        } catch (err) {
          trackEvent(request, ANALYTICS_EVENTS.TOOL_USED, {
            tool_id: config.toolId,
            status: "failed",
            duration_ms: Date.now() - startTime,
            category: TOOLS.find((t) => t.id === config.toolId)?.category ?? "unknown",
            is_ai_tool: getBundleForTool(config.toolId) !== null,
            error_code: err instanceof Error ? err.constructor.name : "UnknownError",
            error_message:
              err instanceof Error ? err.message.slice(0, 200) : "Image processing failed",
          });
          return reply.status(422).send({
            error: "Processing failed",
            details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
          });
        }
      } finally {
        await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
}
