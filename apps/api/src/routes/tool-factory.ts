import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  apiToolPath,
  FEATURE_BUNDLES,
  type Section,
  TOOL_BUNDLE_MAP,
  TOOLS,
} from "@snapotter/shared";
import { and, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { enqueueToolJob, waitForJob } from "../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../jobs/types.js";
import { formatZodErrors, friendlyError, stripInternalPaths } from "../lib/errors.js";
import { getFirstMissingBundleForTool, isToolInstalled } from "../lib/feature-status.js";
import { getObjectBuffer, putObject } from "../lib/object-storage.js";
import { resolveToolPool, shouldSkipSyncWindow } from "../lib/pool.js";
import { getSettingNumber } from "../lib/settings-helpers.js";
import { type ReceivedUpload, receiveUpload } from "../lib/upload-stream.js";
import { type InputHandler, InputValidationError } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";
import { MediaInputHandler, type MediaInputKind } from "../modality/media-input.js";
import { requireToolAccess } from "../permissions.js";
import { buildAsyncAcceptedPayload } from "./async-response.js";
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
  /**
   * Override the URL section for non-catalog alias routes kept for
   * backwards-compatible URLs (e.g. adjust-colors' brightness-contrast).
   * Catalog tools omit this; their section is derived via apiToolPath.
   */
  section?: Section;
  /**
   * How many file parts the route accepts (default 1). Inputs beyond the
   * first are validated by the same modality handler and appended to
   * inputRefs in arrival order.
   */
  maxInputs?: number;
  /** Minimum number of file parts required (default 1). Fewer returns HTTP 400. */
  minInputs?: number;
  /**
   * Optional pre-enqueue validation hook. Receives the prepared input buffers
   * and validated settings; throw InputValidationError to reject with its
   * statusCode (default 400) before any job is enqueued (vs a worker 422).
   */
  preValidate?: (ctx: { inputs: { filename: string; buffer: Buffer }[] }) => Promise<void> | void;
  /**
   * Per-position input kind overrides for mixed-input tools (e.g. video +
   * subtitle). Input i validates with kind inputKinds[Math.min(i, len-1)].
   * When absent, the tool's modality drives a single handler as before.
   */
  inputKinds?: ("video" | "audio" | "image" | "subtitle")[];
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
  /**
   * When set, the factory passes `{ scratchDir, lenient: true }` to the
   * input handler's prepare(). DocumentInputHandler skips qpdfCheck and
   * page-cap when lenient, keeping only the %PDF- header check. Set on
   * tools that intentionally accept damaged inputs (e.g. repair-pdf).
   */
  skipStructuralValidation?: boolean;
  /**
   * When set, the factory does NOT reject password-protected PDFs at input
   * validation. Only unlock-pdf sets this: it takes an encrypted PDF plus a
   * password and decrypts it. Every other document tool leaves this off, so
   * the factory rejects encrypted PDFs up front (400) with guidance to unlock
   * first, instead of letting qpdf fail cryptically in the worker.
   */
  allowPasswordProtectedPdf?: boolean;
  /**
   * When set, produces a redacted copy of settings for the durable DB
   * row. Passwords and other secrets are replaced so they do not persist
   * in the jobs table (retention keeps rows for days). The BullMQ job
   * data keeps the real settings; the worker reads from job data.
   */
  redactSettingsForAudit?: (settings: unknown) => Record<string, unknown>;
}

