import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  asDecoderOutOfMemory,
  asDecoderUnavailable,
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
  noDecoderFound,
} from "./format-decoders.js";
import { normalizeOperationalWriteError } from "./object-storage.js";

const execFileAsync = promisify(execFile);

const SHARP_UNSUPPORTED_HEIF_CODEC =
  /No decoding plugin installed|No decoder for this image format|Unsupported feature: Unsupported codec|Support for this compression format has not been built in/i;

export interface HeicDecodeOptions {
  maxDimension?: number;
  maxPixels?: number;
  signal?: AbortSignal;
}

function assertImageLimits(
  width: number | undefined,
  height: number | undefined,
  maxPixels: number | undefined,
  maxDimension: number | undefined,
): void {
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return;
  }
  if (maxDimension !== undefined && (width > maxDimension || height > maxDimension)) {
    throw new Error(
      `Decoded image exceeds the ${maxDimension.toLocaleString("en-US")} pixel dimension safety limit (${width.toLocaleString("en-US")}x${height.toLocaleString("en-US")})`,
    );
  }
  if (maxPixels !== undefined && width * height > maxPixels) {
    throw new Error(
      `Decoded image exceeds the ${maxPixels.toLocaleString("en-US")} pixel safety limit (${width}x${height})`,
    );
  }
}

async function verifyDecodedImageLimits(
  decoded: Buffer,
  options: HeicDecodeOptions,
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  if (options.maxPixels !== undefined || options.maxDimension !== undefined) {
    try {
      const metadata = await sharp(decoded, {
        limitInputPixels: options.maxPixels ?? false,
      }).metadata();
      assertImageLimits(metadata.width, metadata.height, options.maxPixels, options.maxDimension);
    } catch (error) {
      options.signal?.throwIfAborted();
      throw asDecoderOutOfMemory(error);
    }
  }
  options.signal?.throwIfAborted();
  return decoded;
}

function readIspeDimensions(buffer: Buffer): Array<{ width: number; height: number }> {
  // HEIF stores the display dimensions in an Image Spatial Extents (`ispe`)
  // full box. Reading it avoids invoking a pixel decoder merely to enforce a
  // pre-decode allocation bound.
  let offset = 0;
  const dimensions: Array<{ width: number; height: number }> = [];
  while (offset + 20 <= buffer.length) {
    const index = buffer.indexOf("ispe", offset, "ascii");
    if (index < 0 || index + 16 > buffer.length) break;
    const boxStart = index - 4;
    const boxSize = boxStart >= 0 ? buffer.readUInt32BE(boxStart) : 0;
    if (boxSize >= 20 && boxStart + boxSize <= buffer.length) {
      dimensions.push({
        width: buffer.readUInt32BE(index + 8),
        height: buffer.readUInt32BE(index + 12),
      });
    }
    offset = index + 4;
  }
  return dimensions;
}

/**
 * Write a buffer to a temp file exclusively (O_CREAT | O_EXCL | O_WRONLY).
 * Prevents symlink / race-condition attacks on predictable temp paths.
 */
