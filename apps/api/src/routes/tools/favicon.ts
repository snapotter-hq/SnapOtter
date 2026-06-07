import { randomUUID } from "node:crypto";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { getSecurityHeaders } from "../../lib/csp.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

const settingsSchema = z.object({}).passthrough();

const FAVICON_SIZES = [
  { name: "favicon-16x16.png", size: 16, format: "png" as const },
  { name: "favicon-32x32.png", size: 32, format: "png" as const },
  { name: "favicon-48x48.png", size: 48, format: "png" as const },
  { name: "apple-touch-icon.png", size: 180, format: "png" as const },
  { name: "android-chrome-192x192.png", size: 192, format: "png" as const },
  { name: "android-chrome-512x512.png", size: 512, format: "png" as const },
];

interface UploadedFile {
  buffer: Buffer;
  filename: string;
}

export function registerFavicon(app: FastifyInstance) {
  app.post("/api/v1/tools/favicon", async (request, reply) => {
    const uploadedFiles: UploadedFile[] = [];
    let settingsRaw: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const filename = sanitizeFilename(part.filename ?? `image-${uploadedFiles.length + 1}`);
          uploadedFiles.push({ buffer, filename });
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

    if (uploadedFiles.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    // Validate and decode all files before streaming the ZIP response.
    // This ensures format errors are caught before reply.hijack() is called.
    // Files that fail to decode are skipped (noted in the ZIP) rather than
    // aborting the entire batch.
    interface DecodedFile {
      buffer: Buffer;
      filename: string;
    }
    const decodedFiles: DecodedFile[] = [];
    const skippedFiles: { filename: string; reason: string }[] = [];

    for (const file of uploadedFiles) {
      const validation = await validateImageBuffer(file.buffer, file.filename);
      if (!validation.valid) {
        skippedFiles.push({ filename: file.filename, reason: validation.reason });
        continue;
      }

      let buf = file.buffer;
      const fileExt = file.filename.split(".").pop()?.toLowerCase();

      try {
        // Decode HEIC/HEIF via system decoder
        if (validation.format === "heif") {
          buf = await decodeHeic(buf);
        }

        // Decode exotic formats (PSD, EXR, HDR, BMP, JXL, JP2, RAW, etc.)
        if (needsCliDecode(validation.format)) {
          try {
            buf = await decodeToSharpCompat(buf, validation.format, fileExt);
          } catch {
            await sharp(buf).metadata();
          }
        }

        // Sanitize SVG input
        if (validation.format === "svg") {
          buf = decompressSvgz(buf);
          buf = sanitizeSvg(buf);
        }

        // Auto-orient EXIF rotation (skip for SVG)
        if (validation.format !== "svg") {
          buf = await autoOrient(buf);
        }

        decodedFiles.push({ buffer: buf, filename: file.filename });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown decode error";
        skippedFiles.push({ filename: file.filename, reason });
      }
    }

    if (decodedFiles.length === 0) {
      const first = skippedFiles[0];
      return reply.status(400).send({
        error:
          skippedFiles.length === 1
            ? `Invalid file "${first.filename}": ${first.reason}`
            : "No images could be decoded",
        skipped: skippedFiles.length > 1 ? skippedFiles : undefined,
      });
    }

    if (settingsRaw) {
      try {
        const parsed = JSON.parse(settingsRaw);
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }
    }

    try {
      const jobId = randomUUID();
      const isSingleFile = decodedFiles.length === 1;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="favicons-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
        ...getSecurityHeaders(),
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      for (const file of decodedFiles) {
        const stem = sanitizeFilename(file.filename).replace(/\.[^.]+$/, "");
        const prefix = isSingleFile ? "" : `${stem}/`;

        for (const icon of FAVICON_SIZES) {
          const buffer = await sharp(file.buffer)
            .resize(icon.size, icon.size, { fit: "cover" })
            .png()
            .toBuffer();
          archive.append(buffer, { name: `${prefix}${icon.name}` });
        }

        const ico32 = await sharp(file.buffer).resize(32, 32, { fit: "cover" }).png().toBuffer();
        archive.append(ico32, { name: `${prefix}favicon.ico` });

        const manifest = {
          name: stem,
          short_name: stem,
          icons: [
            { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
          ],
          theme_color: "#ffffff",
          background_color: "#ffffff",
          display: "standalone",
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: `${prefix}manifest.json` });

        const htmlSnippet = `<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
`;
        archive.append(htmlSnippet, { name: `${prefix}favicon-snippet.html` });
      }

      if (skippedFiles.length > 0) {
        const lines = skippedFiles.map((s) => `- ${s.filename}: ${s.reason}`);
        archive.append(`The following files could not be processed:\n\n${lines.join("\n")}\n`, {
          name: "skipped-files.txt",
        });
      }

      await archive.finalize();
    } catch (err) {
      if (!reply.raw.headersSent) {
        return reply.status(422).send({
          error: "Favicon generation failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  });
}
