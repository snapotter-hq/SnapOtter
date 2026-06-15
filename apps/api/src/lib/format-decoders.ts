import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

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
): Promise<Buffer> {
  switch (format) {
    case "raw":
      return decodeRaw(buffer, ext);
    case "ico":
      return decodeIco(buffer);
    case "psd":
      return decodePsd(buffer);
    case "tga":
      return decodeTga(buffer);
    case "exr":
      return decodeExr(buffer);
    case "hdr":
      return decodeHdr(buffer);
    case "bmp":
      return decodeBmp(buffer);
    case "jxl":
      return decodeJxl(buffer);
    case "jp2":
      return decodeJp2(buffer);
    case "eps":
      return decodeEps(buffer);
    case "dds":
      return decodeDds(buffer);
    case "cur":
      return decodeIco(buffer); // CUR is structurally identical to ICO
    case "dpx":
      return decodeDpx(buffer);
    case "fits":
      return decodeFits(buffer);
    case "qoi":
      return decodeQoi(buffer);
    case "ppm":
    case "pgm":
    case "pbm":
      return decodeNetpbm(buffer, format);
    default:
      return buffer;
  }
}

/**
 * Last-resort decode: convert any image to PNG via ImageMagick.
 * Used when Sharp's bundled decoders fail (e.g. AVIF 2.0 bitstreams).
 */
