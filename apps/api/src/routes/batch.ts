/**
 * Batch processing route.
 *
 * POST /api/v1/tools/:section/:toolId/batch
 *
 * Accepts multipart with multiple files + settings JSON.
 * Each file is enqueued as a batch-child BullMQ job; a batch-finalize
 * parent assembles the manifest once all children complete.
 * Returns a ZIP file containing all processed images.
 */
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { FEATURE_BUNDLES, isSafeMessageError, TOOLS, toolSection } from "@snapotter/shared";
import type { FlowJob } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { recordChildOutcome } from "../jobs/batch-progress.js";
import { getFlowProducer, injectTraceContext, waitForJob } from "../jobs/enqueue.js";
import { type Pool, queueName, type ToolJobData, type ToolJobResult } from "../jobs/types.js";
import { autoOrient } from "../lib/auto-orient.js";
import { getSecurityHeaders } from "../lib/csp.js";
import { formatZodErrors, friendlyError, sharedFailureReason } from "../lib/errors.js";
import { getFirstMissingBundleForTool } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import {
  deleteObject,
  getObjectStream,
  putObject,
  workspaceHeadroomBytes,
} from "../lib/object-storage.js";
import { resolveOcrIngressSettings } from "../lib/ocr-capability.js";
import { prepareOcrIngressImage } from "../lib/ocr-image-input.js";
import {
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrUploadLimits,
} from "../lib/ocr-limits.js";
import {
  type SpooledMultipartFile,
  spoolMultipartFile,
  storeValidatedOcrPdf,
} from "../lib/ocr-pdf-ingress.js";
import { resolveToolPool } from "../lib/pool.js";
import { withRouteScratch } from "../lib/route-scratch.js";
import { InputValidationError } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";
import { requireToolAccess } from "../permissions.js";
import { failBatchJob, updateJobProgress } from "./progress.js";
import { getToolConfig } from "./tool-factory.js";

type ParsedFile =
  | { kind: "buffer"; buffer: Buffer; filename: string; size: number }
  | ({ kind: "path" } & SpooledMultipartFile);

const formatMb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Storage capacity failures answer 503 wherever they surface, so a client
// keys on one status and code for "the instance is full" (#1161).
const CAPACITY_CODES = new Set(["workspace-cap", "disk-free-floor"]);

/**
 * The failure a finalize committed to the parent row before it rethrew, or
 * null when the row is not settled as failed. The rejection that reaches the
 * route through BullMQ is a plain Error, so the row is the only carrier of
 * the user-facing reason and code.
 */
async function settledFailure(jobId: string): Promise<{
  message: string;
  code?: string;
  errors: Array<{ filename: string; error: string }>;
} | null> {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (row?.status !== "failed") return null;
  const error = row.error as { message?: string; code?: string; details?: unknown } | null;
  if (!error?.message) return null;
  return {
    message: error.message,
    ...(typeof error.code === "string" ? { code: error.code } : {}),
    errors: Array.isArray(error.details)
      ? (error.details as Array<{ filename: string; error: string }>)
      : [],
  };
}

/** Recursively inject OTel trace context into every node of a FlowJob tree. */
function injectTraceContextIntoFlow(node: FlowJob): void {
  injectTraceContext(node.data as ToolJobData);
  if (node.children) {
    for (const child of node.children) {
      injectTraceContextIntoFlow(child);
    }
  }
}

