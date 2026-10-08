import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeBackground } from "@snapotter/ai";
import {
  BG_REMOVAL_MODELS,
  getBundleForTool,
  hasServerErrorStatus,
  TOOL_BUNDLE_MAP,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, insertToolJobAlias } from "../../jobs/enqueue.js";
import { autoSaveToLibrary } from "../../jobs/postprocess.js";
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  INVALID_SAVE_MODE_ERROR,
  parseClientJobIdField,
  parseSaveModeField,
} from "../../jobs/types.js";
import { autoOrient } from "../../lib/auto-orient.js";
import {
  applyEffects,
  BG_FORMAT_CONTENT_TYPES,
  type BgOutputFormat,
} from "../../lib/bg-effects.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  model: z.enum(BG_REMOVAL_MODELS).optional(),
  backgroundType: z.enum(["transparent", "color", "gradient", "blur", "image"]).optional(),
  backgroundColor: z.string().optional(),
  gradientColor1: z.string().optional(),
  gradientColor2: z.string().optional(),
  gradientAngle: z.number().optional(),
  blurEnabled: z.boolean().optional(),
  blurIntensity: z.number().min(0).max(100).optional(),
  shadowEnabled: z.boolean().optional(),
  shadowOpacity: z.number().min(0).max(100).optional(),
  outputFormat: z.enum(["png", "webp", "avif"]).optional(),
  edgeRefine: z.number().int().min(0).max(3).optional(),
  decontaminate: z.boolean().optional(),
});

type RemoveBgSettings = z.infer<typeof settingsSchema>;

// Pipelines and batches carry settings as JSON, so an uploaded background image
// can't reach the worker. Reject the type up front instead of returning a
// cutout with the background silently dropped (#1047).
const pipelineSettingsSchema = settingsSchema.extend({
  backgroundType: z.enum(["transparent", "color", "gradient", "blur"]).optional(),
});

/**
 * Composite the cutout over the requested background and name the result.
 * Shared by the pipeline/batch path of the AI handler and the registry process
 * fn so the two cannot drift apart again (#1047).
 */
async function compositeCutout(
  transparent: Buffer,
  original: Buffer,
  s: RemoveBgSettings,
  filename: string,
) {
  const fmt = (s.outputFormat ?? "png") as BgOutputFormat;
  const buffer = await applyEffects(transparent, original, {
    backgroundType: s.backgroundType,
    backgroundColor: s.backgroundColor,
    gradientColor1: s.gradientColor1,
    gradientColor2: s.gradientColor2,
    gradientAngle: s.gradientAngle,
    blurEnabled: s.blurEnabled,
    blurIntensity: s.blurIntensity,
    shadowEnabled: s.shadowEnabled,
    shadowOpacity: s.shadowOpacity,
    outputFormat: fmt,
  });
  return {
    buffer,
    filename: `${filename.replace(/\.[^.]+$/, "")}_nobg.${fmt}`,
    contentType: BG_FORMAT_CONTENT_TYPES[fmt],
  };
}

// ── AI job handler (runs inside the BullMQ worker) ────────────────
// The worker dispatches to this handler before the registry process fn, so it
// has to cover every job kind. Standalone jobs ("ai-tool") are Phase 1 of the
// two-phase flow and return the transparent mask; pipeline steps and batch
// children have no Phase 2, so they get the finished composite (#1047).
registerAiJobHandler("remove-background", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);
  const standalone = data.kind === "ai-tool";
  const source = standalone ? input : await autoOrient(input);

  // Phase 1: AI background removal -> transparent PNG
  const transparentResult = await removeBackground(
    source,
    ctx.scratchDir,
    {
      model: settings.model,
      edgeRefine: settings.edgeRefine,
      decontaminate: settings.decontaminate,
      signal: ctx.signal,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  if (!standalone) return compositeCutout(transparentResult, source, settings, data.filename);

  // The mask IS the transparent result; cache original for effects re-apply
  const maskFilename = `${data.filename.replace(/\.[^.]+$/, "")}_mask.png`;
  const originalFilename = `${data.filename.replace(/\.[^.]+$/, "")}_original.png`;

  const maskUrl = `/api/v1/download/${data.jobId}/${encodeURIComponent(maskFilename)}`;
  const originalUrl = `/api/v1/download/${data.jobId}/${encodeURIComponent(originalFilename)}`;

  return {
    buffer: transparentResult,
    filename: maskFilename,
    contentType: "image/png",
    resultPayload: {
      maskUrl,
      originalUrl,
      filename: data.filename,
      model: settings.model,
    },
    extraOutputs: [{ name: originalFilename, buffer: input, contentType: "image/png" }],
  };
});

