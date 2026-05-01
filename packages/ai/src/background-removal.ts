import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, parseStdoutJson, runPythonWithProgress } from "./bridge.js";

export interface RemoveBackgroundOptions {
  model?: string;
  backgroundColor?: string;
}

const MAX_REMBG_PX = Number(process.env.MAX_REMBG_PX) || 2048;
const OOM_FALLBACK_MODEL = "u2net";

export async function removeBackground(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundOptions = {},
  onProgress?: ProgressCallback,
): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `rembg_in_${id}.png`);
  const outputPath = join(outputDir, `rembg_out_${id}.png`);

  const meta = await sharp(inputBuffer).metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;
  const longest = Math.max(origW, origH);
  const needsDownscale = longest > MAX_REMBG_PX;

  let pipeline = sharp(inputBuffer);
  if (needsDownscale) {
    pipeline = pipeline.resize({
      width: origW >= origH ? MAX_REMBG_PX : undefined,
      height: origH > origW ? MAX_REMBG_PX : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const pngBuffer = await pipeline.png().toBuffer();
  await writeFile(inputPath, pngBuffer);

  try {
    const megapixels = (origW * origH) / 1_000_000;
    const baseTimeout = options.model?.startsWith("birefnet") ? 600000 : 300000;
    const timeout = Math.max(baseTimeout, megapixels * 30 * 1000);

    const rawMask = await runAndParse(inputPath, outputPath, options, onProgress, timeout);

    if (needsDownscale) {
      return sharp(rawMask).resize({ width: origW, height: origH, fit: "fill" }).png().toBuffer();
    }

    return rawMask;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

async function runAndParse(
  inputPath: string,
  outputPath: string,
  options: RemoveBackgroundOptions,
  onProgress: ProgressCallback | undefined,
  timeout: number,
): Promise<Buffer> {
  try {
    const { stdout } = await runPythonWithProgress(
      "remove_bg.py",
      [inputPath, outputPath, JSON.stringify(options)],
      { onProgress, timeout },
    );
    const result = parseStdoutJson(stdout);
    if (!result.success) {
      throw new Error(result.error || "Background removal failed");
    }
    return readFile(outputPath);
  } catch (err) {
    const isOom = err instanceof Error && err.message.includes("out of memory");
    const canFallback = isOom && options.model !== OOM_FALLBACK_MODEL;

    if (!canFallback) throw err;

    onProgress?.(5, `Retrying with lighter model (${OOM_FALLBACK_MODEL})`);
    const fallbackOpts = { ...options, model: OOM_FALLBACK_MODEL };
    const { stdout } = await runPythonWithProgress(
      "remove_bg.py",
      [inputPath, outputPath, JSON.stringify(fallbackOpts)],
      { onProgress, timeout: 300000 },
    );
    const result = parseStdoutJson(stdout);
    if (!result.success) {
      throw new Error(result.error || "Background removal failed");
    }
    return readFile(outputPath);
  }
}
