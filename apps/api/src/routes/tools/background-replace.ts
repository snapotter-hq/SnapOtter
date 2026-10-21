import { randomUUID } from "node:crypto";
import { removeBackground } from "@snapotter/ai";
import {
  getBundleForTool,
  HEX_COLOR_PATTERN,
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
import { compositeOnColor, createGradientBackground } from "../../lib/bg-effects.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { isDecoderUnavailable } from "../../lib/format-decoders.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { prepareRouteImage } from "../../lib/image-input-prep.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError } from "../../lib/object-storage.js";
import {
  discardUnenqueuedUploads,
  hasPersistedJobRow,
  settleUnenqueuedAlias,
} from "../../lib/upload-cleanup.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { InputValidationError } from "../../modality/contract.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";

const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN, "Use a hex color such as #FF5500 or #F50");

const settingsSchema = z
  .object({
    backgroundType: z.enum(["color", "gradient"]).default("color"),
    color: hexColor.default("#ffffff"),
    gradientColor1: hexColor.optional(),
    gradientColor2: hexColor.optional(),
    gradientAngle: z.number().int().min(0).max(360).default(180),
    feather: z.number().int().min(0).max(20).default(0),
    format: z.enum(["png", "webp"]).default("png"),
  })
  .superRefine((s, ctx) => {
    if (s.backgroundType !== "gradient") return;
    for (const key of ["gradientColor1", "gradientColor2"] as const) {
      if (s[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `A gradient background needs ${key}`,
        });
      }
    }
  });

/**
 * Soften the alpha edges of a subject PNG by blurring its alpha channel.
 * Keeps RGB intact; only the transparency boundary gets smoothed.
 */
async function featherEdges(subjectBuffer: Buffer, radius: number): Promise<Buffer> {
  // Read the subject as raw RGBA plus a separately-blurred copy of its alpha,
  // then overwrite the alpha channel in place. joinChannel does not reliably
  // re-tag the merged channel as alpha, so we splice the raw bytes directly.
  const { data: rgba, info } = await sharp(subjectBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: blurredAlpha } = await sharp(subjectBuffer)
    .extractChannel(3)
    .blur(radius)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 3, a = 0; p < rgba.length; p += 4, a++) {
    rgba[p] = blurredAlpha[a];
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// -- AI job handler (runs inside the BullMQ worker) --
registerAiJobHandler("background-replace", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  ctx.report(5, "Removing background");

  let subjectPng: Buffer;
  try {
    subjectPng = await removeBackground(
      input,
      ctx.scratchDir,
      { signal: ctx.signal, toolId: "background-replace" },
      (percent, stage) => {
        // Scale rembg progress into 5..80 range
        const scaled = 5 + Math.round(percent * 0.75);
        ctx.report(Math.min(scaled, 80), stage);
      },
    );
  } catch (err) {
    throw await asInputErrorIfUndecodable(input, err);
  }

  return withImageEncodeContext<z.infer<typeof settingsSchema>>(
    "Background replacement failed",
    (s) => s.format,
    async (subjectBuf, s, filename) => {
      // Feather alpha edges before compositing
      let subject = subjectBuf;
      if (s.feather > 0) {
        ctx.report(82, "Feathering edges");
        subject = await featherEdges(subjectBuf, s.feather);
      }

      ctx.report(85, "Compositing background");

      let composited: Buffer;
      if (s.backgroundType === "gradient") {
        if (!s.gradientColor1 || !s.gradientColor2) {
          throw new Error("A gradient background needs two colors");
        }
        const meta = await sharp(subject).metadata();
        if (!meta.width || !meta.height) throw new Error("Cannot read subject dimensions");
        const gradBg = await createGradientBackground(
          meta.width,
          meta.height,
          s.gradientColor1,
          s.gradientColor2,
          s.gradientAngle,
        );
        composited = await sharp(gradBg)
          .composite([{ input: subject, blend: "over" }])
          .png()
          .toBuffer();
      } else {
        composited = await compositeOnColor(subject, s.color);
      }

      // Encode to requested output format
      const fmt = s.format;
      const result =
        fmt === "webp" ? await sharp(composited).webp({ lossless: true }).toBuffer() : composited;

      const base = filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_bg.${fmt}`;

      return {
        buffer: result,
        filename: outName,
        contentType: fmt === "webp" ? "image/webp" : "image/png",
      };
    },
  )(subjectPng, settings, data.filename, ctx);
});

export function registerBackgroundReplace(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/background-replace",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "background-replace";
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
            request.log.error({ err, toolId }, "Input decoding failed");
          }
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
}
