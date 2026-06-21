import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { encodeMultiIco, hasMagick } from "../../lib/format-encoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

const settingsSchema = z.object({
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  padding: z.number().int().min(0).max(40).default(0),
  radius: z.number().int().min(0).max(50).default(0),
  sizes: z.array(z.number().int()).optional(),
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
});

type FaviconSettings = z.infer<typeof settingsSchema>;

const FAVICON_SIZES = [
  { name: "favicon-16x16.png", size: 16, format: "png" as const },
  { name: "favicon-32x32.png", size: 32, format: "png" as const },
  { name: "favicon-48x48.png", size: 48, format: "png" as const },
  { name: "apple-touch-icon.png", size: 180, format: "png" as const },
  { name: "android-chrome-192x192.png", size: 192, format: "png" as const },
  { name: "android-chrome-512x512.png", size: 512, format: "png" as const },
];

/** Build a single icon at the given pixel size with styling applied. */
async function buildIcon(source: Buffer, size: number, settings: FaviconSettings): Promise<Buffer> {
  const inset = settings.padding > 0 ? Math.round((size * settings.padding) / 100) : 0;
  const contentSize = Math.max(1, size - 2 * inset);

  let pipeline = sharp(source).resize(contentSize, contentSize, { fit: "cover" });

  if (settings.background) {
    pipeline = pipeline.flatten({ background: settings.background });
  }

  if (inset > 0) {
    pipeline = pipeline.extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: settings.background || { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  if (settings.radius > 0) {
    const rx = Math.round((size * settings.radius) / 100);
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="white"/></svg>`,
    );
    pipeline = pipeline.ensureAlpha().composite([{ input: mask, blend: "dest-in" }]);
  }

  return pipeline.png().toBuffer();
}

interface UploadedFile {
  buffer: Buffer;
  filename: string;
}

export function registerFavicon(app: FastifyInstance) {
  app.post("/api/v1/tools/image/favicon", async (request, reply) => {
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

        // Force a full pixel decode now. Header validation alone lets
        // truncated files through, and a decode failure after reply.hijack()
        // cannot be turned into an error response anymore.
        if (validation.format !== "svg") {
          await sharp(buf).stats();
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

    let settings: FaviconSettings = { padding: 0, radius: 0, themeColor: "#ffffff" };

    if (settingsRaw) {
      try {
        const parsed = JSON.parse(settingsRaw);
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
    }

    try {
      const jobId = randomUUID();
      const isSingleFile = decodedFiles.length === 1;
      const filteredSizes = settings.sizes
        ? FAVICON_SIZES.filter((s) => settings.sizes?.includes(s.size))
        : FAVICON_SIZES;

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

        for (const icon of filteredSizes) {
          const buffer = await buildIcon(file.buffer, icon.size, settings);
          archive.append(buffer, { name: `${prefix}${icon.name}` });
        }

        // Generate a true multi-size ICO (16/32/48/256) via ImageMagick
        // when available; fall back to a single 32px PNG renamed .ico otherwise.
        const magickReady = await hasMagick();
        if (magickReady) {
          const icoId = randomUUID();
          const icoSizes = [16, 32, 48, 256];
          const icoPaths: string[] = [];
          const icoOutPath = join(tmpdir(), `favicon-${icoId}.ico`);
          try {
            for (const sz of icoSizes) {
              const pngPath = join(tmpdir(), `favicon-${icoId}-${sz}.png`);
              const buf = await buildIcon(file.buffer, sz, settings);
              await writeFile(pngPath, buf);
              icoPaths.push(pngPath);
            }
            await encodeMultiIco(icoPaths, icoOutPath);
            const icoData = await readFile(icoOutPath);
            archive.append(icoData, { name: `${prefix}favicon.ico` });
          } finally {
            for (const p of [...icoPaths, icoOutPath]) {
              await rm(p, { force: true }).catch(() => {});
            }
          }
        } else {
          const ico32 = await buildIcon(file.buffer, 32, settings);
          archive.append(ico32, { name: `${prefix}favicon.ico` });
        }

        const manifestIcons = filteredSizes
          .filter((s) => s.size === 192 || s.size === 512)
          .map((s) => ({
            src: `/${s.name}`,
            sizes: `${s.size}x${s.size}`,
            type: "image/png",
          }));
        const manifest = {
          name: stem,
          short_name: stem,
          icons: manifestIcons,
          theme_color: settings.themeColor,
          background_color: settings.themeColor,
          display: "standalone",
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: `${prefix}manifest.json` });

        const snippetLines = ["<!-- Favicons -->"];
        for (const s of filteredSizes) {
          if (s.name.startsWith("android-chrome")) continue;
          if (s.name === "apple-touch-icon.png") {
            snippetLines.push(
              `<link rel="apple-touch-icon" sizes="${s.size}x${s.size}" href="/${s.name}">`,
            );
          } else {
            snippetLines.push(
              `<link rel="icon" type="image/png" sizes="${s.size}x${s.size}" href="/${s.name}">`,
            );
          }
        }
        snippetLines.push('<link rel="manifest" href="/manifest.json">');
        archive.append(`${snippetLines.join("\n")}\n`, {
          name: `${prefix}favicon-snippet.html`,
        });
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
      // The ZIP stream already started; end the connection so clients see a
      // truncated transfer instead of hanging forever.
      reply.raw.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
