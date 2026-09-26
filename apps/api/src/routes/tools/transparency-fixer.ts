import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMemoryAllocError, removeBackground } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, insertToolJobAlias } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";
import { registerToolProcessFn } from "../tool-factory.js";

const TOOL_ID = "transparency-fixer";
const DEFAULT_MODEL = "birefnet-hr-matting";
const FALLBACK_MODEL = "birefnet-general";

const settingsSchema = z.object({
  defringe: z.number().min(0).max(100).optional().default(30),
  outputFormat: z.enum(["png", "webp"]).optional().default("png"),
  removeWatermark: z.boolean().optional().default(false),
});

/**
 * Sliding max along one line of `src` (van Herk / Gil-Werman): each output is
 * the largest value within `radius` of it on the line, at constant cost per
 * pixel whatever the radius, so a large defringe on a large image can't stall
 * the worker. The line is copied out before any of it is written, so `dst`
 * may be `src`. `line`, `prefix` and `suffix` are scratch space of at least
 * `length + 2 * radius`.
 */
function slideMax(
  src: Uint8Array,
  dst: Uint8Array,
  start: number,
  stride: number,
  length: number,
  radius: number,
  line: Uint8Array,
  prefix: Uint8Array,
  suffix: Uint8Array,
): void {
  const size = 2 * radius + 1;
  const padded = length + 2 * radius;
  // Zero padding leaves windows past the line's ends judged on the pixels
  // that exist, since zero never wins a max.
  line.fill(0, 0, radius);
  line.fill(0, radius + length, padded);
  for (let k = 0; k < length; k++) line[radius + k] = src[start + k * stride];

  for (let blockStart = 0; blockStart < padded; blockStart += size) {
    const blockEnd = Math.min(blockStart + size, padded);
    let run = 0;
    for (let j = blockStart; j < blockEnd; j++) {
      if (line[j] > run) run = line[j];
      prefix[j] = run;
    }
    run = 0;
    for (let j = blockEnd - 1; j >= blockStart; j--) {
      if (line[j] > run) run = line[j];
      suffix[j] = run;
    }
  }

  // The window [i, i + size) spans at most two blocks: the tail of one from
  // `suffix` and the head of the next from `prefix`.
  for (let i = 0; i < length; i++) {
    const tail = suffix[i];
    const head = prefix[i + size - 1];
    dst[start + i * stride] = tail > head ? tail : head;
  }
}

/** Largest value within `radius` pixels of each pixel, over a square window. */
function windowMax(values: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const scratchLength = Math.max(width, height) + 2 * radius;
  const line = new Uint8Array(scratchLength);
  const prefix = new Uint8Array(scratchLength);
  const suffix = new Uint8Array(scratchLength);
  const result = new Uint8Array(values.length);
  for (let y = 0; y < height; y++) {
    slideMax(values, result, y * width, 1, width, radius, line, prefix, suffix);
  }
  for (let x = 0; x < width; x++) {
    slideMax(result, result, x, width, height, radius, line, prefix, suffix);
  }
  return result;
}

// Alpha under this counts as background when deciding whether a pixel sits
// next to it, so a faint noise floor left in the matte doesn't hide the
// background from the fringe test.
const BACKGROUND_ALPHA = 8;

/**
 * Sharp-based defringe post-processing.
 */
