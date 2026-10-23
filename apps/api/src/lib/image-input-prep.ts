import { extname } from "node:path";
import { hasServerErrorStatus, markToolInputError, ToolInputError } from "@snapotter/shared";
import type { FastifyBaseLogger } from "fastify";
import sharp from "sharp";
import { InputValidationError } from "../modality/contract.js";
import { autoOrient } from "./auto-orient.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "./format-decoders.js";
import { decodeHeic } from "./heic-converter.js";
import { asInputErrorIfUndecodable } from "./image-error.js";
import { normalizeOperationalWriteError } from "./object-storage.js";
import { decompressSvgz, isSvgzClientError, sanitizeSvg } from "./svg-sanitize.js";

export interface PrepareRouteImageOptions {
  /**
   * Request-scoped logger forwarded to `autoOrient` so orientation warnings
   * carry request context (#1417).
   */
  log?: Pick<FastifyBaseLogger, "warn">;
  /**
   * When true, rewrite `filename`'s extension to `.png` whenever the input was
   * decoded from HEIF, a CLI-decoded format, or rasterized from SVG/SVGZ.
   */
  rewriteFilenameToPng?: boolean;
  /**
   * When true, rasterize sanitized SVG buffers to PNG via Sharp so Python
   * sidecar scripts and raster-only consumers receive a PNG buffer.
   */
  rasterizeSvg?: boolean;
  /**
   * When true, re-encode non-SVG inputs to PNG after `autoOrient` (used when
   * staging a background image for Python's Pillow, which lacks AVIF/JXL/ICO
   * plugins).
   */
  rasterizeToPng?: boolean;
}

export interface PreparedRouteImage {
  buffer: Buffer;
  filename: string;
  isSvg: boolean;
}

function replaceExtWithPng(filename: string): string {
  const ext = filename.match(/\.[^.]+$/)?.[0];
  return ext ? `${filename.slice(0, -ext.length)}.png` : filename;
}

/**
 * Shared image preparation helper for custom image routes that have already run
 * `validateImageBuffer(inputBuffer, filename)`:
 *
 * 1. Decodes HEIF via `decodeHeic`, normalizing operational write errors and
 *    marking client decode failures as `ToolInputError`.
 * 2. Decodes CLI-decoded formats (`needsCliDecode`) via `decodeToSharpCompat`
 *    with lowercase `fileExt`, falling back to a Sharp metadata + 1x1 pixel
 *    decode probe for formats Sharp reads natively (such as TIFF-based DNG or
 *    disguised SVGs) and classifying undecodable client inputs via
 *    `asInputErrorIfUndecodable`.
 * 3. Detects SVG/SVGZ inputs (including comment-padded SVGs disguised with
 *    `.apng` or CLI-decoded extensions), runs `decompressSvgz` and
 *    `sanitizeSvg` (throwing `InputValidationError` on 400 client SVG errors),
 *    and optionally rasterizes the sanitized SVG to PNG.
 * 4. Runs `autoOrient(buf, opts.log)` on non-SVG inputs and optionally
 *    rasterizes the result to PNG for sidecars that only read PNG/JPEG.
 */
export async function prepareRouteImage(
  inputBuffer: Buffer,
  filename: string,
  format: string,
  opts: PrepareRouteImageOptions = {},
): Promise<PreparedRouteImage> {
  let buf = inputBuffer;
  let outName = filename;
  let convertedToPng = false;

  if (format === "heif") {
    try {
      buf = await decodeHeic(buf);
      convertedToPng = true;
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
      throw err instanceof Error ? markToolInputError(err) : new ToolInputError(String(err));
    }
  }

  let fallbackFormat: string | undefined;
  if (needsCliDecode(format)) {
    const fileExt = extname(filename).toLowerCase().replace(/^\./, "") || undefined;
    try {
      buf = await decodeToSharpCompat(buf, format, fileExt);
      convertedToPng = true;
    } catch (rawDecodeErr) {
      const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
      if (
        decodeErr instanceof DecoderOutOfMemoryError ||
        (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
      ) {
        throw decodeErr;
      }
      try {
        const meta = await sharp(buf).metadata();
        fallbackFormat = meta.format;
        if (fallbackFormat !== "svg") {
          await sharp(buf).resize(1).raw().toBuffer();
        }
      } catch (err) {
        const probeErr = asDecoderOutOfMemory(err);
        if (probeErr instanceof DecoderOutOfMemoryError) {
          throw probeErr;
        }
        if (isDecoderUnavailable(decodeErr) || hasServerErrorStatus(decodeErr)) {
          throw decodeErr;
        }
        throw await asInputErrorIfUndecodable(buf, err);
      }
    }
  }

  let isSvg = format === "svg" || fallbackFormat === "svg";
  if (!isSvg && format === "png" && filename.toLowerCase().endsWith(".apng")) {
    const meta = await sharp(buf)
      .metadata()
      .catch((err: unknown) => {
        const oom = asDecoderOutOfMemory(err);
        if (oom instanceof DecoderOutOfMemoryError) throw oom;
        return null;
      });
    if (meta?.format === "svg") isSvg = true;
  }

  if (isSvg) {
    try {
      buf = decompressSvgz(buf);
      buf = sanitizeSvg(buf);
    } catch (err) {
      if (
        isSvgzClientError(err) ||
        (err as { statusCode?: number } | null)?.statusCode === 400 ||
        (err instanceof Error && err.message.includes("SVGZ file does not contain"))
      ) {
        const validationErr = new InputValidationError(
          err instanceof Error ? err.message : "Invalid SVG",
        );
        validationErr.cause = err;
        throw validationErr;
      }
      throw asDecoderOutOfMemory(err);
    }
    if (opts.rasterizeSvg || opts.rasterizeToPng) {
      try {
        buf = await sharp(buf).png().toBuffer();
        convertedToPng = true;
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
        throw await asInputErrorIfUndecodable(buf, err);
      }
    }
  } else {
    buf = await autoOrient(buf, opts.log);
    if (opts.rasterizeToPng && !convertedToPng) {
      try {
        buf = await sharp(buf).png().toBuffer();
        convertedToPng = true;
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
        throw await asInputErrorIfUndecodable(buf, err);
      }
    }
  }

  if (opts.rewriteFilenameToPng && convertedToPng) {
    outName = replaceExtWithPng(outName);
  }

  return { buffer: buf, filename: outName, isSvg };
}