async function writeTempExclusive(filePath: string, buffer: Buffer): Promise<void> {
  try {
    const fh = await open(filePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
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
  } catch (err) {
    throw normalizeOperationalWriteError(asDecoderOutOfMemory(err));
  }
}

/**
 * Find the HEIF decode command. Both heif-convert and heif-dec accept
 * `<input> <output>` positional arguments.
 */
let cachedDecodeCmd: string | null = null;

async function findDecodeCmd(options: HeicDecodeOptions = {}): Promise<string> {
  options.signal?.throwIfAborted();
  if (cachedDecodeCmd) return cachedDecodeCmd;
  const probeFailures: unknown[] = [];
  for (const cmd of ["heif-convert", "heif-dec"]) {
    try {
      await execFileAsync(cmd, ["--version"], {
        timeout: 5_000,
        signal: options.signal,
      });
      cachedDecodeCmd = cmd;
      return cmd;
    } catch (err) {
      options.signal?.throwIfAborted();
      const outOfMemory = asDecoderOutOfMemory(err);
      if (outOfMemory !== err) throw outOfMemory;
      probeFailures.push(err);
    }
  }
  throw noDecoderFound(
    "No HEIF decoder found. Install libheif-examples (Linux) or libheif (macOS).",
    probeFailures,
  );
}

/**
 * Decode a HEIC/HEIF buffer to PNG using the system HEIF decoder CLI.
 * This is needed because Sharp's bundled libheif does not include the
 * HEVC decoder required for true HEIC files (iPhone photos).
 *
 * Multi-image HEIF files (common from iPhones) cause heif-convert/heif-dec
 * to add numeric suffixes (-1, -2, ...) to the output filename. We try the
 * exact path first, then fall back to the -1 suffixed path.
 */
export async function decodeHeic(buffer: Buffer, options: HeicDecodeOptions = {}): Promise<Buffer> {
  options.signal?.throwIfAborted();
  const encodedDimensions = readIspeDimensions(buffer);
  for (const dimensions of encodedDimensions) {
    assertImageLimits(dimensions.width, dimensions.height, options.maxPixels, options.maxDimension);
  }
  const hasVerifiedIspe =
    encodedDimensions.length > 0 &&
    encodedDimensions.every((dimensions) => dimensions.width > 0 && dimensions.height > 0);

  if ((options.maxPixels !== undefined || options.maxDimension !== undefined) && !hasVerifiedIspe) {
    let dimensionsVerified = false;
    let metadataError: unknown;
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: options.maxPixels ?? false,
      }).metadata();
      assertImageLimits(metadata.width, metadata.height, options.maxPixels, options.maxDimension);
      dimensionsVerified =
        metadata.width !== undefined &&
        metadata.height !== undefined &&
        metadata.width > 0 &&
        metadata.height > 0;
    } catch (error) {
      options.signal?.throwIfAborted();
      // Sharp often has enough libheif support for metadata but not HEVC pixel
      // decode. Only turn a proven size-limit failure into a rejection.
      if (
        error instanceof Error &&
        /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
      ) {
        throw error;
      }
      const outOfMemory = asDecoderOutOfMemory(
        error instanceof Error && /\bAllocating \d+ bytes failed\b/.test(error.message)
          ? Object.assign(error, { stderr: error.message })
          : error,
      );
      if (outOfMemory !== error) throw outOfMemory;
      metadataError = error;
    }
    if (!dimensionsVerified) {
      throw new Error(
        "Cannot safely decode HEIF: encoded dimensions are unavailable",
        metadataError !== undefined ? { cause: metadataError } : undefined,
      );
    }
  }

  // Generic HEIF containers (`mif1`, `msf1`) can carry an AV1 bitstream rather
  // than HEVC (#1462). Sharp's bundled libheif decodes AV1 natively, whereas
  // the container's system libheif is built with libde265 (HEVC) only. Try
  // Sharp first and fall back to heif-dec/heif-convert for HEVC inputs.
  let sharpDecoded: Buffer | undefined;
  let sharpVerdict: unknown;
  try {
    sharpDecoded = await sharp(buffer, {
      limitInputPixels: options.maxPixels ?? false,
    })
      .keepMetadata()
      .png()
      .toBuffer();
  } catch (error) {
    options.signal?.throwIfAborted();
    if (
      error instanceof Error &&
      /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
    ) {
      throw error;
    }
    const outOfMemory = asDecoderOutOfMemory(
      error instanceof Error && /\bAllocating \d+ bytes failed\b/.test(error.message)
        ? Object.assign(error, { stderr: error.message })
        : error,
    );
    if (outOfMemory !== error) throw outOfMemory;
    if (!(error instanceof Error && SHARP_UNSUPPORTED_HEIF_CODEC.test(error.message))) {
      sharpVerdict = error;
    }
  }
  if (sharpDecoded !== undefined) {
    return await verifyDecodedImageLimits(sharpDecoded, options);
  }

  const cmd = await findDecodeCmd(options).catch((err: unknown) => {
    options.signal?.throwIfAborted();
    if (sharpVerdict !== undefined && !(err instanceof DecoderOutOfMemoryError)) {
      throw sharpVerdict;
    }
    throw err;
  });
  // Include the PID so concurrent processes (and test workers) write to
  // distinct, attributable temp paths in the shared tmpdir.
  const id = `${process.pid}-${randomUUID()}`;
  const inputPath = join(tmpdir(), `heic-in-${id}.heic`);
  const outputPath = join(tmpdir(), `heic-out-${id}.png`);
  const suffixedPath = outputPath.replace(/\.png$/, "-1.png");

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, [inputPath, outputPath], {
      timeout: 120_000,
      signal: options.signal,
    }).catch((err: unknown) => {
      options.signal?.throwIfAborted();
      const classified = asDecoderUnavailable(asDecoderOutOfMemory(err));
      if (
        sharpVerdict !== undefined &&
        classified instanceof DecoderUnavailableError &&
        !(classified instanceof DecoderOutOfMemoryError)
      ) {
        throw sharpVerdict;
      }
      throw classified;
    });
    options.signal?.throwIfAborted();

    // Single-image HEIF: exact filename. Multi-image: -1 suffix on first image.
    // Only a missing file means "look for the suffixed one"; any other read
    // failure (V8 unable to allocate the buffer, EIO) is the real error, and
    // falling back would replace it with an ENOENT for a file that never
    // existed (#1533).
    let decoded: Buffer;
    try {
      decoded = await readFile(outputPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw asDecoderOutOfMemory(err);
      decoded = await readFile(suffixedPath).catch((suffixedErr: unknown) => {
        throw asDecoderOutOfMemory(suffixedErr);
      });
    }
    return await verifyDecodedImageLimits(decoded, options);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
    await rm(suffixedPath, { force: true }).catch(() => {});
  }
}

/**
 * Encode a PNG/JPEG buffer to HEIC using the system `heif-enc` CLI tool.
 * Uses x265 (HEVC) compression for true HEIC output.
 */
/**
 * Detect HEIC/HEIF format from magic bytes (ftyp box at offset 4, brand at offset 8).
 */
function isHeifBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ftyp = buffer.subarray(4, 8).toString("ascii");
  if (ftyp !== "ftyp") return false;
  const brand = buffer.subarray(8, 12).toString("ascii");
  return ["heic", "heix", "mif1", "msf1", "hevc", "hevx"].includes(brand);
}

/**
 * Ensure a buffer is decodable by Sharp. HEIC/HEIF buffers are decoded to
 * PNG via the system decoder; all other formats pass through unchanged.
 */
export async function ensureSharpCompat(
  buffer: Buffer,
  options: HeicDecodeOptions = {},
): Promise<Buffer> {
  if (isHeifBuffer(buffer)) {
    return decodeHeic(buffer, options);
  }
  options.signal?.throwIfAborted();
  return buffer;
}

export async function encodeHeic(buffer: Buffer, quality = 80): Promise<Buffer> {
  const id = `${process.pid}-${randomUUID()}`;
  const inputPath = join(tmpdir(), `heic-in-${id}.png`);
  const outputPath = join(tmpdir(), `heic-out-${id}.heic`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync("heif-enc", ["-q", String(quality), "-o", outputPath, inputPath], {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
