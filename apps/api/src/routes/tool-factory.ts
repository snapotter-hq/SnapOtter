import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { ANALYTICS_EVENTS, getBundleForTool, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import type { z } from "zod";
import { db, schema } from "../db/index.js";
import { trackEvent } from "../lib/analytics.js";
import { autoOrient } from "../lib/auto-orient.js";
import { formatZodErrors } from "../lib/errors.js";
import { isToolInstalled } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import type { WorkerInput, WorkerOutput } from "../lib/image-worker.js";
import { sanitizeSvg } from "../lib/svg-sanitize.js";
import { computeTimeout } from "../lib/timeout.js";
import { getWorkerPool } from "../lib/worker-pool.js";
import { createWorkspace } from "../lib/workspace.js";

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
  ) => Promise<{ buffer: Buffer; filename: string; contentType: string }>;
}

/**
 * In-memory registry of all tool configs, keyed by toolId.
 * Populated by createToolRoute() calls; used by batch processing.
 */
const toolRegistry = new Map<string, AnyToolRouteConfig>();

/**
 * Worker threads are disabled for all tools.
 *
 * AI tools skip workers because they use the Python bridge.
 * Sharp-based tools skip workers because they complete in milliseconds
 * and the worker initialization (which imports the full tool registry
 * and reads SQLite) can deadlock under Docker volume filesystems.
 *
 * The Piscina pool is kept in the codebase for potential future use
 * with long-running CPU-bound operations.
 */

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
 *   - Multipart parsing
 *   - File validation
 *   - Settings validation via Zod
 *   - Workspace management
 *   - Error handling
 *   - Response formatting
 */
