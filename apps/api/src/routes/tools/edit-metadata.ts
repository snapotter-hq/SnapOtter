import { basename } from "node:path";
import { editMetadata, parseExif, parseGps, parseXmp } from "@stirling-image/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  artist: z.string().optional(),
  copyright: z.string().optional(),
  imageDescription: z.string().optional(),
  software: z.string().optional(),
  dateTime: z.string().optional(),
  dateTimeOriginal: z.string().optional(),
  clearGps: z.boolean().default(false),
  fieldsToRemove: z.array(z.string()).default([]),
});

export function registerEditMetadata(app: FastifyInstance) {
  // Inspect endpoint - returns parsed metadata as JSON
  app.post(
    "/api/v1/tools/edit-metadata/inspect",
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
            filename = basename(part.filename ?? "image");
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      try {
        const metadata = await sharp(fileBuffer).metadata();
        const result: Record<string, unknown> = {
          filename,
          fileSize: fileBuffer.length,
        };

        if (metadata.exif) {
          try {
            const parsed = parseExif(metadata.exif);
            const exifData: Record<string, unknown> = {
              ...parsed.image,
              ...parsed.photo,
              ...parsed.iop,
            };
            const gpsData: Record<string, unknown> = { ...parsed.gps };

            if (Object.keys(parsed.gps).length > 0) {
              const coords = parseGps(parsed.gps);
              if (coords.latitude !== null) gpsData._latitude = coords.latitude;
              if (coords.longitude !== null) gpsData._longitude = coords.longitude;
              if (coords.altitude !== null) gpsData._altitude = coords.altitude;
            }

            if (Object.keys(exifData).length > 0) result.exif = exifData;
            if (Object.keys(gpsData).length > 0) result.gps = gpsData;
          } catch {
            result.exif = null;
            result.exifError = "Failed to parse EXIF data";
          }
        }

        if (metadata.xmp) {
          try {
            result.xmp = parseXmp(metadata.xmp);
          } catch {
            result.xmp = null;
          }
        }

        return reply.send(result);
      } catch (err) {
        return reply.status(422).send({
          error: "Failed to read image metadata",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // Edit endpoint - writes metadata and returns updated image
  createToolRoute(app, {
    toolId: "edit-metadata",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const metadata = await sharp(inputBuffer).metadata();
      const format = metadata.format ?? "jpeg";
      const image = sharp(inputBuffer);
      const result = await editMetadata(image, settings);

      switch (format) {
        case "jpeg":
          result.jpeg({ quality: 95, mozjpeg: true });
          break;
        case "png":
          result.png({ compressionLevel: 6 });
          break;
        case "webp":
          result.webp({ quality: 90 });
          break;
        case "avif":
          result.avif({ quality: 60 });
          break;
        case "tiff":
          result.tiff({ quality: 90 });
          break;
        default:
          result.jpeg({ quality: 95 });
          break;
      }

      const buffer = await result.toBuffer();
      const ext = format === "jpeg" ? "jpg" : format;
      const outFilename = filename.replace(/\.[^.]+$/, `.${ext}`);
      const mimeMap: Record<string, string> = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        avif: "image/avif",
        tiff: "image/tiff",
        gif: "image/gif",
      };

      return {
        buffer,
        filename: outFilename,
        contentType: mimeMap[format] ?? "image/jpeg",
      };
    },
  });
}
