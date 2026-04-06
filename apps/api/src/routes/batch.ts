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
import archiver from "archiver";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import PQueue from "p-queue";
import { env } from "../config.js";
import { autoOrient } from "../lib/auto-orient.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { requirePermission } from "../permissions.js";
import { type JobProgress, updateJobProgress } from "./progress.js";
import { getToolConfig } from "./tool-factory.js";

interface ParsedFile {
  buffer: Buffer;
  filename: string;
}

export async function registerBatchRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/tools/:toolId/batch",
    async (request: FastifyRequest<{ Params: { toolId: string } }>, reply: FastifyReply) => {
      const user = requirePermission("tools:use")(request, reply);
      if (!user) return;

      const { toolId } = request.params;

      // Look up the tool config from the registry
      const toolConfig = getToolConfig(toolId);
      if (!toolConfig) {
        return reply.status(404).send({ error: `Tool "${toolId}" not found` });
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

      // Use p-queue for concurrency control
      const queue = new PQueue({ concurrency: env.CONCURRENT_JOBS });

      // All processed buffers are held in memory until ZIP streaming begins.
      // Peak memory scales with files.length * avg output size. MAX_BATCH_SIZE bounds this.
      // Collect results in indexed array to preserve upload order
      const results: ({ buffer: Buffer; filename: string } | null)[] = new Array(files.length).fill(
        null,
      );

      // Process all files through the queue
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
              let processBuffer = file.buffer;
              if (validation.format === "heif") {
                processBuffer = await decodeHeic(processBuffer);
              }
              processBuffer = await autoOrient(processBuffer);
              const result = await toolConfig.process(processBuffer, settings, file.filename);

              results[index] = { buffer: result.buffer, filename: result.filename };

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

        await Promise.all(tasks);
      } catch (err) {
        request.log.error({ err }, "Unexpected error in batch queue");
      }

      // Finalize progress
      progress.status = progress.failedFiles === progress.totalFiles ? "failed" : "completed";
      progress.currentFile = undefined;
      updateJobProgress({ ...progress });

      // Deduplicate filenames in original order and build X-File-Results header
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

      // Hijack and stream the ZIP response after all processing
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="batch-${toolId}-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
        "X-Job-Id": jobId,
        "X-File-Results": JSON.stringify(fileResultsMap),
      });

      const archive = archiver("zip", { zlib: { level: 5 } });

      archive.on("error", (err) => {
        request.log.error({ err }, "Archiver error during batch processing");
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
    },
  );
}
