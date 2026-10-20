import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import {
  isGpuAvailable,
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

/**
 * Maximum input megapixels accepted for CPU-only upscaling (#2513).
 * RealESRGAN_x4plus always runs at 4x internally (allocating a 4x output buffer
 * plus fp32 tile tensors), so a 4 MP ceiling caps the internal 4x array at
 * 64 MP (~192 MB RGB) on CPU hosts. Configurable via MAX_CPU_UPSCALE_MP (0 = unlimited).
 */
export const MAX_CPU_UPSCALE_MP = 4;

/**
 * Maximum output megapixels (`width * height * scale^2 / 1e6`) on CPU hosts,
 * equal to a 4 MP input at 4x scale (64 MP). Bounds high scale factors (6x, 8x)
 * on smaller inputs so the final upscaled array cannot OOM a 4 GB container.
 */
export const MAX_CPU_UPSCALE_OUTPUT_MP = 64;

function resolveMaxCpuUpscaleMp(): number {
  const raw = process.env.MAX_CPU_UPSCALE_MP?.trim();
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return MAX_CPU_UPSCALE_MP;
}

function formatExceededMp(actual: number, limit: number): string {
  const oneDec = actual.toFixed(1);
  return Number(oneDec) <= limit ? actual.toFixed(2) : oneDec;
}

export interface UpscaleOptions {
  scale?: number;
  model?: string;
  faceEnhance?: boolean;
  denoise?: number;
  format?: string;
  quality?: number;
  signal?: AbortSignal;
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
  const { signal, ...pythonOptions } = options;
  const inputPath = join(outputDir, "input_upscale.png");
  const outputPath = join(outputDir, "output_upscale.png");

  const image = sharp(inputBuffer);
  const meta = await image.metadata();
  const megapixels = ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000;
  const scale = pythonOptions.scale ?? 2;
  const effectiveMp = megapixels * scale ** 2;
  const gpu = isGpuAvailable("torch");

  if (!gpu) {
    const maxCpuMp = resolveMaxCpuUpscaleMp();
    if (maxCpuMp > 0) {
      if (pythonOptions.model !== "lanczos" && megapixels > maxCpuMp) {
        throw new ToolInputError(
          `Image is too large for CPU upscaling (${formatExceededMp(megapixels, maxCpuMp)} MP, max ${maxCpuMp} MP on CPU). Resize the image, use Fast (Lanczos) quality, or use a GPU host.`,
        );
      }
      const maxCpuOutputMp = maxCpuMp * (MAX_CPU_UPSCALE_OUTPUT_MP / MAX_CPU_UPSCALE_MP);
      if (effectiveMp > maxCpuOutputMp) {
        throw new ToolInputError(
          `Upscaled output is too large for CPU upscaling (${formatExceededMp(effectiveMp, maxCpuOutputMp)} MP at ${scale}x, max ${maxCpuOutputMp} MP on CPU). Use a smaller image, lower scale factor, or a GPU host.`,
        );
      }
    }
  }

  const pngBuffer = await image.png().toBuffer();
  await writeFile(inputPath, pngBuffer);

  // CPU inference is ~50-100x slower than GPU; be generous for self-hosted NAS hardware
  const rateMs = gpu ? 30_000 : 180_000;
  const timeout = Math.max(600_000, effectiveMp * rateMs);

  const { stdout } = await runPythonWithProgress(
    "upscale.py",
    [inputPath, outputPath, JSON.stringify(pythonOptions)],
    { onProgress, timeout, signal },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw toSidecarError(result.error, "Upscaling failed");
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
