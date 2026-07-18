import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { removeBackgroundAnimated } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { detectAnimation } from "../../lib/animation-detect.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  model: z.string().optional(),
  outputFormat: z.enum(["webp", "gif", "apng"]).optional(),
  backgroundType: z.enum(["transparent", "color", "gradient", "blur", "image"]).optional(),
  backgroundColor: z.string().optional(),
  gradientColor1: z.string().optional(),
  gradientColor2: z.string().optional(),
  gradientAngle: z.number().optional(),
  blurIntensity: z.number().min(0).max(100).optional(),
  shadowEnabled: z.boolean().optional(),
  shadowOpacity: z.number().min(0).max(100).optional(),
  edgeRefine: z.number().int().min(0).max(3).optional(),
  decontaminate: z.boolean().optional(),
});

// The worker also receives the staged background-image storage key (never
// persisted to the audit row — passed via dbSettings redaction on enqueue).
const jobSettingsSchema = settingsSchema.extend({ bgImageKey: z.string().optional() });

type Settings = z.infer<typeof settingsSchema>;

function toWrapperOptions(s: z.infer<typeof jobSettingsSchema>, frames: number, filename: string) {
  return {
    model: s.model,
    outputFormat: s.outputFormat,
    backgroundType: s.backgroundType,
    backgroundColor: s.backgroundColor,
    gradientColor1: s.gradientColor1,
    gradientColor2: s.gradientColor2,
    gradientAngle: s.gradientAngle,
    blurIntensity: s.blurIntensity,
    shadowEnabled: s.shadowEnabled,
    shadowOpacity: s.shadowOpacity,
    edgeRefine: s.edgeRefine,
    decontaminate: s.decontaminate,
    frames,
    inputExt: extname(filename).replace(/^\./, "").toLowerCase() || "gif",
  };
}

// ── AI job handler (runs inside the BullMQ worker) ────────────────
registerAiJobHandler("remove-gif-background", async (input, data, ctx) => {
  const settings = jobSettingsSchema.parse(data.settings);

  // ctx.signal is not plumbed to Python; drop a sentinel the loop polls between
  // frames so a cancel stops the run instead of wasting the whole animation.
  const cancelFile = join(ctx.scratchDir, "cancel.flag");
  const writeCancel = () => {
    try {
      writeFileSync(cancelFile, "1");
    } catch {
      // best effort
    }
  };
  if (ctx.signal.aborted) writeCancel();
  else ctx.signal.addEventListener("abort", writeCancel, { once: true });

  let bgImagePath: string | undefined;
  if (settings.bgImageKey) {
    const bg = await getObjectBuffer(settings.bgImageKey);
    if (bg && bg.length > 0) {
      bgImagePath = join(ctx.scratchDir, "bg-input");
      await writeFile(bgImagePath, bg);
    }
  }

  const { frames } = await detectAnimation(input, data.filename);

  const result = await removeBackgroundAnimated(
    input,
    ctx.scratchDir,
    { ...toWrapperOptions(settings, frames, data.filename), cancelFile, bgImagePath },
    (percent, stage) => ctx.report(percent, stage),
  );

  const base = data.filename.replace(/\.[^.]+$/, "");
  return {
    buffer: result.buffer,
    filename: `${base}-nobg.${result.ext}`,
    contentType: result.contentType,
  };
});

/**
 * AI background removal for animated images (GIF, animated WebP, APNG). Unlike
 * the still remove-background tool this is a one-shot flow: every frame is
 * matted and the chosen effect is baked in a single pass, then re-encoded to
 * the requested animated format. Returns 202 and streams progress over SSE.
 */
export function registerRemoveGifBackground(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/remove-gif-background",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "remove-gif-background";
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
      let filename = "image.gif";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;
      let fileId: string | null = null;
      let saveModeRaw: string | null = null;
      let inputKey: string | null = null;
      let bgBuffer: Buffer | null = null;
      let bgName = "background";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "backgroundImage") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            bgBuffer = Buffer.concat(chunks);
            bgName = sanitizeFilename(part.filename ?? "background");
          } else if (part.type === "file") {
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
          } else if (part.fieldname === "saveMode") {
            saveModeRaw = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const fileBuffer = await getObjectBuffer(inputKey);
      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      // Detect animation WITHOUT decoding/orienting (those flatten an animation
      // to one frame). Reject stills and enforce the frame cap before enqueue.
      let animation: { animated: boolean; frames: number };
      try {
        animation = await detectAnimation(fileBuffer, filename);
      } catch (err) {
        return reply.status(400).send({
          error: `Invalid image: ${stripInternalPaths(err instanceof Error ? err.message : "unreadable")}`,
        });
      }
      if (!animation.animated) {
        return reply.status(400).send({
          error: "This tool only handles animated images. Use Remove Background for still images.",
          code: "NOT_ANIMATED",
        });
      }
      const cap = env.GIF_BG_MAX_FRAMES;
      if (cap > 0 && animation.frames > cap) {
        return reply.status(400).send({
          error: `Animation has ${animation.frames} frames, over the ${cap}-frame limit.`,
          code: "TOO_MANY_FRAMES",
        });
      }

      let settings: Settings;
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

      // Stage the background image for the "image" effect.
      let bgImageKey: string | undefined;
      if (settings.backgroundType === "image") {
        if (!bgBuffer || bgBuffer.length === 0) {
          return reply
            .status(400)
            .send({ error: "A background image is required for the image background." });
        }
        const bgValidation = await validateImageBuffer(bgBuffer, bgName);
        if (!bgValidation.valid) {
          return reply
            .status(400)
            .send({ error: `Invalid background image: ${bgValidation.reason}` });
        }
        bgImageKey = `uploads/${jobId}/bg-${bgName}`;
        await putObject(bgImageKey, bgBuffer);
      }

      await enqueueToolJob({
        jobId,
        toolId,
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings: { ...settings, bgImageKey },
        dbSettings: settings, // keep the internal bgImageKey out of the audit row
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        saveMode,
        kind: "ai-tool",
      });

      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    },
  );

  // ── Pipeline/batch registry ──────────────────────────────────────
  registerToolProcessFn({
    toolId: "remove-gif-background",
    settingsSchema,
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as Settings;
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const animation = await detectAnimation(inputBuffer, filename);
        if (!animation.animated) {
          throw new Error("Input is not an animated image");
        }
        // Batch/pipeline has no per-request background image; "image" degrades
        // to transparent in the pipeline (the Python side handles a null bg).
        const result = await removeBackgroundAnimated(
          inputBuffer,
          scratchDir,
          toWrapperOptions(s, animation.frames, filename),
        );
        const base = filename.replace(/\.[^.]+$/, "");
        return {
          buffer: result.buffer,
          filename: `${base}-nobg.${result.ext}`,
          contentType: result.contentType,
        };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
