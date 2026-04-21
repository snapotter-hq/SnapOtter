import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/** Formats that need external CLI tools (not decodable by Sharp). */
const CLI_DECODED_FORMATS = new Set(["raw", "tga", "psd", "exr", "hdr"]);

export function needsCliDecode(format: string): boolean {
  return CLI_DECODED_FORMATS.has(format);
}

/**
 * Main entry point - routes to the right decoder based on format.
 * Returns a PNG buffer that Sharp can process downstream.
 */
export async function decodeToSharpCompat(buffer: Buffer, format: string): Promise<Buffer> {
  switch (format) {
    case "raw":
      return decodeRaw(buffer);
    case "psd":
      return decodePsd(buffer);
    case "tga":
      return decodeTga(buffer);
    case "exr":
      return decodeExr(buffer);
    case "hdr":
      return decodeHdr(buffer);
    default:
      return buffer;
  }
}

// ── RAW decoder (dcraw_emu / dcraw) ─────────────────────────────

let cachedRawCmd: string | null = null;

async function findRawCmd(): Promise<string> {
  if (cachedRawCmd) return cachedRawCmd;
  for (const cmd of ["dcraw_emu", "dcraw"]) {
    try {
      await execFileAsync(cmd, [], { timeout: 5_000 });
      cachedRawCmd = cmd;
      return cmd;
    } catch {
      // dcraw_emu / dcraw exit non-zero with no args but that's fine -
      // if the binary exists the exec won't throw ENOENT
      if (cachedRawCmd === null) {
        // Check if the error was ENOENT (not found) vs normal exit code
        try {
          await execFileAsync("which", [cmd], { timeout: 5_000 });
          cachedRawCmd = cmd;
          return cmd;
        } catch {
          // not found, try next
        }
      }
    }
  }
  throw new Error("No RAW decoder found. Install libraw-dev (provides dcraw_emu) or dcraw.");
}

/**
 * Decode Camera RAW buffer to PNG via dcraw_emu.
 * dcraw_emu -T produces a TIFF file alongside the input (same name, .tiff extension).
 * We then convert TIFF to PNG via Sharp for consistent downstream handling.
 */
async function decodeRaw(buffer: Buffer): Promise<Buffer> {
  const cmd = await findRawCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `raw-in-${id}.dng`);
  const tiffPath = join(tmpdir(), `raw-in-${id}.tiff`);

  try {
    await writeFile(inputPath, buffer);
    // -T = output TIFF, -w = use camera white balance, -W = disable auto-brightness
    await execFileAsync(cmd, ["-T", "-w", "-W", inputPath], { timeout: 120_000 });
    const tiffBuffer = await readFile(tiffPath);
    return await sharp(tiffBuffer).png().toBuffer();
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(tiffPath, { force: true }).catch(() => {});
  }
}

// ── ImageMagick decoders (PSD, TGA, EXR, HDR) ──────────────────

let cachedMagickCmd: string | null = null;

async function findMagickCmd(): Promise<string> {
  if (cachedMagickCmd) return cachedMagickCmd;
  // ImageMagick 7 uses `magick`, v6 uses `convert`
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

/**
 * Build the ImageMagick command args. For ImageMagick 7 (`magick`),
 * the subcommand `convert` must be prepended.
 */
function magickArgs(cmd: string, args: string[]): string[] {
  return cmd === "magick" ? ["convert", ...args] : args;
}

/**
 * Decode PSD to PNG. Uses [0] to read only the flattened composite layer.
 */
async function decodePsd(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `psd-in-${id}.psd`);
  const outputPath = join(tmpdir(), `psd-out-${id}.png`);

  try {
    await writeFile(inputPath, buffer);
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
    await writeFile(inputPath, buffer);
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
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `exr-in-${id}.exr`);
  const outputPath = join(tmpdir(), `exr-out-${id}.png`);

  try {
    await writeFile(inputPath, buffer);
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

/**
 * Decode Radiance HDR to PNG. Same colorspace handling as EXR.
 */
async function decodeHdr(buffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `hdr-in-${id}.hdr`);
  const outputPath = join(tmpdir(), `hdr-out-${id}.png`);

  try {
    await writeFile(inputPath, buffer);
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
