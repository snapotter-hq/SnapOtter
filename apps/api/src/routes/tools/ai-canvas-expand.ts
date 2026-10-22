import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { outpaint } from "@snapotter/ai";
import {
  getBundleForTool,
  hasServerErrorStatus,
  isToolInputError,
  TOOL_BUNDLE_MAP,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
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
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { isDecoderUnavailable } from "../../lib/format-decoders.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { encodeHeic } from "../../lib/heic-converter.js";
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
import { resolveOutputFormat } from "../../lib/output-format.js";
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
  extendTop: z.number().int().min(0).default(0),
  extendRight: z.number().int().min(0).default(0),
  extendBottom: z.number().int().min(0).default(0),
  extendLeft: z.number().int().min(0).default(0),
  tier: z.enum(["fast", "balanced", "high"]).default("balanced"),
  format: z
    .enum(["auto", "png", "jpg", "jpeg", "webp", "tiff", "gif", "avif", "heic", "heif", "jxl"])
    .default("auto"),
  quality: z.number().int().min(1).max(100).default(95),
});

type Settings = z.infer<typeof settingsSchema>;

// ── AI job handler ────────────────────────────────────────────────
const EXT_MAP: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
  tiff: "tiff",
  gif: "gif",
  avif: "avif",
  heic: "heic",
  heif: "heif",
  jxl: "jxl",
};

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tiff: "image/tiff",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
};

/**
 * Encode the outpainted image in the requested format (the input's own when the
 * setting says "auto") and name the result. Shared by the AI job handler and the
 * registry process fn so a pipeline step and the tool page agree on format,
 * quality and extension (#2076).
 */
async function encodeExtended(
  resultBuffer: Buffer,
  requested: string,
  requestedQuality: number,
  input: Buffer,
  filename: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  let format = requested;
  let quality = requestedQuality;

  if (format === "auto") {
    const detected = await resolveOutputFormat(input, filename);
    format = detected.format === "jpeg" ? "jpg" : detected.format;
    // detected.quality is undefined for PNG, whose encode path below never
    // reads it anyway; keep the local a plain number.
    quality = detected.quality ?? quality;
  }

  const needsNodeConversion = ["heic", "heif", "avif", "jxl"].includes(format);
  let outputBuffer: Buffer;
  let finalFormat = format;

  if (needsNodeConversion) {
    if (format === "heic" || format === "heif") {
      outputBuffer = await encodeHeic(resultBuffer, quality);
    } else if (format === "jxl") {
      outputBuffer = await encodeJxl(resultBuffer, quality);
    } else {
      outputBuffer = await sharp(resultBuffer).avif({ quality }).toBuffer();
      finalFormat = "avif";
    }
  } else if (format === "jpg" || format === "jpeg") {
    outputBuffer = await sharp(resultBuffer).jpeg({ quality }).toBuffer();
    finalFormat = "jpg";
  } else if (format === "webp") {
    outputBuffer = await sharp(resultBuffer).webp({ quality }).toBuffer();
    finalFormat = "webp";
  } else if (format === "tiff") {
    outputBuffer = await sharp(resultBuffer).tiff({ quality }).toBuffer();
    finalFormat = "tiff";
  } else if (format === "gif") {
    outputBuffer = await sharp(resultBuffer).gif().toBuffer();
    finalFormat = "gif";
  } else {
    outputBuffer = resultBuffer;
    finalFormat = "png";
  }

  const ext = EXT_MAP[finalFormat] || "png";
  return {
    buffer: outputBuffer,
    filename: `${filename.replace(/\.[^.]+$/, "")}_extended.${ext}`,
    contentType: CONTENT_TYPES[finalFormat] || "image/png",
  };
}

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler(
  "ai-canvas-expand",
  withAiImageEncodeContext<Settings>(
    "AI canvas expand failed",
    (s) => s?.format ?? "auto",
    async (input, data, ctx) => {
      const settings = settingsSchema.parse(data.settings);

      let resultBuffer: Buffer;
      try {
        resultBuffer = await outpaint(
          input,
          {
            extendTop: settings.extendTop,
            extendRight: settings.extendRight,
            extendBottom: settings.extendBottom,
            extendLeft: settings.extendLeft,
            tier: settings.tier,
          },
          ctx.scratchDir,
          (percent, stage) => ctx.report(percent, stage),
        );
      } catch (err) {
        throw await asInputErrorIfUndecodable(input, err);
      }

      return encodeExtended(resultBuffer, settings.format, settings.quality, input, data.filename);
    },
  ),
);

export function registerAiCanvasExpand(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/ai-canvas-expand",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "ai-canvas-expand";
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

        // Validate settings
        let settings: Settings;
        try {
          const raw = settingsRaw ? JSON.parse(settingsRaw) : {};
          const result = settingsSchema.safeParse(raw);
          if (!result.success) {
            return reply
              .status(400)
              .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
          }
          settings = result.data;
        } catch {
          return reply.status(400).send({ error: "Settings must be valid JSON" });
        }

        // At least one extend direction must be > 0
        if (
          settings.extendTop === 0 &&
          settings.extendRight === 0 &&
          settings.extendBottom === 0 &&
          settings.extendLeft === 0
        ) {
          return reply.status(400).send({
            error: "At least one extend direction must be greater than 0",
          });
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
            request.log.error({ err, toolId: "ai-canvas-expand" }, "Input decoding failed");
          }
          return reply.status(422).send({
            error: "AI canvas expand failed",
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
          settings,
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
    toolId: "ai-canvas-expand",
    settingsSchema,
    process: withImageEncodeContext<unknown>(
      "AI canvas expand failed",
      (s) => (s as Settings)?.format ?? "auto",
      async (inputBuffer, settings, filename, ctx) => {
        const s = settings as Settings;

        const cliCheck = await validateImageBuffer(inputBuffer, filename);
        const ext = extname(filename).toLowerCase().replace(/^\./, "");
        const format = cliCheck.valid
          ? cliCheck.format
          : ["heic", "heif", "hif"].includes(ext)
            ? "heif"
            : ext === "svg" || ext === "svgz"
              ? "svg"
              : "png";
        const prepared = await prepareRouteImage(inputBuffer, filename, format, {
          rasterizeSvg: true,
        });
        const orientedBuffer = prepared.buffer;
        const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
        const needsCleanup = !ctx?.scratchDir;
        if (needsCleanup) await mkdir(scratchDir, { recursive: true });
        try {
          let resultBuffer: Buffer;
          try {
            resultBuffer = await outpaint(
              orientedBuffer,
              {
                extendTop: s.extendTop,
                extendRight: s.extendRight,
                extendBottom: s.extendBottom,
                extendLeft: s.extendLeft,
                tier: s.tier,
              },
              scratchDir,
            );
          } catch (err) {
            throw await asInputErrorIfUndecodable(orientedBuffer, err);
          }

          return await encodeExtended(
            resultBuffer,
            s.format ?? "auto",
            s.quality ?? 95,
            orientedBuffer,
            filename,
          );
        } finally {
          if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    ),
  });
}
