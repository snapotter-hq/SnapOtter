import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { blurFaces } from "@ashim/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeHeic, ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

/** Face detection and blurring route. */
export function registerBlurFaces(app: FastifyInstance) {
  app.post("/api/v1/tools/blur-faces", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "blur-faces";
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

    let fileBuffer: Buffer | null = null;
    let filename = "image";
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
          fileBuffer = Buffer.concat(chunks);
          filename = basename(part.filename ?? "image");
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

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    const validation = await validateImageBuffer(fileBuffer);
    if (!validation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
    }

    try {
      const settings = settingsRaw ? JSON.parse(settingsRaw) : {};

      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }

      request.log.info(
        {
          toolId: "blur-faces",
          imageSize: fileBuffer.length,
          blurRadius: settings.blurRadius,
          sensitivity: settings.sensitivity,
        },
        "Starting face blur",
      );

      fileBuffer = await autoOrient(fileBuffer);

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      // Save input
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, fileBuffer);

      // Process
      const jobIdForProgress = clientJobId;
      const onProgress = jobIdForProgress
        ? (percent: number, stage: string) => {
            updateSingleFileProgress({
              jobId: jobIdForProgress,
              phase: "processing",
              stage,
              percent,
            });
          }
        : undefined;

      const result = await blurFaces(
        fileBuffer,
        join(workspacePath, "output"),
        {
          blurRadius: settings.blurRadius ?? 30,
          sensitivity: settings.sensitivity ?? 0.5,
        },
        onProgress,
      );

      // Save output
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_blurred.png`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, result.buffer);

      if (clientJobId) {
        updateSingleFileProgress({
          jobId: clientJobId,
          phase: "complete",
          percent: 100,
        });
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
        originalSize: fileBuffer.length,
        processedSize: result.buffer.length,
        facesDetected: result.facesDetected,
        faces: result.faces,
        ...(result.facesDetected === 0 && {
          warning: "No faces detected in this image. Try increasing detection sensitivity.",
        }),
      });
    } catch (err) {
      request.log.error({ err, toolId: "blur-faces" }, "Face blur failed");
      return reply.status(422).send({
        error: "Face blur failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Register in the pipeline/batch registry so this tool can be used
  // as a step in automation pipelines (without progress callbacks).
  registerToolProcessFn({
    toolId: "blur-faces",
    settingsSchema: z.object({
      blurRadius: z.number().min(1).max(100).default(30),
      sensitivity: z.number().min(0).max(1).default(0.5),
    }),
    process: async (inputBuffer, settings, filename) => {
      const s = settings as { blurRadius?: number; sensitivity?: number };
      const orientedBuffer = await autoOrient(await ensureSharpCompat(inputBuffer));
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const result = await blurFaces(orientedBuffer, join(workspacePath, "output"), {
        blurRadius: s.blurRadius ?? 30,
        sensitivity: s.sensitivity ?? 0.5,
      });
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_blurred.png`;
      return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
    },
  });
}
