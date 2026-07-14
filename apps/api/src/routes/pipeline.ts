/**
 * Pipeline execution, save, list, and delete routes.
 *
 * POST   /api/v1/pipeline/execute  -- Execute a pipeline (array of tool steps)
 * POST   /api/v1/pipeline/save     -- Save a pipeline definition
 * GET    /api/v1/pipeline/list     -- List saved pipelines
 * DELETE /api/v1/pipeline/:id      -- Delete a saved pipeline
 * POST   /api/v1/pipeline/batch    -- Batch pipeline execution (ZIP output)
 */
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { FEATURE_BUNDLES, MODALITY_POOL, TOOLS } from "@snapotter/shared";
import archiver from "archiver";
import type { FlowJob } from "bullmq";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { recordChildOutcome } from "../jobs/batch-progress.js";
import { getFlowProducer, injectTraceContext, waitForJob } from "../jobs/enqueue.js";
import { type Pool, queueName, type ToolJobData } from "../jobs/types.js";
import { autoOrient } from "../lib/auto-orient.js";
import { getSecurityHeaders } from "../lib/csp.js";
import { formatZodErrors } from "../lib/errors.js";
import { getFirstMissingBundleForTool } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { deleteObject, getObjectStream, putObject } from "../lib/object-storage.js";
import { resolveOcrIngressSettings } from "../lib/ocr-capability.js";
import { prepareOcrIngressImage } from "../lib/ocr-image-input.js";
import {
  findOcrEncodedInputViolation,
  ocrUploadErrorMessage,
  ocrUploadErrorStatus,
  resolveOcrEncodedInputLimit,
  resolveOcrUploadLimits,
} from "../lib/ocr-limits.js";
import {
  configuredUploadLimit,
  type SpooledMultipartFile,
  spoolMultipartFile,
  storeValidatedOcrPdf,
} from "../lib/ocr-pdf-ingress.js";
import { resolveToolPool } from "../lib/pool.js";
import { withRouteScratch } from "../lib/route-scratch.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";
import { InputValidationError } from "../modality/contract.js";
import { inputHandlerFor } from "../modality/input-handler.js";
import { hasEffectivePermission, hasEffectiveToolAccess } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";
import { updateJobProgress, updateSingleFileProgress } from "./progress.js";
import { getRegisteredToolIds, getToolConfig } from "./tool-factory.js";

/** Schema for a single pipeline step. */
const pipelineStepSchema = z.object({
  toolId: z.string(),
  settings: z.record(z.unknown()).default({}),
});

/** Schema for a full pipeline definition. */
const stepsSchema =
  env.MAX_PIPELINE_STEPS > 0
    ? z
        .array(pipelineStepSchema)
        .min(1, "Pipeline must have at least one step")
        .max(env.MAX_PIPELINE_STEPS, "Pipeline exceeds maximum steps")
    : z.array(pipelineStepSchema).min(1, "Pipeline must have at least one step");

const pipelineDefinitionSchema = z.object({
  steps: stepsSchema,
});

/** Schema for saving a pipeline. */
const savePipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required").max(100),
  description: z.string().max(500).optional(),
  steps: stepsSchema,
});

// ── Helpers ────────────────────────────────────────────────────

interface ParsedStep {
  toolId: string;
  resolvedToolId: string;
  parsedSettings: unknown;
  pool: Pool;
}

function firstPipelineToolId(raw: string | null): string | undefined {
  try {
    return (JSON.parse(raw ?? "{}") as { steps?: Array<{ toolId?: string }> }).steps?.[0]?.toolId;
  } catch {
    return undefined;
  }
}

/**
 * Tools whose settings carry passwords. They are blocked from ALL pipeline
 * paths so secrets never persist in step rows (the single-tool route redacts
 * via dbSettings).
 */
const PASSWORD_TOOLS = new Set(["protect-pdf", "unlock-pdf"]);

/** Recursively inject OTel trace context into every node of a FlowJob tree. */
function injectTraceContextIntoFlow(node: FlowJob): void {
  injectTraceContext(node.data as ToolJobData);
  if (node.children) {
    for (const child of node.children) {
      injectTraceContextIntoFlow(child);
    }
  }
}

/**
 * Build a FlowJob tree for a single-file pipeline.
 *
 * BullMQ children run BEFORE parents, so the sequential chain nests
 * with step 0 deepest:
 *
 *   finalize (parent)
 *     step N-1
 *       step N-2
 *         ...
 *           step 0 (deepest leaf, runs first)
 */
