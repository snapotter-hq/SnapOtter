import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, parseStdoutJson, runPythonWithProgress } from "./bridge.js";

export interface NoiseRemovalOptions {
  tier?: string;
  strength?: number;
  detailPreservation?: number;
  colorNoise?: number;
  format?: string;
  quality?: number;
}

export interface NoiseRemovalResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  tier: string;
}

export async function noiseRemoval(
  inputBuffer: Buffer,
  outputDir: string,
  options: NoiseRemovalOptions = {},
  onProgress?: ProgressCallback,
): Promise<NoiseRemovalResult> {
  const inputPath = join(outputDir, "input_denoise.png");
  const outputPath = join(outputDir, "output_denoise.png");

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);

  const meta = await sharp(pngBuffer).metadata();
  const megapixels = ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000;
  const timeout = Math.max(300_000, megapixels * 120_000);

  const { stdout } = await runPythonWithProgress(
    "noise_removal.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress, timeout },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw new Error(result.error || "Noise removal failed");
  }

  const actualOutputPath = result.output_path || outputPath;
  const buffer = await readFile(actualOutputPath);
  return {
    buffer,
    width: result.width,
    height: result.height,
    format: result.format ?? "png",
    tier: result.tier ?? options.tier ?? "balanced",
  };
}
