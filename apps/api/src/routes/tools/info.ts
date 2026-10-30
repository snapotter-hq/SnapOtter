import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { hasServerErrorStatus } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { stripInternalPaths } from "../../lib/errors.js";
import { isRawExtension, validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError } from "../../lib/object-storage.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgClientError,
  isSvgzClientError,
  sanitizeSvg,
} from "../../lib/svg-sanitize.js";

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
      const failure = multipartFailure(err);
      return reply.status(failure.status).send(failure.body);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    // Detect format for CLI-decoded formats (PSD, TGA, EXR, HDR, ICO, RAW)
    const validation = await validateImageBuffer(fileBuffer, filename);
    const detectedFormat = validation.valid ? validation.format : null;

    // Pre-decode formats Sharp can't fully handle (needs pixel decoding for stats).
    // HEIC/HEIF: Sharp can read container headers but can't decode HEVC pixels,
    // so unconditionally pre-decode to PNG (matching createToolRoute behavior).
    let metaBuffer = fileBuffer;
    const ext = extname(filename).toLowerCase().replace(/^\./, "") || undefined;
    const isSvg = detectedFormat === "svg" || isSvgBuffer(fileBuffer);

    if (isSvg) {
      try {
        metaBuffer = decompressSvgz(fileBuffer);
        metaBuffer = sanitizeSvg(metaBuffer);
      } catch (err) {
        if (
          isSvgzClientError(err) ||
          (err instanceof Error && err.message.includes("SVGZ file does not contain"))
        ) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
        throw asDecoderOutOfMemory(err);
      }
    } else if (ext === "svgz" && !validation.valid) {
      return reply.status(400).send({ error: "Invalid SVGZ file" });
    }

    let fallbackFormat: string | undefined;
    try {
      if (isSvg) {
        // Already decompressed and sanitized above.
      } else if (detectedFormat === "heif") {
        metaBuffer = await decodeHeic(fileBuffer);
      } else if (detectedFormat && needsCliDecode(detectedFormat)) {
        try {
          metaBuffer = await decodeToSharpCompat(fileBuffer, detectedFormat, ext);
        } catch (rawDecodeErr) {
          const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
          if (
            decodeErr instanceof DecoderOutOfMemoryError ||
            (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
          ) {
            throw decodeErr;
          }
          try {
            const meta = await sharp(fileBuffer).metadata();
            fallbackFormat = meta.format;
            if (fallbackFormat !== "svg") {
              await sharp(fileBuffer).resize(1).raw().toBuffer();
            }
          } catch (rawProbeErr) {
            const probeErr = asDecoderOutOfMemory(rawProbeErr);
            if (probeErr instanceof DecoderOutOfMemoryError) {
              throw probeErr;
            }
            if (isDecoderUnavailable(decodeErr)) throw decodeErr;
            // The Sharp probe is the weaker signal: it only says Sharp can't read
            // the bytes, while the decoder's error says why the format failed.
            request.log?.warn({ err: decodeErr, toolId: "info" }, "Decode failed");
            throw decodeErr;
          }
        }
      } else {
        let sharpDirectFailed = false;
        try {
          const meta = await sharp(fileBuffer).metadata();
          fallbackFormat = meta.format;
        } catch (rawSharpErr) {
          const sharpErr = asDecoderOutOfMemory(rawSharpErr);
          if (sharpErr instanceof DecoderOutOfMemoryError) {
            throw sharpErr;
          }
          sharpDirectFailed = true;
        }
        if (sharpDirectFailed) {
          // A guess: the upload wasn't detected as HEIF, so a missing HEIF
          // decoder says nothing about this server's ability to read it. The
          // decoder running out of memory or failing to write its temp file
          // does: it was decoding the file, so that stays the server's 503
          // (#1628, #3451).
          metaBuffer = await decodeHeic(fileBuffer).catch((rawErr: unknown) => {
            const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
            if (!isDecoderUnavailable(err) || err instanceof DecoderOutOfMemoryError) throw err;
            throw new Error("Unrecognized image format", { cause: err });
          });
        }
      }
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
      return reply.status(422).send({
        error: "Failed to read image metadata",
        details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
      });
    }

    if (fallbackFormat === "svg") {
      try {
        metaBuffer = decompressSvgz(fileBuffer);
        metaBuffer = sanitizeSvg(metaBuffer);
      } catch (err) {
        if (isSvgClientError(err)) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
        throw asDecoderOutOfMemory(err);
      }
    }

    try {
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
      const exif =
        detectedFormat === "raw" && fallbackFormat !== "svg"
          ? await readExifToolMeta(fileBuffer, ext)
          : null;

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
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
      return reply.status(422).send({
        error: "Failed to read image metadata",
        details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
      });
    }
  });
}

