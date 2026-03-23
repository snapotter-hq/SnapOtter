/**
 * Batch processing route.
 *
 * POST /api/v1/tools/:toolId/batch
 *
 * Accepts multipart with multiple files + settings JSON.
 * Processes all files through the tool using p-queue for concurrency control.
 * Returns a ZIP file containing all processed images.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import archiver from "archiver";
import PQueue from "p-queue";
import { getToolConfig } from "./tool-factory.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { env } from "../config.js";
import { updateJobProgress, type JobProgress } from "./progress.js";

interface ParsedFile {
  buffer: Buffer;
  filename: string;
}

export async function registerBatchRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/api/v1/tools/:toolId/batch",
    async (
      request: FastifyRequest<{ Params: { toolId: string } }>,
      reply: FastifyReply,
    ) => {
      const { toolId } = request.params;

      // Look up the tool config from the registry
      const toolConfig = getToolConfig(toolId);
      if (!toolConfig) {
        return reply.status(404).send({ error: `Tool "${toolId}" not found` });
      }

      // Parse multipart: collect all files and the settings field
      const files: ParsedFile[] = [];
      let settingsRaw: string | null = null;

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

      // Parse and validate settings
      let settings: unknown;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = toolConfig.settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({
            error: "Invalid settings",
            details: result.error.issues.map(
              (i: { path: (string | number)[]; message: string }) => ({
                path: i.path.join("."),
                message: i.message,
              }),
            ),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      // Create a job ID for progress tracking
      const jobId = randomUUID();

      const progress: JobProgress = {
        jobId,
        status: "processing",
        totalFiles: files.length,
        completedFiles: 0,
        failedFiles: 0,
        errors: [],
      };
      updateJobProgress({ ...progress });

      // Set up response headers for ZIP streaming
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="batch-${toolId}-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
        "X-Job-Id": jobId,
      });

      // Create ZIP archive that pipes directly to the response
      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      // Use p-queue for concurrency control
      const queue = new PQueue({ concurrency: env.CONCURRENT_JOBS });

      // Track unique filenames to avoid collisions in the ZIP
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

      // Process all files through the queue
      const tasks = files.map((file) =>
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
            const result = await toolConfig.process(
              file.buffer,
              settings,
              file.filename,
            );

            const zipFilename = getUniqueName(result.filename);
            archive.append(result.buffer, { name: zipFilename });

            progress.completedFiles++;
            updateJobProgress({ ...progress });
          } catch (err) {
            progress.failedFiles++;
            progress.errors.push({
              filename: file.filename,
              error: err instanceof Error ? err.message : "Processing failed",
            });
            progress.completedFiles++;
            updateJobProgress({ ...progress });
          }
        }),
      );

      // Wait for all tasks to complete
      await Promise.all(tasks);

      // Finalize progress
      progress.status =
        progress.failedFiles === progress.totalFiles ? "failed" : "completed";
      progress.currentFile = undefined;
      updateJobProgress({ ...progress });

      // Finalize the ZIP archive (flushes remaining data and ends the stream)
      await archive.finalize();
    },
  );
}