function buildPipelineFlowTree(opts: {
  jobId: string;
  userId: string | null;
  parsedSteps: ParsedStep[];
  uploadKey: string;
  filename: string;
  pipelinePool: Pool;
  clientJobId?: string;
  parentId?: string;
  totalFiles?: number;
  analyticsDistinctId?: string;
}): { tree: FlowJob; stepJobIds: string[] } {
  const {
    jobId,
    userId,
    parsedSteps,
    uploadKey,
    filename,
    pipelinePool,
    clientJobId,
    parentId,
    totalFiles,
    analyticsDistinctId,
  } = opts;
  const totalSteps = parsedSteps.length;
  const stepJobIds = parsedSteps.map((_: unknown, i: number) => `${jobId}-s${i}`);

  // Build bottom-up: step 0 is the deepest leaf
  // Steps swallow failures via return markers, so a retry would never
  // run; attempts: 1 makes that explicit.
  let currentNode: FlowJob = {
    name: parsedSteps[0].resolvedToolId,
    queueName: queueName(parsedSteps[0].pool),
    data: {
      kind: "pipeline-step",
      jobId: stepJobIds[0],
      toolId: parsedSteps[0].resolvedToolId,
      userId,
      pool: parsedSteps[0].pool,
      stepIndex: 0,
      totalSteps,
      prevJobId: undefined,
      clientJobId,
      inputRefs: [uploadKey],
      filename,
      settings: parsedSteps[0].parsedSettings,
      analyticsDistinctId,
    } satisfies ToolJobData,
    opts: { jobId: stepJobIds[0], attempts: 1 },
  };

  for (let i = 1; i < totalSteps; i++) {
    currentNode = {
      name: parsedSteps[i].resolvedToolId,
      queueName: queueName(parsedSteps[i].pool),
      data: {
        kind: "pipeline-step",
        jobId: stepJobIds[i],
        toolId: parsedSteps[i].resolvedToolId,
        userId,
        pool: parsedSteps[i].pool,
        stepIndex: i,
        totalSteps,
        prevJobId: stepJobIds[i - 1],
        clientJobId,
        inputRefs: [],
        filename,
        settings: parsedSteps[i].parsedSettings,
        analyticsDistinctId,
      } satisfies ToolJobData,
      opts: { jobId: stepJobIds[i], attempts: 1 },
      children: [currentNode],
    };
  }

  // Finalize parent: runs on the pipeline's modality pool (lightweight DB reads
  // + one object copy; steps already run on their own per-step pools; system
  // pool is reserved for crons + batch manifest assembly)
  const tree: FlowJob = {
    name: "pipeline-finalize",
    queueName: queueName(pipelinePool),
    data: {
      kind: "pipeline-finalize",
      jobId,
      toolId: "pipeline",
      userId,
      pool: pipelinePool,
      totalSteps,
      clientJobId,
      parentId,
      totalFiles,
      inputRefs: [],
      filename,
      settings: {},
      analyticsDistinctId,
    } satisfies ToolJobData,
    opts: { jobId, attempts: 1 },
    children: [currentNode],
  };

  return { tree, stepJobIds };
}

