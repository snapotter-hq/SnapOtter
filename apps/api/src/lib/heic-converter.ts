import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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

/**
 * Find the HEIF decode command. Both heif-convert and heif-dec accept
 * `<input> <output>` positional arguments.
 */
let cachedDecodeCmd: string | null = null;

async function findDecodeCmd(): Promise<string> {
  if (cachedDecodeCmd) return cachedDecodeCmd;
  for (const cmd of ["heif-convert", "heif-dec"]) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 5_000 });
      cachedDecodeCmd = cmd;
      return cmd;
    } catch {
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
export async function decodeHeic(buffer: Buffer): Promise<Buffer> {
  const cmd = await findDecodeCmd();
  // Include the PID so concurrent processes (and test workers) write to
  // distinct, attributable temp paths in the shared tmpdir.
  const id = `${process.pid}-${randomUUID()}`;
  const inputPath = join(tmpdir(), `heic-in-${id}.heic`);
  const outputPath = join(tmpdir(), `heic-out-${id}.png`);
  const suffixedPath = outputPath.replace(/\.png$/, "-1.png");

  try {
    await writeTempExclusive(inputPath, buffer);
    await execFileAsync(cmd, [inputPath, outputPath], { timeout: 120_000 });

    // Single-image HEIF: exact filename. Multi-image: -1 suffix on first image.
    try {
      return await readFile(outputPath);
    } catch {
      return await readFile(suffixedPath);
    }
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
export async function ensureSharpCompat(buffer: Buffer): Promise<Buffer> {
  if (isHeifBuffer(buffer)) {
    return decodeHeic(buffer);
  }
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
