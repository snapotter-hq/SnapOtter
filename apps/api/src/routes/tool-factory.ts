import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createWorkspace } from "../lib/workspace.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";

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

/**
 * In-memory registry of all tool configs, keyed by toolId.
 * Populated by createToolRoute() calls; used by batch processing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolRegistry = new Map<string, ToolRouteConfig<any>>();

/**
 * Retrieve a registered tool config by its ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolConfig(toolId: string): ToolRouteConfig<any> | undefined {
  return toolRegistry.get(toolId);
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
export function createToolRoute<T>(
  app: FastifyInstance,
  config: ToolRouteConfig<T>,
): void {
  // Register in the tool registry for batch processing
  toolRegistry.set(config.toolId, config);

  app.post(
    `/api/v1/tools/${config.toolId}`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;

      // Parse multipart parts
      try {
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === "file") {
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
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      // Require a file
      if (!fileBuffer || fileBuffer.length === 0) {
        return reply
          .status(400)
          .send({ error: "No image file provided" });
      }

      // Validate the uploaded image
      const validation = await validateImageBuffer(fileBuffer);
      if (!validation.valid) {
        return reply
          .status(400)
          .send({ error: `Invalid image: ${validation.reason}` });
      }

      // Parse and validate settings
      let settings: T;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = config.settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({
            error: "Invalid settings",
            details: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      // Process the image
      try {
        const result = await config.process(fileBuffer, settings, filename);

        // Create workspace and save output
        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const outputPath = join(workspacePath, "output", result.filename);
        await writeFile(outputPath, result.buffer);

        // Also save the original input for reference/download
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
          originalSize: fileBuffer.length,
          processedSize: result.buffer.length,
        });
      } catch (err) {
        // Catch Sharp / processing errors and return a clean API error
        const message = err instanceof Error ? err.message : "Image processing failed";
        request.log.error({ err, toolId: config.toolId }, "Tool processing failed");
        return reply.status(422).send({
          error: "Processing failed",
          details: process.env.NODE_ENV === "production" ? undefined : message,
        });
      }
    },
  );
}
