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
 * Processes at native resolution -- JPEG intermediate is used because
 * Go's JPEG decoder is significantly faster than PNG for large images.
 */
export async function seamCarve(
  inputBuffer: Buffer,
  outputDir: string,
  options: SeamCarveOptions = {},
): Promise<SeamCarveResult> {
  const cairePath = await findCaire();
  const id = randomUUID();
  const inputPath = join(outputDir, `caire-in-${id}.jpg`);
  const outputPath = join(outputDir, `caire-out-${id}.png`);

  try {
    const meta = await sharp(inputBuffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const megapixels = (width * height) / 1_000_000;

    const MAX_MP = 25;
    if (megapixels > MAX_MP) {
      throw new Error(
        `Image is too large for content-aware resize (${megapixels.toFixed(1)} MP, max ${MAX_MP} MP). Resize the image to a smaller size first.`,
      );
    }

    let targetW = options.width ?? width;
    let targetH = options.height ?? height;

    if (options.square) {
      const shortest = Math.min(options.width ?? width, options.height ?? height, width, height);
      targetW = shortest;
      targetH = shortest;
    }

    const wRatio = targetW / width;
    const hRatio = targetH / height;

    let currentW = width;
    let currentH = height;
    let preResizedBuffer = inputBuffer;

    // Seam carving can only reduce each axis by ~75% per pass. If the target
    // is further away, do a standard resize first to bring it within range.
    const MIN_RATIO = 0.25;
    if (wRatio < MIN_RATIO || hRatio < MIN_RATIO) {
      const safeW = Math.max(targetW, Math.ceil(width * MIN_RATIO));
      const safeH = Math.max(targetH, Math.ceil(height * MIN_RATIO));
      const preResized = sharp(inputBuffer).resize(safeW, safeH, { fit: "inside" });
      preResizedBuffer = await preResized.toBuffer();
      const preMeta = await sharp(preResizedBuffer).metadata();
      currentW = preMeta.width ?? safeW;
      currentH = preMeta.height ?? safeH;
    }

    const processBuffer = await sharp(preResizedBuffer).jpeg({ quality: 95 }).toBuffer();

    await writeFile(inputPath, processBuffer);

    const args = ["-in", inputPath, "-out", outputPath, "-preview=false"];

    if (options.square) {
      const shortest = Math.min(currentW, currentH);
      const caireTarget = Math.min(shortest, targetW);
      args.push("-square", "-width", String(caireTarget), "-height", String(caireTarget));
    } else {
      if (options.width) {
        args.push("-width", String(options.width));
      }
      if (options.height) {
        args.push("-height", String(options.height));
      }
    }

    if (options.protectFaces) args.push("-face");
    if (options.blurRadius !== undefined) args.push("-blur", String(options.blurRadius));
    if (options.sobelThreshold !== undefined) args.push("-sobel", String(options.sobelThreshold));

    const currentMp = (currentW * currentH) / 1_000_000;
    const timeoutMs = Math.ceil(Math.max(120_000, currentMp * 10_000));
    try {
      await execFileAsync(cairePath, args, { timeout: timeoutMs });
    } catch (err) {
      // execFile sets killed=true when it terminates the child on timeout.
      // Replace the raw caire terminal output (ANSI/spinner control chars) with
      // an actionable message; keep the original as `cause` for server logs.
      if ((err as { killed?: boolean }).killed) {
        throw new Error(
          "Content-aware resize timed out on this image. Try a smaller image or a larger target size.",
          { cause: err },
        );
      }
      throw err;
    }

    const buffer = await readFile(outputPath);
    const outMeta = await sharp(buffer).metadata();

    return {
      buffer,
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