/** Type-erased config stored in the registry (settings type is widened to avoid variance issues). */
export interface AnyToolRouteConfig {
  toolId: string;
  maxInputs?: number;
  minInputs?: number;
  preValidate?: (ctx: { inputs: { filename: string; buffer: Buffer }[] }) => Promise<void> | void;
  inputKinds?: ("video" | "audio" | "image" | "subtitle")[];
  settingsSchema: z.ZodType<unknown, z.ZodTypeDef, unknown>;
  process: (
    inputBuffer: Buffer,
    settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => Promise<{ buffer: Buffer; filename: string; contentType: string }>;
  processV2?: ToolProcessV2;
  skipStructuralValidation?: boolean;
  redactSettingsForAudit?: (settings: unknown) => Record<string, unknown>;
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
 * Factory that registers a POST /api/v1/tools/:section/:toolId route.
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

  // Set up rate limiting
  const toolRateLimit =
    env.RATE_LIMIT_PER_MIN === 0
      ? false
      : {
          max: env.RATE_LIMIT_PER_MIN || 60, // Keep fallback in case env var is not set
          timeWindow: "1 minute",
        };

  app.post(
    config.section
      ? `/api/v1/tools/${config.section}/${config.toolId}`
      : apiToolPath(config.toolId),
    { config: { rateLimit: toolRateLimit } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = await requireToolAccess(request, reply, config.toolId);
      if (!authUser) return;

      const jobId = randomUUID();
      const maxInputs = config.maxInputs ?? 1;
      const minInputs = config.minInputs ?? 1;
      let filename = "file";
      let settingsRaw: string | null = null;
      let fileId: string | null = null;
      let saveModeRaw: string | null = null;
      let clientJobId: string | null = null;
      let fileCount = 0;
      const received: ReceivedUpload[] = [];

      // Parse multipart parts (file parts stream to object storage).
      // request.parts() is the keep-alive-safe iterator from
      // lib/multipart-parts.ts (installed in plugins/upload.ts), which never
      // drops trailing parts, so no post-loop field recovery is needed.
      try {
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === "file") {
            fileCount++;
            if (fileCount > maxInputs) {
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
            received.push(upload);
            if (fileCount === 1) {
              filename = upload.filename;
            }
          } else {
            // Field part
            if (part.fieldname === "settings") {
              settingsRaw = part.value as string;
            }
            if (part.fieldname === "fileId") {
              fileId = part.value as string;
            }
            if (part.fieldname === "saveMode") {
              saveModeRaw = part.value as string;
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

      if (fileCount > maxInputs) {
        return reply.status(400).send({
          error: `Too many files (max ${maxInputs})`,
        });
      }

      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
      }

      // Require at least one file
      if (received.length === 0) {
        return reply.status(400).send({ error: "No file provided" });
      }

      // Require the tool's minimum number of files (e.g. create-zip / merge-csvs
      // need 2). Returns 400 pre-enqueue instead of a 422 from the worker.
      if (received.length < minInputs) {
        return reply.status(400).send({
          error: `This tool needs at least ${minInputs} files`,
        });
      }

      const reportProgress = (percent: number, stage?: string) => {
        if (!clientJobId) return;
        void updateSingleFileProgress({
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

      // Per-request scratch dir for input handlers that need temp files during
      // validation. MUST stay distinct from the worker's job scratch dir
      // (worker.ts scratchRoot()/<jobId>): for "long" tools the factory returns
      // 202 below and the `finally` rm's this dir immediately, which would race
      // and delete the worker's input mid-job whenever SCRATCH_PATH is unset
      // (both otherwise default to tmpdir()/snapotter-scratch/<jobId>). The
      // "-prep" suffix keeps the two from colliding.
      const scratchDir = join(tmpdir(), "snapotter-scratch", `${jobId}-prep`);
      await mkdir(scratchDir, { recursive: true });
      try {
        // Reject files whose extension is not in the tool's acceptedInputs.
        // Image and media modalities validate content via their input handlers
        // (sharp decode, ffprobe); document/file modalities need an explicit
        // extension gate because their handlers pass unrecognized types through.
        const accepted = toolMeta?.acceptedInputs;
        if (accepted?.length && (modality === "file" || modality === "document")) {
          for (const upload of received) {
            const ext = extname(upload.filename).toLowerCase();
            if (!accepted.includes(ext)) {
              return reply.status(415).send({
                error: `Unsupported file type "${ext || "(none)"}" for this tool`,
              });
            }
          }
        }

        // Build per-position input handlers. Mixed-input image slots still need
        // the image pipeline so RAW/HEIC/SVG inputs are normalized before jobs.
        const kindHandlers: Map<MediaInputKind, InputHandler> = new Map();
        function handlerForPosition(idx: number): InputHandler {
          if (config.inputKinds) {
            const kind = config.inputKinds[Math.min(idx, config.inputKinds.length - 1)];
            let h = kindHandlers.get(kind);
            if (!h) {
              h = kind === "image" ? inputHandlerFor("image") : new MediaInputHandler(kind);
              kindHandlers.set(kind, h);
            }
            return h;
          }
          return inputHandlerFor(modality);
        }

        // Prepare all files through the modality input handler
        const inputRefs: string[] = [];
        const preparedInputs: { filename: string; buffer: Buffer }[] = [];
        for (let i = 0; i < received.length; i++) {
          const upload = received[i];
          let fileBuffer = await getObjectBuffer(upload.key);
          const originalBuffer = fileBuffer;
          let fname = upload.filename;

          try {
            const prepared = await handlerForPosition(i).prepare(fileBuffer, fname, {
              scratchDir,
              lenient: config.skipStructuralValidation,
              // Reject encrypted PDFs up front only for PDF-only tools (qpdf
              // page ops etc.). Scoped to acceptedInputs === [".pdf"] so the
              // flag never forces a %PDF- header on non-PDF document tools
              // (markdown/epub/docx converters). unlock-pdf opts out.
              rejectPasswordProtected:
                modality === "document" &&
                !config.allowPasswordProtectedPdf &&
                !!accepted?.length &&
                accepted.every((e) => e === ".pdf"),
            });
            fileBuffer = prepared.buffer;
            fname = prepared.filename;
          } catch (err) {
            if (err instanceof InputValidationError) {
              const errorMsg = maxInputs > 1 ? `${fname}: ${err.message}` : err.message;
              const body: Record<string, string> = { error: errorMsg };
              if (err.details) body.details = err.details;
              // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
              return reply.status(err.statusCode).send(body);
            }
            throw err;
          }

          // If decode/orient transformed the buffer or changed the filename,
          // write the final version so the worker processes the correct data.
          // Skip re-upload when the buffer is reference-identical to the
          // originally streamed bytes and the filename hasn't changed.
          const decodedKey = `uploads/${jobId}/${fname}`;
          if (decodedKey !== upload.key) {
            await putObject(decodedKey, fileBuffer);
            inputRefs.push(decodedKey);
          } else if (fileBuffer !== originalBuffer) {
            await putObject(upload.key, fileBuffer);
            inputRefs.push(upload.key);
          } else {
            inputRefs.push(upload.key);
          }

          // Primary file keeps the existing variable roles
          if (i === 0) {
            filename = fname;
          }

          if (config.preValidate) {
            preparedInputs.push({ filename: fname, buffer: fileBuffer });
          }
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

        // Optional tool-specific pre-enqueue validation (e.g. zip-entry safety).
        // Throwing InputValidationError here returns its statusCode (400) before
        // any job is enqueued, instead of a generic 422 from the worker.
        if (config.preValidate) {
          try {
            await config.preValidate({ inputs: preparedInputs });
          } catch (err) {
            if (err instanceof InputValidationError) {
              const body: Record<string, string> = { error: err.message };
              if (err.details) body.details = err.details;
              return reply.status(err.statusCode).send(body);
            }
            throw err;
          }
        }

        // Guard: check if the tool's AI feature bundle is installed
        const bundleId = TOOL_BUNDLE_MAP[config.toolId];
        if (bundleId && !isToolInstalled(config.toolId)) {
          const missingBundleId = getFirstMissingBundleForTool(config.toolId) ?? bundleId;
          const bundle = FEATURE_BUNDLES[missingBundleId];
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(501).send({
            error: "Feature not installed",
            code: "FEATURE_NOT_INSTALLED",
            feature: missingBundleId,
            featureName: bundle?.name ?? missingBundleId,
            estimatedSize: bundle?.estimatedSize ?? "unknown",
          });
        }

        // Check per-user concurrent job limit before enqueuing
        const userId = authUser.id;
        const maxConcurrent = await getSettingNumber("maxConcurrentJobsPerUser", 0);
        if (maxConcurrent > 0 && userId) {
          const activeJobs = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.jobs)
            .where(
              and(
                sql`${schema.jobs.userId} = ${userId}`,
                inArray(schema.jobs.status, ["queued", "processing"]),
              ),
            );

          if (activeJobs[0].count >= maxConcurrent) {
            return reply.status(429).send({
              error: "Too many concurrent jobs. Please wait for existing jobs to complete.",
              activeJobs: activeJobs[0].count,
              limit: maxConcurrent,
            });
          }
        }

        const startTime = Date.now();
        const pool = resolveToolPool(config.toolId);

        // Enqueue for the BullMQ worker
        const dbSettings = config.redactSettingsForAudit
          ? config.redactSettingsForAudit(settings)
          : undefined;
        await enqueueToolJob({
          jobId,
          toolId: config.toolId,
          userId,
          pool,
          inputRefs,
          filename,
          settings,
          dbSettings,
          fileId: fileId ?? undefined,
          saveMode,
          clientJobId: clientJobId ?? undefined,
          kind: "tool",
          analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
        });

        // Long tools never block the HTTP request (spec 4.5): straight to SSE.
        if (shouldSkipSyncWindow(toolMeta?.executionHint)) {
          return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
        }

        try {
          const result = await waitForJob(pool, jobId);
          if (result) {
            // Fire-and-forget: audit log must never block the response
            import("../lib/audit.js")
              .then(({ isToolAuditEnabled, auditFromRequest }) =>
                isToolAuditEnabled().then((enabled) => {
                  if (!enabled) return;
                  return auditFromRequest(request)("TOOL_EXECUTED", {
                    userId: authUser.id,
                    username: authUser.username,
                    toolId: config.toolId,
                    inputFileCount: received.length,
                    totalInputSize: received.reduce((sum, r) => sum + r.size, 0),
                    outputFormat: (settings as Record<string, unknown>)?.format ?? null,
                    status: "success",
                    durationMs: Date.now() - startTime,
                  });
                }),
              )
              .catch(() => {});

            return reply.send({
              jobId,
              downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
              previewUrl: result.previewRef
                ? `/api/v1/download/${jobId}/${result.previewRef.split("/").pop()}`
                : undefined,
              originalSize: result.originalSize,
              processedSize: result.processedSize,
              savedFileId: result.savedFileId,
              ...result.resultPayload,
            });
          }
          return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
        } catch (err) {
          // Keep the full error (incl. raw ffmpeg/tool stderr) in server logs,
          // but return only a user-safe detail to the client.
          request.log.error({ err, toolId: config.toolId }, "tool processing failed");
          return reply.status(422).send({
            error: "Processing failed",
            details: friendlyError(err instanceof Error ? err.message : String(err)),
          });
        }
      } finally {
        await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
}
