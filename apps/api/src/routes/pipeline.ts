/**
 * Pipeline execution, save, list, and delete routes.
 *
 * POST   /api/v1/pipeline/execute  — Execute a pipeline (array of tool steps)
 * POST   /api/v1/pipeline/save     — Save a pipeline definition
 * GET    /api/v1/pipeline/list      — List saved pipelines
 * DELETE /api/v1/pipeline/:id       — Delete a saved pipeline
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@ashim/shared";
import archiver from "archiver";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import PQueue from "p-queue";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { autoOrient } from "../lib/auto-orient.js";
import { formatZodErrors } from "../lib/errors.js";
import { isToolInstalled } from "../lib/feature-status.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { createWorkspace } from "../lib/workspace.js";
import { requireAuth } from "../plugins/auth.js";
import { type JobProgress, updateJobProgress } from "./progress.js";
import { getRegisteredToolIds, getToolConfig } from "./tool-factory.js";

/** Schema for a single pipeline step. */
const pipelineStepSchema = z.object({
  toolId: z.string(),
  settings: z.record(z.unknown()).default({}),
});

/** Schema for a full pipeline definition. */
const pipelineDefinitionSchema = z.object({
  steps: z
    .array(pipelineStepSchema)
    .min(1, "Pipeline must have at least one step")
    .max(20, "Pipeline cannot exceed 20 steps"),
});

/** Schema for saving a pipeline. */
const savePipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required").max(255),
  description: z.string().max(2000).optional(),
  steps: z
    .array(pipelineStepSchema)
    .min(1, "Pipeline must have at least one step")
    .max(20, "Pipeline cannot exceed 20 steps"),
});

