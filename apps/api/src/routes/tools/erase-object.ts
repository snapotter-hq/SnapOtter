import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { inpaint } from "@ashim/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { autoOrient } from "../../lib/auto-orient.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";

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
};

const BROWSER_PREVIEWABLE = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);

/**
 * Object eraser / inpainting route.
 * Accepts an image and a mask image, erases masked areas using LaMa.
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

    let imageBuffer: Buffer | null = null;
    let maskBuffer: Buffer | null = null;
    let filename = "image";
    let clientJobId: string | null = null;
    let format = "png";
    let quality = 95;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (part.fieldname === "mask") {
            maskBuffer = buf;
          } else {
            imageBuffer = buf;
            filename = basename(part.filename ?? "image");
          }
        } else if (part.fieldname === "clientJobId") {
          clientJobId = part.value as string;
        } else if (part.fieldname === "format") {
          format = (part.value as string) || "png";
        } else if (part.fieldname === "quality") {
          quality = Number(part.value) || 95;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }
    if (!maskBuffer || maskBuffer.length === 0) {
      return reply.status(400).send({
        error: "No mask image provided. Upload a mask as a second file with fieldname 'mask'",
      });
    }

    const imageValidation = await validateImageBuffer(imageBuffer, filename);
    if (!imageValidation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${imageValidation.reason}` });
    }
    const maskValidation = await validateImageBuffer(maskBuffer, "mask.png");
    if (!maskValidation.valid) {
      return reply.status(400).send({ error: `Invalid mask: ${maskValidation.reason}` });
    }

    try {
      request.log.info(
        {
          toolId: "erase-object",
          imageSize: imageBuffer.length,
          maskSize: maskBuffer.length,
          format,
        },
        "Starting object erasure",
      );

      // Decode HEIC/HEIF input via system decoder
      if (imageValidation.format === "heif") {
        imageBuffer = await decodeHeic(imageBuffer);
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(imageValidation.format)) {
        imageBuffer = await decodeToSharpCompat(imageBuffer, imageValidation.format);
      }

      // Auto-orient to fix EXIF rotation
      imageBuffer = await autoOrient(imageBuffer);

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      // Save input
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, imageBuffer);

      // Process
      const jobIdForProgress = clientJobId;
      const onProgress = jobIdForProgress
        ? (percent: number, stage: string) => {
            updateSingleFileProgress({
              jobId: jobIdForProgress,
              phase: "processing",
              stage,
              percent,
            });
          }
        : undefined;

      const resultBuffer = await inpaint(
        imageBuffer,
        maskBuffer,
        join(workspacePath, "output"),
        onProgress,
      );

      // Convert to the requested output format using Sharp
      const needsNodeConversion = ["heic", "heif", "avif"].includes(format);
      let outputBuffer: Buffer;
      let finalFormat = format;

      if (needsNodeConversion) {
        if (format === "heic" || format === "heif") {
          outputBuffer = await encodeHeic(resultBuffer, quality);
          finalFormat = format;
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

      // Save output
      const ext = EXT_MAP[finalFormat] || "png";
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_erased.${ext}`;
      const outputPath = join(workspacePath, "output", outputFilename);
      await writeFile(outputPath, outputBuffer);

      // Generate browser-compatible preview for non-previewable formats
      let previewUrl: string | undefined;
      if (!BROWSER_PREVIEWABLE.has(finalFormat)) {
        try {
          const previewInput =
            finalFormat === "heic" || finalFormat === "heif"
              ? await decodeHeic(outputBuffer)
              : outputBuffer;
          const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal - frontend will show fallback
        }
      }

      if (clientJobId) {
        updateSingleFileProgress({
          jobId: clientJobId,
          phase: "complete",
          percent: 100,
        });
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
        previewUrl,
        originalSize: imageBuffer.length,
        processedSize: outputBuffer.length,
      });
    } catch (err) {
      request.log.error({ err, toolId: "erase-object" }, "Object erasing failed");
      return reply.status(422).send({
        error: "Object erasing failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
