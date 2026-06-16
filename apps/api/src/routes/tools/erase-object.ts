import { randomUUID } from "node:crypto";
import { inpaint } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";

const settingsSchema = z.object({
  format: z
    .enum(["auto", "png", "jpg", "jpeg", "webp", "tiff", "gif", "avif", "heic", "heif", "jxl"])
    .default("auto"),
  quality: z.number().int().min(1).max(100).default(95),
});

/**
 * Object eraser / inpainting route.
 * Accepts an image and a mask image, erases masked areas using LaMa.
 *
 * Enqueues with kind "ai-tool" and uses registerAiJobHandler for the
 * worker. The mask is passed as the second entry in inputRefs and read
 * via getObjectBuffer(data.inputRefs[1]) inside the handler.
 */
export function registerEraseObject(app: FastifyInstance) {
  app.post("/api/v1/tools/erase-object", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "erase-object";
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
    let imageBuffer: Buffer | null = null;
    let maskBuffer: Buffer | null = null;
    let filename = "image";
    let clientJobId: string | null = null;
    let fileId: string | null = null;
    let format = "png";
    let quality = 95;
    let imageKey: string | null = null;
    let maskKey: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname === "mask") {
            const upload = await receiveUpload(part, jobId);
            maskKey = upload.key;
          } else {
            const upload = await receiveUpload(part, jobId);
            imageKey = upload.key;
            filename = upload.filename;
          }
        } else if (part.fieldname === "clientJobId") {
          const raw = part.value as string;
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
            clientJobId = raw;
          }
        } else if (part.fieldname === "fileId") {
          fileId = part.value as string;
        } else if (part.fieldname === "format") {
          format = (part.value as string) || "png";
        } else if (part.fieldname === "quality") {
          quality = Number(part.value) || 95;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    if (!imageKey) {
      return reply.status(400).send({ error: "No image file provided" });
    }
    if (!maskKey) {
      return reply.status(400).send({
        error: "No mask image provided. Upload a mask as a second file with fieldname 'mask'",
      });
    }

    imageBuffer = await getObjectBuffer(imageKey);
    maskBuffer = await getObjectBuffer(maskKey);

    const imageValidation = await validateImageBuffer(imageBuffer, filename);
    if (!imageValidation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${imageValidation.reason}` });
    }
    const maskValidation = await validateImageBuffer(maskBuffer, "mask.png");
    if (!maskValidation.valid) {
      return reply.status(400).send({ error: `Invalid mask: ${maskValidation.reason}` });
    }

    // Validate format and quality via Zod
    const settingsResult = settingsSchema.safeParse({ format, quality });
    if (!settingsResult.success) {
      return reply.status(400).send({
        error: "Invalid settings",
        details: settingsResult.error.issues
          .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
          .join("; "),
      });
    }
    format = settingsResult.data.format;
    quality = settingsResult.data.quality;

    if (format === "auto") {
      const detected = await resolveOutputFormat(imageBuffer, filename);
      format = detected.format === "jpeg" ? "jpg" : detected.format;
      quality = detected.quality;
    }

    try {
      if (imageValidation.format === "heif") {
        imageBuffer = await decodeHeic(imageBuffer);
      }
      if (needsCliDecode(imageValidation.format)) {
        imageBuffer = await decodeToSharpCompat(imageBuffer, imageValidation.format);
      }
      imageBuffer = await autoOrient(imageBuffer);
    } catch (err) {
      request.log.error({ err, toolId: "erase-object" }, "Input decoding failed");
      return reply.status(422).send({
        error: "Object erasing failed",
        details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
      });
    }

    // Write decoded image for the worker
    const decodedKey = `uploads/${jobId}/${filename}`;
    if (decodedKey !== imageKey) {
      await putObject(decodedKey, imageBuffer);
      imageKey = decodedKey;
    } else {
      await putObject(imageKey, imageBuffer);
    }

    const progressJobId = clientJobId || jobId;

    // Enqueue with both image and mask as inputRefs; the worker handler
    // reads them via getObjectBuffer.
    await enqueueToolJob({
      jobId,
      toolId,
      userId,
      pool: "ai",
      inputRefs: [imageKey, maskKey],
      filename,
      settings: { format, quality },
      clientJobId: clientJobId ?? undefined,
      fileId: fileId ?? undefined,
      kind: "ai-tool",
    });

    return reply.status(202).send({ jobId: progressJobId, async: true });
  });
}

// ── AI job handler (separate import for the worker) ───────────────
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";

registerAiJobHandler("erase-object", async (input, data, ctx) => {
  // Second inputRef is the mask
  const maskBuffer = await getObjectBuffer(data.inputRefs[1]);
  const settings = settingsSchema.parse(data.settings);
  const format = settings.format;
  const quality = settings.quality;

  const resultBuffer = await inpaint(input, maskBuffer, ctx.scratchDir, (percent, stage) =>
    ctx.report(percent, stage),
  );

  // Convert to requested output format
  const needsNodeConversion = ["heic", "heif", "avif", "jxl"].includes(format);
  let outputBuffer: Buffer;
  let finalFormat = format;

  if (needsNodeConversion) {
    if (format === "heic" || format === "heif") {
      outputBuffer = await encodeHeic(resultBuffer, quality);
      finalFormat = format;
    } else if (format === "jxl") {
      outputBuffer = await encodeJxl(resultBuffer, quality);
      finalFormat = "jxl";
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
  const ext = EXT_MAP[finalFormat] || "png";
  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_erased.${ext}`;

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

  return {
    buffer: outputBuffer,
    filename: outputFilename,
    contentType: CONTENT_TYPES[finalFormat] || "image/png",
  };
});
