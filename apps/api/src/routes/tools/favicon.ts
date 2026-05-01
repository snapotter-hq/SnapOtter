import { randomUUID } from "node:crypto";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";

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

    // Validate all uploaded files
    for (const file of uploadedFiles) {
      const validation = await validateImageBuffer(file.buffer, file.filename);
      if (!validation.valid) {
        return reply
          .status(400)
          .send({ error: `Invalid file "${file.filename}": ${validation.reason}` });
      }
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
      const isSingleFile = uploadedFiles.length === 1;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="favicons-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      for (const file of uploadedFiles) {
        // Decode HEIC/HEIF if needed, then normalize EXIF orientation
        const decoded = await autoOrient(await ensureSharpCompat(file.buffer));
        const stem = sanitizeFilename(file.filename).replace(/\.[^.]+$/, "");
        // Single file: flat structure. Multiple files: per-image folders.
        const prefix = isSingleFile ? "" : `${stem}/`;

        // Generate each size
        for (const icon of FAVICON_SIZES) {
          const buffer = await sharp(decoded)
            .resize(icon.size, icon.size, { fit: "cover" })
            .png()
            .toBuffer();
          archive.append(buffer, { name: `${prefix}${icon.name}` });
        }

        // Generate ICO (32x32 PNG as ICO)
        const ico32 = await sharp(decoded).resize(32, 32, { fit: "cover" }).png().toBuffer();
        archive.append(ico32, { name: `${prefix}favicon.ico` });

        // Generate manifest.json (for PWA)
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

        // Generate HTML snippet
        const htmlSnippet = `<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
`;
        archive.append(htmlSnippet, { name: `${prefix}favicon-snippet.html` });
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
