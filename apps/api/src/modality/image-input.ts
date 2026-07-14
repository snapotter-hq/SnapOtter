import sharp from "sharp";
import { autoOrient } from "../lib/auto-orient.js";
import { stripInternalPaths } from "../lib/errors.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { decodeAnyFormat, decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { decompressSvgz, sanitizeSvg } from "../lib/svg-sanitize.js";
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
      } catch (err) {
        opts.signal?.throwIfAborted();
        if (isPixelSafetyError(err)) {
          throw new InputValidationError(err instanceof Error ? err.message : String(err));
        }
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
        const fileExt = name.split(".").pop()?.toLowerCase();
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt, {
          maxDimension: opts.maxDimension,
          maxPixels: opts.maxPixels,
          signal: opts.signal,
        });
        opts.signal?.throwIfAborted();
      } catch (decodeErr) {
        opts.signal?.throwIfAborted();
        if (isPixelSafetyError(decodeErr)) {
          throw new InputValidationError(
            decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
          );
        }
        try {
          await boundedSharp(fileBuffer, opts.maxPixels).metadata();
        } catch (err) {
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
        throw new InputValidationError(err instanceof Error ? err.message : "Invalid SVG");
      }
    }

    // AVIF can pass metadata validation but fail pixel decode when
    // Sharp's bundled libheif lacks support for the bitstream version.
    // A 1x1 resize forces a minimal pixel decode to catch this early.
    if (validation.format === "avif") {
      try {
        opts.signal?.throwIfAborted();
        await boundedSharp(fileBuffer, opts.maxPixels).resize(1).raw().toBuffer();
      } catch {
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
        } catch (fallbackErr) {
          throw new InputValidationError(
            "Failed to decode AVIF file",
            422,
            stripInternalPaths(
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
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
      fileBuffer = await autoOrient(fileBuffer);
      opts.signal?.throwIfAborted();
    }

    return {
      buffer: fileBuffer,
      filename: name,
    };
  }
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

function isPixelSafetyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
  );
}
