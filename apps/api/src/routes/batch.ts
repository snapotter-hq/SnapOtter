/**
 * Batch processing route.
 *
 * POST /api/v1/tools/:toolId/batch
 *
 * Accepts multipart with multiple files + settings JSON.
 * Each file is enqueued as a batch-child BullMQ job; a batch-finalize
 * parent assembles the manifest once all children complete.
 * Returns a ZIP file containing all processed images.
 */
import { randomUUID } from "node:crypto";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import archiver from "archiver";
import type { FlowJob } from "bullmq";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { recordChildOutcome } from "../jobs/batch-progress.js";
import { getFlowProducer, waitForJob } from "../jobs/enqueue.js";
import { type Pool, queueName, type ToolJobData } from "../jobs/types.js";
import { autoOrient } from "../lib/auto-orient.js";
import { getSecurityHeaders } from "../lib/csp.js";
import { formatZodErrors } from "../lib/errors.js";
import { isToolInstalled } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { getObjectStream, putObject } from "../lib/object-storage.js";
import { resolveToolPool } from "../lib/pool.js";
import { getAuthUser } from "../plugins/auth.js";
import { updateJobProgress } from "./progress.js";
import { getToolConfig } from "./tool-factory.js";

interface ParsedFile {
  buffer: Buffer;
  filename: string;
}

