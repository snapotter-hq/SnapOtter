import { randomUUID } from "node:crypto";
import { removeBackground } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { blurBackground } from "../../lib/bg-effects.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { receiveUpload } from "../../lib/upload-stream.js";

const settingsSchema = z.object({
  intensity: z.number().int().min(1).max(100).default(50),
});

// -- AI job handler (runs inside the BullMQ worker) --
registerAiJobHandler("blur-background", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  ctx.report(5, "Removing background");

  const subjectPng = await removeBackground(input, ctx.scratchDir, {}, (percent, stage) => {
    // Scale rembg progress into 5..80 range
    const scaled = 5 + Math.round(percent * 0.75);
    ctx.report(Math.min(scaled, 80), stage);
  });

  ctx.report(85, "Blurring background");

  const result = await blurBackground(input, subjectPng, settings.intensity);

  const base = data.filename.replace(/\.[^.]+$/, "");
  const outName = `${base}_blurbg.png`;

  return {
    buffer: result,
    filename: outName,
    contentType: "image/png",
  };
});

export function registerBlurBackground(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/blur-background",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "blur-background";
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

      const jobId = randomUUID();
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;
      let inputKey: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const upload = await receiveUpload(part, jobId);
            inputKey = upload.key;
            filename = upload.filename;
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
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const { getObjectBuffer, putObject } = await import("../../lib/object-storage.js");
      fileBuffer = await getObjectBuffer(inputKey);

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

      try {
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId }, "Input decoding failed");
        return reply.status(422).send({
          error: "Processing failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }

      const decodedKey = `uploads/${jobId}/${filename}`;
      if (decodedKey !== inputKey) {
        await putObject(decodedKey, fileBuffer);
        inputKey = decodedKey;
      } else {
        await putObject(inputKey, fileBuffer);
      }

      const progressJobId = clientJobId || jobId;

      await enqueueToolJob({
        jobId,
        toolId,
        userId: null,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings,
        clientJobId: clientJobId ?? undefined,
        kind: "ai-tool",
      });

      return reply.status(202).send({ jobId: progressJobId, async: true });
    },
  );
}
