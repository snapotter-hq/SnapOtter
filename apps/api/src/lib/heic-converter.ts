import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

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
  const fh = await open(filePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
  try {
    await fh.writeFile(buffer);
  } finally {
    await fh.close();
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
  for (const cmd of ["heif-convert", "heif-dec"]) {
    try {
      await execFileAsync(cmd, ["--version"], {
        timeout: 5_000,
        signal: options.signal,
      });
      cachedDecodeCmd = cmd;
      return cmd;
    } catch {
      options.signal?.throwIfAborted();
      // try next
    }
  }
  throw new Error("No HEIF decoder found. Install libheif-examples (Linux) or libheif (macOS).");
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

  if (
    (options.maxPixels !== undefined || options.maxDimension !== undefined) &&
    encodedDimensions.length === 0
  ) {
    let dimensionsVerified = false;
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
      // Sharp often has enough libheif support for metadata but not HEVC pixel
      // decode. Only turn a proven size-limit failure into a rejection.
      if (
        error instanceof Error &&
        /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
      ) {
        throw error;
      }
    }
    if (!dimensionsVerified) {
      throw new Error("Cannot safely decode HEIF: encoded dimensions are unavailable");
    }
  }

  const cmd = await findDecodeCmd(options);
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
    });
    options.signal?.throwIfAborted();

    // Single-image HEIF: exact filename. Multi-image: -1 suffix on first image.
    let decoded: Buffer;
    try {
      decoded = await readFile(outputPath);
    } catch {
      decoded = await readFile(suffixedPath);
    }
    if (options.maxPixels !== undefined || options.maxDimension !== undefined) {
      try {
        const metadata = await sharp(decoded, {
          limitInputPixels: options.maxPixels ?? false,
        }).metadata();
        assertImageLimits(metadata.width, metadata.height, options.maxPixels, options.maxDimension);
      } catch (error) {
        if (
          error instanceof Error &&
          /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(
            error.message,
          )
        ) {
          throw error;
        }
        throw new Error("Decoded image exceeds the configured image safety limits", {
          cause: error,
        });
      }
    }
    options.signal?.throwIfAborted();
    return decoded;
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
