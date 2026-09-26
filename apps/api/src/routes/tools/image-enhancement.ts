import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noiseRemoval } from "@snapotter/ai";
import { analyzeImage, applyCorrections } from "@snapotter/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { runPerFrame } from "../../lib/animated-image.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { reportError } from "../../lib/error-report.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { logger } from "../../lib/logger.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["auto", "portrait", "landscape", "low-light", "food", "document"]).default("auto"),
  intensity: z.number().min(0).max(100).default(50),
  corrections: z
    .object({
      exposure: z.boolean().default(true),
      contrast: z.boolean().default(true),
      whiteBalance: z.boolean().default(true),
      saturation: z.boolean().default(true),
      sharpness: z.boolean().default(true),
      denoise: z.boolean().default(true),
    })
    .default({}),
  deepEnhance: z.boolean().default(false),
});

type EnhancementSettings = z.infer<typeof settingsSchema>;

/**
 * Why a requested Deep Enhance pass did not run, returned to the client as
 * `resultPayload.deepEnhanceSkipped` so the panel can say so instead of
 * presenting the standard result as the deep one (#950).
 */
export type DeepEnhanceSkipReason = "failed" | "unavailable" | "animated";

export async function processImageEnhancement(
  rawBuffer: Buffer,
  settings: EnhancementSettings,
  filename: string,
) {
  const outputFormat = await resolveOutputFormat(rawBuffer, filename);

  // Measure once, for the whole upload. Analysing each frame of an animation
  // separately gives every frame its own auto exposure and white balance, so a
  // frame that happens to be darker gets lifted and the next one does not, which
  // plays back as flicker (#1083).
  let analysis: Awaited<ReturnType<typeof analyzeImage>>;
  try {
    // HDR/EXR decodes can produce 16-bit buffers; CLAHE requires 8-bit (VIPS_FORMAT_UCHAR)
    let analysisSource = rawBuffer;
    const rawMeta = await sharp(analysisSource).metadata();
    if (rawMeta.depth && rawMeta.depth !== "uchar") {
      analysisSource = await sharp(analysisSource).toColourspace("srgb").png().toBuffer();
    }
    // analyzeImage() -> .stats() is the first full pixel decode; intake only
    // parsed headers, so undecodable-but-well-formed files fail here (#897)
    analysis = await analyzeImage(analysisSource);
  } catch (err) {
    throw await asInputErrorIfUndecodable(rawBuffer, err);
  }

  let deepEnhanceSkipped: DeepEnhanceSkipReason | undefined;

  // The alpha channel is split out and rejoined through separate pipelines, and
  // a rejoin re-opens the buffer as a still, so animation is handled a frame at
  // a time (#1083).
  const core = async (frameBuffer: Buffer, allowDeep: boolean): Promise<Buffer> => {
    let inputBuffer = frameBuffer;
    const inputMeta = await sharp(inputBuffer).metadata();
    if (inputMeta.depth && inputMeta.depth !== "uchar") {
      inputBuffer = await sharp(inputBuffer).toColourspace("srgb").png().toBuffer();
    }
    const meta = await sharp(inputBuffer).metadata();
    const hasAlpha = meta.hasAlpha === true;

    let alphaBuffer: Buffer | undefined;
    if (hasAlpha) {
      // .png() is load-bearing. A bare toBuffer() re-encodes in whatever the
      // input was, and Sharp's GIF writer reuses the palette it read the image
      // in with, so a one-band alpha mask has to be expressed in that palette's
      // colors instead of staying a mask (issue #1187, same trap as #1180).
      alphaBuffer = await sharp(inputBuffer).extractChannel(3).png().toBuffer();
    }

    let image = sharp(inputBuffer);
    if (hasAlpha) {
      image = image.removeAlpha();
    }

    image = applyCorrections(
      image,
      analysis.corrections,
      settings.mode,
      settings.intensity,
      settings.corrections,
      { width: meta.width ?? 1, height: meta.height ?? 1 },
    );

    let buffer: Buffer;
    if (alphaBuffer) {
      // The corrected color pass has to land as a named lossless intermediate
      // here too, not the final output format. Materializing straight to GIF
      // carries the read-time GIF palette forward, so the encoder quantizes
      // the corrected pixels against a palette built for the pre-correction
      // image, and rereading those bytes for joinChannel() gets back a GIF
      // decode that always reports a fourth (phantom, always-opaque) alpha
      // band. joinChannel() then appends the real mask as a fifth channel,
      // which the final encoder silently drops, so alpha ends up wrong
      // regardless of what alphaBuffer itself holds (issue #1187).
      const colorBuffer = await image.png().toBuffer();
      buffer = await sharp(colorBuffer)
        .joinChannel(alphaBuffer)
        .toFormat(outputFormat.format, outputFormat.encoderOptions)
        .toBuffer();
    } else {
      // No intermediate to break the lineage on this branch, so the encoder
      // still holds the palette it read the GIF with and quantizes the
      // corrected pixels back onto their pre-correction colours: the tool
      // returned the input unchanged, with a 200 (#1219). encoderOptions
      // carries the fresh-palette request that fixes it.
      buffer = await image.toFormat(outputFormat.format, outputFormat.encoderOptions).toBuffer();
    }

    if (!settings.deepEnhance || !allowDeep) return buffer;
    if (!isToolInstalled("noise-removal")) {
      deepEnhanceSkipped = "unavailable";
      return buffer;
    }

    const scratchDir = join(tmpdir(), "snapotter-scratch", randomUUID());
    try {
      await mkdir(scratchDir, { recursive: true });
      const result = await noiseRemoval(buffer, scratchDir, {
        tier: "quality",
        strength: 35,
        detailPreservation: 70,
        colorNoise: 20,
      });
      return result.buffer;
    } catch (err) {
      // isToolInstalled() only filters out bundles the install record says
      // are absent, so what lands here is a pass that was meant to run and
      // broke: a sidecar crash, an OOM, a bad scratch dir, missing or corrupt
      // model files. The Sharp-only result is still the right response, but
      // the failure has to stay visible in the logs, in Sentry, and to the user.
      logger.warn(
        { err, toolId: "image-enhancement" },
        "deep enhance failed, returning the Sharp-only result",
      );
      void reportError(err, { source: "worker", toolId: "image-enhancement" });
      deepEnhanceSkipped = "failed";
      return buffer;
    } finally {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  // Deep Enhance never runs per frame (#1183): one SCUNet call per frame is up
  // to 500 sidecar round trips for one job, and denoising each frame on its
  // own plays back as flicker. Animations get the standard pass on every frame
  // and a reason the client can show.
  const perFrame = await runPerFrame(rawBuffer, outputFormat.format, (frame) => core(frame, false));
  if (perFrame && settings.deepEnhance) deepEnhanceSkipped = "animated";
  const finalBuffer = perFrame ?? (await core(rawBuffer, true));

  return {
    buffer: finalBuffer,
    filename,
    contentType: outputFormat.contentType,
    ...(deepEnhanceSkipped && { resultPayload: { deepEnhanceSkipped } }),
  };
}

export function registerImageEnhancement(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "image-enhancement",
    settingsSchema,
    process: withImageEncodeContext<EnhancementSettings>(
      "Image enhancement failed",
      (s) => s.mode,
      processImageEnhancement,
    ),
  });

  app.post(
    "/api/v1/tools/image/image-enhancement/analyze",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = part.filename ?? "image";
            break;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      if (validation.format === "heif") {
        try {
          fileBuffer = await decodeHeic(fileBuffer);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode HEIC file",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        try {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
        } catch (err) {
          return reply.status(422).send({
            error: `Failed to decode ${validation.format} file`,
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        fileBuffer = await autoOrient(fileBuffer);
        const analysis = await analyzeImage(fileBuffer);
        return reply.send(analysis);
      } catch (err) {
        return reply.status(422).send({
          error: "Analysis failed",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
