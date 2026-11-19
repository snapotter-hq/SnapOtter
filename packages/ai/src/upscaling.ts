import { join } from "node:path";
import sharp from "sharp";
import {
  gpuMayBeAvailable,
  isGpuAvailable,
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";
import { readScratchOutput, writeScratchInput } from "./scratch-io.js";

/**
 * Maximum input megapixels for CPU-only AI upscaling (#2513); a larger input
 * is reduced to fit first (#4820).
 * RealESRGAN_x4plus always runs at 4x internally (allocating a 4x output buffer
 * plus fp32 tile tensors), so a 4 MP ceiling caps the internal 4x array at
 * 64 MP (~192 MB RGB) on CPU hosts. Configurable via MAX_CPU_UPSCALE_MP (0 = unlimited).
 */
export const MAX_CPU_UPSCALE_MP = 4;

/**
 * Maximum output megapixels (`width * height * scale^2 / 1e6`) on CPU hosts,
 * equal to a 4 MP input at 4x scale (64 MP). Bounds high scale factors (6x, 8x)
 * on smaller inputs so the final upscaled array cannot OOM a 4 GB container.
 * Scales with MAX_CPU_UPSCALE_MP.
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

/**
 * The size a CPU host reduces the input to before upscaling, or null when it
 * already fits (#4820). Refusing a 12 MP phone photo after the upload left
 * people with nothing, so the input shrinks to the largest size both ceilings
 * allow: `maxCpuMp` for the AI models (lanczos is exempt), and the output
 * ceiling `maxCpuMp * 16` divided by the scale squared. Floors keep the result
 * at or under the budget; 0 disables both.
 */
export function cpuFitDimensions(
  width: number,
  height: number,
  scale: number,
  model: string | undefined,
  maxCpuMp: number,
): { width: number; height: number } | null {
  if (maxCpuMp <= 0 || width <= 0 || height <= 0) return null;
  const maxCpuOutputMp = maxCpuMp * (MAX_CPU_UPSCALE_OUTPUT_MP / MAX_CPU_UPSCALE_MP);
  const outputBudgetMp = scale > 0 ? maxCpuOutputMp / scale ** 2 : Number.POSITIVE_INFINITY;
  const budgetMp = model === "lanczos" ? outputBudgetMp : Math.min(maxCpuMp, outputBudgetMp);
  const megapixels = (width * height) / 1_000_000;
  if (megapixels <= budgetMp) return null;
  const factor = Math.sqrt(budgetMp / megapixels);
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
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
  /** Set when a CPU host reduced the input to this size before upscaling (#4820). */
  inputResizedTo?: { width: number; height: number };
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
  const scale = pythonOptions.scale ?? 2;
  // The fit asks whether a GPU could run this (a device node counts until the
  // dispatcher reports, #4758); the timeout keeps the probed answer, so a
  // pre-probe run gets the generous CPU budget.
  const fit = gpuMayBeAvailable("torch")
    ? null
    : cpuFitDimensions(
        meta.width ?? 0,
        meta.height ?? 0,
        scale,
        pythonOptions.model,
        resolveMaxCpuUpscaleMp(),
      );
  if (fit) image.resize(fit.width, fit.height, { fit: "fill", kernel: "lanczos3" });
  const width = fit?.width ?? meta.width ?? 0;
  const height = fit?.height ?? meta.height ?? 0;
  const effectiveMp = ((width * height) / 1_000_000) * scale ** 2;

  const pngBuffer = await image.png().toBuffer();
  await writeScratchInput("upscale", inputPath, pngBuffer);

  // CPU inference is ~50-100x slower than GPU; be generous for self-hosted NAS hardware
  const rateMs = isGpuAvailable("torch") ? 30_000 : 180_000;
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
  const buffer = await readScratchOutput("upscale", actualOutputPath);
  return {
    buffer,
    width: result.width,
    height: result.height,
    method: result.method ?? "unknown",
    format: result.format ?? "png",
    ...(fit ? { inputResizedTo: fit } : {}),
  };
}
