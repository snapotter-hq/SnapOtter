import { randomUUID } from "node:crypto";
import { ANALYTICS_EVENTS, getBundleForTool, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import type { z } from "zod";
import { env } from "../config.js";
import { enqueueToolJob, waitForJob } from "../jobs/enqueue.js";
import { trackEvent } from "../lib/analytics.js";
import { autoOrient } from "../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../lib/errors.js";
import { isToolInstalled } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { decodeAnyFormat, decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../lib/object-storage.js";
import { decompressSvgz, sanitizeSvg } from "../lib/svg-sanitize.js";
import { receiveUpload } from "../lib/upload-stream.js";
import { getAuthUser } from "../plugins/auth.js";
import { updateSingleFileProgress } from "./progress.js";

/** Context passed to tool process functions for cooperative cancellation, scratch storage, and progress. */
export interface ToolProcessCtx {
  signal: AbortSignal;
  scratchDir: string;
  report: (percent: number, stage?: string) => void;
}

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
 */
export function registerToolProcessFn(config: AnyToolRouteConfig): void {
  toolRegistry.set(config.toolId, config);
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
  // Register in the tool registry for batch processing (cast to type-erased form)
  toolRegistry.set(config.toolId, config as AnyToolRouteConfig);

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

      // Validate the uploaded image
      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      // Decode HEIC/HEIF input via system heif-dec (Sharp's bundled libheif
      // lacks the HEVC decoder needed for iPhone photos).
      // The decoded buffer is PNG, so update the filename extension to match.
      const isHeif = validation.format === "heif";
      if (isHeif) {
        reportProgress(10, "Decoding HEIC...");
        try {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        } catch (err) {
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(422).send({
            error: "Failed to decode HEIC file. Ensure libheif-examples is installed.",
            details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
          });
        }
      }

      // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools.
      // The decoded buffer is PNG, so update the filename extension to match.
      // Pass the original file extension so RAW decoder can use the correct
      // temp file suffix (e.g. .cr3, .nef) for format identification.
      if (needsCliDecode(validation.format)) {
        reportProgress(10, "Decoding...");
        try {
          const fileExt = filename.split(".").pop()?.toLowerCase();
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt);
        } catch {
          try {
            await sharp(fileBuffer).metadata();
          } catch (err) {
            // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
            return reply.status(422).send({
              error: `Failed to decode ${validation.format.toUpperCase()} file`,
              details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
            });
          }
        }
        const ext = filename.match(/\.[^.]+$/)?.[0];
        if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
      }

      // Sanitize SVG input to prevent XXE, SSRF, and script injection
      const isSvg = validation.format === "svg";
      if (isSvg) {
        try {
          fileBuffer = decompressSvgz(fileBuffer);
          fileBuffer = sanitizeSvg(fileBuffer);
        } catch (err) {
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
      }

      // AVIF can pass metadata validation but fail pixel decode when
      // Sharp's bundled libheif lacks support for the bitstream version.
      // A 1x1 resize forces a minimal pixel decode to catch this early.
      if (validation.format === "avif") {
        try {
          await sharp(fileBuffer).resize(1).raw().toBuffer();
        } catch {
          try {
            reportProgress(10, "Decoding...");
            fileBuffer = await decodeAnyFormat(fileBuffer, "avif");
            const ext = filename.match(/\.[^.]+$/)?.[0];
            if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
          } catch (fallbackErr) {
            // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
            return reply.status(422).send({
              error: "Failed to decode AVIF file",
              details: stripInternalPaths(
                fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
              ),
            });
          }
        }
      }

      // Auto-orient non-SVG images: physically rotate pixels to match
      // the EXIF orientation tag so the worker sees upright pixels.
      if (!isSvg) {
        fileBuffer = await autoOrient(fileBuffer);
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

      // Enqueue for the BullMQ worker
      await enqueueToolJob({
        jobId,
        toolId: config.toolId,
        userId: getAuthUser(request)?.id ?? null,
        pool: "image",
        inputRefs: [inputKey],
        filename,
        settings,
        fileId: fileId ?? undefined,
        clientJobId: clientJobId ?? undefined,
        kind: "tool",
      });

      try {
        const result = await waitForJob("image", jobId);
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
            previewUrl: result.previewRef ? `/api/v1/download/${jobId}/preview.webp` : undefined,
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
    },
  );
}