async function applyDefringe(buffer: Buffer, intensity: number): Promise<Buffer> {
  if (intensity <= 0) return buffer;

  const img = sharp(buffer);
  const { width, height, channels } = await img.metadata();
  if (!width || !height || channels !== 4) return buffer;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;

  const alpha = Buffer.alloc(pixelCount);
  const background = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * 4 + 3];
    background[i] = alpha[i] < BACKGROUND_ALPHA ? 1 : 0;
  }

  const blurRadius = Math.max(0.3, Math.round(intensity / 20));
  // Sharp's output colourspace defaults to sRGB, so a 1-channel raw buffer
  // comes back out of .raw() as three bytes per pixel unless the output is
  // pinned to b-w. The loop below indexes one byte per pixel (#1082).
  const blurredAlphaRaw = await sharp(alpha, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .blur(blurRadius)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  if (blurredAlphaRaw.length !== pixelCount) {
    throw new Error(
      `Defringe mask has ${blurredAlphaRaw.length} bytes for ${pixelCount} pixels. Set defringe to 0 to skip it.`,
    );
  }

  // Fringe is a pixel at the subject's boundary with the background whose
  // neighbourhood is thin compared with the subject around it (#1178). Two
  // conditions, both judged over the pixels the blur actually read:
  //  - background must be in reach, so an opaque region meeting a soft one
  //    (skin under a sheer sleeve, a head under hair) is never cut apart;
  //  - the threshold is a fraction of the most opaque alpha in reach, not of
  //    255, so a uniform soft region (glass, smoke) blurs to its own alpha
  //    and keeps its interior, trimmed at the edge like an opaque one.
  // Where the blur saw a fully opaque pixel and background, this is the old
  // absolute rule, and it never clears a pixel the old rule kept.
  // sharp truncates its Gaussian at minAmplitude 0.2, so each blurred value
  // comes from within this many pixels; rounding up keeps the window a superset.
  const blurFootprint = Math.ceil(blurRadius * Math.sqrt(2 * Math.log(5)));
  const peakAlpha = windowMax(alpha, info.width, info.height, blurFootprint);
  const backgroundInReach = windowMax(background, info.width, info.height, blurFootprint);
  const threshold = Math.round(128 + (intensity / 100) * 80);
  const result = Buffer.from(data);
  for (let i = 0; i < pixelCount; i++) {
    const thinNeighbourhood = blurredAlphaRaw[i] * 255 < threshold * peakAlpha[i];
    if (alpha[i] > 0 && backgroundInReach[i] && thinNeighbourhood) {
      result[i * 4] = 0;
      result[i * 4 + 1] = 0;
      result[i * 4 + 2] = 0;
      result[i * 4 + 3] = 0;
    }
  }

  return sharp(result, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function removeWatermarkMedian(buffer: Buffer): Promise<Buffer> {
  // PNG: a median filter averages neighbourhoods into colours the source never
  // held, which a GIF's own palette cannot carry to the matting model (#1190).
  return sharp(buffer).median(5).png().toBuffer();
}

/**
 * Run transparency fix: rembg matting -> defringe -> output format.
 */
async function processTransparencyFix(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  outputDir: string,
  onProgress?: (percent: number, stage: string) => void,
): Promise<Buffer> {
  let workingBuffer = inputBuffer;

  if (settings.removeWatermark) {
    onProgress?.(2, "Removing watermark...");
    workingBuffer = await removeWatermarkMedian(workingBuffer);
  }

  let resultBuffer: Buffer;

  try {
    resultBuffer = await removeBackground(
      workingBuffer,
      outputDir,
      { model: DEFAULT_MODEL },
      onProgress,
    );
  } catch (err) {
    const isOom = isMemoryAllocError(err);
    if (!isOom) throw err;

    onProgress?.(5, `Retrying with fallback model (${FALLBACK_MODEL})`);
    resultBuffer = await removeBackground(
      workingBuffer,
      outputDir,
      { model: FALLBACK_MODEL },
      onProgress,
    );
  }

  resultBuffer = await applyDefringe(resultBuffer, settings.defringe);

  if (settings.outputFormat === "webp") {
    resultBuffer = await sharp(resultBuffer).webp({ lossless: true }).toBuffer();
  }

  return resultBuffer;
}

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler("transparency-fixer", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  const resultBuffer = await processTransparencyFix(
    input,
    settings,
    ctx.scratchDir,
    (percent, stage) => ctx.report(Math.min(percent, 95), stage),
  );

  const outputExt = settings.outputFormat === "webp" ? "webp" : "png";
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
  const contentType = outputExt === "webp" ? "image/webp" : "image/png";

  return {
    buffer: resultBuffer,
    filename: outputFilename,
    contentType,
    resultPayload: {
      filename: data.filename,
    },
  };
});

export function registerTransparencyFixer(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/transparency-fixer",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isToolInstalled(TOOL_ID)) {
        const bundle = getBundleForTool(TOOL_ID);
        return reply.status(501).send({
          error: "Feature not installed",
          code: "FEATURE_NOT_INSTALLED",
          feature: TOOL_BUNDLE_MAP[TOOL_ID],
          featureName: bundle?.name ?? TOOL_ID,
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
        request.log.error({ err, toolId: TOOL_ID }, "Input decoding failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
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

      await enqueueToolJob({
        jobId,
        toolId: TOOL_ID,
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

      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    },
  );

  // Pipeline/batch registry
  registerToolProcessFn({
    toolId: TOOL_ID,
    settingsSchema,
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const resultBuffer = await processTransparencyFix(orientedBuffer, s, scratchDir);

        const outputExt = s.outputFormat === "webp" ? "webp" : "png";
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
        const contentType = outputExt === "webp" ? "image/webp" : "image/png";
        return { buffer: resultBuffer, filename: outputFilename, contentType };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
