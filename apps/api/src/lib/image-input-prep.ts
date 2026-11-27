import { extname } from "node:path";
import {
  hasServerErrorStatus,
  isToolInputError,
  markToolInputError,
  pixelLimitImageError,
  ToolInputError,
  toolInputErrorCode,
} from "@snapotter/shared";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import sharp from "sharp";
import { InputValidationError } from "../modality/contract.js";
import { isPixelSafetyError, replaceExtWithPng } from "../modality/image-input.js";
import { autoOrient } from "./auto-orient.js";
import { stripInternalPaths } from "./errors.js";
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
import { type RenderSvgOptions, renderSvgToPng } from "./svg-render.js";
import {
  decompressSvgz,
  isSvgzClientError,
  sanitizeSvg,
  svgClientErrorFields,
} from "./svg-sanitize.js";

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
   * When true, re-encode non-SVG inputs to PNG after `autoOrient` (used when
   * staging a background image for Python's Pillow, which lacks AVIF/JXL/ICO
   * plugins).
   */
  rasterizeToPng?: boolean;
  /** Cancels an SVG render when the client disconnects. */
  signal?: AbortSignal;
}

export interface PreparedRouteImage {
  buffer: Buffer;
  filename: string;
  isSvg: boolean;
}

/**
 * Classify a failed child render without touching the SVG again: the generic
 * undecodable probe would render it in-process, which is the hang #5153 fixes.
 */
function svgRenderFailure(err: unknown): unknown {
  if (isToolInputError(err)) return err;
  const fault = asDecoderOutOfMemory(err);
  if (isDecoderUnavailable(fault)) return fault;
  if (isPixelSafetyError(err)) return pixelLimitImageError(err);
  return err instanceof Error
    ? markToolInputError(err, "IMAGE_UNDECODABLE")
    : new ToolInputError(String(err), { code: "IMAGE_UNDECODABLE" });
}

/**
 * Rasterize an already sanitized SVG through the deadline-bound child render,
 * for routes that run their own intake instead of `prepareRouteImage`. Throws
 * what `prepareRouteImage` throws: SVG_TOO_COMPLEX past the deadline, a decoder
 * fault when the renderer can't run, a pixel-limit 400, or IMAGE_UNDECODABLE
 * (#5274).
 */
export async function rasterizeSanitizedSvg(
  svg: Buffer,
  opts: RenderSvgOptions = {},
): Promise<Buffer> {
  try {
    return await renderSvgToPng(svg, opts);
  } catch (err) {
    throw svgRenderFailure(err);
  }
}

/**
 * `rasterizeSanitizedSvg` for routes that answer with `reply` directly. Sends
 * the 400 (too slow to render, over the pixel cap) or the 422 (librsvg can't
 * draw it) itself and returns null; a missing renderer is rethrown so the
 * route's 503 handling sees it like any decoder gap.
 */
export async function renderSanitizedSvgOrReply(
  svg: Buffer,
  reply: FastifyReply,
  opts: RenderSvgOptions = {},
): Promise<Buffer | null> {
  try {
    return await rasterizeSanitizedSvg(svg, opts);
  } catch (failure) {
    if (isDecoderUnavailable(failure) || hasServerErrorStatus(failure)) throw failure;
    const code = toolInputErrorCode(failure);
    if (failure instanceof ToolInputError) {
      reply.status(400).send({ error: failure.message, ...(code && { code }) });
    } else {
      const message = failure instanceof Error ? failure.message : String(failure);
      reply.status(422).send({
        error: "Failed to render SVG file",
        details: stripInternalPaths(message),
        ...(code && { code }),
      });
    }
    return null;
  }
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
 *    disguised SVGs) and marking client decode failures as `ToolInputError`.
 * 3. Detects SVG/SVGZ inputs (including comment-padded SVGs disguised with
 *    `.apng` or CLI-decoded extensions), runs `decompressSvgz` and
 *    `sanitizeSvg` (throwing `InputValidationError` on 400 client SVG errors),
 *    and rasterizes the sanitized SVG to PNG in a deadline-bound child
 *    process, so no route renders an SVG in-process (#5153).
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
      opts.log?.warn({ err }, "Decode failed");
      throw err instanceof Error
        ? markToolInputError(err, "IMAGE_UNDECODABLE")
        : new ToolInputError(String(err), { code: "IMAGE_UNDECODABLE" });
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
        if (isPixelSafetyError(err)) {
          throw pixelLimitImageError(err);
        }
        opts.log?.warn({ err: decodeErr }, "Decode failed");
        throw decodeErr instanceof Error
          ? markToolInputError(decodeErr, "IMAGE_UNDECODABLE")
          : new ToolInputError(String(decodeErr), { code: "IMAGE_UNDECODABLE" });
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
          400,
          undefined,
          svgClientErrorFields(err).code,
        );
        validationErr.cause = err;
        throw validationErr;
      }
      throw asDecoderOutOfMemory(err);
    }
    try {
      buf = await renderSvgToPng(buf, { signal: opts.signal });
      convertedToPng = true;
    } catch (err) {
      opts.signal?.throwIfAborted();
      throw svgRenderFailure(err);
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
