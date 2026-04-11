import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export interface SeamCarveOptions {
  width?: number;
  height?: number;
  protectFaces?: boolean;
  blurRadius?: number;
  sobelThreshold?: number;
  square?: boolean;
}

export interface SeamCarveResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Discover the caire binary. Checks PATH (Docker installs to /usr/local/bin)
 * and the CAIRE_PATH env var for local development.
 */
let cachedCairePath: string | null = null;

async function findCaire(): Promise<string> {
  if (cachedCairePath) return cachedCairePath;

  const candidates = process.env.CAIRE_PATH ? [process.env.CAIRE_PATH, "caire"] : ["caire"];

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["-help"], { timeout: 5_000 });
      cachedCairePath = cmd;
      return cmd;
    } catch {
      // try next
    }
  }
  throw new Error(
    "caire binary not found. Install via: go install github.com/esimov/caire/cmd/caire@v1.5.0",
  );
}

/**
 * Content-aware resize using caire (Go seam carving engine).
 * Supports both shrinking and enlarging via seam removal/insertion.
 */
export async function seamCarve(
  inputBuffer: Buffer,
  outputDir: string,
  options: SeamCarveOptions = {},
): Promise<SeamCarveResult> {
  const cairePath = await findCaire();
  const id = randomUUID();
  const inputPath = join(outputDir, `caire-in-${id}.png`);
  const outputPath = join(outputDir, `caire-out-${id}.png`);

  try {
    await writeFile(inputPath, inputBuffer);

    // Build caire arguments
    const args = ["-in", inputPath, "-out", outputPath, "-preview=false"];

    if (options.square) {
      // Caire -square requires -width and -height set to the shortest edge
      const meta = await sharp(inputBuffer).metadata();
      const shortest = Math.min(meta.width ?? 0, meta.height ?? 0);
      args.push("-square", "-width", String(shortest), "-height", String(shortest));
    } else {
      if (options.width) args.push("-width", String(options.width));
      if (options.height) args.push("-height", String(options.height));
    }

    if (options.protectFaces) args.push("-face");
    if (options.blurRadius !== undefined) args.push("-blur", String(options.blurRadius));
    if (options.sobelThreshold !== undefined) args.push("-sobel", String(options.sobelThreshold));

    await execFileAsync(cairePath, args, { timeout: 60_000 });

    const buffer = await readFile(outputPath);
    const meta = await sharp(buffer).metadata();

    return {
      buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
