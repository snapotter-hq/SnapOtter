import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export interface DecodeSafetyOptions {
  /** Maximum decoded width * height accepted by this operation. */
  maxPixels?: number;
  /** Maximum decoded width or height accepted by this operation. */
  maxDimension?: number;
  /** Cancels external decoder processes when the owning job is canceled. */
  signal?: AbortSignal;
}

function commandOptions(options: DecodeSafetyOptions, timeout: number) {
  return { timeout, signal: options.signal };
}

function assertDimensionsWithinLimit(
  width: number | undefined,
  height: number | undefined,
  options: DecodeSafetyOptions,
): void {
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return;
  }
  if (
    options.maxDimension !== undefined &&
    (width > options.maxDimension || height > options.maxDimension)
  ) {
    throw new Error(
      `Decoded image exceeds the ${options.maxDimension.toLocaleString("en-US")} pixel dimension safety limit (${width.toLocaleString("en-US")}x${height.toLocaleString("en-US")})`,
    );
  }
  if (options.maxPixels !== undefined && width * height > options.maxPixels) {
    throw new Error(
      `Decoded image exceeds the ${options.maxPixels.toLocaleString("en-US")} pixel safety limit (${width}x${height})`,
    );
  }
}

async function assertDecodedWithinLimit(
  buffer: Buffer,
  options: DecodeSafetyOptions,
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  if (options.maxPixels !== undefined || options.maxDimension !== undefined) {
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: options.maxPixels ?? false,
      }).metadata();
      assertDimensionsWithinLimit(metadata.width, metadata.height, options);
    } catch (error) {
      if (isImageSafetyError(error)) throw error;
      throw new Error("Decoded image exceeds the configured image safety limits", {
        cause: error,
      });
    }
  }
  options.signal?.throwIfAborted();
  return buffer;
}

interface ImageDimensions {
  width: number;
  height: number;
}

function readKnownEncodedDimensions(buffer: Buffer, format: string): ImageDimensions | undefined {
  if (format === "qoi" && buffer.length >= 14) {
    return { width: buffer.readUInt32BE(4), height: buffer.readUInt32BE(8) };
  }
  if (format === "psd" && buffer.length >= 22 && buffer.subarray(0, 4).toString() === "8BPS") {
    return { width: buffer.readUInt32BE(18), height: buffer.readUInt32BE(14) };
  }
  if (format === "tga" && buffer.length >= 18) {
    return { width: buffer.readUInt16LE(12), height: buffer.readUInt16LE(14) };
  }
  if (format === "bmp" && buffer.length >= 26 && buffer.subarray(0, 2).toString() === "BM") {
    const dibSize = buffer.readUInt32LE(14);
    if (dibSize === 12) {
      return { width: buffer.readUInt16LE(18), height: buffer.readUInt16LE(20) };
    }
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) };
  }
  if (format === "dds" && buffer.length >= 20 && buffer.subarray(0, 4).toString() === "DDS ") {
    return { width: buffer.readUInt32LE(16), height: buffer.readUInt32LE(12) };
  }
  if ((format === "ico" || format === "cur") && buffer.length >= 6) {
    const count = buffer.readUInt16LE(4);
    let largest: ImageDimensions | undefined;
    for (let index = 0; index < count && 6 + index * 16 + 16 <= buffer.length; index++) {
      const offset = 6 + index * 16;
      const width = buffer[offset] || 256;
      const height = buffer[offset + 1] || 256;
      if (!largest || width * height > largest.width * largest.height) largest = { width, height };
    }
    return largest;
  }
  if (format === "hdr") {
    const match = buffer
      .subarray(0, Math.min(buffer.length, 64 * 1024))
      .toString("ascii")
      .match(/[+-]Y\s+(\d+)\s+[+-]X\s+(\d+)/i);
    if (match) return { width: Number(match[2]), height: Number(match[1]) };
  }
  if (format === "ppm" || format === "pgm" || format === "pbm") {
    const header = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString("ascii");
    if (/^P7(?:\s|$)/.test(header)) {
      const width = header.match(/^WIDTH\s+(\d+)/im)?.[1];
      const height = header.match(/^HEIGHT\s+(\d+)/im)?.[1];
      if (width && height) return { width: Number(width), height: Number(height) };
    } else {
      const tokens = header
        .replace(/#[^\r\n]*/g, " ")
        .trim()
        .split(/\s+/);
      if (/^P[1-6]$/.test(tokens[0] ?? "") && tokens[1] && tokens[2]) {
        return { width: Number(tokens[1]), height: Number(tokens[2]) };
      }
    }
  }
  if (format === "dpx" && buffer.length >= 780) {
    const magic = buffer.subarray(0, 4).toString("ascii");
    if (magic === "SDPX") {
      return { width: buffer.readUInt32BE(772), height: buffer.readUInt32BE(776) };
    }
    if (magic === "XPDS") {
      return { width: buffer.readUInt32LE(772), height: buffer.readUInt32LE(776) };
    }
  }
  if (format === "fits") {
    const header = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString("ascii");
    const width = header.match(/(?:^|\s)NAXIS1\s*=\s*(\d+)/)?.[1];
    const height = header.match(/(?:^|\s)NAXIS2\s*=\s*(\d+)/)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };
  }
  if (format === "eps") {
    // BoundingBox is normally near the prolog, or near the trailer when the
    // prolog says `(atend)`. Avoid duplicating a potentially large EPS buffer
    // as a JavaScript string just to inspect those two regions.
    const sampleSize = 1024 * 1024;
    const source =
      buffer.length <= sampleSize * 2
        ? buffer.toString("latin1")
        : `${buffer.subarray(0, sampleSize).toString("latin1")}\n${buffer
            .subarray(buffer.length - sampleSize)
            .toString("latin1")}`;
    const matches = [
      ...source.matchAll(
        /^%%(?:HiRes)?BoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/gim,
      ),
    ];
    const match = matches.at(-1);
    if (match) {
      // EPS is rasterized by this module at 300 DPI; bounding boxes use points.
      return {
        width: Math.ceil(((Number(match[3]) - Number(match[1])) * 300) / 72),
        height: Math.ceil(((Number(match[4]) - Number(match[2])) * 300) / 72),
      };
    }
  }
  return undefined;
}