export async function decodeAnyFormat(buffer: Buffer, format: string): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const ext = format || "img";
  const inputPath = join(tmpdir(), `any-in-${id}.${ext}`);
  const outputPath = join(tmpdir(), `any-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", `png:${outputPath}`]),
      { timeout: 120_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── ImageMagick helpers ────────────────────────────────────────

let cachedMagickCmd: string | null = null;

async function findMagickCmd(): Promise<string> {
  if (cachedMagickCmd) return cachedMagickCmd;
  for (const cmd of ["magick", "convert"]) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 5_000 });
      cachedMagickCmd = cmd;
      return cmd;
    } catch {
      // try next
    }
  }
  throw new Error("No ImageMagick found. Install imagemagick (provides convert/magick).");
}

function magickArgs(cmd: string, args: string[]): string[] {
  return cmd === "magick" ? ["convert", ...args] : args;
}

// ── ICO decoder ────────────────────────────────────────────────

async function decodeIco(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `ico-in-${id}.ico`);
  const outputPath = join(tmpdir(), `ico-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    // ICO contains multiple sizes; extract the largest by sorting
    await execFileAsync(cmd, magickArgs(cmd, [`${inputPath}[-1]`, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── RAW decoder (ExifTool-first, ImageMagick fallback) ──────────
//
// Strategy: Many camera RAW files (CR2, CR3, NEF, ARW, etc.) embed a
// full-size JPEG preview. ExifTool can extract it near-instantly with
// `-b -JpgFromRaw`. This is faster and more reliable than ImageMagick's
// LibRaw delegate, which may not support newer formats like CR3.
//
// If ExifTool extraction fails (no embedded JPEG, or exiftool not
// installed), we fall back to ImageMagick + LibRaw.

async function decodeRaw(buffer: Buffer, ext?: string): Promise<Buffer> {
  const id = randomUUID();
  // Use the original extension so ExifTool / ImageMagick can identify the RAW variant.
  const suffix = ext ? `.${ext.replace(/^\./, "")}` : ".dng";
  const inputPath = join(tmpdir(), `raw-in-${id}${suffix}`);
  const outputPath = join(tmpdir(), `raw-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);

    // Attempt 1: ExifTool embedded JPEG extraction (fast path)
    try {
      const { stdout } = await execFileAsync("exiftool", ["-b", "-JpgFromRaw", inputPath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
      } as never);
      // stdout is a Buffer when encoding is "buffer"
      const jpegBuf = stdout as unknown as Buffer;
      if (jpegBuf && jpegBuf.length > 1000) {
        // Verify it starts with JPEG SOI marker
        if (jpegBuf[0] === 0xff && jpegBuf[1] === 0xd8) {
          return jpegBuf;
        }
      }
    } catch {
      // ExifTool not available or no embedded JPEG -- fall through
    }

    // Attempt 1b: ExifTool PreviewImage extraction (some formats store
    // preview under a different tag than JpgFromRaw).
    try {
      const { stdout } = await execFileAsync("exiftool", ["-b", "-PreviewImage", inputPath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
      } as never);
      const previewBuf = stdout as unknown as Buffer;
      if (previewBuf && previewBuf.length > 1000) {
        if (previewBuf[0] === 0xff && previewBuf[1] === 0xd8) {
          return previewBuf;
        }
      }
    } catch {
      // fall through
    }

    // Attempt 2: dcraw_emu from libraw-bin (direct LibRaw decode to TIFF).
    // More reliable than ImageMagick's delegate chain for Camera RAW.
    try {
      await execFileAsync("dcraw_emu", ["-T", "-w", "-o", "1", inputPath], { timeout: 120_000 });
      // dcraw_emu writes output next to the input with a .tiff extension
      const dcrawOutput = inputPath.replace(/\.[^.]+$/, ".tiff");
      const tiffBuf = await readFile(dcrawOutput);
      await rm(dcrawOutput, { force: true }).catch(() => {});
      if (tiffBuf.length > 0) {
        // Convert TIFF to PNG via Sharp (Sharp handles TIFF natively)
        return await sharp(tiffBuf).png().toBuffer();
      }
    } catch {
      // dcraw_emu not available or unsupported format -- fall through
    }

    // Attempt 3: ImageMagick + LibRaw delegate (full decode)
    const cmd = await findMagickCmd();
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", "-auto-orient", `png:${outputPath}`]),
      { timeout: 120_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── ImageMagick decoders (PSD, TGA, EXR, HDR) ──────────────────

/**
 * Decode PSD to PNG. Uses [0] to read only the flattened composite layer.
 */
async function decodePsd(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `psd-in-${id}.psd`);
  const outputPath = join(tmpdir(), `psd-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, magickArgs(cmd, [`${inputPath}[0]`, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Decode TGA to PNG.
 */
async function decodeTga(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `tga-in-${id}.tga`);
  const outputPath = join(tmpdir(), `tga-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `png:${outputPath}`]), {
      timeout: 120_000,
    });
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
async function decodeExr(buffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `exr-in-${id}.exr`);
  const outputPath = join(tmpdir(), `exr-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);

    // ImageMagick needs the OpenEXR delegate which is often missing on macOS
    try {
      const cmd = await findMagickCmd();
      await execFileAsync(
        cmd,
        magickArgs(cmd, [inputPath, "-colorspace", "sRGB", "-depth", "8", `png:${outputPath}`]),
        { timeout: 120_000 },
      );
      return await readFile(outputPath);
    } catch {
      // ImageMagick failed, try ffmpeg
    }

    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-pix_fmt", "rgba", "-update", "1", outputPath],
      { timeout: 120_000 },
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
async function decodeHdr(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `hdr-in-${id}.hdr`);
  const outputPath = join(tmpdir(), `hdr-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", "-depth", "8", `png:${outputPath}`]),
      { timeout: 120_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

async function decodeBmp(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `bmp-in-${id}.bmp`);
  const outputPath = join(tmpdir(), `bmp-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

async function decodeJxl(buffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jxl-in-${id}.jxl`);
  const outputPath = join(tmpdir(), `jxl-out-${id}.png`);

  try {
    await writeTempExclusive(inputPath, buffer);

    // Try djxl first (from libjxl-tools) — works even when ImageMagick
    // lacks a JXL delegate (common on Ubuntu stock packages).
    try {
      await execFileAsync("djxl", [inputPath, outputPath], { timeout: 120_000 });
      return await readFile(outputPath);
    } catch {
      // djxl not available, fall back to ImageMagick
    }

    const cmd = await findMagickCmd();
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── JPEG 2000 decoder (opj_decompress-first, ImageMagick fallback) ──

async function decodeJp2(buffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jp2-in-${id}.jp2`);
  const outputPath = join(tmpdir(), `jp2-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    try {
      await execFileAsync("opj_decompress", ["-i", inputPath, "-o", outputPath], {
        timeout: 60_000,
      });
      return await readFile(outputPath);
    } catch {
      // opj_decompress not available, fall back to ImageMagick
    }
    const cmd = await findMagickCmd();
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── EPS decoder (ImageMagick + Ghostscript delegate) ──

const MAX_EPS_SIZE = 50 * 1024 * 1024;

async function decodeEps(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > MAX_EPS_SIZE) {
    throw new Error(
      `EPS file too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB, limit: 50MB)`,
    );
  }
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `eps-in-${id}.eps`);
  const outputPath = join(tmpdir(), `eps-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [
        "-density",
        "300",
        "-define",
        "gs:MaxBitmap=500000000",
        inputPath,
        "-colorspace",
        "sRGB",
        `png:${outputPath}`,
      ]),
      { timeout: 30_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── DDS decoder ──

async function decodeDds(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `dds-in-${id}.dds`);
  const outputPath = join(tmpdir(), `dds-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, magickArgs(cmd, [`${inputPath}[0]`, `png:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── DPX / Cineon decoder ──

async function decodeDpx(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `dpx-in-${id}.dpx`);
  const outputPath = join(tmpdir(), `dpx-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [inputPath, "-colorspace", "sRGB", `png:${outputPath}`]),
      { timeout: 120_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── FITS decoder ──

async function decodeFits(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `fits-in-${id}.fits`);
  const outputPath = join(tmpdir(), `fits-out-${id}.png`);
  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(
      cmd,
      magickArgs(cmd, [
        `${inputPath}[0]`,
        "-normalize",
        "-colorspace",
        "sRGB",
        `png:${outputPath}`,
      ]),
      { timeout: 120_000 },
    );
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

// ── QOI decoder ──

async function decodeQoi(buffer: Buffer): Promise<Buffer> {
  const { qoiDecode } = await import("@snapotter/image-engine");
  const { header, pixels } = qoiDecode(new Uint8Array(buffer));
  return sharp(Buffer.from(pixels), {
    raw: { width: header.width, height: header.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ── Netpbm (PPM/PGM/PBM) decoder ──

async function decodeNetpbm(buffer: Buffer, format: string): Promise<Buffer> {
  try {
    return await sharp(buffer).png().toBuffer();
  } catch {
    const cmd = await findMagickCmd();
    const id = randomUUID();
    const ext = format === "pgm" ? "pgm" : format === "pbm" ? "pbm" : "ppm";
    const inputPath = join(tmpdir(), `netpbm-in-${id}.${ext}`);
    const outputPath = join(tmpdir(), `netpbm-out-${id}.png`);
    try {
      await writeTempExclusive(inputPath, buffer);
      await execFileAsync(cmd, magickArgs(cmd, [inputPath, `png:${outputPath}`]), {
        timeout: 120_000,
      });
      return await readFile(outputPath);
    } finally {
      await rm(inputPath, { force: true }).catch(() => {});
      await rm(outputPath, { force: true }).catch(() => {});
    }
  }
}
