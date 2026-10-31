import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restorePhoto } from "@snapotter/ai";
import {
  getBundleForTool,
  hasServerErrorStatus,
  isToolInputError,
  markToolInputError,
  ToolInputError,
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
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeAnyFormat, isDecoderUnavailable } from "../../lib/format-decoders.js";
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
  scratchRemoval: z.boolean().default(true),
  faceEnhancement: z.boolean().default(true),
  fidelity: z.number().min(0).max(1).default(0.7),
  denoise: z.boolean().default(true),
  denoiseStrength: z.number().min(0).max(100).default(25),
  colorize: z.boolean().default(false),
  colorizeStrength: z.number().min(0).max(100).default(85),
});

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler(
  "restore-photo",
  withAiImageEncodeContext(
    "Photo restoration failed",
    () => "restore-photo",
    async (input, data, ctx) => {
      const settings = settingsSchema.parse(data.settings);

      let result: Awaited<ReturnType<typeof restorePhoto>>;
      try {
        result = await restorePhoto(
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
            signal: ctx.signal,
          },
          (percent, stage) => ctx.report(percent, stage),
        );
      } catch (err) {
        throw await asInputErrorIfUndecodable(input, err);
      }

      const outputFormat = await resolveOutputFormat(input, data.filename);
      let outputBuffer = result.buffer;
      if (outputFormat.format !== "png") {
        outputBuffer = await sharp(result.buffer)
          .toFormat(outputFormat.format, outputFormat.encoderOptions)
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
    },
  ),
);

/**
 * AI photo restoration route.
 * Multi-step pipeline: scratch repair, face enhancement, denoising,
 * optional colorization.
 */
export function registerRestorePhoto(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/restore-photo",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
          if (validation.format === "avif") {
            try {
              fileBuffer = await sharp(fileBuffer).png().toBuffer();
            } catch (probeErr) {
              request.log.info(
                { err: probeErr, format: "avif" },
                "restore-photo: native AVIF decode failed, trying the CLI decoder",
              );
              try {
                fileBuffer = await decodeAnyFormat(fileBuffer, "avif");
              } catch (rawAvifErr) {
                const avifErr = normalizeOperationalWriteError(rawAvifErr);
                if (isDecoderUnavailable(avifErr) || hasServerErrorStatus(avifErr)) throw avifErr;
                const combined = new ToolInputError(
                  `AVIF decode failed (native: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}; cli: ${avifErr instanceof Error ? avifErr.message : String(avifErr)})`,
                );
                combined.cause = avifErr;
                throw markToolInputError(combined);
              }
            }
          }
        } catch (rawErr) {
          const err = normalizeOperationalWriteError(rawErr);
          if (err instanceof InputValidationError) {
            return reply.status(400).send({ error: err.message });
          }
          if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
          if (!isToolInputError(err)) {
            request.log.error({ err, toolId: "restore-photo" }, "Input decoding failed");
          }
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

        enqueued = true;
        const jobData: ToolJobData = {
          jobId,
          toolId: "restore-photo",
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
    process: withImageEncodeContext(
      "Photo restoration failed",
      () => "restore-photo",
      async (inputBuffer, settings, filename, ctx) => {
        const s = settings as z.infer<typeof settingsSchema>;
        const orientedBuffer = await autoOrient(inputBuffer);
        const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
        const needsCleanup = !ctx?.scratchDir;
        if (needsCleanup) await mkdir(scratchDir, { recursive: true });
        try {
          let result: Awaited<ReturnType<typeof restorePhoto>>;
          try {
            result = await restorePhoto(
              orientedBuffer,
              scratchDir,
              {
                scratchRemoval: s.scratchRemoval,
                faceEnhancement: s.faceEnhancement,
                fidelity: s.fidelity,
                denoise: s.denoise,
                denoiseStrength: s.denoiseStrength,
                colorize: s.colorize,
                colorizeStrength: s.colorizeStrength,
                signal: ctx?.signal,
              },
              ctx ? (percent, stage) => ctx.report(percent, stage) : undefined,
            );
          } catch (err) {
            throw await asInputErrorIfUndecodable(orientedBuffer, err);
          }
          const outputFormat = await resolveOutputFormat(inputBuffer, filename);
          let outputBuffer = result.buffer;
          if (outputFormat.format !== "png") {
            outputBuffer = await sharp(result.buffer)
              .toFormat(outputFormat.format, outputFormat.encoderOptions)
              .toBuffer();
          }
          const ext = outputFormat.format === "jpeg" ? "jpg" : outputFormat.format;
          const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_restored.${ext}`;
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
        } finally {
          if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    ),
  });
}