export async function registerBatchRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/tools/:toolId/batch",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { toolId: string } }>, reply: FastifyReply) => {
      const { toolId } = request.params;

      // Batch processing (especially with AI) can take tens of minutes.
      // Disable the Node.js HTTP socket timeout so the connection is not
      // dropped while images are still being processed.
      request.raw.socket?.setTimeout?.(0);

      // Look up the tool config from the registry
      const toolConfig = getToolConfig(toolId);
      if (!toolConfig) {
        return reply.status(404).send({ error: `Tool "${toolId}" not found` });
      }

      // Guard: check if the tool's AI feature bundle is installed
      if (!isToolInstalled(toolId)) {
        const bundle = getBundleForTool(toolId);
        return reply.status(501).send({
          error: "Feature not installed",
          code: "FEATURE_NOT_INSTALLED",
          feature: TOOL_BUNDLE_MAP[toolId],
          featureName: bundle?.name ?? toolId,
          estimatedSize: bundle?.estimatedSize ?? "unknown",
        });
      }

      // Parse multipart: collect all files and the settings field
      const files: ParsedFile[] = [];
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 0) {
              files.push({
                buffer,
                filename: sanitizeFilename(part.filename ?? "image"),
              });
            }
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            const raw = part.value as string;
            if (typeof raw === "string" && raw.length > 0 && raw.length <= 128) {
              clientJobId = raw;
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (files.length === 0) {
        return reply.status(400).send({ error: "No image files provided" });
      }

      // Enforce batch size limit
      if (env.MAX_BATCH_SIZE > 0 && files.length > env.MAX_BATCH_SIZE) {
        return reply.status(400).send({
          error: `Too many files. Maximum batch size is ${env.MAX_BATCH_SIZE}`,
        });
      }

      // Parse and validate settings
      let settings: unknown;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = toolConfig.settingsSchema.safeParse(parsed);
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

      // ── Create job ID and initial progress ────────────────────────
      const parentId = clientJobId || randomUUID();
      const userId = getAuthUser(request)?.id ?? null;
      const pool: Pool = resolveToolPool(toolId);

      // Insert the parent row BEFORE updateJobProgress, because the
      // progress persist layer does a check-then-insert that races
      // with our explicit insert below.
      await db.insert(schema.jobs).values({
        id: parentId,
        userId,
        toolId,
        pool: "system",
        type: "batch",
        status: "queued",
        inputRefs: [],
        settings: { flowChildCount: 0 },
      });

      updateJobProgress({
        jobId: parentId,
        status: "processing",
        totalFiles: files.length,
        completedFiles: 0,
        failedFiles: 0,
        errors: [],
      });

      // ── Validate, decode, and upload each file ────────────────────
      const flowChildren: FlowJob[] = [];
      const preFailures: Array<{ originalIndex: number; filename: string; error: string }> = [];
      let flowChildIndex = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let processBuffer = file.buffer;
        let processFilename = file.filename;

        const validation = await validateImageBuffer(processBuffer, processFilename);
        if (!validation.valid) {
          preFailures.push({
            originalIndex: i,
            filename: file.filename,
            error: `Invalid image: ${validation.reason}`,
          });
          continue;
        }

        // Decode chain (skip for metadata tools that handle all formats natively)
        const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";

        if (!skipPreprocess && validation.format === "heif") {
          try {
            processBuffer = await decodeHeic(processBuffer);
            const ext = processFilename.match(/\.[^.]+$/)?.[0];
            if (ext) processFilename = `${processFilename.slice(0, -ext.length)}.png`;
          } catch {
            preFailures.push({
              originalIndex: i,
              filename: file.filename,
              error: "Failed to decode HEIC file",
            });
            continue;
          }
        }

        if (!skipPreprocess && needsCliDecode(validation.format)) {
          try {
            const fileExt = processFilename.split(".").pop()?.toLowerCase();
            processBuffer = await decodeToSharpCompat(processBuffer, validation.format, fileExt);
          } catch {
            try {
              await sharp(processBuffer).metadata();
            } catch {
              // Neither CLI decode nor Sharp can handle it; upload raw
            }
          }
          const ext = processFilename.match(/\.[^.]+$/)?.[0];
          if (ext) processFilename = `${processFilename.slice(0, -ext.length)}.png`;
        }

        if (!skipPreprocess) {
          processBuffer = await autoOrient(processBuffer);
        }

        // Upload decoded file to object storage
        const childId = `${parentId}-f${flowChildIndex}`;
        const key = `uploads/${childId}/${processFilename}`;
        await putObject(key, processBuffer);

        // Insert child row
        await db.insert(schema.jobs).values({
          id: childId,
          userId,
          toolId,
          pool,
          type: "batch-child",
          status: "queued",
          inputRefs: [key],
          settings: settings as Record<string, unknown>,
        });

        // Build flow child node
        flowChildren.push({
          name: toolId,
          queueName: queueName(pool),
          data: {
            kind: "batch-child",
            jobId: childId,
            toolId,
            userId,
            pool,
            parentId,
            totalFiles: files.length,
            fileIndex: i,
            inputRefs: [key],
            filename: processFilename,
            settings,
          } satisfies ToolJobData,
          // Children swallow failures via return markers, so a retry would
          // never run; attempts: 1 makes that explicit.
          opts: { jobId: childId, attempts: 1 },
        });

        flowChildIndex++;
      }

      // Record pre-failures in batch progress
      for (const pf of preFailures) {
        await recordChildOutcome(parentId, files.length, pf.filename, pf.error);
      }

      if (flowChildren.length === 0) {
        // All files failed validation
        return reply.status(422).send({
          error: "All files failed processing",
          errors: preFailures.map((f) => ({ filename: f.filename, error: f.error })),
        });
      }

      // ── Build flow tree and enqueue ────────────────────────────────
      const batchTree: FlowJob = {
        name: "batch-finalize",
        queueName: queueName("system"),
        data: {
          kind: "batch-finalize",
          jobId: parentId,
          toolId,
          userId,
          pool: "system" as Pool,
          totalFiles: files.length,
          inputRefs: [],
          filename: "",
          settings: { flowChildCount: flowChildren.length },
        } satisfies ToolJobData,
        opts: { jobId: parentId, attempts: 1 },
        children: flowChildren,
      };

      // Update the parent row with the final flow child count
      await db
        .update(schema.jobs)
        .set({ settings: { flowChildCount: flowChildren.length } })
        .where(eq(schema.jobs.id, parentId));

      await getFlowProducer().add(batchTree);

      // ── Wait for completion and stream ZIP ─────────────────────────
      const batchResult = await waitForJob("system", parentId, 30 * 60_000);

      if (!batchResult) {
        return reply.status(422).send({ error: "Batch processing timed out" });
      }

      const manifest = (batchResult.resultPayload?.manifest ?? []) as Array<{
        index: number;
        filename: string;
        outputRef?: string;
        error?: string;
      }>;

      // Combine manifest with pre-failures for the full ordered result
      const allResults: Array<{
        originalIndex: number;
        filename: string;
        outputRef?: string;
        error?: string;
      }> = [];

      let fci = 0;
      for (let i = 0; i < files.length; i++) {
        const pf = preFailures.find((p) => p.originalIndex === i);
        if (pf) {
          allResults.push({
            originalIndex: i,
            filename: pf.filename,
            error: pf.error,
          });
        } else {
          const entry = manifest.find((m) => m.index === fci);
          if (entry) {
            allResults.push({
              originalIndex: i,
              filename: entry.filename,
              outputRef: entry.outputRef,
              error: entry.error,
            });
          }
          fci++;
        }
      }

      const successEntries = allResults.filter((r) => r.outputRef);
      const failedEntries = allResults.filter((r) => !r.outputRef);

      // If every file failed, return an error instead of an empty ZIP
      if (successEntries.length === 0) {
        return reply.status(422).send({
          error: "All files failed processing",
          errors: failedEntries.map((f) => ({ filename: f.filename, error: f.error ?? "Failed" })),
        });
      }

      // Deduplicate output filenames and build X-File-Results header
      const usedNames = new Set<string>();
      function getUniqueName(name: string): string {
        if (!usedNames.has(name)) {
          usedNames.add(name);
          return name;
        }
        const dotIdx = name.lastIndexOf(".");
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
        let counter = 1;
        let candidate = `${base}_${counter}${ext}`;
        while (usedNames.has(candidate)) {
          counter++;
          candidate = `${base}_${counter}${ext}`;
        }
        usedNames.add(candidate);
        return candidate;
      }

      const fileResultsMap: Record<string, string> = {};
      for (const entry of successEntries) {
        const uniqueName = getUniqueName(entry.filename);
        entry.filename = uniqueName;
        fileResultsMap[String(entry.originalIndex)] = uniqueName;
      }

      // Hijack and stream the ZIP response after all processing
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="batch-${toolId}-${parentId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
        "X-Job-Id": parentId,
        "X-File-Results": encodeURIComponent(JSON.stringify(fileResultsMap)),
        ...getSecurityHeaders(),
      });

      const archive = archiver("zip", { zlib: { level: 5 } });

      archive.on("error", (err) => {
        request.log.error({ err }, "Archiver error during batch processing");
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      });

      archive.pipe(reply.raw);

      // Append results from object storage in original upload order
      try {
        for (const entry of successEntries) {
          const stream = await getObjectStream(entry.outputRef!);
          archive.append(stream, { name: entry.filename });
        }

        await archive.finalize();
      } catch (err) {
        request.log.error({ err }, "Failed to stream ZIP entries during batch processing");
        archive.abort();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }
    },
  );
}
