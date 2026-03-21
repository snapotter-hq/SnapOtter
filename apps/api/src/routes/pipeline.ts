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
import { join, basename } from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getToolConfig } from "./tool-factory.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { createWorkspace } from "../lib/workspace.js";
import { db, schema } from "../db/index.js";

/** Schema for a single pipeline step. */
const pipelineStepSchema = z.object({
  toolId: z.string(),
  settings: z.record(z.unknown()).default({}),
});

/** Schema for a full pipeline definition. */
const pipelineDefinitionSchema = z.object({
  steps: z.array(pipelineStepSchema).min(1, "Pipeline must have at least one step"),
});

/** Schema for saving a pipeline. */
const savePipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required").max(100),
  description: z.string().max(500).optional(),
  steps: z.array(pipelineStepSchema).min(1, "Pipeline must have at least one step"),
});

/**
 * Sanitize a filename to prevent path traversal attacks.
 */
function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "image";
  }
  return name;
}

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
  app.post(
    "/api/v1/pipeline/execute",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
            details: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          });
        }
        pipeline = result.data;
      } catch {
        return reply.status(400).send({ error: "Pipeline must be valid JSON" });
      }

      // Validate all tool IDs exist before starting
      for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        const toolConfig = getToolConfig(step.toolId);
        if (!toolConfig) {
          return reply.status(400).send({
            error: `Step ${i + 1}: Tool "${step.toolId}" not found`,
          });
        }

        // Validate the settings for this tool
        const settingsResult = toolConfig.settingsSchema.safeParse(step.settings);
        if (!settingsResult.success) {
          return reply.status(400).send({
            error: `Step ${i + 1} (${step.toolId}): Invalid settings`,
            details: settingsResult.error.issues.map((iss: { path: (string | number)[]; message: string }) => ({
              path: iss.path.join("."),
              message: iss.message,
            })),
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
          const toolConfig = getToolConfig(step.toolId)!;

          // Parse settings through the schema to apply defaults
          const settings = toolConfig.settingsSchema.parse(step.settings);

          const result = await toolConfig.process(currentBuffer, settings, currentFilename);

          stepResults.push({
            step: i + 1,
            toolId: step.toolId,
            size: result.buffer.length,
          });

          currentBuffer = result.buffer;
          currentFilename = result.filename;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Pipeline processing failed";
        return reply.status(422).send({
          error: "Pipeline processing failed",
          details: message,
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
    },
  );

  /**
   * POST /api/v1/pipeline/save
   *
   * Save a named pipeline definition for later reuse.
   */
  app.post(
    "/api/v1/pipeline/save",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
  );

  /**
   * GET /api/v1/pipeline/list
   *
   * List all saved pipelines.
   */
  app.get(
    "/api/v1/pipeline/list",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const rows = db.select().from(schema.pipelines).all();

      const pipelines = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        steps: JSON.parse(row.steps),
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
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      const existing = db
        .select()
        .from(schema.pipelines)
        .where(eq(schema.pipelines.id, id))
        .get();

      if (!existing) {
        return reply.status(404).send({ error: "Pipeline not found" });
      }

      db.delete(schema.pipelines)
        .where(eq(schema.pipelines.id, id))
        .run();

      return reply.send({ ok: true });
    },
  );

  app.log.info("Pipeline routes registered");
}
