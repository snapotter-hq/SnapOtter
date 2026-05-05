import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  isGpuAvailable,
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
} from "./bridge.js";

export interface UpscaleOptions {
  scale?: number;
  model?: string;
  faceEnhance?: boolean;
  denoise?: number;
  format?: string;
  quality?: number;
}

export interface UpscaleResult {
  buffer: Buffer;
  width: number;
  height: number;
  method: string;
  format: string;
}

export async function upscale(
  inputBuffer: Buffer,
  outputDir: string,
  options: UpscaleOptions = {},
  onProgress?: ProgressCallback,
): Promise<UpscaleResult> {
  const inputPath = join(outputDir, "input_upscale.png");
  const outputPath = join(outputDir, "output_upscale.png");

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);

  const meta = await sharp(pngBuffer).metadata();
  const megapixels = ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000;
  const scale = options.scale ?? 2;
  const effectiveMp = megapixels * scale ** 2;
  // CPU inference is ~50-100x slower than GPU; be generous for self-hosted NAS hardware
  const rateMs = isGpuAvailable() ? 30_000 : 180_000;
  const timeout = Math.max(600_000, effectiveMp * rateMs);

  const { stdout } = await runPythonWithProgress(
    "upscale.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress, timeout },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw new Error(result.error || "Upscaling failed");
  }

  // Python may write to a different path when the output format changes
  const actualOutputPath = result.output_path || outputPath;
  const buffer = await readFile(actualOutputPath);
  return {
    buffer,
    width: result.width,
    height: result.height,
    method: result.method ?? "unknown",
    format: result.format ?? "png",
  };
}