/**
 * AI background removal with two-phase flow:
 *
 * Phase 1 (POST /remove-background): Python/rembg removes background.
 *   Returns transparent PNG + caches mask & original for effects re-apply.
 *   Also returns maskUrl and originalUrl for frontend CSS preview.
 *
 * Phase 2 (POST /remove-background/effects): Node.js/Sharp applies effects.
 *   Uses cached mask + original. No AI re-run. Instant response.
 *   Called when user adjusts blur/shadow/background and clicks download.
 */
export function registerRemoveBackground(app: FastifyInstance) {
  // ── Phase 1: Background removal ──────────────────────────────────
  app.post(
    "/api/v1/tools/image/remove-background",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "remove-background";
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
      let clientJobIdRaw: string | null = null;
      let fileId: string | null = null;
      let saveModeRaw: string | null = null;
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
            clientJobIdRaw = part.value as string;
          } else if (part.fieldname === "fileId") {
            fileId = part.value as string;
          } else if (part.fieldname === "saveMode") {
            saveModeRaw = part.value as string;
          }
        }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      const clientJobIdField = parseClientJobIdField(clientJobIdRaw);
      if (clientJobIdField === null) {
        return reply.status(400).send({ error: INVALID_CLIENT_JOB_ID_ERROR });
      }
      clientJobId = clientJobIdField ?? null;

      // Stamp the client-facing alias before any pre-enqueue work (#892): a
      // cancel landing between parse and enqueueToolJob needs a durable pointer
      // to resolve. Insert-only; enqueueToolJob re-points it at enqueue (#886).
      if (clientJobId && clientJobId !== jobId) {
        await insertToolJobAlias({ jobId, clientJobId, userId, pool: "ai" });
      }

      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      fileBuffer = await getObjectBuffer(inputKey);

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
        settings = result.data;
      } catch {
        // Orphaned uploads/<jobId>/ dir will be cleaned by T10 TTL sweeper
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        // Decode HEIC/HEIF before processing
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        // Auto-orient to fix EXIF rotation
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        if (isDecoderUnavailable(err)) throw err;
        request.log.error({ err, toolId: "remove-background" }, "Input decoding failed");
        return reply.status(422).send({
          error: "Background removal failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }

      // Write decoded input for the worker
      const decodedKey = `uploads/${jobId}/${filename}`;
      if (decodedKey !== inputKey) {
        await putObject(decodedKey, fileBuffer);
        inputKey = decodedKey;
      } else {
        await putObject(inputKey, fileBuffer);
      }

      // Enqueue on the AI pool
      await enqueueToolJob({
        jobId,
        toolId,
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings,
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        saveMode,
        kind: "ai-tool",
      });

      // AI tools always return 202 (no sync window)
      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    },
  );

  // ── Phase 2: Effects-only (no AI re-run) ─────────────────────────
  app.post(
    "/api/v1/tools/image/remove-background/effects",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let settingsRaw: string | null = null;
      let bgImageBuffer: Buffer | null = null;
      let bgFilename = "background";
      let fileId: string | null = null;
      let saveModeRaw: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "backgroundImage") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            bgImageBuffer = Buffer.concat(chunks);
            bgFilename = sanitizeFilename(part.filename ?? "background");
          } else if (part.type === "field" && part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.type === "field" && part.fieldname === "fileId") {
            fileId = part.value as string;
          } else if (part.type === "field" && part.fieldname === "saveMode") {
            saveModeRaw = part.value as string;
          }
        }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      // Same 400 gate as the Phase 1 route: this is the FINAL request when the
      // user applies effects, so it carries the library save choice (#565).
      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
      }

      if (!settingsRaw) {
        return reply.status(400).send({ error: "No settings provided" });
      }

      const effectsSchema = z.object({
        jobId: z.string().min(1),
        filename: z.string().min(1),
        backgroundType: z.enum(["transparent", "color", "gradient", "blur", "image"]).optional(),
        backgroundColor: z.string().optional(),
        gradientColor1: z.string().optional(),
        gradientColor2: z.string().optional(),
        gradientAngle: z.number().optional(),
        blurEnabled: z.boolean().optional(),
        blurIntensity: z.number().min(0).max(100).optional(),
        shadowEnabled: z.boolean().optional(),
        shadowOpacity: z.number().min(0).max(100).optional(),
        outputFormat: z.enum(["png", "webp", "avif"]).optional(),
      });

      try {
        let settings: z.infer<typeof effectsSchema>;
        try {
          const parsed = JSON.parse(settingsRaw);
          const result = effectsSchema.safeParse(parsed);
          if (!result.success) {
            return reply.status(400).send({
              error: "Invalid settings",
              details: formatZodErrors(result.error.issues),
            });
          }
          settings = result.data;
        } catch {
          return reply.status(400).send({ error: "Settings must be valid JSON" });
        }

        const { jobId, filename } = settings;

        const baseName = filename.replace(/\.[^.]+$/, "");
        const maskKey = `outputs/${jobId}/${baseName}_mask.png`;
        const originalKey = `outputs/${jobId}/${baseName}_original.png`;

        const [maskBuffer, originalBuffer] = await Promise.all([
          getObjectBuffer(maskKey),
          getObjectBuffer(originalKey),
        ]);

        // Decode HEIC/HEIF background image if needed
        if (bgImageBuffer) {
          const bgValidation = await validateImageBuffer(bgImageBuffer, bgFilename);
          if (bgValidation.valid && bgValidation.format === "heif") {
            bgImageBuffer = await decodeHeic(bgImageBuffer);
          }
          if (bgValidation.valid && needsCliDecode(bgValidation.format)) {
            bgImageBuffer = await decodeToSharpCompat(bgImageBuffer, bgValidation.format);
          }
        }

        // Apply effects using cached mask + original
        const fmt = (settings.outputFormat ?? "png") as BgOutputFormat;
        const resultBuffer = await applyEffects(maskBuffer, originalBuffer, {
          backgroundType: settings.backgroundType,
          backgroundColor: settings.backgroundColor,
          gradientColor1: settings.gradientColor1,
          gradientColor2: settings.gradientColor2,
          gradientAngle: settings.gradientAngle,
          backgroundImageBuffer: bgImageBuffer ?? undefined,
          blurEnabled: settings.blurEnabled,
          blurIntensity: settings.blurIntensity,
          shadowEnabled: settings.shadowEnabled,
          shadowOpacity: settings.shadowOpacity,
          outputFormat: fmt,
        });

        // Save the final output
        const outputFilename = `${baseName}_nobg.${fmt}`;
        await putObject(`outputs/${jobId}/${outputFilename}`, resultBuffer);

        // Auto-save the composited result (not the Phase 1 transparent
        // intermediate) to the library when the run referenced a library file.
        const savedFileId = await autoSaveToLibrary({
          fileId: fileId ?? undefined,
          saveMode,
          userId: getAuthUser(request)?.id ?? null,
          buffer: resultBuffer,
          outName: outputFilename,
          contentType: BG_FORMAT_CONTENT_TYPES[fmt],
          toolId: "remove-background",
        });

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
          processedSize: resultBuffer.length,
          savedFileId,
        });
      } catch (err) {
        if (isDecoderUnavailable(err)) throw err;
        if (hasServerErrorStatus(err)) throw err;
        request.log.error({ err }, "Effects processing failed");
        return reply.status(422).send({
          error: "Effects processing failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }
    },
  );

  // ── Pipeline/batch registry ──────────────────────────────────────
  registerToolProcessFn({
    toolId: "remove-background",
    settingsSchema: pipelineSettingsSchema,
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const transparentResult = await removeBackground(orientedBuffer, scratchDir, {
          model: s.model,
          edgeRefine: s.edgeRefine,
          decontaminate: s.decontaminate,
          signal: ctx?.signal,
        });

        return await compositeCutout(transparentResult, orientedBuffer, s, filename);
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
