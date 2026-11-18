import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  isGpuAvailable,
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";
import { readScratchOutput, writeScratchInput } from "./scratch-io.js";

export interface RemoveBackgroundOptions {
  model?: string;
  /** One lighter model to retry on after an out-of-memory failure, or false for none. */
  oomFallbackModel?: string | false;
  /** Called with the model actually used when an out-of-memory retry replaces `model`. */
  onFallbackModel?: (model: string) => void;
  backgroundColor?: string;
  edgeRefine?: number;
  decontaminate?: boolean;
  signal?: AbortSignal;
  toolId?: string;
}

const MAX_REMBG_PX = Number(process.env.MAX_REMBG_PX) || 2048;
const OOM_FALLBACK_MODEL = "u2net";
// The nearest lighter model to retry on after an out-of-memory failure, when
// it is not u2net. HR matting outgrows 12 and 16 GB GPUs where birefnet-general
// fits, and dropping Ultra straight to u2net swapped the best model for the
// weakest one (#4753). A failure there still ends at u2net.
const OOM_FALLBACK_STEPS: Readonly<Record<string, string>> = {
  "birefnet-hr-matting": "birefnet-general",
};

/**
 * onnxruntime / CUDA / PyTorch CPU allocator / NumPy surface allocation
 * failures with several different messages ("out of memory", "not enough memory",
 * "can't allocate memory", "cannot allocate memory", "Unable to allocate ...",
 * "Failed to allocate memory for requested buffer",
 * CUBLAS_STATUS_ALLOC_FAILED, bad_alloc, MemoryError). Match them all so the
 * lighter-model fallback actually triggers instead of failing the job.
 */
export function isMemoryAllocError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /out of memory|not enough memory|can't allocate memory|cannot allocate memory|\[errno 12\]|unable to allocate|failed to allocate|cudaerrormemoryallocation|cublas_status_alloc_failed|bad_alloc|memoryerror/i.test(
    err.message,
  );
}

function toBgRemovalError(reason: unknown): Error {
  return toSidecarError(reason, "Background removal failed");
}

export async function removeBackground(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundOptions = {},
  onProgress?: ProgressCallback,
): Promise<Buffer> {
  const { oomFallbackModel, onFallbackModel, signal, toolId, ...sidecarOptions } = options;
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
  await writeScratchInput("remove-bg", inputPath, pngBuffer);

  try {
    const megapixels = (origW * origH) / 1_000_000;
    const gpu = isGpuAvailable("onnx");
    // CPU inference is ~50-100x slower than GPU; mirror the upscaler's CPU
    // rate, and give CPU runs a 10-minute floor since model load alone can
    // exceed 5 minutes on NAS-class hardware.
    const baseTimeout = sidecarOptions.model?.startsWith("birefnet") || !gpu ? 600_000 : 300_000;
    const rateMs = gpu ? 30_000 : 180_000;
    const timeout = Math.max(baseTimeout, megapixels * rateMs);

    const rawMask = await runAndParse(
      inputPath,
      outputPath,
      sidecarOptions,
      onProgress,
      timeout,
      signal,
      toolId,
      oomFallbackModel,
      onFallbackModel,
    );

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
  options: Omit<
    RemoveBackgroundOptions,
    "oomFallbackModel" | "onFallbackModel" | "signal" | "toolId"
  >,
  onProgress: ProgressCallback | undefined,
  timeout: number,
  signal: AbortSignal | undefined,
  toolId?: string,
  oomFallbackModel?: string | false,
  onFallbackModel?: (model: string) => void,
): Promise<Buffer> {
  const runOptions = {
    onProgress,
    timeout,
    signal,
    ...(toolId ? { toolId } : {}),
  };
  const attempt = async (opts: typeof options): Promise<Buffer> => {
    const { stdout } = await runPythonWithProgress(
      "remove_bg.py",
      [inputPath, outputPath, JSON.stringify(opts)],
      runOptions,
    );
    const result = parseStdoutJson(stdout);
    if (!result.success) {
      throw toBgRemovalError(result.error || "Background removal failed");
    }
    return await readScratchOutput("remove-bg", outputPath);
  };

  let current = options;
  // An explicit fallback is one step; the default walks OOM_FALLBACK_STEPS down to u2net.
  let steps = oomFallbackModel === undefined ? Number.POSITIVE_INFINITY : 1;
  for (;;) {
    try {
      return await attempt(current);
    } catch (err) {
      const next =
        oomFallbackModel === undefined
          ? (OOM_FALLBACK_STEPS[current.model ?? ""] ?? OOM_FALLBACK_MODEL)
          : oomFallbackModel;
      if (!isMemoryAllocError(err) || !next || steps <= 0 || current.model === next) {
        throw toBgRemovalError(err);
      }
      steps--;
      onProgress?.(5, `Retrying with lighter model (${next})`);
      onFallbackModel?.(next);
      current = { ...current, model: next };
    }
  }
}