export async function registerPipelineRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/pipeline/execute
   *
   * Accepts multipart with:
   *   - A file part (the file to process)
   *   - A "pipeline" field containing JSON: { steps: [{ toolId, settings }, ...] }
   *
   * Enqueues a BullMQ FlowProducer tree (nested children for sequential
   * execution) and blocks until the finalize job completes.
   */
  app.post(
    "/api/v1/pipeline/execute",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = requireAuth(request, reply);
      if (!authUser) return;

      return withRouteScratch("pipeline", async (scratchDir) => {
        const ingressAbort = new AbortController();
        const abortIngress = () => ingressAbort.abort();
        let uncommittedOcrKey: string | undefined;
        request.raw.once("aborted", abortIngress);
        if (request.raw.aborted) ingressAbort.abort();
        try {
          let file: SpooledMultipartFile | null = null;
          let filename = "file";
          let pipelineRaw: string | null = null;
          let clientJobId: string | null = null;

          // Parse multipart
          try {
            // The pipeline definition may follow the file. Until the first step is
            // known, stream with OCR's hard ceiling so a file-first request cannot
            // bypass it by making us spool unbounded bytes. Large non-OCR callers
            // can put the pipeline field first and retain the operator's limit.
            const parts = request.parts();
            for await (const part of parts) {
              if (part.type === "file") {
                if (file) throw new InputValidationError("Only one pipeline input is allowed");
                const knownFirstToolId = firstPipelineToolId(pipelineRaw);
                const ingressLimits =
                  knownFirstToolId === undefined ||
                  knownFirstToolId === "ocr" ||
                  knownFirstToolId === "ocr-pdf"
                    ? resolveOcrUploadLimits(env.MAX_UPLOAD_SIZE_MB)
                    : undefined;
                file = await spoolMultipartFile(part, scratchDir, 0, {
                  maxBytes: Math.min(
                    configuredUploadLimit(env.MAX_UPLOAD_SIZE_MB) ?? Number.MAX_SAFE_INTEGER,
                    ingressLimits?.fileBytes ?? Number.MAX_SAFE_INTEGER,
                  ),
                  signal: ingressAbort.signal,
                });
                filename = file.filename;
              } else if (part.fieldname === "pipeline") {
                pipelineRaw = part.value as string;
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

          if (!file || file.size === 0) {
            return reply.status(400).send({ error: "No file provided" });
          }
          let processBuffer: Buffer | null = null;

          // The first pipeline step determines the input modality, so non-image
          // inputs (audio/video/document) get validated by the right handler instead
          // of always being forced through image validation/decoding.
          let firstToolId: string | undefined;
          firstToolId = firstPipelineToolId(pipelineRaw);
          if (firstToolId === "ocr" || firstToolId === "ocr-pdf") {
            const violation = findOcrEncodedInputViolation([file.size], env.MAX_UPLOAD_SIZE_MB);
            if (violation) {
              return reply.status(413).send({
                error: `OCR pipeline input exceeds the ${violation.limitBytes} byte ${violation.scope} safety limit`,
              });
            }
          }
          const inputModality = TOOLS.find((t) => t.id === firstToolId)?.modality ?? "image";
          if (firstToolId !== "ocr-pdf") {
            processBuffer = await readFile(file.path);
            await rm(file.path, { force: true });
          }
          const preprocessingReply =
            firstToolId === "ocr-pdf"
              ? undefined
              : await (async () => {
                  if (!processBuffer) throw new Error("Pipeline input buffer is unavailable");
                  if (inputModality === "image" && firstToolId === "ocr") {
                    try {
                      const prepared = await prepareOcrIngressImage(
                        processBuffer,
                        filename,
                        scratchDir,
                      );
                      processBuffer = prepared.buffer;
                      filename = prepared.filename;
                    } catch (err) {
                      if (err instanceof InputValidationError) {
                        const body: Record<string, string> = { error: err.message };
                        if (err.details) body.details = err.details;
                        return reply.status(err.statusCode).send(body);
                      }
                      throw err;
                    }
                  } else if (inputModality === "image") {
                    // Validate the initial image
                    const validation = await validateImageBuffer(processBuffer, filename);
                    if (!validation.valid) {
                      return reply.status(400).send({
                        error: `Invalid image: ${validation.reason}`,
                      });
                    }

                    // Decode HEIC/HEIF input via system heif-dec
                    if (validation.format === "heif") {
                      try {
                        processBuffer = await decodeHeic(processBuffer);
                        const ext = filename.match(/\.[^.]+$/)?.[0];
                        if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
                      } catch (err) {
                        return reply.status(422).send({
                          error:
                            "Failed to decode HEIC file. Ensure libheif-examples is installed.",
                          details: err instanceof Error ? err.message : String(err),
                        });
                      }
                    }

                    // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
                    if (needsCliDecode(validation.format)) {
                      try {
                        const fileExt = filename.split(".").pop()?.toLowerCase();
                        processBuffer = await decodeToSharpCompat(
                          processBuffer,
                          validation.format,
                          fileExt,
                        );
                        const ext = filename.match(/\.[^.]+$/)?.[0];
                        if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
                      } catch (err) {
                        return reply.status(422).send({
                          error: `Failed to decode ${validation.format} file`,
                          details: err instanceof Error ? err.message : String(err),
                        });
                      }
                    }

                    // Sanitize SVG input and normalize EXIF orientation
                    const isSvg = isSvgBuffer(processBuffer);
                    if (isSvg) {
                      processBuffer = sanitizeSvg(processBuffer);
                    } else {
                      processBuffer = await autoOrient(processBuffer);
                    }
                  } else {
                    // Non-image input: validate/decode via the tool's modality handler.
                    try {
                      const prepared = await inputHandlerFor(inputModality).prepare(
                        processBuffer,
                        filename,
                        {
                          scratchDir,
                          lenient: getToolConfig(firstToolId ?? "")?.skipStructuralValidation,
                        },
                      );
                      processBuffer = prepared.buffer;
                      filename = prepared.filename;
                    } catch (err) {
                      if (err instanceof InputValidationError) {
                        const body: Record<string, string> = { error: err.message };
                        if (err.details) body.details = err.details;
                        return reply.status(err.statusCode).send(body);
                      }
                      throw err;
                    }
                  }
                })();
          if (preprocessingReply) return preprocessingReply;

          // Parse and validate the pipeline definition
          if (!pipelineRaw) {
            return reply.status(400).send({ error: "No pipeline definition provided" });
          }

          let pipeline: z.infer<typeof pipelineDefinitionSchema>;
          try {
            const parsed = JSON.parse(pipelineRaw);
            const result = pipelineDefinitionSchema.safeParse(parsed);
            if (!result.success) {
              return reply.status(400).send({
                error: "Invalid pipeline definition",
                details: formatZodErrors(result.error.issues),
              });
            }
            pipeline = result.data;
          } catch {
            return reply.status(400).send({ error: "Pipeline must be valid JSON" });
          }

          // Validate all tool IDs and settings; collect parsed steps
          const parsedSteps: ParsedStep[] = [];

          for (let i = 0; i < pipeline.steps.length; i++) {
            const step = pipeline.steps[i];

            // Route content-aware resize to its dedicated tool
            const resolvedToolId =
              step.toolId === "resize" && step.settings?.contentAware
                ? "content-aware-resize"
                : step.toolId;

            const toolConfig = getToolConfig(resolvedToolId);
            if (!toolConfig) {
              return reply.status(400).send({
                error: `Step ${i + 1} (${step.toolId}): Tool not found or not available`,
              });
            }
            if (!(await hasEffectiveToolAccess(authUser, resolvedToolId))) {
              return reply.status(403).send({
                error: `Step ${i + 1} (${step.toolId}): You don't have permission to use this tool`,
              });
            }

            if (PASSWORD_TOOLS.has(step.toolId)) {
              return reply.status(400).send({
                error: `Step ${i + 1}: This tool cannot be used in pipelines because it requires a password`,
              });
            }

            const settingsResult = toolConfig.settingsSchema.safeParse(step.settings);
            if (!settingsResult.success) {
              return reply.status(400).send({
                error: `Step ${i + 1} (${step.toolId}): Invalid settings`,
                details: settingsResult.error.issues.map(
                  (iss: { path: (string | number)[]; message: string }) => ({
                    path: iss.path.join("."),
                    message: iss.message,
                  }),
                ),
              });
            }

            const ocrResolution = resolveOcrIngressSettings(resolvedToolId, settingsResult.data, {
              requestedSettings: step.settings,
            });
            if (!ocrResolution.ok) {
              const bundle = FEATURE_BUNDLES.ocr;
              return reply.status(501).send({
                error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is ${
                  ocrResolution.code === "FEATURE_INCOMPATIBLE" ? "incompatible" : "not installed"
                }`,
                code: ocrResolution.code,
                feature: "ocr",
                featureName: bundle?.name ?? resolvedToolId,
                requestedQuality: ocrResolution.requestedQuality,
                compatibilityReason: ocrResolution.reason,
                ...(ocrResolution.guidance && { guidance: ocrResolution.guidance }),
              });
            }

            // Validate settings before reporting unavailable mandatory bundles, so
            // feature state never masks malformed step input.
            const missingBundleId = getFirstMissingBundleForTool(resolvedToolId);
            if (missingBundleId) {
              const bundle = FEATURE_BUNDLES[missingBundleId];
              return reply.status(501).send({
                error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is not installed`,
                code: "FEATURE_NOT_INSTALLED",
                feature: missingBundleId,
                featureName: bundle?.name ?? resolvedToolId,
              });
            }

            if (env.MAX_PIPELINE_STEP_PIXELS > 0) {
              const s = ocrResolution.settings as Record<string, unknown>;
              const w = Number(s.width) || 0;
              const h = Number(s.height) || 0;
              if (w > 0 && h > 0 && w * h > env.MAX_PIPELINE_STEP_PIXELS) {
                return reply.status(400).send({
                  error: `Step ${i + 1} (${step.toolId}): Output dimensions ${w}x${h} exceed per-step pixel limit`,
                });
              }
            }

            parsedSteps.push({
              toolId: step.toolId,
              resolvedToolId,
              parsedSettings: ocrResolution.settings,
              pool: resolveToolPool(resolvedToolId),
            });
          }

          // ── Enqueue as a BullMQ flow ────────────────────────────────

          const jobId = randomUUID();
          const userId = authUser.id;
          const originalSize = firstToolId === "ocr-pdf" ? file.size : processBuffer?.length;
          if (originalSize === undefined) throw new Error("Pipeline input size is unavailable");

          // Upload decoded file to object storage
          const uploadKey = `uploads/${jobId}/${filename}`;
          if (firstToolId === "ocr-pdf") {
            try {
              await storeValidatedOcrPdf(file, uploadKey, {
                maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
                signal: ingressAbort.signal,
              });
              uncommittedOcrKey = uploadKey;
            } catch (err) {
              if (err instanceof InputValidationError) {
                const body: Record<string, string> = { error: err.message };
                if (err.details) body.details = err.details;
                return reply.status(err.statusCode).send(body);
              }
              const statusCode = ocrUploadErrorStatus(err);
              if (statusCode === 413 || statusCode === 503) {
                return reply.status(statusCode).send({
                  error: ocrUploadErrorMessage(statusCode),
                  details: err instanceof Error ? err.message : String(err),
                });
              }
              throw err;
            } finally {
              await rm(file.path, { force: true }).catch(() => {});
            }
          } else {
            if (!processBuffer) throw new Error("Pipeline input buffer is unavailable");
            await putObject(uploadKey, processBuffer);
          }

          // Report initial progress
          if (clientJobId) {
            void updateSingleFileProgress({
              jobId: clientJobId,
              phase: "processing",
              percent: 0,
              stage: "Preparing pipeline...",
            });
          }

          // Derive the pipeline's pool from the first step's modality so the
          // finalize job and parent row land on the correct queue.
          const firstModality =
            TOOLS.find((t) => t.id === parsedSteps[0].resolvedToolId)?.modality ?? "image";
          const pipelinePool: Pool = MODALITY_POOL[firstModality];

          // Build the nested FlowJob tree
          const { tree, stepJobIds } = buildPipelineFlowTree({
            jobId,
            userId,
            parsedSteps,
            uploadKey,
            filename,
            pipelinePool,
            clientJobId: clientJobId ?? jobId,
            analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
          });

          // Insert all durable rows before adding the flow. enqueueToolJob
          // inserts row-then-add; for flows we insert ALL rows first, then
          // one flow.add.
          for (let i = 0; i < parsedSteps.length; i++) {
            await db.insert(schema.jobs).values({
              id: stepJobIds[i],
              userId,
              toolId: parsedSteps[i].resolvedToolId,
              pool: parsedSteps[i].pool,
              type: "pipeline-step",
              status: "queued",
              inputRefs: i === 0 ? [uploadKey] : [],
              settings: parsedSteps[i].parsedSettings as Record<string, unknown>,
            });
          }

          await db.insert(schema.jobs).values({
            id: jobId,
            userId,
            toolId: "pipeline",
            pool: pipelinePool,
            type: "pipeline",
            status: "queued",
            inputRefs: [],
            settings: {},
          });

          // Inject OTel trace context into every node of the flow tree
          injectTraceContextIntoFlow(tree);

          // Add the flow to BullMQ
          await getFlowProducer().add(tree);
          uncommittedOcrKey = undefined;

          // Wait for the finalize job (pipelines block to completion)
          try {
            const result = await waitForJob(pipelinePool, jobId, 10 * 60_000);

            if (!result) {
              return reply.status(422).send({
                error: "Pipeline processing timed out",
              });
            }

            // Check for step failure reported by the finalize handler
            if (result.resultPayload?.error) {
              return reply.status(422).send({
                error: result.resultPayload.error as string,
                completedSteps: result.resultPayload.steps,
              });
            }

            return reply.send({
              jobId,
              downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
              previewUrl: result.previewRef
                ? `/api/v1/download/${jobId}/${result.previewRef.split("/").pop()}`
                : undefined,
              originalSize,
              processedSize: result.processedSize,
              stepsCompleted: result.resultPayload?.stepsCompleted ?? parsedSteps.length,
              steps: result.resultPayload?.steps ?? [],
            });
          } catch (err) {
            return reply.status(422).send({
              error: err instanceof Error ? err.message : "Pipeline processing failed",
            });
          }
        } finally {
          request.raw.removeListener("aborted", abortIngress);
          if (uncommittedOcrKey) await deleteObject(uncommittedOcrKey).catch(() => {});
        }
      });
    },
  );

  /**
   * POST /api/v1/pipeline/save
   *
   * Save a named pipeline definition for later reuse.
   */
  app.post(
    "/api/v1/pipeline/save",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const body = request.body as unknown;
      const result = savePipelineSchema.safeParse(body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid pipeline definition",
          details: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { name, description, steps } = result.data;

      // Validate all tool IDs exist
      for (let i = 0; i < steps.length; i++) {
        if (PASSWORD_TOOLS.has(steps[i].toolId)) {
          return reply.status(400).send({
            error: `This tool cannot be used in saved pipelines because it requires a password`,
          });
        }
        const toolConfig = getToolConfig(steps[i].toolId);
        if (!toolConfig) {
          return reply.status(400).send({
            error: `Step ${i + 1}: Tool "${steps[i].toolId}" not found`,
          });
        }
        if (!(await hasEffectiveToolAccess(user, steps[i].toolId))) {
          return reply.status(403).send({
            error: `Step ${i + 1}: You don't have permission to use this tool`,
          });
        }
      }

      const id = randomUUID();

      try {
        await db.insert(schema.pipelines).values({
          id,
          userId: user.id,
          name,
          description: description ?? null,
          steps,
        });
      } catch {
        return reply.status(409).send({ error: "Failed to save pipeline" });
      }

      return reply.status(201).send({
        id,
        name,
        description: description ?? null,
        steps,
        createdAt: new Date().toISOString(),
      });
    },
  );

  /**
   * GET /api/v1/pipeline/list
   *
   * List all saved pipelines.
   */
  app.get(
    "/api/v1/pipeline/list",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      // Admins see all pipelines; regular users see their own + legacy (no owner)
      const allRows = await db.select().from(schema.pipelines);
      const rows = (await hasEffectivePermission(user, "pipelines:all"))
        ? allRows
        : allRows.filter((row) => !row.userId || row.userId === user.id);

      const pipelines = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        steps: row.steps,
        createdAt: row.createdAt.toISOString(),
      }));

      return reply.send({ pipelines });
    },
  );

  /**
   * DELETE /api/v1/pipeline/:id
   *
   * Delete a saved pipeline by its ID.
   */
  app.delete(
    "/api/v1/pipeline/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(schema.pipelines)
        .where(eq(schema.pipelines.id, id));

      if (!existing) {
        return reply.status(404).send({ error: "Pipeline not found" });
      }

      // Only the owner (or admin) can delete; legacy pipelines (no owner) can be deleted by anyone
      if (
        existing.userId &&
        existing.userId !== user.id &&
        !(await hasEffectivePermission(user, "pipelines:all"))
      ) {
        return reply.status(403).send({ error: "Not authorized to delete this pipeline" });
      }

      await db.delete(schema.pipelines).where(eq(schema.pipelines.id, id));

      return reply.send({ ok: true });
    },
  );

  /**
   * GET /api/v1/pipeline/tools
   *
   * Returns the IDs of tools that can be used as pipeline steps.
   * Only tools registered via createToolRoute() support pipeline execution.
   */
  app.get("/api/v1/pipeline/tools", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ toolIds: getRegisteredToolIds() });
  });

  /**
   * POST /api/v1/pipeline/batch
   *
   * Accepts multipart with multiple files + a "pipeline" JSON field.
   * Each file is processed through the full pipeline via a per-file
   * FlowProducer chain. All chains are children of a single
   * batch-finalize parent. Returns a ZIP containing all results.
   */
  app.post(
    "/api/v1/pipeline/batch",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = requireAuth(request, reply);
      if (!authUser) return;

      return withRouteScratch("pipeline-batch", async (scratchDir) => {
        const ingressAbort = new AbortController();
        const abortIngress = () => ingressAbort.abort();
        const uncommittedOcrKeys = new Set<string>();
        request.raw.once("aborted", abortIngress);
        if (request.raw.aborted) ingressAbort.abort();
        try {
          // ── Parse multipart ──────────────────────────────────────────────
          const files: SpooledMultipartFile[] = [];
          let pipelineRaw: string | null = null;
          let clientJobId: string | null = null;
          let filePartIndex = 0;
          let totalStagedBytes = 0;

          try {
            // The pipeline field is allowed after its files. Until its first step
            // is known, provisionally enforce OCR's per-file and aggregate caps so
            // a pipeline-last request cannot consume unbounded scratch storage.
            // Large non-OCR callers can put the pipeline field first.
            const parts = request.parts();
            for await (const part of parts) {
              if (part.type === "file") {
                const knownFirstToolId = firstPipelineToolId(pipelineRaw);
                const knownOcrLimits =
                  knownFirstToolId === undefined ||
                  knownFirstToolId === "ocr" ||
                  knownFirstToolId === "ocr-pdf"
                    ? resolveOcrUploadLimits(env.MAX_UPLOAD_SIZE_MB)
                    : undefined;
                const remainingAggregate =
                  (knownOcrLimits?.aggregateBytes ?? Number.MAX_SAFE_INTEGER) - totalStagedBytes;
                const file = await spoolMultipartFile(part, scratchDir, filePartIndex, {
                  maxBytes: Math.min(
                    configuredUploadLimit(env.MAX_UPLOAD_SIZE_MB) ?? Number.MAX_SAFE_INTEGER,
                    knownOcrLimits?.fileBytes ?? Number.MAX_SAFE_INTEGER,
                    Math.max(0, remainingAggregate),
                  ),
                  signal: ingressAbort.signal,
                });
                if (file.size > 0) files.push(file);
                totalStagedBytes += file.size;
                filePartIndex++;
              } else if (part.fieldname === "pipeline") {
                pipelineRaw = part.value as string;
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

          // ── Parse and validate pipeline definition ───────────────────────
          if (!pipelineRaw) {
            return reply.status(400).send({ error: "No pipeline definition provided" });
          }

          let pipeline: z.infer<typeof pipelineDefinitionSchema>;
          try {
            const parsed = JSON.parse(pipelineRaw);
            const result = pipelineDefinitionSchema.safeParse(parsed);
            if (!result.success) {
              return reply.status(400).send({
                error: "Invalid pipeline definition",
                details: formatZodErrors(result.error.issues),
              });
            }
            pipeline = result.data;
          } catch {
            return reply.status(400).send({ error: "Pipeline must be valid JSON" });
          }

          // Validate all tool IDs and settings
          const parsedSteps: ParsedStep[] = [];

          for (let i = 0; i < pipeline.steps.length; i++) {
            const step = pipeline.steps[i];

            const resolvedToolId =
              step.toolId === "resize" && step.settings?.contentAware
                ? "content-aware-resize"
                : step.toolId;

            const toolConfig = getToolConfig(resolvedToolId);
            if (!toolConfig) {
              return reply.status(400).send({
                error: `Step ${i + 1}: Tool "${step.toolId}" not found`,
              });
            }
            if (!(await hasEffectiveToolAccess(authUser, resolvedToolId))) {
              return reply.status(403).send({
                error: `Step ${i + 1} (${step.toolId}): You don't have permission to use this tool`,
              });
            }

            if (PASSWORD_TOOLS.has(step.toolId)) {
              return reply.status(400).send({
                error: `Step ${i + 1}: This tool cannot be used in pipelines because it requires a password`,
              });
            }

            const settingsResult = toolConfig.settingsSchema.safeParse(step.settings);
            if (!settingsResult.success) {
              return reply.status(400).send({
                error: `Step ${i + 1} (${step.toolId}): Invalid settings`,
                details: settingsResult.error.issues.map(
                  (iss: { path: (string | number)[]; message: string }) => ({
                    path: iss.path.join("."),
                    message: iss.message,
                  }),
                ),
              });
            }

            const ocrResolution = resolveOcrIngressSettings(resolvedToolId, settingsResult.data, {
              requestedSettings: step.settings,
            });
            if (!ocrResolution.ok) {
              const bundle = FEATURE_BUNDLES.ocr;
              return reply.status(501).send({
                error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is ${
                  ocrResolution.code === "FEATURE_INCOMPATIBLE" ? "incompatible" : "not installed"
                }`,
                code: ocrResolution.code,
                feature: "ocr",
                featureName: bundle?.name ?? resolvedToolId,
                requestedQuality: ocrResolution.requestedQuality,
                compatibilityReason: ocrResolution.reason,
                ...(ocrResolution.guidance && { guidance: ocrResolution.guidance }),
              });
            }

            // Keep the validation order identical to single-file pipelines.
            const missingBundleId = getFirstMissingBundleForTool(resolvedToolId);
            if (missingBundleId) {
              const bundle = FEATURE_BUNDLES[missingBundleId];
              return reply.status(501).send({
                error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is not installed`,
                code: "FEATURE_NOT_INSTALLED",
                feature: missingBundleId,
                featureName: bundle?.name ?? resolvedToolId,
              });
            }

            if (env.MAX_PIPELINE_STEP_PIXELS > 0) {
              const s = ocrResolution.settings as Record<string, unknown>;
              const w = Number(s.width) || 0;
              const h = Number(s.height) || 0;
              if (w > 0 && h > 0 && w * h > env.MAX_PIPELINE_STEP_PIXELS) {
                return reply.status(400).send({
                  error: `Step ${i + 1} (${step.toolId}): Output dimensions ${w}x${h} exceed per-step pixel limit`,
                });
              }
            }

            parsedSteps.push({
              toolId: step.toolId,
              resolvedToolId,
              parsedSettings: ocrResolution.settings,
              pool: resolveToolPool(resolvedToolId),
            });
          }

          if (
            parsedSteps[0]?.resolvedToolId === "ocr" ||
            parsedSteps[0]?.resolvedToolId === "ocr-pdf"
          ) {
            const violation = findOcrEncodedInputViolation(
              files.map((file) => file.size),
              env.MAX_UPLOAD_SIZE_MB,
            );
            if (violation) {
              return reply.status(413).send({
                error: `OCR pipeline input exceeds the ${violation.limitBytes} byte ${violation.scope} safety limit`,
              });
            }
          }

          // ── Prepare files and build flow ─────────────────────────────────
          const parentId = clientJobId || randomUUID();
          const userId = authUser.id;

          // Insert batch-finalize row BEFORE updateJobProgress to avoid
          // a duplicate-key race with the progress persist layer.
          await db.insert(schema.jobs).values({
            id: parentId,
            userId,
            toolId: "pipeline-batch",
            pool: "system",
            type: "batch",
            status: "queued",
            inputRefs: [],
            settings: { flowChildCount: 0 },
          });

          // Emit initial batch progress
          updateJobProgress({
            jobId: parentId,
            status: "processing",
            totalFiles: files.length,
            completedFiles: 0,
            failedFiles: 0,
            errors: [],
          });

          // Validate, decode, and upload each file; build per-file pipeline chains
          const perFileChildren: FlowJob[] = [];
          const preFailures: Array<{ originalIndex: number; filename: string; error: string }> = [];
          let flowChildIndex = 0;

          // The first step's modality drives input validation for every file, so
          // audio, video, and document pipelines are not rejected by the image
          // validator.
          const batchModality =
            TOOLS.find((t) => t.id === pipeline.steps[0]?.toolId)?.modality ?? "image";
          const batchPipelinePool: Pool = MODALITY_POOL[batchModality];
          const pathBackedOcrPdf = parsedSteps[0]?.resolvedToolId === "ocr-pdf";
          for (let fi = 0; fi < files.length; fi++) {
            const file = files[fi];
            let processFilename = file.filename;
            const perFileJobId = `${parentId}-f${flowChildIndex}`;
            let uploadKey = `uploads/${perFileJobId}-s0/${processFilename}`;

            if (pathBackedOcrPdf) {
              try {
                await storeValidatedOcrPdf(file, uploadKey, {
                  maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
                  signal: ingressAbort.signal,
                });
                uncommittedOcrKeys.add(uploadKey);
              } catch (err) {
                if (err instanceof InputValidationError) {
                  preFailures.push({
                    originalIndex: fi,
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
              let processBuffer: Buffer = await readFile(file.path);
              await rm(file.path, { force: true }).catch(() => {});
              if (batchModality === "image" && parsedSteps[0]?.resolvedToolId === "ocr") {
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
                      originalIndex: fi,
                      filename: file.filename,
                      error: err.message,
                    });
                    continue;
                  }
                  throw err;
                }
              } else if (batchModality === "image") {
                const fileValidation = await validateImageBuffer(processBuffer, processFilename);
                if (!fileValidation.valid) {
                  preFailures.push({
                    originalIndex: fi,
                    filename: file.filename,
                    error: `Invalid image: ${fileValidation.reason}`,
                  });
                  continue;
                }

                if (fileValidation.format === "heif") {
                  try {
                    processBuffer = await decodeHeic(processBuffer);
                    const ext = processFilename.match(/\.[^.]+$/)?.[0];
                    if (ext) processFilename = `${processFilename.slice(0, -ext.length)}.png`;
                  } catch {
                    preFailures.push({
                      originalIndex: fi,
                      filename: file.filename,
                      error: "Failed to decode HEIC file",
                    });
                    continue;
                  }
                }

                if (needsCliDecode(fileValidation.format)) {
                  try {
                    const fileExt = processFilename.split(".").pop()?.toLowerCase();
                    processBuffer = await decodeToSharpCompat(
                      processBuffer,
                      fileValidation.format,
                      fileExt,
                    );
                    const ext = processFilename.match(/\.[^.]+$/)?.[0];
                    if (ext) processFilename = `${processFilename.slice(0, -ext.length)}.png`;
                  } catch {
                    // Fall through -- tool might handle it
                  }
                }

                if (isSvgBuffer(processBuffer)) {
                  processBuffer = sanitizeSvg(processBuffer);
                } else {
                  processBuffer = await autoOrient(processBuffer);
                }
              } else {
                try {
                  const prepared = await inputHandlerFor(batchModality).prepare(
                    processBuffer,
                    processFilename,
                    {
                      scratchDir,
                      lenient: getToolConfig(pipeline.steps[0]?.toolId ?? "")
                        ?.skipStructuralValidation,
                    },
                  );
                  processBuffer = prepared.buffer;
                  processFilename = prepared.filename;
                } catch (err) {
                  if (err instanceof InputValidationError) {
                    preFailures.push({
                      originalIndex: fi,
                      filename: file.filename,
                      error: err.message,
                    });
                    continue;
                  }
                  throw err;
                }
              }

              uploadKey = `uploads/${perFileJobId}-s0/${processFilename}`;
              await putObject(uploadKey, processBuffer);
            }

            // Build per-file pipeline chain
            const { tree: perFileTree, stepJobIds } = buildPipelineFlowTree({
              jobId: perFileJobId,
              userId,
              parsedSteps,
              uploadKey,
              filename: processFilename,
              pipelinePool: batchPipelinePool,
              parentId,
              totalFiles: files.length,
              analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
            });

            // Insert step + finalize rows for this file
            for (let si = 0; si < parsedSteps.length; si++) {
              await db.insert(schema.jobs).values({
                id: stepJobIds[si],
                userId,
                toolId: parsedSteps[si].resolvedToolId,
                pool: parsedSteps[si].pool,
                type: "pipeline-step",
                status: "queued",
                inputRefs: si === 0 ? [uploadKey] : [],
                settings: parsedSteps[si].parsedSettings as Record<string, unknown>,
              });
            }

            await db.insert(schema.jobs).values({
              id: perFileJobId,
              userId,
              toolId: "pipeline",
              pool: batchPipelinePool,
              type: "pipeline-finalize",
              status: "queued",
              inputRefs: [],
              settings: {},
            });

            perFileChildren.push(perFileTree);
            flowChildIndex++;
          }

          // Record pre-failures in batch progress
          for (const pf of preFailures) {
            await recordChildOutcome(parentId, files.length, pf.filename, pf.error);
          }

          if (perFileChildren.length === 0) {
            // All files failed validation
            return reply.status(422).send({
              error: "All files failed processing",
              errors: preFailures.map((f) => ({ filename: f.filename, error: f.error })),
            });
          }

          // Build batch-finalize parent
          const batchTree: FlowJob = {
            name: "batch-finalize",
            queueName: queueName("system"),
            data: {
              kind: "batch-finalize",
              jobId: parentId,
              toolId: "pipeline-batch",
              userId,
              pool: "system" as Pool,
              totalFiles: files.length,
              inputRefs: [],
              filename: "",
              settings: { flowChildCount: perFileChildren.length },
              analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
            } satisfies ToolJobData,
            opts: { jobId: parentId, attempts: 1 },
            children: perFileChildren,
          };

          // Update the parent row with the final flow child count
          await db
            .update(schema.jobs)
            .set({ settings: { flowChildCount: perFileChildren.length } })
            .where(eq(schema.jobs.id, parentId));

          // Inject OTel trace context into every node of the batch flow tree
          injectTraceContextIntoFlow(batchTree);

          await getFlowProducer().add(batchTree);
          uncommittedOcrKeys.clear();

          // Wait for batch completion
          const batchResult = await waitForJob("system", parentId, 30 * 60_000);

          if (!batchResult) {
            return reply.status(422).send({ error: "Pipeline batch processing timed out" });
          }

          const manifest = (batchResult.resultPayload?.manifest ?? []) as Array<{
            index: number;
            filename: string;
            outputRef?: string;
            error?: string;
          }>;

          // Combine manifest with pre-failures
          const allResults: Array<{
            originalIndex: number;
            filename: string;
            outputRef?: string;
            error?: string;
          }> = [];

          // Map flow indices back to original file indices
          let fci = 0;
          for (let fi = 0; fi < files.length; fi++) {
            const pf = preFailures.find((p) => p.originalIndex === fi);
            if (pf) {
              allResults.push({
                originalIndex: fi,
                filename: pf.filename,
                error: pf.error,
              });
            } else {
              const entry = manifest.find((m) => m.index === fci);
              if (entry) {
                allResults.push({
                  originalIndex: fi,
                  filename: entry.filename,
                  outputRef: entry.outputRef,
                  error: entry.error,
                });
              }
              fci++;
            }
          }

          // Deduplicate output filenames
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

          const successEntries = allResults.filter((r) => r.outputRef);
          const failedEntries = allResults.filter((r) => !r.outputRef);

          if (successEntries.length === 0) {
            return reply.status(422).send({
              error: "All files failed processing",
              errors: failedEntries.map((f) => ({
                filename: f.filename,
                error: f.error ?? "Failed",
              })),
            });
          }

          const fileResultsMap: Record<string, string> = {};
          for (const entry of successEntries) {
            const uniqueName = getUniqueName(entry.filename);
            entry.filename = uniqueName;
            fileResultsMap[String(entry.originalIndex)] = uniqueName;
          }

          // ── Stream ZIP response ──────────────────────────────────────────
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="pipeline-batch-${parentId.slice(0, 8)}.zip"`,
            "Transfer-Encoding": "chunked",
            "X-Job-Id": parentId,
            "X-File-Results": encodeURIComponent(JSON.stringify(fileResultsMap)),
            ...getSecurityHeaders(),
          });

          const archive = archiver("zip", { zlib: { level: 5 } });

          archive.on("error", (err) => {
            request.log.error({ err }, "Archiver error during pipeline batch processing");
            if (!reply.raw.writableEnded) {
              reply.raw.end();
            }
          });

          archive.pipe(reply.raw);

          // Append results from object storage in original upload order
          try {
            for (const entry of successEntries) {
              if (!entry.outputRef) continue;
              const stream = await getObjectStream(entry.outputRef);
              archive.append(stream, { name: entry.filename });
            }

            await archive.finalize();
          } catch (err) {
            request.log.error(
              { err },
              "Failed to stream ZIP entries during pipeline batch processing",
            );
            archive.abort();
            if (!reply.raw.writableEnded) {
              reply.raw.end();
            }
          }
        } finally {
          request.raw.removeListener("aborted", abortIngress);
          await Promise.all(
            [...uncommittedOcrKeys].map((key) => deleteObject(key).catch(() => {})),
          );
        }
      });
    },
  );

  app.log.info("Pipeline routes registered");
}