export async function registerPipelineRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/pipeline/execute
   *
   * Accepts multipart with:
   *   - A file part (the image to process)
   *   - A "pipeline" field containing JSON: { steps: [{ toolId, settings }, ...] }
   *
   * Processes the image through each step sequentially.
   * The output of step N becomes the input of step N+1.
   * Returns the final processed image for download.
   */
  app.post("/api/v1/pipeline/execute", async (request: FastifyRequest, reply: FastifyReply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "image";
    let pipelineRaw: string | null = null;

    // Parse multipart
    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          filename = sanitizeFilename(part.filename ?? "image");
        } else if (part.fieldname === "pipeline") {
          pipelineRaw = part.value as string;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    // Validate the initial image
    const validation = await validateImageBuffer(fileBuffer);
    if (!validation.valid) {
      return reply.status(400).send({
        error: `Invalid image: ${validation.reason}`,
      });
    }

    // Decode HEIC/HEIF input via system heif-dec
    if (validation.format === "heif") {
      try {
        fileBuffer = await decodeHeic(fileBuffer);
        // Update filename extension to match the decoded format
        const ext = filename.match(/\.[^.]+$/)?.[0];
        if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
      } catch (err) {
        return reply.status(422).send({
          error: "Failed to decode HEIC file. Ensure libheif-examples is installed.",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Normalize EXIF orientation before passing to pipeline steps
    fileBuffer = await autoOrient(fileBuffer);

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

    // Validate all tool IDs exist before starting
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

      // Guard: check if the tool's AI feature bundle is installed
      if (!isToolInstalled(resolvedToolId)) {
        const bundle = getBundleForTool(resolvedToolId);
        return reply.status(501).send({
          error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is not installed`,
          code: "FEATURE_NOT_INSTALLED",
          feature: TOOL_BUNDLE_MAP[resolvedToolId],
          featureName: bundle?.name ?? resolvedToolId,
        });
      }

      // Validate the settings for this tool
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
    }

    // Execute the pipeline: pass the buffer through each step sequentially
    let currentBuffer = fileBuffer;
    let currentFilename = filename;
    const stepResults: Array<{ step: number; toolId: string; size: number }> = [];

    try {
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

        try {
          const settings = toolConfig.settingsSchema.parse(step.settings);
          const result = await toolConfig.process(currentBuffer, settings, currentFilename);

          stepResults.push({
            step: i + 1,
            toolId: step.toolId,
            size: result.buffer.length,
          });

          currentBuffer = result.buffer;
          currentFilename = result.filename;
        } catch (stepErr) {
          const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
          throw new Error(`Step ${i + 1} (${step.toolId}): ${msg}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline processing failed";
      return reply.status(422).send({
        error: message,
        completedSteps: stepResults,
      });
    }

    // Save the final output to workspace
    const jobId = randomUUID();
    const workspacePath = await createWorkspace(jobId);
    const outputPath = join(workspacePath, "output", currentFilename);
    await writeFile(outputPath, currentBuffer);

    // Also save the original input for reference
    const inputPath = join(workspacePath, "input", filename);
    await writeFile(inputPath, fileBuffer);

    return reply.send({
      jobId,
      downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(currentFilename)}`,
      originalSize: fileBuffer.length,
      processedSize: currentBuffer.length,
      stepsCompleted: stepResults.length,
      steps: stepResults,
    });
  });

  /**
   * POST /api/v1/pipeline/save
   *
   * Save a named pipeline definition for later reuse.
   */
  app.post("/api/v1/pipeline/save", async (request: FastifyRequest, reply: FastifyReply) => {
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
      const toolConfig = getToolConfig(steps[i].toolId);
      if (!toolConfig) {
        return reply.status(400).send({
          error: `Step ${i + 1}: Tool "${steps[i].toolId}" not found`,
        });
      }
    }

    const id = randomUUID();

    db.insert(schema.pipelines)
      .values({
        id,
        userId: user.id,
        name,
        description: description ?? null,
        steps: JSON.stringify(steps),
      })
      .run();

    return reply.status(201).send({
      id,
      name,
      description: description ?? null,
      steps,
      createdAt: new Date().toISOString(),
    });
  });

  /**
   * GET /api/v1/pipeline/list
   *
   * List all saved pipelines.
   */
  app.get("/api/v1/pipeline/list", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    // Admins see all pipelines; regular users see their own + legacy (no owner)
    const allRows = db.select().from(schema.pipelines).all();
    const rows =
      user.role === "admin"
        ? allRows
        : allRows.filter((row) => !row.userId || row.userId === user.id);

    const pipelines = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      steps: JSON.parse(row.steps),
      createdAt: row.createdAt.toISOString(),
    }));

    return reply.send({ pipelines });
  });

  /**
   * DELETE /api/v1/pipeline/:id
   *
   * Delete a saved pipeline by its ID.
   */
  app.delete(
    "/api/v1/pipeline/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      const existing = db.select().from(schema.pipelines).where(eq(schema.pipelines.id, id)).get();

      if (!existing) {
        return reply.status(404).send({ error: "Pipeline not found" });
      }

      // Only the owner (or admin) can delete; legacy pipelines (no owner) can be deleted by anyone
      if (existing.userId && existing.userId !== user.id && user.role !== "admin") {
        return reply.status(403).send({ error: "Not authorized to delete this pipeline" });
      }

      db.delete(schema.pipelines).where(eq(schema.pipelines.id, id)).run();

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
   * Runs the full pipeline on each file with concurrency control via p-queue.
   * Returns a ZIP containing all processed results.
   */
  app.post("/api/v1/pipeline/batch", async (request: FastifyRequest, reply: FastifyReply) => {
    // ── Parse multipart ──────────────────────────────────────────────
    interface ParsedFile {
      buffer: Buffer;
      filename: string;
    }

    const files: ParsedFile[] = [];
    let pipelineRaw: string | null = null;
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
        } else if (part.fieldname === "pipeline") {
          pipelineRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          clientJobId = part.value as string;
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
    if (files.length > env.MAX_BATCH_SIZE) {
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

    // Validate all tool IDs exist and settings are valid before processing
    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      const toolConfig = getToolConfig(step.toolId);
      if (!toolConfig) {
        return reply.status(400).send({
          error: `Step ${i + 1}: Tool "${step.toolId}" not found`,
        });
      }

      // Guard: check if the tool's AI feature bundle is installed
      if (!isToolInstalled(step.toolId)) {
        const bundle = getBundleForTool(step.toolId);
        return reply.status(501).send({
          error: `Step ${i + 1} (${step.toolId}): Feature "${bundle?.name}" is not installed`,
          code: "FEATURE_NOT_INSTALLED",
          feature: TOOL_BUNDLE_MAP[step.toolId],
          featureName: bundle?.name ?? step.toolId,
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
    }

    // ── Progress tracking ────────────────────────────────────────────
    const jobId = clientJobId || randomUUID();

    const progress: JobProgress = {
      jobId,
      status: "processing",
      totalFiles: files.length,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    };
    updateJobProgress({ ...progress });

    // ── Process files through the pipeline with concurrency control ──
    const queue = new PQueue({ concurrency: env.CONCURRENT_JOBS });

    const results: ({ buffer: Buffer; filename: string } | null)[] = new Array(files.length).fill(
      null,
    );

    try {
      const tasks = files.map((file, index) =>
        queue.add(async () => {
          progress.currentFile = file.filename;
          updateJobProgress({ ...progress });

          // Validate the image
          const validation = await validateImageBuffer(file.buffer);
          if (!validation.valid) {
            progress.failedFiles++;
            progress.errors.push({
              filename: file.filename,
              error: `Invalid image: ${validation.reason}`,
            });
            progress.completedFiles++;
            updateJobProgress({ ...progress });
            return;
          }

          try {
            let currentBuffer = file.buffer;
            let currentFilename = file.filename;

            // Decode HEIC/HEIF if needed
            if (validation.format === "heif") {
              currentBuffer = await decodeHeic(currentBuffer);
              const ext = currentFilename.match(/\.[^.]+$/)?.[0];
              if (ext) currentFilename = `${currentFilename.slice(0, -ext.length)}.png`;
            }

            // Normalize EXIF orientation
            currentBuffer = await autoOrient(currentBuffer);

            // Run through all pipeline steps sequentially
            for (let i = 0; i < pipeline.steps.length; i++) {
              const step = pipeline.steps[i];

              // Route content-aware resize to its dedicated tool
              const resolvedToolId =
                step.toolId === "resize" && step.settings?.contentAware
                  ? "content-aware-resize"
                  : step.toolId;

              const toolConfig = getToolConfig(resolvedToolId);
              if (!toolConfig) {
                throw new Error(`Step ${i + 1} (${step.toolId}): Tool not found or not available`);
              }

              try {
                const settings = toolConfig.settingsSchema.parse(step.settings);
                const result = await toolConfig.process(currentBuffer, settings, currentFilename);
                currentBuffer = result.buffer;
                currentFilename = result.filename;
              } catch (stepErr) {
                const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
                throw new Error(`Step ${i + 1} (${step.toolId}): ${msg}`);
              }
            }

            results[index] = { buffer: currentBuffer, filename: currentFilename };

            progress.completedFiles++;
            updateJobProgress({ ...progress });
          } catch (err) {
            progress.failedFiles++;
            progress.errors.push({
              filename: file.filename,
              error: err instanceof Error ? err.message : "Pipeline processing failed",
            });
            progress.completedFiles++;
            updateJobProgress({ ...progress });
          }
        }),
      );

      await Promise.all(tasks);
    } catch (err) {
      request.log.error({ err }, "Unexpected error in pipeline batch queue");
    }

    // ── Finalize progress ────────────────────────────────────────────
    progress.status = progress.failedFiles === progress.totalFiles ? "failed" : "completed";
    progress.currentFile = undefined;
    updateJobProgress({ ...progress });

    // ── Deduplicate output filenames ─────────────────────────────────
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
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    // If every file failed, return an error instead of an empty ZIP
    if (progress.status === "failed") {
      return reply.status(422).send({
        error: "All files failed processing",
        errors: progress.errors,
      });
    }

    // ── Stream ZIP response ──────────────────────────────────────────
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="pipeline-batch-${jobId.slice(0, 8)}.zip"`,
      "Transfer-Encoding": "chunked",
      "X-Job-Id": jobId,
      "X-File-Results": JSON.stringify(fileResultsMap),
    });

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("error", (err) => {
      request.log.error({ err }, "Archiver error during pipeline batch processing");
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    });

    archive.pipe(reply.raw);

    // Append results in original upload order
    for (const result of results) {
      if (result) {
        archive.append(result.buffer, { name: result.filename });
      }
    }

    await archive.finalize();
  });

  app.log.info("Pipeline routes registered");
}
