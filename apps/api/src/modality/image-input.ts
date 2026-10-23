import { extname } from "node:path";
import { hasServerErrorStatus, isSafeMessageError } from "@snapotter/shared";
import type { FastifyBaseLogger } from "fastify";
import sharp from "sharp";
import { autoOrient } from "../lib/auto-orient.js";
import { stripInternalPaths } from "../lib/errors.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import {
  DecoderOutOfMemoryError,
  decodeAnyFormat,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { logger } from "../lib/logger.js";
import { normalizeOperationalWriteError } from "../lib/object-storage.js";
import { decompressSvgz, isSvgClientError, sanitizeSvg } from "../lib/svg-sanitize.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

/**
 * Image input handler: validateImageBuffer, HEIC decode, CLI decode,
 * SVG sanitize, AVIF probe fallback, autoOrient. Extracted verbatim
 * from the tool-factory validation/decode chain.
 */
export class ImageInputHandler implements InputHandler {
  async prepare(
    raw: Buffer,
    originalFilename: string,
    opts: {
      scratchDir: string;
      maxDimension?: number;
      maxPixels?: number;
      signal?: AbortSignal;
      log?: FastifyBaseLogger;
    },
  ): Promise<PreparedInput> {
    let fileBuffer = raw;
    let name = originalFilename;
    opts.signal?.throwIfAborted();

    // Validate the uploaded image
    const validation = await validateImageBuffer(fileBuffer, name);
    opts.signal?.throwIfAborted();
    if (!validation.valid) {
      throw new InputValidationError(`Invalid image: ${validation.reason}`);
    }
    assertWithinImageLimits(validation.width, validation.height, opts.maxPixels, opts.maxDimension);

    // Decode HEIC/HEIF input via system heif-dec (Sharp's bundled libheif
    // lacks the HEVC decoder needed for iPhone photos).
    // The decoded buffer is PNG, so update the filename extension to match.
    const isHeif = validation.format === "heif";
    if (isHeif) {
      try {
        fileBuffer = await decodeHeic(fileBuffer, {
          maxDimension: opts.maxDimension,
          maxPixels: opts.maxPixels,
          signal: opts.signal,
        });
        opts.signal?.throwIfAborted();
        const ext = name.match(/\.[^.]+$/)?.[0];
        if (ext) name = `${name.slice(0, -ext.length)}.png`;
      } catch (rawErr) {
        opts.signal?.throwIfAborted();
        const err = normalizeOperationalWriteError(rawErr);
        if (isPixelSafetyError(err)) {
          throw new InputValidationError(err instanceof Error ? err.message : String(err));
        }
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw engineUnavailable(err);
        throw new InputValidationError(
          "Failed to decode HEIC file. Ensure libheif-examples is installed.",
          422,
          stripInternalPaths(err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools.
    // The decoded buffer is PNG, so update the filename extension to match.
    // Pass the original file extension so RAW decoder can use the correct
    // temp file suffix (e.g. .cr3, .nef) for format identification.
    if (needsCliDecode(validation.format)) {
      try {
        opts.signal?.throwIfAborted();
        const fileExt = extname(name).toLowerCase().replace(/^\./, "") || undefined;
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt, {
          maxDimension: opts.maxDimension,
          maxPixels: opts.maxPixels,
          signal: opts.signal,
        });
        opts.signal?.throwIfAborted();
      } catch (rawDecodeErr) {
        opts.signal?.throwIfAborted();
        const decodeErr = normalizeOperationalWriteError(rawDecodeErr);
        if (isPixelSafetyError(decodeErr)) {
          throw new InputValidationError(
            decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
          );
        }
        // Out of memory or a storage write fault says nothing about whether
        // Sharp can read the format (DNG's TIFF header, say): surface it
        // instead of falling back (#1453, #2800).
        if (
          decodeErr instanceof DecoderOutOfMemoryError ||
          (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
        ) {
          throw engineUnavailable(decodeErr);
        }
        try {
          await boundedSharp(fileBuffer, opts.maxPixels).metadata();
          await boundedSharp(fileBuffer, opts.maxPixels).resize(1).raw().toBuffer();
        } catch (err) {
          // Sharp reads some of these formats itself (DNG is a TIFF), so a
          // missing CLI decoder only matters once that fallback fails too.
          if (isDecoderUnavailable(decodeErr) || hasServerErrorStatus(decodeErr)) {
            throw engineUnavailable(decodeErr);
          }
          throw new InputValidationError(
            `Failed to decode ${validation.format.toUpperCase()} file`,
            422,
            stripInternalPaths(err instanceof Error ? err.message : String(err)),
          );
        }
      }
      const ext = name.match(/\.[^.]+$/)?.[0];
      if (ext) name = `${name.slice(0, -ext.length)}.png`;
    }

    // Sanitize SVG input to prevent XXE, SSRF, and script injection
    const isSvg = validation.format === "svg";
    if (isSvg) {
      try {
        opts.signal?.throwIfAborted();
        fileBuffer = decompressSvgz(fileBuffer);
        fileBuffer = sanitizeSvg(fileBuffer);
        opts.signal?.throwIfAborted();
      } catch (err) {
        opts.signal?.throwIfAborted();
        if (isSvgClientError(err)) {
          throw new InputValidationError(err instanceof Error ? err.message : "Invalid SVG");
        }
        throw err;
      }
    }

    // AVIF can pass metadata validation but fail pixel decode when
    // Sharp's bundled libheif lacks support for the bitstream version.
    // A 1x1 resize forces a minimal pixel decode to catch this early.
    if (validation.format === "avif") {
      try {
        opts.signal?.throwIfAborted();
        await boundedSharp(fileBuffer, opts.maxPixels).resize(1).raw().toBuffer();
      } catch (probeErr) {
        opts.signal?.throwIfAborted();
        // The safety cap tripping is not a decoder gap: answer 400 like the
        // HEIC and CLI branches do, and don't hand the file to ImageMagick.
        if (isPixelSafetyError(probeErr)) throw new InputValidationError(errorMessage(probeErr));
        // Say why the native decode was refused before trying the CLI decoder:
        // a successful fallback is otherwise a silent re-encode, and a double
        // failure would lose Sharp's reason (#1548).
        (opts.log ?? logger).info(
          { err: probeErr, format: "avif" },
          "image-input: native AVIF decode failed, trying the CLI decoder",
        );
        try {
          opts.signal?.throwIfAborted();
          fileBuffer = await decodeAnyFormat(fileBuffer, "avif", {
            maxDimension: opts.maxDimension,
            maxPixels: opts.maxPixels,
            signal: opts.signal,
          });
          opts.signal?.throwIfAborted();
          const ext = name.match(/\.[^.]+$/)?.[0];
          if (ext) name = `${name.slice(0, -ext.length)}.png`;
        } catch (rawFallbackErr) {
          opts.signal?.throwIfAborted();
          const fallbackErr = normalizeOperationalWriteError(rawFallbackErr);
          if (isPixelSafetyError(fallbackErr)) {
            throw new InputValidationError(errorMessage(fallbackErr));
          }
          if (isDecoderUnavailable(fallbackErr) || hasServerErrorStatus(fallbackErr)) {
            throw engineUnavailable(fallbackErr);
          }
          // execFile's message ends with the tool's stderr, newline included,
          // so trim before joining or the second reason starts its own line.
          throw new InputValidationError(
            "Failed to decode AVIF file",
            422,
            stripInternalPaths(
              `${errorMessage(fallbackErr).trim()}; native decode: ${errorMessage(probeErr)}`,
            ),
          );
        }
      }
    }

    // Some external formats do not expose trustworthy dimensions until they
    // have been normalized. Re-check the actual decoder output before any
    // orientation or OCR preprocessing can allocate its full pixel surface.
    if (opts.maxPixels !== undefined || opts.maxDimension !== undefined) {
      try {
        const metadata = await boundedSharp(fileBuffer, opts.maxPixels).metadata();
        assertWithinImageLimits(metadata.width, metadata.height, opts.maxPixels, opts.maxDimension);
      } catch (err) {
        opts.signal?.throwIfAborted();
        if (err instanceof InputValidationError) throw err;
        throw new InputValidationError(
          "Image exceeds the decoded image safety limits",
          400,
          stripInternalPaths(err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Auto-orient non-SVG images: physically rotate pixels to match
    // the EXIF orientation tag so the worker sees upright pixels.
    if (!isSvg) {
      opts.signal?.throwIfAborted();
      fileBuffer = await autoOrient(fileBuffer, opts.log);
      opts.signal?.throwIfAborted();
    }

    return {
      buffer: fileBuffer,
      filename: name,
    };
  }
}

/**
 * A missing decoder binary is the operator's container, not the caller's
 * file. As a 503 ENGINE_UNAVAILABLE the factory logs and reports it, the same
 * contract the media and document handlers use, instead of a 422 that blames
 * the upload (#1428). The decoder's spawn error rides along as `cause`: its
 * path and errno are the only record of which binary failed and why.
 */
export function engineUnavailable(err: unknown): InputValidationError {
  const code =
    isSafeMessageError(err) && typeof err.code === "string" && err.code.length > 0
      ? err.code
      : "ENGINE_UNAVAILABLE";
  const statusCode = hasServerErrorStatus(err) ? err.statusCode : 503;
  const converted = new InputValidationError(
    err instanceof Error ? err.message : String(err),
    statusCode,
    undefined,
    code,
  );
  converted.cause = err;
  return converted;
}

function boundedSharp(buffer: Buffer, maxPixels?: number) {
  return maxPixels === undefined ? sharp(buffer) : sharp(buffer, { limitInputPixels: maxPixels });
}

function formatPixelLimit(maxPixels: number): string {
  return maxPixels.toLocaleString("en-US");
}

function assertWithinImageLimits(
  width: number | undefined,
  height: number | undefined,
  maxPixels: number | undefined,
  maxDimension: number | undefined,
): void {
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return;
  }
  if (maxDimension !== undefined && (width > maxDimension || height > maxDimension)) {
    throw new InputValidationError(
      `Image exceeds the ${maxDimension.toLocaleString("en-US")} pixel dimension safety limit (${width.toLocaleString("en-US")}x${height.toLocaleString("en-US")})`,
    );
  }
  if (maxPixels !== undefined && width * height > maxPixels) {
    throw new InputValidationError(
      `Image exceeds the ${formatPixelLimit(maxPixels)} pixel safety limit (${width}x${height})`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isPixelSafetyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
  );
}
