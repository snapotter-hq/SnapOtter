import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { stripInternalPaths } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";

const execFileAsync = promisify(execFile);

/**
 * Image info route - read-only, returns JSON metadata.
 * Does NOT use createToolRoute since it doesn't produce a processed file.
 */
export function registerInfo(app: FastifyInstance) {
  app.post("/api/v1/tools/image/info", async (request: FastifyRequest, reply: FastifyReply) => {
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
          filename = sanitizeFilename(part.filename ?? "image");
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    try {
      // Detect format for CLI-decoded formats (PSD, TGA, EXR, HDR, ICO, RAW)
      const validation = await validateImageBuffer(fileBuffer, filename);
      const detectedFormat = validation.valid ? validation.format : null;

      // Pre-decode formats Sharp can't fully handle (needs pixel decoding for stats).
      // HEIC/HEIF: Sharp can read container headers but can't decode HEVC pixels,
      // so unconditionally pre-decode to PNG (matching createToolRoute behavior).
      let metaBuffer = fileBuffer;
      const ext = filename.split(".").pop()?.toLowerCase();

      if (detectedFormat === "heif") {
        metaBuffer = await decodeHeic(fileBuffer);
      } else if (detectedFormat && needsCliDecode(detectedFormat)) {
        metaBuffer = await decodeToSharpCompat(fileBuffer, detectedFormat, ext);
      } else {
        let sharpDirectFailed = false;
        try {
          await sharp(fileBuffer).metadata();
        } catch {
          sharpDirectFailed = true;
        }
        if (sharpDirectFailed) {
          metaBuffer = await decodeHeic(fileBuffer);
        }
      }

      const metadata = await sharp(metaBuffer).metadata();
      const stats = await sharp(metaBuffer).stats();

      // Build histogram data from stats
      const histogram = stats.channels.map((ch, i) => ({
        channel: ["red", "green", "blue", "alpha"][i] ?? `channel-${i}`,
        min: ch.min,
        max: ch.max,
        mean: Math.round(ch.mean * 100) / 100,
        stdev: Math.round(ch.stdev * 100) / 100,
      }));

      // For RAW formats, Sharp reads the embedded thumbnail -- enrich with
      // ExifTool to get the real sensor dimensions and EXIF/ICC/XMP flags.
      const exif = detectedFormat === "raw" ? await readExifToolMeta(fileBuffer, ext) : null;

      return reply.send({
        filename,
        fileSize: fileBuffer.length,
        width: exif?.width ?? metadata.width ?? 0,
        height: exif?.height ?? metadata.height ?? 0,
        format: exif?.format ?? metadata.format ?? "unknown",
        channels: metadata.channels ?? 0,
        hasAlpha: metadata.hasAlpha ?? false,
        colorSpace: exif?.colorSpace ?? metadata.space ?? "unknown",
        density: metadata.density ?? exif?.density ?? null,
        isProgressive: metadata.isProgressive ?? false,
        orientation: metadata.orientation ?? null,
        hasProfile: metadata.hasProfile ?? false,
        hasExif: exif?.hasExif ?? !!metadata.exif,
        hasIcc: exif?.hasIcc ?? !!metadata.icc,
        hasXmp: exif?.hasXmp ?? !!metadata.xmp,
        bitDepth: exif?.bitDepth ?? metadata.depth ?? null,
        pages: metadata.pages ?? 1,
        histogram,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Failed to read image metadata",
        details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
      });
    }
  });
}

interface ExifMeta {
  width: number;
  height: number;
  format: string;
  colorSpace: string | null;
  density: number | null;
  bitDepth: string | null;
  hasExif: boolean;
  hasIcc: boolean;
  hasXmp: boolean;
}

async function readExifToolMeta(buffer: Buffer, ext?: string): Promise<ExifMeta | null> {
  const suffix = ext ? `.${ext}` : ".dng";
  const tmpPath = join(tmpdir(), `info-exif-${Date.now()}${suffix}`);
  try {
    await writeFile(tmpPath, buffer);
    const { stdout } = await execFileAsync(
      "exiftool",
      [
        "-j",
        "-ImageWidth",
        "-ImageHeight",
        "-FileType",
        "-BitsPerSample",
        "-ColorSpace",
        "-XResolution",
        "-ICCProfileName",
        "-EXIF:all",
        "-XMP:XMPToolkit",
        tmpPath,
      ],
      { timeout: 10_000 },
    );
    const [data] = JSON.parse(stdout);
    if (!data) return null;

    return {
      width: data.ImageWidth ?? 0,
      height: data.ImageHeight ?? 0,
      format: (data.FileType ?? "raw").toLowerCase(),
      colorSpace: data.ColorSpace ?? null,
      density: data.XResolution ?? null,
      bitDepth: data.BitsPerSample ? String(data.BitsPerSample) : null,
      hasExif: Object.keys(data).some((k) => k.startsWith("EXIF:") || k === "ExifVersion"),
      hasIcc: !!data.ICCProfileName,
      hasXmp: !!data.XMPToolkit,
    };
  } catch {
    return null;
  } finally {
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}