export function createToolRoute<T>(app: FastifyInstance, config: ToolRouteConfig<T>): void {
  // Register in the tool registry for batch processing (cast to type-erased form)
  toolRegistry.set(config.toolId, config as AnyToolRouteConfig);

  app.post(
    `/api/v1/tools/${config.toolId}`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let fileId: string | null = null;
      let fileCount = 0;

      // Parse multipart parts
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
            // Consume the file stream into a buffer
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = sanitizeFilename(part.filename ?? "image");
          } else {
            // Field part
            if (part.fieldname === "settings") {
              settingsRaw = part.value as string;
            }
            if (part.fieldname === "fileId") {
              fileId = part.value as string;
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (fileCount > 1) {
        return reply.status(400).send({
          error: `This endpoint processes one image at a time. Use /api/v1/tools/${config.toolId}/batch for multiple files.`,
        });
      }

      // Require a file
      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      // Capture the original upload size before any decoding (HEIC, CLI)
      // mutates fileBuffer into a larger intermediate PNG.
      const uploadedSize = fileBuffer.length;

      // Validate the uploaded image
      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      // Decode HEIC/HEIF input via system heif-dec (Sharp's bundled libheif
      // lacks the HEVC decoder needed for iPhone photos).
      // The decoded buffer is PNG, so update the filename extension to match.
      const isHeif = validation.format === "heif";
      if (isHeif) {
        try {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode HEIC file. Ensure libheif-examples is installed.",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools.
      // The decoded buffer is PNG, so update the filename extension to match.
      if (needsCliDecode(validation.format)) {
        try {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        } catch (err) {
          return reply.status(422).send({
            error: `Failed to decode ${validation.format.toUpperCase()} file`,
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Sanitize SVG input to prevent XXE, SSRF, and script injection
      const isSvg = validation.format === "svg";
      if (isSvg) {
        try {
          fileBuffer = sanitizeSvg(fileBuffer);
        } catch (err) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
      }

      // Parse and validate settings
      let settings: T;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = config.settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(result.error.issues),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      // Guard: check if the tool's AI feature bundle is installed
      const bundleId = TOOL_BUNDLE_MAP[config.toolId];
      if (bundleId && !isToolInstalled(config.toolId)) {
        const bundle = getBundleForTool(config.toolId);
        return reply.status(501).send({
          error: "Feature not installed",
          code: "FEATURE_NOT_INSTALLED",
          feature: bundleId,
          featureName: bundle?.name ?? bundleId,
          estimatedSize: bundle?.estimatedSize ?? "unknown",
        });
      }

      // Process the image (worker thread or main thread)
      const startTime = Date.now();
      try {
        let result: { buffer: Buffer; filename: string; contentType: string };

        // Offload to worker thread for non-AI tools.
        // Falls back to main-thread processing on any worker error.
        // Disabled in test environments where worker_threads can't load .ts files.
        const useWorker = false;
        if (useWorker) {
          try {
            const pool = getWorkerPool();
            const workerInput: WorkerInput = {
              toolId: config.toolId,
              inputBuffer: fileBuffer,
              settings,
              filename,
              inputFormat: validation.format,
            };
            const meta = await sharp(fileBuffer).metadata();
            const megapixels = ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000;
            const timeoutMs = computeTimeout(megapixels, "sharp");
            const workerResult: WorkerOutput = await pool.run(workerInput, {
              signal: AbortSignal.timeout(timeoutMs),
            });
            result = {
              buffer: Buffer.from(workerResult.buffer),
              filename: workerResult.filename,
              contentType: workerResult.contentType,
            };
          } catch (workerErr) {
            // Worker failed - fall back to main-thread processing
            request.log.warn(
              { workerErr, toolId: config.toolId },
              "Worker processing failed, falling back to main thread",
            );
            const processBuffer = isSvg ? fileBuffer : await autoOrient(fileBuffer);
            result = await config.process(processBuffer, settings, filename);
          }
        } else {
          // AI tools: always main thread (they use Python bridge)
          const processBuffer = isSvg ? fileBuffer : await autoOrient(fileBuffer);
          result = await config.process(processBuffer, settings, filename);
        }

        // Add a tool-specific suffix to the filename so the download
        // doesn't silently overwrite the user's original file.
        // Skip if the tool already changed the filename (e.g. convert, split).
        if (result.filename === filename) {
          const ext = extname(filename);
          const base = ext ? filename.slice(0, -ext.length) : filename;
          result.filename = `${base}_${config.toolId}${ext}`;
        }

        // Fix extension mismatch: when the output format differs from the
        // original (e.g. SVG input -> PNG output), update the filename
        // extension so the download endpoint serves the correct Content-Type.
        const CONTENT_TYPE_TO_EXT: Record<string, string> = {
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/webp": ".webp",
          "image/gif": ".gif",
          "image/tiff": ".tiff",
          "image/avif": ".avif",
          "image/svg+xml": ".svg",
          "image/bmp": ".bmp",
          "image/heic": ".heic",
          "image/heif": ".heif",
        };
        const expectedExt = CONTENT_TYPE_TO_EXT[result.contentType];
        if (expectedExt) {
          const currentExt = extname(result.filename).toLowerCase();
          if (currentExt && currentExt !== expectedExt) {
            result.filename = result.filename.slice(0, -currentExt.length) + expectedExt;
          }
        }

        // Create workspace and save output
        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const outputPath = join(workspacePath, "output", result.filename);
        await writeFile(outputPath, result.buffer);

        // Generate a browser-previewable WebP thumbnail for formats that
        // browsers cannot render in <img> tags (HEIC, TIFF, etc.)
        const BROWSER_PREVIEWABLE = new Set([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg+xml",
          "image/bmp",
          "image/avif",
        ]);
        let previewUrl: string | undefined;
        if (!BROWSER_PREVIEWABLE.has(result.contentType)) {
          try {
            let previewInput = result.buffer;
            // Sharp can't decode HEIC - use system decoder first
            if (result.contentType === "image/heic" || result.contentType === "image/heif") {
              previewInput = await decodeHeic(result.buffer);
            }
            const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
            const previewPath = join(workspacePath, "output", "preview.webp");
            await writeFile(previewPath, previewBuffer);
            previewUrl = `/api/v1/download/${jobId}/preview.webp`;
          } catch {
            // Non-fatal - frontend will show the success card fallback
          }
        }

        // Also save the original input for reference/download
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);

        // Auto-save to persistent file store when a fileId is provided
        let savedFileId: string | undefined;
        if (fileId) {
          try {
            const { saveFile } = await import("../lib/file-storage.js");
            const parent = db
              .select()
              .from(schema.userFiles)
              .where(eq(schema.userFiles.id, fileId))
              .get();
            if (parent) {
              const newVersion = parent.version + 1;
              const parentChain: string[] = parent.toolChain ? JSON.parse(parent.toolChain) : [];
              const newToolChain = [...parentChain, config.toolId];
              const storedName = await saveFile(result.buffer, result.filename);
              // Get image dimensions from the processed output
              let width: number | null = null;
              let height: number | null = null;
              try {
                const meta = await sharp(result.buffer).metadata();
                width = meta.width ?? null;
                height = meta.height ?? null;
              } catch {
                // dimensions are non-critical
              }
              const newId = randomUUID();
              db.insert(schema.userFiles)
                .values({
                  id: newId,
                  userId: parent.userId,
                  originalName: result.filename,
                  storedName,
                  mimeType: result.contentType,
                  size: result.buffer.length,
                  width,
                  height,
                  version: newVersion,
                  parentId: fileId,
                  toolChain: JSON.stringify(newToolChain),
                })
                .run();
              savedFileId = newId;
            }
          } catch (saveErr) {
            // Non-fatal — tool processing already succeeded
            request.log.warn({ saveErr, fileId }, "Failed to auto-save processed file");
          }
        }

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
          previewUrl,
          originalSize: uploadedSize,
          processedSize: result.buffer.length,
          savedFileId,
        });
      } catch (err) {
        // Catch Sharp / processing errors and return a clean API error
        const message = err instanceof Error ? err.message : "Image processing failed";
        request.log.error({ err, toolId: config.toolId }, "Tool processing failed");
        trackEvent(request, ANALYTICS_EVENTS.TOOL_USED, {
          tool_id: config.toolId,
          status: "failed",
          duration_ms: Date.now() - startTime,
          category: TOOLS.find((t) => t.id === config.toolId)?.category ?? "unknown",
          is_ai_tool: getBundleForTool(config.toolId) !== null,
          error_code: err instanceof Error ? err.constructor.name : "UnknownError",
          error_message: message.slice(0, 200),
        });
        return reply.status(422).send({
          error: "Processing failed",
          details: message,
        });
      }
    },
  );
}
