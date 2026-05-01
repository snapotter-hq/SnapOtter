import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blurFaces } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic, ensureSharpCompat } from "../../lib/heic-converter.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  blurRadius: z.number().min(1).max(100).default(30),
  sensitivity: z.number().min(0).max(1).default(0.5),
});

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
          filename = sanitizeFilename(part.filename ?? "image");
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          const raw = part.value as string;
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
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

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    const validation = await validateImageBuffer(fileBuffer, filename);
    if (!validation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
    }

    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    const { blurRadius, sensitivity } = settings;

    try {
      if (validation.format === "heif") {
        fileBuffer = await decodeHeic(fileBuffer);
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }

      fileBuffer = await autoOrient(fileBuffer);
    } catch (err) {
      request.log.error({ err, toolId: "blur-faces" }, "Input decoding failed");
      return reply.status(422).send({
        error: "Face blur failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }

    const originalSize = fileBuffer.length;
    const jobId = randomUUID();
    const progressJobId = clientJobId || jobId;
    let workspacePath: string;
    try {
      workspacePath = await createWorkspace(jobId);
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, fileBuffer);
    } catch (err) {
      request.log.error({ err, toolId: "blur-faces" }, "Workspace creation failed");
      return reply.status(422).send({
        error: "Face blur failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }

    const log = request.log;
    log.info(
      { toolId: "blur-faces", imageSize: originalSize, blurRadius, sensitivity },
      "Starting face blur",
    );

    // Reply immediately so the HTTP connection closes within proxy timeout limits.
    // The result will be delivered via the SSE progress channel.
    reply.status(202).send({ jobId: progressJobId, async: true });

    const onProgress = (percent: number, stage: string) => {
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "processing",
        stage,
        percent,
      });
    };

    // Fire-and-forget: processing happens after the response is sent
    (async () => {
      const result = await blurFaces(
        fileBuffer,
        join(workspacePath, "output"),
        {
          blurRadius,
          sensitivity,
        },
        onProgress,
      );

      // Resolve output format to match input
      const outputFormat = await resolveOutputFormat(fileBuffer, filename);
      let outputBuffer = result.buffer;
      if (outputFormat.format !== "png") {
        outputBuffer = await sharp(result.buffer)
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      }

      const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_blurred.${ext}`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, outputBuffer);

      const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "complete",
        percent: 100,
        result: {
          jobId,
          downloadUrl,
          originalSize,
          processedSize: outputBuffer.length,
          facesDetected: result.facesDetected,
          faces: result.faces,
          ...(result.facesDetected === 0 && {
            warning: "No faces detected in this image. Try increasing detection sensitivity.",
          }),
        },
      });

      log.info({ toolId: "blur-faces", jobId, downloadUrl }, "Face blur complete");
    })().catch((err) => {
      log.error({ err, toolId: "blur-faces" }, "Face blur failed");
      updateSingleFileProgress({
        jobId: progressJobId,
        phase: "failed",
        percent: 0,
        error: err instanceof Error ? err.message : "Face blur failed",
      });
    });
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
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      let outputBuffer = result.buffer;
      if (outputFormat.format !== "png") {
        outputBuffer = await sharp(result.buffer)
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      }
      const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_blurred.${ext}`;
      return {
        buffer: outputBuffer,
        filename: outputFilename,
        contentType: outputFormat.contentType,
      };
    },
  });
}