interface ExifMeta {
  width: number | null;
  height: number | null;
  format: string;
  colorSpace: string | null;
  density: number | null;
  bitDepth: string | null;
  hasExif: boolean;
  hasIcc: boolean;
  hasXmp: boolean;
}

const EXIFTOOL_GROUP_PRIORITY = ["Composite", "EXIF", "XMP", "ICC_Profile", "MakerNotes"] as const;

function positiveDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validBitDepth(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? String(value) : null;
  }
  if (typeof value === "string" && value.trim().length > 0 && value.trim() !== "0") {
    return value;
  }
  return null;
}

function findExifValue<T>(
  data: Record<string, unknown>,
  tag: string,
  parse: (value: unknown) => T | null,
): T | null {
  for (const group of EXIFTOOL_GROUP_PRIORITY) {
    const parsed = parse(data[`${group}:${tag}`]);
    if (parsed !== null) return parsed;
  }
  const ungrouped = parse(data[tag]);
  if (ungrouped !== null) return ungrouped;
  const fileKey = `File:${tag}`;
  const suffix = `:${tag}`;
  for (const [key, val] of Object.entries(data)) {
    if (key !== fileKey && key.endsWith(suffix)) {
      const parsed = parse(val);
      if (parsed !== null) return parsed;
    }
  }
  return parse(data[fileKey]);
}

async function readExifToolMeta(buffer: Buffer, ext?: string): Promise<ExifMeta | null> {
  const safeExt = ext?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = safeExt && isRawExtension(safeExt) ? `.${safeExt}` : ".dng";
  const tmpPath = join(tmpdir(), `info-exif-${randomUUID()}${suffix}`);
  try {
    try {
      const fh = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      let fileWriteErr: unknown;
      try {
        await fh.writeFile(buffer);
      } catch (err) {
        fileWriteErr = err;
        throw err;
      } finally {
        await fh.close().catch((closeErr: unknown) => {
          if (fileWriteErr === undefined) throw closeErr;
        });
      }
    } catch (writeErr) {
      throw normalizeOperationalWriteError(writeErr);
    }
    const { stdout } = await execFileAsync(
      "exiftool",
      [
        "-j",
        "-G",
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
      { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
    );
    const [data] = JSON.parse(stdout) as Array<Record<string, unknown> | undefined>;
    if (!data) return null;

    const fileType = findExifValue(data, "FileType", nonEmptyString);

    return {
      width: findExifValue(data, "ImageWidth", positiveDimension),
      height: findExifValue(data, "ImageHeight", positiveDimension),
      format: (fileType ?? "raw").toLowerCase(),
      colorSpace: findExifValue(data, "ColorSpace", nonEmptyString),
      density: findExifValue(data, "XResolution", positiveDimension),
      bitDepth: findExifValue(data, "BitsPerSample", validBitDepth),
      hasExif: Object.keys(data).some((k) => k.startsWith("EXIF:") || k === "ExifVersion"),
      hasIcc: findExifValue(data, "ICCProfileName", nonEmptyString) !== null,
      hasXmp: findExifValue(data, "XMPToolkit", nonEmptyString) !== null,
    };
  } catch (rawErr) {
    const err = asDecoderOutOfMemory(rawErr);
    if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
    return null;
  } finally {
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}
