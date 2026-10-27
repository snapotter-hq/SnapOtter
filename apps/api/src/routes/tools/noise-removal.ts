import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noiseRemoval } from "@snapotter/ai";
import {
  getBundleForTool,
  hasServerErrorStatus,
  isToolInputError,
  TOOL_BUNDLE_MAP,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, insertToolJobAlias } from "../../jobs/enqueue.js";
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  INVALID_SAVE_MODE_ERROR,
  parseClientJobIdField,
  parseSaveModeField,
  type ToolJobData,
} from "../../jobs/types.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { isDecoderUnavailable } from "../../lib/format-decoders.js";
import {
  asInputErrorIfUndecodable,
  withAiImageEncodeContext,
  withImageEncodeContext,
} from "../../lib/image-error.js";
import { prepareRouteImage } from "../../lib/image-input-prep.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import {
  getObjectBuffer,
  isStorageServiceFault,
  normalizeOperationalWriteError,
  normalizeS3ReadFault,
  putObject,
} from "../../lib/object-storage.js";
import {
  discardUnenqueuedUploads,
  hasPersistedJobRow,
  settleUnenqueuedAlias,
} from "../../lib/upload-cleanup.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { InputValidationError } from "../../modality/contract.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
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
registerAiJobHandler(
  "noise-removal",
  withAiImageEncodeContext<z.infer<typeof settingsSchema>>(
    "Noise removal failed",
    (s) => s?.tier ?? "balanced",
    async (input, data, ctx) => {
      const settings = settingsSchema.parse(data.settings);

      let result: Awaited<ReturnType<typeof noiseRemoval>>;
      try {
        result = await noiseRemoval(
          input,
          ctx.scratchDir,
          {
            tier: settings.tier,
            strength: settings.strength,
            detailPreservation: settings.detailPreservation,
            colorNoise: settings.colorNoise,
            format: settings.format,
            quality: settings.quality,
            signal: ctx.signal,
          },
          (percent, stage) => ctx.report(percent, stage),
        );
      } catch (err) {
        throw await asInputErrorIfUndecodable(input, err);
      }

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
    },
  ),
);

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
        await discardUnenqueuedUploads(jobId, request.log);
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      let enqueued = false;
      let aliasStamped = false;
      try {
        const clientJobIdField = parseClientJobIdField(clientJobIdRaw);
        if (clientJobIdField === null) {
          return reply.status(400).send({ error: INVALID_CLIENT_JOB_ID_ERROR });
        }
        clientJobId = clientJobIdField ?? null;

        // Stamp the client-facing alias before any pre-enqueue work (#892): a
        // cancel landing between parse and enqueueToolJob needs a durable pointer
        // to resolve. Insert-only; enqueueToolJob re-points it at enqueue (#886).
        if (clientJobId && clientJobId !== jobId) {
          aliasStamped =
            (await insertToolJobAlias({ jobId, clientJobId, userId, pool: "ai" })) !== false;
        }

        const saveMode = parseSaveModeField(saveModeRaw);
        if (saveMode === null) {
          return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
        }

        if (!inputKey) {
          return reply.status(400).send({ error: "No image file provided" });
        }

        try {
          fileBuffer = await getObjectBuffer(inputKey);
        } catch (err) {
          if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
          throw err;
        }

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
          const prepared = await prepareRouteImage(fileBuffer, filename, validation.format, {
            log: request.log,
            rewriteFilenameToPng: true,
            rasterizeSvg: true,
          });
          fileBuffer = prepared.buffer;
          filename = prepared.filename;
        } catch (rawErr) {
          const err = normalizeOperationalWriteError(rawErr);
          if (err instanceof InputValidationError) {
            return reply.status(400).send({ error: err.message });
          }
          if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
          if (!isToolInputError(err)) {
            request.log.error({ err, toolId: "noise-removal" }, "Input decoding failed");
          }
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

        enqueued = true;
        const jobData: ToolJobData = {
          jobId,
          toolId,
          userId,
          pool: "ai",
          inputRefs: [inputKey],
          filename,
          settings: parsed,
          clientJobId: clientJobId ?? undefined,
          fileId: fileId ?? undefined,
          saveMode,
          kind: "ai-tool",
        };
        try {
          await enqueueToolJob(jobData);
          clientJobId = jobData.clientJobId ?? null;
        } catch (err) {
          if (!(await hasPersistedJobRow(jobId, request.log))) enqueued = false;
          throw err;
        }

        return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
      } finally {
        if (!enqueued) {
          await discardUnenqueuedUploads(jobId, request.log);
          if (aliasStamped) {
            await settleUnenqueuedAlias(jobId, clientJobId, request.log);
          }
        }
      }
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
    process: withImageEncodeContext(
      "Noise removal failed",
      (s) => (s as z.infer<typeof settingsSchema>)?.tier ?? "balanced",
      async (inputBuffer, settings, filename, ctx) => {
        const s = settings as z.infer<typeof settingsSchema>;
        const orientedBuffer = await autoOrient(inputBuffer);
        const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
        const needsCleanup = !ctx?.scratchDir;
        if (needsCleanup) await mkdir(scratchDir, { recursive: true });
        try {
          let result: Awaited<ReturnType<typeof noiseRemoval>>;
          try {
            result = await noiseRemoval(
              orientedBuffer,
              scratchDir,
              {
                tier: s.tier,
                strength: s.strength,
                detailPreservation: s.detailPreservation,
                colorNoise: s.colorNoise,
                format: s.format,
                quality: s.quality,
                signal: ctx?.signal,
              },
              ctx ? (percent, stage) => ctx.report(percent, stage) : undefined,
            );
          } catch (err) {
            throw await asInputErrorIfUndecodable(orientedBuffer, err);
          }
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
    ),
  });
}
