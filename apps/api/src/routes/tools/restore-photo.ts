import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restorePhoto } from "@snapotter/ai";
import { getBundleForTool } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeAnyFormat, decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  scratchRemoval: z.boolean().default(true),
  faceEnhancement: z.boolean().default(true),
  fidelity: z.number().min(0).max(1).default(0.7),
  denoise: z.boolean().default(true),
  denoiseStrength: z.number().min(0).max(100).default(25),
  colorize: z.boolean().default(false),
  colorizeStrength: z.number().min(0).max(100).default(85),
});

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler("restore-photo", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  const result = await restorePhoto(
    input,
    ctx.scratchDir,
    {
      scratchRemoval: settings.scratchRemoval,
      faceEnhancement: settings.faceEnhancement,
      fidelity: settings.fidelity,
      denoise: settings.denoise,
      denoiseStrength: settings.denoiseStrength,
      colorize: settings.colorize,
      colorizeStrength: settings.colorizeStrength,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  const outputFormat = await resolveOutputFormat(input, data.filename);
  let outputBuffer = result.buffer;
  if (outputFormat.format !== "png") {
    outputBuffer = await sharp(result.buffer)
      .toFormat(outputFormat.format, { quality: outputFormat.quality })
      .toBuffer();
  }

  const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_restored.${ext}`;

  return {
    buffer: outputBuffer,
    filename: outputFilename,
    contentType: outputFormat.contentType,
    resultPayload: {
      width: result.width,
      height: result.height,
      steps: result.steps,
      scratchCoverage: result.scratchCoverage,
      facesEnhanced: result.facesEnhanced,
      isGrayscale: result.isGrayscale,
      colorized: result.colorized,
    },
  };
});

/**
 * AI photo restoration route.
 * Multi-step pipeline: scratch repair, face enhancement, denoising,
 * optional colorization.
 */
export function registerRestorePhoto(app: FastifyInstance) {
  app.post("/api/v1/tools/restore-photo", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isToolInstalled("restore-photo")) {
      const bundle = getBundleForTool("restore-photo");
      return reply.status(501).send({
        error: "Feature not installed",
        code: "FEATURE_NOT_INSTALLED",
        feature: "photo-restoration",
        featureName: bundle?.name ?? "Photo Restoration",
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
      }
      if (needsCliDecode(validation.format)) {
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
      }
      fileBuffer = await autoOrient(fileBuffer);
      if (validation.format === "avif") {
        try {
          fileBuffer = await sharp(fileBuffer).png().toBuffer();
        } catch {
          fileBuffer = await decodeAnyFormat(fileBuffer, "avif");
        }
      }
    } catch (err) {
      request.log.error({ err, toolId: "restore-photo" }, "Input decoding failed");
      return reply.status(422).send({
        error: "Photo restoration failed",
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
      toolId: "restore-photo",
      userId,
      pool: "ai",
      inputRefs: [inputKey],
      filename,
      settings,
      clientJobId: clientJobId ?? undefined,
      fileId: fileId ?? undefined,
      kind: "ai-tool",
    });

    return reply.status(202).send({ jobId: progressJobId, async: true });
  });

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "restore-photo",
    settingsSchema: z.object({
      scratchRemoval: z.boolean().default(true),
      faceEnhancement: z.boolean().default(true),
      fidelity: z.number().min(0).max(1).default(0.7),
      denoise: z.boolean().default(true),
      denoiseStrength: z.number().min(0).max(100).default(25),
      colorize: z.boolean().default(false),
      colorizeStrength: z.number().min(0).max(100).default(85),
    }),
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const result = await restorePhoto(orientedBuffer, scratchDir, {
          scratchRemoval: s.scratchRemoval,
          faceEnhancement: s.faceEnhancement,
          fidelity: s.fidelity,
          denoise: s.denoise,
          denoiseStrength: s.denoiseStrength,
          colorize: s.colorize,
          colorizeStrength: s.colorizeStrength,
        });
        const outputFormat = await resolveOutputFormat(inputBuffer, filename);
        let outputBuffer = result.buffer;
        if (outputFormat.format !== "png") {
          outputBuffer = await sharp(result.buffer)
            .toFormat(outputFormat.format, { quality: outputFormat.quality })
            .toBuffer();
        }
        const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_restored.${ext}`;
        return {
          buffer: outputBuffer,
          filename: outputFilename,
          contentType: outputFormat.contentType,
        };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