export async function registerBatchRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/tools/:section/:toolId/batch",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (
      request: FastifyRequest<{ Params: { section: string; toolId: string } }>,
      reply: FastifyReply,
    ) => {
      const { section, toolId } = request.params;
      const tool = TOOLS.find((t) => t.id === toolId);
      if (!tool || toolSection(tool) !== section) {
        return reply.status(404).send({ error: "Not found", code: "NOT_FOUND" });
      }
      const authUser = await requireToolAccess(request, reply, toolId);
      if (!authUser) return;

      // Batch processing (especially with AI) can take tens of minutes.
      // Disable the Node.js HTTP socket timeout so the connection is not
      // dropped while images are still being processed.
      request.raw.socket?.setTimeout?.(0);

      // Look up the tool config from the registry
      const toolConfig = getToolConfig(toolId);
      if (!toolConfig) {
        return reply.status(404).send({ error: `Tool "${toolId}" not found` });
      }

      // Refuse an upload the workspace cannot hold before buffering it. The
      // whole body is buffered below, so without this a batch that could
      // never fit was accepted in full and then failed at its first store,
      // and every request after it failed the same way until the TTL sweep
      // freed the space (#1161). Absent Content-Length (chunked upload)
      // leaves it to the per-write check.
      const contentLength = Number(request.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > 0) {
        const headroom = await workspaceHeadroomBytes();
        if (headroom !== null && contentLength > headroom) {
          return reply.status(503).send({
            error: "This batch does not fit in the remaining workspace storage",
            code: "workspace-cap",
            details:
              `The upload is ${formatMb(contentLength)} but only ${formatMb(headroom)} of the ` +
              `${env.MAX_WORKSPACE_SIZE_GB} GB workspace (MAX_WORKSPACE_SIZE_GB) is free. Send fewer ` +
              "files at a time, or raise the limit; " +
              (env.FILE_MAX_AGE_HOURS > 0
                ? `stored results expire after ${env.FILE_MAX_AGE_HOURS} hours (FILE_MAX_AGE_HOURS)`
                : "stored results never expire while FILE_MAX_AGE_HOURS is 0"),
          });
        }
      }

      return withRouteScratch("batch", async (scratchDir) => {
        const ingressAbort = new AbortController();
        const abortIngress = () => ingressAbort.abort();
        // Every key stored for this batch until the flow is enqueued. An
        // ingress failure after some files were stored (the workspace cap
        // tripping on a later file) must not leave them behind: they are
        // unreachable, and until the TTL sweep they kept the workspace full
        // so every following request failed the same way (#1161).
        const uncommittedKeys = new Set<string>();
        // The rows this request inserted, until the flow owns them. Set once
        // the parent row exists, cleared once the flow is enqueued; an
        // ingress failure in between settles them (see the catch below).
        let stagedBatch: { parentId: string; totalFiles: number; childIds: string[] } | null = null;
        request.raw.once("aborted", abortIngress);
        if (request.raw.aborted) ingressAbort.abort();
        try {
          // Parse multipart: collect all files and the settings field
          const files: ParsedFile[] = [];
          let settingsRaw: string | null = null;
          let clientJobId: string | null = null;
          const ocrUploadLimits =
            toolId === "ocr" || toolId === "ocr-pdf"
              ? resolveOcrUploadLimits(env.MAX_UPLOAD_SIZE_MB)
              : undefined;
          let totalEncodedBytes = 0;
          let filePartIndex = 0;

          try {
            const parts = request.parts(
              ocrUploadLimits === undefined
                ? undefined
                : { limits: { fileSize: ocrUploadLimits.fileBytes } },
            );
            for await (const part of parts) {
              if (part.type === "file") {
                if (toolId === "ocr-pdf") {
                  const remainingAggregate =
                    (ocrUploadLimits?.aggregateBytes ?? Number.MAX_SAFE_INTEGER) -
                    totalEncodedBytes;
                  const file = await spoolMultipartFile(part, scratchDir, filePartIndex, {
                    maxBytes: Math.min(
                      ocrUploadLimits?.fileBytes ?? Number.MAX_SAFE_INTEGER,
                      Math.max(0, remainingAggregate),
                    ),
                    signal: ingressAbort.signal,
                  });
                  totalEncodedBytes += file.size;
                  if (
                    ocrUploadLimits !== undefined &&
                    totalEncodedBytes > ocrUploadLimits.aggregateBytes
                  ) {
                    throw new InputValidationError(
                      `OCR batch input exceeds the ${ocrUploadLimits.aggregateBytes} byte aggregate safety limit`,
                      413,
                    );
                  }
                  // Empty parts keep their slot: the client maps results back
                  // onto its own file list by index, so dropping one here
                  // would label a converted file with a different file's name
                  // (issue #645). They fail in place in the loop below.
                  files.push({ kind: "path", ...file });
                } else {
                  const chunks: Buffer[] = [];
                  for await (const chunk of part.file) {
                    if (ocrUploadLimits !== undefined) {
                      totalEncodedBytes += chunk.length;
                      if (totalEncodedBytes > ocrUploadLimits.aggregateBytes) {
                        throw new InputValidationError(
                          `OCR batch input exceeds the ${ocrUploadLimits.aggregateBytes} byte aggregate safety limit`,
                          413,
                        );
                      }
                    }
                    chunks.push(chunk);
                  }
                  const buffer = Buffer.concat(chunks);
                  files.push({
                    kind: "buffer",
                    buffer,
                    filename: sanitizeFilename(part.filename ?? "file"),
                    size: buffer.length,
                  });
                }
                filePartIndex++;
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
            const statusCode = ocrUploadErrorStatus(err);
            return reply.status(statusCode).send({
              error: ocrUploadErrorMessage(statusCode),
              details: err instanceof Error ? err.message : String(err),
            });
          }

          if (files.length === 0) {
            return reply.status(400).send({ error: "No files provided" });
          }

          // Enforce batch size limit
          if (env.MAX_BATCH_SIZE > 0 && files.length > env.MAX_BATCH_SIZE) {
            return reply.status(400).send({
              error: `Too many files. Maximum batch size is ${env.MAX_BATCH_SIZE}`,
            });
          }

          // Parse and validate settings
          let settings: unknown;
          let requestedSettings: unknown;
          try {
            const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
            const result = toolConfig.settingsSchema.safeParse(parsed);
            if (!result.success) {
              return reply.status(400).send({
                error: "Invalid settings",
                details: formatZodErrors(result.error.issues),
              });
            }
            requestedSettings = parsed;
            settings = result.data;
          } catch {
            return reply.status(400).send({ error: "Settings must be valid JSON" });
          }

          const ocrResolution = resolveOcrIngressSettings(toolId, settings, { requestedSettings });
          if (!ocrResolution.ok) {
            const bundle = FEATURE_BUNDLES.ocr;
            return reply.status(501).send({
              error:
                ocrResolution.code === "FEATURE_INCOMPATIBLE"
                  ? "Feature incompatible"
                  : "Feature not installed",
              code: ocrResolution.code,
              feature: "ocr",
              featureName: bundle?.name ?? toolId,
              estimatedSize: bundle?.estimatedSize ?? "unknown",
              requestedQuality: ocrResolution.requestedQuality,
              compatibilityReason: ocrResolution.reason,
              ...(ocrResolution.guidance && { guidance: ocrResolution.guidance }),
            });
          }
          settings = ocrResolution.settings;

          // Settings errors take precedence over feature availability. This keeps
          // unavailable installations from masking invalid client input.
          const missingBundleId = getFirstMissingBundleForTool(toolId);
          if (missingBundleId) {
            const bundle = FEATURE_BUNDLES[missingBundleId];
            return reply.status(501).send({
              error: "Feature not installed",
              code: "FEATURE_NOT_INSTALLED",
              feature: missingBundleId,
              featureName: bundle?.name ?? toolId,
              estimatedSize: bundle?.estimatedSize ?? "unknown",
            });
          }

          // ── Create job ID and initial progress ────────────────────────
          const parentId = clientJobId || randomUUID();
          const userId = authUser.id;
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
          stagedBatch = { parentId, totalFiles: files.length, childIds: [] };

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
          // Flow index -> original upload index, consumed by batch-finalize so
          // fileResults keeps #645's index alignment across pre-failures.
          const fileIndexMap: number[] = [];
          let flowChildIndex = 0;

          // Resolve the tool's modality so non-image files (audio/video/document)
          // validate through their own handler instead of the image validator.
          const modality = tool.modality;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let processFilename = file.filename;
            const childId = `${parentId}-f${flowChildIndex}`;
            let key = `uploads/${childId}/${processFilename}`;

            // Reported against the slot it arrived in, so every later result
            // stays paired with the file it came from.
            if (file.size === 0) {
              preFailures.push({
                originalIndex: i,
                filename: file.filename,
                error: "File is empty",
              });
              if (file.kind === "path") await rm(file.path, { force: true }).catch(() => {});
              continue;
            }

            if (file.kind === "path") {
              try {
                await storeValidatedOcrPdf(file, key, {
                  maxBytes: ocrUploadLimits?.fileBytes ?? file.size,
                  signal: ingressAbort.signal,
                });
                uncommittedKeys.add(key);
              } catch (err) {
                if (err instanceof InputValidationError) {
                  preFailures.push({
                    originalIndex: i,
                    filename: file.filename,
                    error: err.message,
                  });
                  continue;
                }
                throw err;
              } finally {
                await rm(file.path, { force: true }).catch(() => {});
              }
            } else {
              let processBuffer = file.buffer;
              if (modality === "image" && toolId === "ocr") {
                try {
                  const prepared = await prepareOcrIngressImage(
                    processBuffer,
                    processFilename,
                    scratchDir,
                  );
                  processBuffer = prepared.buffer;
                  processFilename = prepared.filename;
                } catch (err) {
                  if (err instanceof InputValidationError) {
                    preFailures.push({
                      originalIndex: i,
                      filename: file.filename,
                      error: err.message,
                    });
                    continue;
                  }
                  throw err;
                }
              } else if (modality === "image") {
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
                    processBuffer = await decodeToSharpCompat(
                      processBuffer,
                      validation.format,
                      fileExt,
                    );
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
              } else {
                // Non-image modalities (audio/video/document/file) keep their buffered contract.
                try {
                  const prepared = await inputHandlerFor(modality).prepare(
                    processBuffer,
                    processFilename,
                    {
                      scratchDir,
                      lenient: getToolConfig(toolId)?.skipStructuralValidation,
                    },
                  );
                  processBuffer = prepared.buffer;
                  processFilename = prepared.filename;
                } catch (err) {
                  if (err instanceof InputValidationError) {
                    preFailures.push({
                      originalIndex: i,
                      filename: file.filename,
                      error: err.message,
                    });
                    continue;
                  }
                  throw err;
                }
              }

              key = `uploads/${childId}/${processFilename}`;
              // Tracked before the write so a store that fails part-way is
              // cleaned up too; deleting a key that was never written is a no-op.
              uncommittedKeys.add(key);
              await putObject(key, processBuffer);
            }

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
            stagedBatch?.childIds.push(childId);

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
                analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
              } satisfies ToolJobData,
              // Children swallow failures via return markers, so a retry
              // would never run; attempts: 1 makes that explicit. A child can
              // still hard-fail outside its own handler (stall eviction after
              // an OOM kill); without ignoreDependencyOnFailure that wedges
              // the parent in waiting-children forever and no terminal frame
              // ever reaches a degraded client (#750). With it, the finalize
              // runs and reports the child as failed from its row.
              opts: { jobId: childId, attempts: 1, ignoreDependencyOnFailure: true },
            });

            fileIndexMap.push(i);
            flowChildIndex++;
          }

          // Record pre-failures in batch progress
          for (const pf of preFailures) {
            await recordChildOutcome(parentId, files.length, pf.filename, pf.error);
          }

          if (flowChildren.length === 0) {
            // All files failed validation. There is no flow to run, so no
            // finalize will ever publish a terminal frame; publish it here
            // (awaited and guarded, like the finalize's own writes) so a
            // client that lost this response settles from SSE (#750).
            await failBatchJob({
              jobId: parentId,
              totalFiles: files.length,
              completedFiles: files.length,
              failedFiles: files.length,
              errors: preFailures.map((f) => ({ filename: f.filename, error: f.error })),
              message: "All files failed processing",
            }).catch((err) => {
              request.log.error({ err, jobId: parentId }, "all-prefail terminal write failed");
            });
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
              settings: { flowChildCount: flowChildren.length, fileIndexMap },
              analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
            } satisfies ToolJobData,
            opts: { jobId: parentId, attempts: 1 },
            children: flowChildren,
          };

          // Update the parent row with the final flow child count
          await db
            .update(schema.jobs)
            .set({ settings: { flowChildCount: flowChildren.length, fileIndexMap } })
            .where(eq(schema.jobs.id, parentId));

          // Inject OTel trace context into every node of the batch flow tree
          injectTraceContextIntoFlow(batchTree);

          await getFlowProducer().add(batchTree);
          uncommittedKeys.clear();
          stagedBatch = null;

          // ── Wait for completion and stream the stored ZIP ──────────────
          let batchResult: ToolJobResult | null;
          try {
            batchResult = await waitForJob("system", parentId, 30 * 60_000);
          } catch (err) {
            // A failed finalize settles the parent row with its reason (the
            // workspace cap's message, for one) before it rethrows, but the
            // rejection that reaches this side is BullMQ's plain Error, which
            // the error handler would mask as "Internal server error". The
            // row is what the sync client and API consumers must see (#1161).
            const failure = await settledFailure(parentId);
            if (!failure) throw err;
            const status = failure.code && CAPACITY_CODES.has(failure.code) ? 503 : 500;
            return reply.status(status).send({
              error: failure.message,
              ...(failure.code ? { code: failure.code } : {}),
              errors: failure.errors,
            });
          }

          if (!batchResult) {
            // The flow is still running and nothing couples this response to
            // it. Answer with the async contract instead of a fake failure:
            // the client rides the SSE to the terminal frame, which carries
            // the durable download URL (#750).
            return reply.status(202).send({ jobId: parentId, async: true });
          }

          const payload = batchResult.resultPayload as
            | {
                manifest?: Array<{
                  index: number;
                  filename: string;
                  outputRef?: string;
                  error?: string;
                }>;
                canceled?: boolean;
                zip?: {
                  key: string;
                  filename: string;
                  size: number;
                  fileResults: Record<string, string>;
                };
              }
            | undefined;

          const zip = payload?.zip;
          if (!zip) {
            // No file produced output; the finalize already published the
            // terminal frame. Mirror it on the HTTP contract. A fully
            // canceled batch is not a processing failure; keep the message
            // honest for API consumers that never see the SSE (#767).
            const manifestFailures = (payload?.manifest ?? []).filter((m) => !m.outputRef);
            const errors = [
              ...preFailures.map((f) => ({ filename: f.filename, error: f.error })),
              ...manifestFailures.map((f) => ({
                filename: f.filename,
                error: f.error ?? "Failed",
              })),
            ];
            // When every file failed for the same reason (the workspace cap
            // tripping on the children's output writes), that reason is the
            // batch's error; the generic summary would hide the one thing
            // the user could act on (#1161).
            const shared = sharedFailureReason(errors);
            return reply.status(422).send({
              error: payload?.canceled
                ? "Batch canceled"
                : (shared ?? "All files failed processing"),
              // Structured so clients key on the outcome instead of matching
              // the message string.
              ...(payload?.canceled ? { canceled: true } : {}),
              errors,
            });
          }

          // Hijack and stream the ZIP the finalize persisted. Content-Length
          // is known, so a delivery shortfall is detectable by the client
          // instead of looking like a complete chunked response.
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${zip.filename}"`,
            "Content-Length": String(zip.size),
            "X-Job-Id": parentId,
            "X-File-Results": encodeURIComponent(JSON.stringify(zip.fileResults)),
            ...getSecurityHeaders(),
          });

          // The 200 headers are already out, so nothing here can change the
          // status. Destroy the socket rather than end() it: a clean end
          // would hand the client a short body it may mistake for success.
          try {
            const stream = await getObjectStream(zip.key);
            // A backend that resolves the stream and only then fails (local
            // createReadStream emitting ENOENT) never rejects the await, so
            // the catch below cannot see it. Without this listener that error
            // is unhandled and the request hangs instead of terminating.
            stream.on("error", (err: Error) => {
              request.log.error({ err, jobId: parentId }, "Batch ZIP stream error");
              reply.raw.destroy(err);
            });
            // pipe() only unpipes when the destination dies; the source stays
            // open and leaks its descriptor on every mid-download disconnect.
            reply.raw.on("close", () => {
              stream.destroy();
            });
            stream.pipe(reply.raw);
          } catch (err) {
            request.log.error({ err, jobId: parentId }, "Failed to open stored batch ZIP");
            reply.raw.destroy(err instanceof Error ? err : new Error(String(err)));
          }
        } catch (err) {
          // Ingress died after the parent row existed but before the flow
          // was enqueued (a store refused by the workspace cap, a decoder
          // crash). Settle the rows and publish the terminal frame so job
          // history and a client watching the SSE see the reason instead
          // of "processing" forever; the finally removes the uploads (#1161).
          if (stagedBatch) {
            const { parentId, totalFiles, childIds } = stagedBatch;
            const message = friendlyError(err instanceof Error ? err.message : String(err));
            try {
              if (childIds.length > 0) {
                await db.delete(schema.jobs).where(inArray(schema.jobs.id, childIds));
              }
              await failBatchJob({
                jobId: parentId,
                totalFiles,
                completedFiles: totalFiles,
                failedFiles: totalFiles,
                errors: [{ filename: "", error: message }],
                message,
                ...(isSafeMessageError(err) && err.code ? { code: err.code } : {}),
              });
            } catch (settleErr) {
              request.log.error(
                { err: settleErr, jobId: parentId },
                "failed to settle a batch whose ingress died",
              );
            }
          }
          throw err;
        } finally {
          request.raw.removeListener("aborted", abortIngress);
          await Promise.all(
            [...uncommittedKeys].map((key) =>
              deleteObject(key).catch((cleanupErr) => {
                // The workspace stays full if this fails; say so, or the next
                // request's 503 looks unexplained.
                request.log.warn({ err: cleanupErr, key }, "batch ingress cleanup failed");
              }),
            ),
          );
        }
      });
    },
  );
}
