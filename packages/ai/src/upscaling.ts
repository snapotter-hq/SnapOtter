import { join } from "node:path";
import {
  cpuFitDimensions,
  cpuFitRefuses,
  MAX_CPU_UPSCALE_MP,
  ToolInputError,
} from "@snapotter/shared";
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

export { cpuFitDimensions, MAX_CPU_UPSCALE_MP, MAX_CPU_UPSCALE_OUTPUT_MP } from "@snapotter/shared";

/** The CPU ceiling in effect: MAX_CPU_UPSCALE_MP from the env, else the default. */
export function resolveMaxCpuUpscaleMp(): number {
  const raw = process.env.MAX_CPU_UPSCALE_MP?.trim();
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return MAX_CPU_UPSCALE_MP;
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
  if (fit) {
    if (cpuFitRefuses(meta.width ?? 0, meta.height ?? 0, scale, fit)) {
      const maxOutputMp = ((fit.width * fit.height * scale ** 2) / 1_000_000).toFixed(1);
      throw new ToolInputError(
        `Image is too large to upscale ${scale}x without a GPU: the result would be smaller than the original (about ${maxOutputMp} MP at most on CPU). Use a higher scale factor, a smaller image, or a GPU host.`,
        { code: "RESULT_TOO_LARGE" },
      );
    }
    image.resize(fit.width, fit.height, { fit: "fill", kernel: "lanczos3" });
  }
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