async function preflightEncodedDimensions(
  buffer: Buffer,
  format: string,
  ext: string | undefined,
  options: DecodeSafetyOptions,
): Promise<void> {
  if (options.maxPixels === undefined && options.maxDimension === undefined) return;
  options.signal?.throwIfAborted();

  const known = readKnownEncodedDimensions(buffer, format);
  if (
    known &&
    Number.isFinite(known.width) &&
    Number.isFinite(known.height) &&
    known.width > 0 &&
    known.height > 0
  ) {
    assertDimensionsWithinLimit(known.width, known.height, options);
    return;
  }

  // ExifTool reads container metadata without rasterizing pixels and supports
  // the hard-to-parse formats here (camera RAW, EXR, JXL and JPEG 2000). It is
  // part of every supported container image alongside these decoders.
  const id = randomUUID();
  const safeExt = (ext || format || "img").replace(/[^a-z0-9]/gi, "") || "img";
  const inputPath = join(tmpdir(), `dimensions-${id}.${safeExt}`);
  try {
    await writeTempExclusive(inputPath, buffer);
    const { stdout } = await execFileAsync(
      "exiftool",
      ["-fast2", "-s3", "-ImageWidth", "-ImageHeight", inputPath],
      {
        timeout: 15_000,
        maxBuffer: 64 * 1024,
        signal: options.signal,
      },
    );
    const values = String(stdout).trim().split(/\s+/).map(Number);
    if (values.length >= 2 && values.every(Number.isFinite)) {
      assertDimensionsWithinLimit(values[0], values[1], options);
      return;
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    if (isImageSafetyError(error)) throw error;
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
  }

  throw new Error(
    `Cannot safely decode ${format.toUpperCase()}: encoded dimensions are unavailable for the configured image safety limits`,
  );
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

/** Formats that need external CLI tools (not decodable by Sharp). */
const CLI_DECODED_FORMATS = new Set([
  "raw",
  "ico",
  "tga",
  "psd",
  "exr",
  "hdr",
  "bmp",
  "jxl",
  "jp2",
  "qoi",
  "eps",
  "dds",
  "cur",
  "dpx",
  "ppm",
  "pgm",
  "pbm",
  "fits",
]);

export function needsCliDecode(format: string): boolean {
  return CLI_DECODED_FORMATS.has(format);
}

/**
 * Main entry point - routes to the right decoder based on format.
 * Returns a PNG buffer that Sharp can process downstream.
 *
 * @param buffer - The raw file buffer
 * @param format - The detected format string (e.g. "raw", "psd", "ico")
 * @param ext    - Optional original file extension (e.g. "cr3", "nef").
 *                 Passed to decodeRaw so the temp file uses the correct
 *                 extension, which helps ExifTool and ImageMagick identify
 *                 the RAW variant.
 */
export async function decodeToSharpCompat(
  buffer: Buffer,
  format: string,
  ext?: string,
  options: DecodeSafetyOptions = {},
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  await preflightEncodedDimensions(buffer, format, ext, options);
  let decoded: Buffer;
  switch (format) {
    case "raw":
      decoded = await decodeRaw(buffer, ext, options);
      break;
    case "ico":
      decoded = await decodeIco(buffer, options);
      break;
    case "psd":
      decoded = await decodePsd(buffer, options);
      break;
    case "tga":
      decoded = await decodeTga(buffer, options);
      break;
    case "exr":
      decoded = await decodeExr(buffer, options);
      break;
    case "hdr":
      decoded = await decodeHdr(buffer, options);
      break;
    case "bmp":
      decoded = await decodeBmp(buffer, options);
      break;
    case "jxl":
      decoded = await decodeJxl(buffer, options);
      break;
    case "jp2":
      decoded = await decodeJp2(buffer, options);
      break;
    case "eps":
      decoded = await decodeEps(buffer, options);
      break;
    case "dds":
      decoded = await decodeDds(buffer, options);
      break;
    case "cur":
      decoded = await decodeIco(buffer, options); // CUR is structurally identical to ICO
      break;
    case "dpx":
      decoded = await decodeDpx(buffer, options);
      break;
    case "fits":
      decoded = await decodeFits(buffer, options);
      break;
    case "qoi":
      decoded = await decodeQoi(buffer, options);
      break;
    case "ppm":
    case "pgm":
    case "pbm":
      decoded = await decodeNetpbm(buffer, format, options);
      break;
    default:
      decoded = buffer;
  }
  return assertDecodedWithinLimit(decoded, options);
}

/**
 * Last-resort decode: convert any image to PNG via ImageMagick.
 * Used when Sharp's bundled decoders fail (e.g. AVIF 2.0 bitstreams).
 */
export async function decodeAnyFormat(
  buffer: Buffer,
  format: string,
  options: DecodeSafetyOptions = {},
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  await preflightEncodedDimensions(buffer, format, undefined, options);
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const ext = format || "img";
  const inputPath = join(tmpdir(), `any-in-${id}.${ext}`);
  const outputPath = join(tmpdir(), `any-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await assertDecodedWithinLimit(await readFile(outputPath), options);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── ImageMagick helpers ────────────────────────────────────────

let cachedMagickCmd: string | null = null;

async function findMagickCmd(options: DecodeSafetyOptions = {}): Promise<string> {
  options.signal?.throwIfAborted();
  if (cachedMagickCmd) return cachedMagickCmd;
  for (const cmd of ["magick", "convert"]) {
    try {
      await execFileAsync(cmd, ["--version"], commandOptions(options, 5_000));
      cachedMagickCmd = cmd;
      return cmd;
    } catch {
      options.signal?.throwIfAborted();
      // try next
    }
  }
  throw new Error("No ImageMagick found. Install imagemagick (provides convert/magick).");
}

/** Build resource limits with syntax shared by ImageMagick 6 and 7. */
export function buildImageMagickResourceLimitArgs(options: DecodeSafetyOptions = {}): string[] {
  // Defense in depth for the conversion subprocess. ImageMagick's `area`
  // limit is a cache/spill threshold, not the strict pixel-product check;
  // preflightEncodedDimensions and assertDecodedWithinLimit provide that.
  const pixelCacheBytes = options.maxPixels === undefined ? undefined : options.maxPixels * 16;
  const sideLimit = options.maxDimension ?? options.maxPixels;
  if (sideLimit === undefined || pixelCacheBytes === undefined) return [];

  // Width and height are pixel counts when unitless. A trailing `P` is not a
  // pixel unit: ImageMagick 6 treats it as an overflowing SI prefix and
  // resolves the limit to zero, while ImageMagick 7 clamps it near infinity.
  return [
    "-limit",
    "width",
    String(sideLimit),
    "-limit",
    "height",
    String(sideLimit),
    "-limit",
    "area",
    `${pixelCacheBytes}B`,
    "-limit",
    "memory",
    `${pixelCacheBytes}B`,
    "-limit",
    "map",
    `${pixelCacheBytes}B`,
    "-limit",
    "disk",
    `${pixelCacheBytes * 2}B`,
  ];
}

function magickArgs(cmd: string, args: string[], options: DecodeSafetyOptions = {}): string[] {
  const limits = buildImageMagickResourceLimitArgs(options);
  const convertArgs = [...limits, ...args];
  return cmd === "magick" ? ["convert", ...convertArgs] : convertArgs;
}

function isImageSafetyError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /(?:pixel (?:dimension )?safety limit|input image exceeds pixel limit)/i.test(error.message)
  );
}

// ── ICO decoder ────────────────────────────────────────────────

async function decodeIco(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `ico-in-${id}.ico`);
  const outputPath = join(tmpdir(), `ico-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    // ICO contains multiple sizes; extract the largest by sorting
    await execFileAsync(
      cmd,
      magickArgs(cmd, [`${inputPath}[-1]`, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── RAW decoder (LibRaw-first, ExifTool + ImageMagick fallbacks) ──
//
// Strategy: decode the full-resolution RAW with dcraw_emu (LibRaw), which is
// actively maintained and handles modern Camera RAW including iPhone ProRAW
// DNG. We prefer this over extracting the embedded JPEG preview so a
// full-resolution RAW never silently comes back as a reduced-size preview.
//
// Fallbacks, in order: the embedded full-size JPEG (ExifTool JpgFromRaw),
// then the embedded preview (ExifTool PreviewImage), then ImageMagick. The
// ImageMagick delegate is last because on many distros it is the deprecated
// ufraw-batch, which fails outright on newer RAW formats (see issue #289).

async function decodeRaw(
  buffer: Buffer,
  ext: string | undefined,
  options: DecodeSafetyOptions,
): Promise<Buffer> {
  const id = randomUUID();
  // Use the original extension so LibRaw / ExifTool / ImageMagick can identify
  // the RAW variant.
  const suffix = ext ? `.${ext.replace(/^\./, "")}` : ".dng";
  const inputPath = join(tmpdir(), `raw-in-${id}${suffix}`);
  const outputPath = join(tmpdir(), `raw-out-${id}.png`);
  // dcraw_emu APPENDS the output extension to the full input path
  // (raw-in-X.dng -> raw-in-X.dng.tiff); it does NOT replace the extension.
  const dcrawOutput = `${inputPath}.tiff`;

  try {
    await writeTempExclusive(inputPath, buffer);

    // Attempt 1: dcraw_emu (direct LibRaw decode to TIFF) -- full resolution.
    try {
      await execFileAsync(
        "dcraw_emu",
        ["-T", "-w", "-o", "1", inputPath],
        commandOptions(options, 120_000),
      );
      const tiffBuf = await readFile(dcrawOutput);
      if (tiffBuf.length > 0) {
        // Sharp handles TIFF natively.
        return await sharp(tiffBuf, { limitInputPixels: options.maxPixels }).png().toBuffer();
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof Error && /pixel safety limit/i.test(error.message)) throw error;
      // dcraw_emu not available or unsupported format -- fall through
    }

    // Attempt 2: ExifTool full-size embedded JPEG (JpgFromRaw). Many formats
    // (NEF, RW2, ...) embed a full-resolution JPEG under this tag.
    try {
      const { stdout } = await execFileAsync("exiftool", ["-b", "-JpgFromRaw", inputPath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
        signal: options.signal,
      } as never);
      // stdout is a Buffer when encoding is "buffer"
      const jpegBuf = stdout as unknown as Buffer;
      // length guard + JPEG SOI marker
      if (jpegBuf && jpegBuf.length > 1000 && jpegBuf[0] === 0xff && jpegBuf[1] === 0xd8) {
        return jpegBuf;
      }
    } catch {
      options.signal?.throwIfAborted();
      // ExifTool not available or no embedded JPEG -- fall through
    }

    // Attempt 3: ExifTool PreviewImage (some formats store the embedded image
    // under a different tag than JpgFromRaw).
    try {
      const { stdout } = await execFileAsync("exiftool", ["-b", "-PreviewImage", inputPath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
        signal: options.signal,
      } as never);
      const previewBuf = stdout as unknown as Buffer;
      if (
        previewBuf &&
        previewBuf.length > 1000 &&
        previewBuf[0] === 0xff &&
        previewBuf[1] === 0xd8
      ) {
        return previewBuf;
      }
    } catch {
      options.signal?.throwIfAborted();
      // fall through
    }

    // Attempt 4: ImageMagick (last resort -- its RAW delegate may be the
    // deprecated ufraw-batch, which fails on modern formats).
    const cmd = await findMagickCmd(options);
    await execFileAsync(
      cmd,
      magickArgs(
        cmd,
        [inputPath, "-colorspace", "sRGB", "-auto-orient", `png:${outputPath}`],
        options,
      ),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
    // Always clean up the dcraw_emu output, even when a later tier won.
    await rm(dcrawOutput, { force: true }).catch(() => {});
  }
}

// ── ImageMagick decoders (PSD, TGA, EXR, HDR) ──────────────────

/**
 * Decode PSD to PNG. Uses [0] to read only the flattened composite layer.
 */
async function decodePsd(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `psd-in-${id}.psd`);
  const outputPath = join(tmpdir(), `psd-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [`${inputPath}[0]`, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Decode TGA to PNG.
 */
async function decodeTga(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `tga-in-${id}.tga`);
  const outputPath = join(tmpdir(), `tga-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Decode EXR to PNG. Colorspace conversion from linear to sRGB is needed
 * because EXR files are typically stored in linear light.
 */
async function decodeExr(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `exr-in-${id}.exr`);
  const outputPath = join(tmpdir(), `exr-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);

    // ImageMagick needs the OpenEXR delegate which is often missing on macOS
    try {
      const cmd = await findMagickCmd(options);
      await execFileAsync(
        cmd,
        magickArgs(
          cmd,
          [inputPath, "-colorspace", "sRGB", "-depth", "8", `png:${outputPath}`],
          options,
        ),
        commandOptions(options, 120_000),
      );
      return await readFile(outputPath);
    } catch {
      options.signal?.throwIfAborted();
      // ImageMagick failed, try ffmpeg
    }

    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-pix_fmt", "rgba", "-update", "1", outputPath],
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Decode Radiance HDR to PNG. Same colorspace handling as EXR.
 */
async function decodeHdr(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `hdr-in-${id}.hdr`);
  const outputPath = join(tmpdir(), `hdr-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(
        cmd,
        [inputPath, "-colorspace", "sRGB", "-depth", "8", `png:${outputPath}`],
        options,
      ),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

async function decodeBmp(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `bmp-in-${id}.bmp`);
  const outputPath = join(tmpdir(), `bmp-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

async function decodeJxl(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jxl-in-${id}.jxl`);
  const outputPath = join(tmpdir(), `jxl-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);

    // Try djxl first (from libjxl-tools) — works even when ImageMagick
    // lacks a JXL delegate (common on Ubuntu stock packages).
    try {
      await execFileAsync("djxl", [inputPath, outputPath], commandOptions(options, 120_000));
      return await readFile(outputPath);
    } catch {
      options.signal?.throwIfAborted();
      // djxl not available, fall back to ImageMagick
    }

    const cmd = await findMagickCmd(options);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── JPEG 2000 decoder (opj_decompress-first, ImageMagick fallback) ──

async function decodeJp2(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jp2-in-${id}.jp2`);
  const outputPath = join(tmpdir(), `jp2-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    try {
      await execFileAsync("opj_decompress", ["-i", inputPath, "-o", outputPath], {
        timeout: 60_000,
        signal: options.signal,
      });
      return await readFile(outputPath);
    } catch {
      options.signal?.throwIfAborted();
      // opj_decompress not available, fall back to ImageMagick
    }
    const cmd = await findMagickCmd(options);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── EPS decoder (ImageMagick + Ghostscript delegate) ──

const MAX_EPS_SIZE = 50 * 1024 * 1024;

async function decodeEps(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  if (buffer.length > MAX_EPS_SIZE) {
    throw new Error(
      `EPS file too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB, limit: 50MB)`,
    );
  }
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `eps-in-${id}.eps`);
  const outputPath = join(tmpdir(), `eps-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(
        cmd,
        [
          "-density",
          "300",
          "-define",
          "gs:MaxBitmap=500000000",
          inputPath,
          "-colorspace",
          "sRGB",
          `png:${outputPath}`,
        ],
        options,
      ),
      commandOptions(options, 30_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── DDS decoder ──

async function decodeDds(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `dds-in-${id}.dds`);
  const outputPath = join(tmpdir(), `dds-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [`${inputPath}[0]`, `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── DPX / Cineon decoder ──

async function decodeDpx(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `dpx-in-${id}.dpx`);
  const outputPath = join(tmpdir(), `dpx-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", `png:${outputPath}`], options),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── FITS decoder ──

async function decodeFits(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  const cmd = await findMagickCmd(options);
  const id = randomUUID();
  const inputPath = join(tmpdir(), `fits-in-${id}.fits`);
  const outputPath = join(tmpdir(), `fits-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(
        cmd,
        [`${inputPath}[0]`, "-normalize", "-colorspace", "sRGB", `png:${outputPath}`],
        options,
      ),
      commandOptions(options, 120_000),
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── QOI decoder ──

async function decodeQoi(buffer: Buffer, options: DecodeSafetyOptions): Promise<Buffer> {
  options.signal?.throwIfAborted();
  if (buffer.length < 14 || buffer.subarray(0, 4).toString("ascii") !== "qoif") {
    throw new Error("Invalid QOI header");
  }
  assertDimensionsWithinLimit(buffer.readUInt32BE(4), buffer.readUInt32BE(8), options);
  const { qoiDecode } = await import("@snapotter/image-engine");
  options.signal?.throwIfAborted();
  const { header, pixels } = qoiDecode(new Uint8Array(buffer));
  assertDimensionsWithinLimit(header.width, header.height, options);
  return sharp(Buffer.from(pixels), {
    raw: { width: header.width, height: header.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ── Netpbm (PPM/PGM/PBM) decoder ──

async function decodeNetpbm(
  buffer: Buffer,
  format: string,
  options: DecodeSafetyOptions,
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  try {
    return await sharp(buffer, { limitInputPixels: options.maxPixels }).png().toBuffer();
  } catch {
    options.signal?.throwIfAborted();
    const cmd = await findMagickCmd(options);
    const id = randomUUID();
    const ext = format === "pgm" ? "pgm" : format === "pbm" ? "pbm" : "ppm";
    const inputPath = join(tmpdir(), `netpbm-in-${id}.${ext}`);
    const outputPath = join(tmpdir(), `netpbm-out-${id}.png`);
    try {
      await writeTempExclusive(inputPath, buffer);
      await execFileAsync(
        cmd,
        magickArgs(cmd, [inputPath, `png:${outputPath}`], options),
        commandOptions(options, 120_000),
      );
      return await readFile(outputPath);
    } finally {
      await rm(inputPath, { force: true }).catch(() => {});
      await rm(outputPath, { force: true }).catch(() => {});
    }
  }
}
