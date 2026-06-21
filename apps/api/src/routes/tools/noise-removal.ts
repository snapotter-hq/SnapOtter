import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noiseRemoval } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  tier: z.enum(["quick", "balanced", "quality", "maximum"]).default("balanced"),
  strength: z.union([z.number(), z.string()]).transform(Number).default(50),
  detailPreservation: z.union([z.number(), z.string()]).transform(Number).default(50),
  colorNoise: z.union([z.number(), z.string()]).transform(Number).default(30),
  format: z.enum(["original", "png", "jpeg", "webp", "avif", "jxl"]).default("original"),
  quality: z.union([z.number(), z.string()]).transform(Number).default(90),
});

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler("noise-removal", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  const result = await noiseRemoval(
    input,
    ctx.scratchDir,
    {
      tier: settings.tier,
      strength: settings.strength,
      detailPreservation: settings.detailPreservation,
      colorNoise: settings.colorNoise,
      format: settings.format,
      quality: settings.quality,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  const ext = result.format === "jpeg" ? "jpg" : result.format;
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_denoised.${ext}`;

  const CONTENT_TYPES: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    webp: "image/webp",
    avif: "image/avif",
  };

  return {
    buffer: result.buffer,
    filename: outputFilename,
    contentType: CONTENT_TYPES[result.format] || "image/png",
  };
});

/**
 * AI noise removal route.
 * Uses the Python sidecar for multi-tier denoising.
 */
export function registerNoiseRemoval(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/noise-removal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "noise-removal";
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

      const userId = getAuthUser(request)?.id ?? null;
      const jobId = randomUUID();
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;
      let fileId: string | null = null;
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
          } else if (part.fieldname === "fileId") {
            fileId = part.value as string;
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

      fileBuffer = await getObjectBuffer(inputKey);

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      let parsed: z.infer<typeof settingsSchema>;
      try {
        const raw = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(raw);
        if (!result.success) {
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
        parsed = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
        }
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
        }
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: "noise-removal" }, "Input decoding failed");
        return reply.status(422).send({
          error: "Noise removal failed",
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
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings: parsed,
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        kind: "ai-tool",
      });

      return reply.status(202).send({ jobId: progressJobId, async: true });
    },
  );

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "noise-removal",
    settingsSchema: z.object({
      tier: z.enum(["quick", "balanced", "quality", "maximum"]).default("balanced"),
      strength: z.union([z.number(), z.string()]).transform(Number).default(50),
      detailPreservation: z.union([z.number(), z.string()]).transform(Number).default(50),
      colorNoise: z.union([z.number(), z.string()]).transform(Number).default(30),
      format: z.enum(["original", "png", "jpeg", "webp", "avif", "jxl"]).default("original"),
      quality: z.union([z.number(), z.string()]).transform(Number).default(90),
    }),
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const result = await noiseRemoval(orientedBuffer, scratchDir, {
          tier: s.tier,
          strength: s.strength,
          detailPreservation: s.detailPreservation,
          colorNoise: s.colorNoise,
          format: s.format,
          quality: s.quality,
        });
        const ext = result.format === "jpeg" ? "jpg" : result.format;
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_denoised.${ext}`;
        const CONTENT_TYPES: Record<string, string> = {
          png: "image/png",
          jpeg: "image/jpeg",
          jpg: "image/jpeg",
          webp: "image/webp",
          avif: "image/avif",
        };
        return {
          buffer: result.buffer,
          filename: outputFilename,
          contentType: CONTENT_TYPES[result.format] || "image/png",
        };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
