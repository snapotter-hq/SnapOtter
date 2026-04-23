import { basename } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";

const settingsSchema = z.object({
  outputFormat: z.enum(["original", "jpeg", "png", "webp", "avif"]).default("original"),
  quality: z.number().int().min(1).max(100).default(80),
  maxWidth: z.number().int().min(0).default(0),
  maxHeight: z.number().int().min(0).default(0),
});

interface FileResult {
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  encodedSize: number;
  overheadPercent: number;
  base64: string;
  dataUri: string;
}

interface FileError {
  filename: string;
  error: string;
}

const MIME_MAP: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  tiff: "image/tiff",
  bmp: "image/bmp",
  ico: "image/x-icon",
  heic: "image/jpeg",
  heif: "image/jpeg",
};

function detectMimeType(format: string): string {
  return MIME_MAP[format.toLowerCase()] ?? "application/octet-stream";
}

export function registerImageToBase64(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image-to-base64",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const files: Array<{ buffer: Buffer; filename: string }> = [];
      let settings = {};

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            files.push({
              buffer: Buffer.concat(chunks),
              filename: basename(part.filename ?? "image"),
            });
          } else if (part.fieldname === "settings") {
            try {
              settings = JSON.parse(part.value as string);
            } catch {
              // ignore invalid JSON, use defaults
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (files.length === 0) {
        return reply.status(400).send({ error: "No image files provided" });
      }

      const parsed = settingsSchema.safeParse(settings);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const opts = parsed.data;

      const results: FileResult[] = [];
      const errors: FileError[] = [];

      for (const { buffer, filename } of files) {
        try {
          const originalSize = buffer.length;

          // Decode HEIC/HEIF to PNG for Sharp compatibility
          const decoded = await ensureSharpCompat(buffer);
          let pipeline = sharp(decoded);

          // Get original metadata for dimensions
          const metadata = await pipeline.metadata();
          let width = metadata.width ?? 0;
          let height = metadata.height ?? 0;

          // Apply resize if requested
          if (opts.maxWidth > 0 || opts.maxHeight > 0) {
            pipeline = pipeline.resize({
              width: opts.maxWidth > 0 ? opts.maxWidth : undefined,
              height: opts.maxHeight > 0 ? opts.maxHeight : undefined,
              fit: "inside",
              withoutEnlargement: true,
            });
          }

          // Determine output format and encode
          let outputBuffer: Buffer;
          let mimeType: string;
          const ext = filename.split(".").pop()?.toLowerCase() ?? "";
          const isHeic = ["heic", "heif", "hif"].includes(ext);

          if (opts.outputFormat !== "original") {
            switch (opts.outputFormat) {
              case "jpeg":
                outputBuffer = await pipeline.jpeg({ quality: opts.quality }).toBuffer();
                mimeType = "image/jpeg";
                break;
              case "png":
                outputBuffer = await pipeline.png().toBuffer();
                mimeType = "image/png";
                break;
              case "webp":
                outputBuffer = await pipeline.webp({ quality: opts.quality }).toBuffer();
                mimeType = "image/webp";
                break;
              case "avif":
                outputBuffer = await pipeline.avif({ quality: opts.quality, effort: 4 }).toBuffer();
                mimeType = "image/avif";
                break;
              default:
                outputBuffer = await pipeline.toBuffer();
                mimeType = detectMimeType(ext);
            }
          } else if (isHeic) {
            outputBuffer = await pipeline.jpeg({ quality: opts.quality }).toBuffer();
            mimeType = "image/jpeg";
          } else if (ext === "svg" || ext === "svgz") {
            outputBuffer = buffer;
            mimeType = "image/svg+xml";
          } else if (opts.maxWidth > 0 || opts.maxHeight > 0) {
            // Resize requested - must go through Sharp pipeline
            outputBuffer = await pipeline.toBuffer();
            mimeType = detectMimeType(metadata.format ?? ext);
          } else {
            // No conversion, no resize - pass through decoded buffer as-is
            outputBuffer = decoded;
            mimeType = detectMimeType(metadata.format ?? ext);
          }

          // Get final dimensions after resize
          if (opts.maxWidth > 0 || opts.maxHeight > 0) {
            const resizedMeta = await sharp(outputBuffer).metadata();
            width = resizedMeta.width ?? width;
            height = resizedMeta.height ?? height;
          }

          const base64 = outputBuffer.toString("base64");
          const encodedSize = Buffer.byteLength(base64, "utf8");
          const overheadPercent =
            originalSize > 0
              ? Math.round(((encodedSize - originalSize) / originalSize) * 1000) / 10
              : 0;

          results.push({
            filename,
            mimeType,
            width,
            height,
            originalSize,
            encodedSize,
            overheadPercent,
            base64,
            dataUri: `data:${mimeType};base64,${base64}`,
          });
        } catch (err) {
          errors.push({
            filename,
            error: err instanceof Error ? err.message : "Failed to process image",
          });
        }
      }

      return reply.send({ results, errors });
    },
  );
}
