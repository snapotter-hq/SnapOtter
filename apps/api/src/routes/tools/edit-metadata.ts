import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import {
  buildTagArgs,
  type EditMetadataSettings,
  inspectMetadata,
  writeMetadata,
} from "../../lib/exiftool.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  artist: z.string().optional(),
  copyright: z.string().optional(),
  imageDescription: z.string().optional(),
  software: z.string().optional(),
  dateTime: z.string().optional(),
  dateTimeOriginal: z.string().optional(),
  clearGps: z.boolean().default(false),
  fieldsToRemove: z.array(z.string()).default([]),
  gpsLatitude: z.number().min(-90).max(90).optional(),
  gpsLongitude: z.number().min(-180).max(180).optional(),
  gpsAltitude: z.number().optional(),
  keywords: z.array(z.string()).optional(),
  keywordsMode: z.enum(["add", "set"]).default("add"),
  dateShift: z
    .string()
    .regex(/^[+-]\d{1,2}:\d{2}$/)
    .optional(),
  setAllDates: z.string().optional(),
  iptcTitle: z.string().optional(),
  iptcHeadline: z.string().optional(),
  iptcCity: z.string().optional(),
  iptcState: z.string().optional(),
  iptcCountry: z.string().optional(),
});

type Settings = z.infer<typeof settingsSchema>;

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heif: "image/heif",
};

const BROWSER_PREVIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
]);

export function registerEditMetadata(app: FastifyInstance) {
  // Inspect endpoint - returns parsed metadata via ExifTool
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
        const result = await inspectMetadata(fileBuffer, filename);
        return reply.send(result);
      } catch (err) {
        return reply.status(422).send({
          error: "Failed to read image metadata",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // Edit endpoint - writes metadata in-place using ExifTool (no pixel re-encoding)
  app.post("/api/v1/tools/edit-metadata", async (request: FastifyRequest, reply: FastifyReply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "image";
    let settingsRaw: string | null = null;

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
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
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

    const validation = await validateImageBuffer(fileBuffer, filename);
    if (!validation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
    }

    // Parse and validate settings
    let settings: Settings;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(result.error.issues),
        });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    try {
      // Build ExifTool arguments from settings
      const tags = buildTagArgs(settings as EditMetadataSettings);

      // If no changes requested, return the original buffer
      let outputBuffer: Buffer;
      if (tags.length === 0) {
        outputBuffer = fileBuffer;
      } else {
        outputBuffer = await writeMetadata(fileBuffer, filename, tags);
      }

      // Determine content type from validated format
      const contentType = MIME_BY_FORMAT[validation.format] ?? "image/jpeg";

      // Create workspace and save output
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const outputPath = join(workspacePath, "output", filename);
      await writeFile(outputPath, outputBuffer);

      // Generate preview for non-browser-previewable formats (HEIF, TIFF)
      let previewUrl: string | undefined;
      if (!BROWSER_PREVIEWABLE.has(contentType)) {
        try {
          let previewInput = outputBuffer;
          if (contentType === "image/heif" || contentType === "image/heic") {
            previewInput = await decodeHeic(outputBuffer);
          }
          const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal - frontend shows fallback
        }
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
        previewUrl,
        originalSize: fileBuffer.length,
        processedSize: outputBuffer.length,
      });
    } catch (err) {
      request.log.error({ err, toolId: "edit-metadata" }, "Metadata edit failed");
      return reply.status(422).send({
        error: "Metadata edit failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Register in pipeline/batch registry
  registerToolProcessFn({
    toolId: "edit-metadata",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as Settings;
      const tags = buildTagArgs(s as EditMetadataSettings);
      const buffer =
        tags.length > 0 ? await writeMetadata(inputBuffer, filename, tags) : inputBuffer;

      // Determine content type from extension
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const extToMime: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        avif: "image/avif",
        tiff: "image/tiff",
        tif: "image/tiff",
        gif: "image/gif",
        heic: "image/heif",
        heif: "image/heif",
      };

      return {
        buffer,
        filename,
        contentType: extToMime[ext] ?? "image/jpeg",
      };
    },
  });
}
