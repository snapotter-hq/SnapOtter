import { dirname, join } from "node:path";
import sharp from "sharp";
import type { ProgressCallback } from "./bridge.js";
import { runOcrRuntime } from "./ocr-runtime-dispatcher.js";
import { runAdaptiveTesseract, type TesseractLanguage } from "./tesseract.js";
import { preparePdfOcrPages, runTesseractPdf } from "./tesseract-pdf.js";

export type OcrQuality = "fast" | "balanced" | "best";
export const FAST_KOREAN_UNSUPPORTED_REASON =
  "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.";
export const MAX_OCR_INPUT_PIXELS = 40_000_000;
/** Bound pathological aspect ratios so tiled OCR cannot fan out into thousands of sessions. */
export const MAX_OCR_INPUT_DIMENSION = 40_000;
/** Keep Fast aligned with the accurate runtime and durable-result database budget. */
export const MAX_OCR_OUTPUT_BYTES = 1_000_000;
const OCR_PROGRESS_HEARTBEAT_MS = 30_000;
const FAST_LOW_CONTRAST_MAX_SHORT_SIDE = 512;
const FAST_LOW_CONTRAST_MAX_LONG_SIDE = 1_024;
const FAST_LOW_CONTRAST_MIN_MEAN = 200;
const FAST_LOW_CONTRAST_MAX_STDEV = 20;
const FAST_LOW_CONTRAST_GAIN = 4;
const FAST_LOW_CONTRAST_TARGET_BACKGROUND = 250;
const FAST_CJK_SCENE_MIN_PIXELS = 1_500_000;
const FAST_CJK_SCENE_MIN_WIDTH = 1_000;
const FAST_CJK_SCENE_MIN_HEIGHT = 1_200;
const FAST_DENSE_CJK_MIN_PIXELS = 1_000_000;
const FAST_DENSE_CJK_MAX_PIXELS = 2_500_000;
const FAST_DENSE_CJK_MIN_WIDTH = 1_000;
const FAST_DENSE_CJK_MIN_HEIGHT = 1_000;

export interface OcrOptions {
  quality?: OcrQuality;
  language?: string;
  enhance?: boolean;
  /** @deprecated Use quality instead. Kept for backward compat. */
  engine?: "tesseract" | "paddleocr";
  signal?: AbortSignal;
}

export interface OcrExecutionMetadata {
  engine: string;
  requestedQuality: OcrQuality;
  actualQuality: OcrQuality;
  device: "cpu" | "cuda";
  degraded: boolean;
  warnings: string[];
  provider: string;
  runtimeVersion?: string;
  modelVersion?: string;
}

export interface OcrResult extends OcrExecutionMetadata {
  text: string;
}

function resolveQuality(options: OcrOptions): OcrQuality {
  if (options.quality) return options.quality;
  if (options.engine) return options.engine === "tesseract" ? "fast" : "balanced";
  return "fast";
}

function assertFastLanguageSupported(quality: OcrQuality, language: string | undefined): void {
  if (quality === "fast" && language === "ko") {
    throw new Error(FAST_KOREAN_UNSUPPORTED_REASON);
  }
}

function parseAccurateResult(resultValue: unknown, quality: OcrQuality): OcrResult {
  if (typeof resultValue !== "object" || resultValue === null || Array.isArray(resultValue)) {
    throw new Error("OCR runtime returned invalid metadata");
  }
  const result = resultValue as Record<string, unknown>;
  if (result.success !== true) {
    throw new Error((result.error as string | undefined) || "OCR failed");
  }

  const metadataValid =
    typeof result.text === "string" &&
    typeof result.engine === "string" &&
    (result.requestedQuality === "fast" ||
      result.requestedQuality === "balanced" ||
      result.requestedQuality === "best") &&
    (result.actualQuality === "fast" ||
      result.actualQuality === "balanced" ||
      result.actualQuality === "best") &&
    (result.device === "cpu" || result.device === "cuda") &&
    typeof result.provider === "string" &&
    typeof result.degraded === "boolean" &&
    Array.isArray(result.warnings) &&
    result.warnings.every((warning) => typeof warning === "string") &&
    (result.runtimeVersion === undefined || typeof result.runtimeVersion === "string") &&
    (result.modelVersion === undefined || typeof result.modelVersion === "string");

  if (!metadataValid) {
    throw new Error("OCR runtime returned invalid metadata");
  }

  if (result.requestedQuality !== quality || result.actualQuality !== quality) {
    throw new Error(
      `OCR runtime tier mismatch: requested ${quality}, reported ${String(result.requestedQuality)}/${String(result.actualQuality)}`,
    );
  }
  if (Buffer.byteLength(result.text as string, "utf8") > MAX_OCR_OUTPUT_BYTES) {
    throw new Error(
      `OCR runtime output exceeds the ${MAX_OCR_OUTPUT_BYTES.toLocaleString("en-US")} byte safety limit`,
    );
  }

  return {
    text: result.text as string,
    engine: result.engine as string,
    requestedQuality: quality,
    actualQuality: quality,
    device: result.device as "cpu" | "cuda",
    provider: result.provider as string,
    degraded: result.degraded as boolean,
    warnings: result.warnings as string[],
    ...(typeof result.runtimeVersion === "string" && { runtimeVersion: result.runtimeVersion }),
    ...(typeof result.modelVersion === "string" && { modelVersion: result.modelVersion }),
  };
}

async function withProgressHeartbeat<T>(
  operation: (progress: ProgressCallback | undefined) => Promise<T>,
  onProgress: ProgressCallback | undefined,
  percent: number,
  stage: string,
): Promise<T> {
  if (!onProgress) return operation(undefined);
  let latestPercent = percent;
  let latestStage = stage;
  const relayProgress: ProgressCallback = (nextPercent, nextStage) => {
    latestPercent = nextPercent;
    latestStage = nextStage;
    onProgress(nextPercent, nextStage);
  };
  const heartbeat = setInterval(
    () => onProgress(latestPercent, latestStage),
    OCR_PROGRESS_HEARTBEAT_MS,
  );
  heartbeat.unref();
  try {
    return await operation(relayProgress);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function extractText(
  inputBuffer: Buffer,
  outputDir: string,
  options: OcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const inputPath = join(outputDir, "input_ocr.png");
  const quality = resolveQuality(options);
  assertFastLanguageSupported(quality, options.language);

  // Normalize the format without discarding source pixels. The old 2048px cap
  // made small text permanently unreadable before either OCR engine saw it.
  const image = sharp(inputBuffer);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels <= 0) {
    throw new Error("OCR input has invalid image dimensions");
  }
  if (width > MAX_OCR_INPUT_DIMENSION || height > MAX_OCR_INPUT_DIMENSION) {
    throw new Error(
      `OCR input exceeds the ${MAX_OCR_INPUT_DIMENSION.toLocaleString("en-US")} pixel dimension safety limit`,
    );
  }
  if (pixels > MAX_OCR_INPUT_PIXELS) {
    throw new Error(
      `OCR input exceeds the ${MAX_OCR_INPUT_PIXELS.toLocaleString("en-US")} pixel safety limit`,
    );
  }
  let recognitionImage: ReturnType<typeof sharp> | undefined;
  let automaticLowContrast = false;
  if (
    quality === "fast" &&
    Math.min(width, height) <= FAST_LOW_CONTRAST_MAX_SHORT_SIDE &&
    Math.max(width, height) <= FAST_LOW_CONTRAST_MAX_LONG_SIDE
  ) {
    const stats = await image.clone().grayscale().stats();
    const luminance = stats.channels[0];
    if (
      luminance &&
      Number.isFinite(luminance.mean) &&
      Number.isFinite(luminance.stdev) &&
      luminance.mean >= FAST_LOW_CONTRAST_MIN_MEAN &&
      luminance.stdev <= FAST_LOW_CONTRAST_MAX_STDEV
    ) {
      // Development receipts showed that a fixed gain with a mean-derived
      // offset recovers faint thermal text without upscaling or threshold
      // artifacts. The strict size/statistics gate leaves ordinary images
      // byte-for-byte equivalent apart from the existing PNG normalization.
      recognitionImage = image
        .clone()
        .grayscale()
        .linear(
          FAST_LOW_CONTRAST_GAIN,
          Math.round(FAST_LOW_CONTRAST_TARGET_BACKGROUND - FAST_LOW_CONTRAST_GAIN * luminance.mean),
        );
      automaticLowContrast = true;
    }
  }
  if (quality === "fast" && options.enhance && !automaticLowContrast) {
    recognitionImage = image.clone().clahe({
      width: Math.max(1, Math.min(256, Math.round(width / 8))),
      height: Math.max(1, Math.min(256, Math.round(height / 8))),
      maxSlope: 2,
    });
  }
  // Stream normalized rasters straight to scratch. When preprocessing is
  // active, preserve an original PNG for auto script-family probes and keep
  // the enhanced raster separate for recognition. This prevents contrast
  // transforms from turning faint Latin noise into false CJK evidence.
  await image.png().toFile(inputPath);
  const recognitionInputPath = recognitionImage
    ? join(outputDir, "input_ocr_recognition.png")
    : inputPath;
  if (recognitionImage) await recognitionImage.png().toFile(recognitionInputPath);

  const selectedLanguage = options.language ?? "auto";
  const canContainCjkSceneText =
    selectedLanguage === "auto" || selectedLanguage === "ja" || selectedLanguage === "zh";
  const fallbackInputProvider =
    quality === "fast" &&
    canContainCjkSceneText &&
    pixels >= FAST_CJK_SCENE_MIN_PIXELS &&
    width >= FAST_CJK_SCENE_MIN_WIDTH &&
    height >= FAST_CJK_SCENE_MIN_HEIGHT
      ? async () => {
          // A whole mixed-polarity scene can hide dense light-on-dark CJK text
          // from Tesseract even when each local band is clean. Split lazily so
          // ordinary and strong primary results pay no extra raster/process cost.
          const splitY = Math.floor(height / 2);
          const paths = [
            join(outputDir, "input_ocr_scene_upper.png"),
            join(outputDir, "input_ocr_scene_lower.png"),
          ] as const;
          await sharp(recognitionInputPath)
            .extract({ left: 0, top: 0, width, height: splitY })
            .png()
            .toFile(paths[0]);
          await sharp(recognitionInputPath)
            .extract({ left: 0, top: splitY, width, height: height - splitY })
            .png()
            .toFile(paths[1]);
          return paths;
        }
      : undefined;
  const denseCjkInputProvider =
    quality === "fast" &&
    canContainCjkSceneText &&
    pixels >= FAST_DENSE_CJK_MIN_PIXELS &&
    pixels <= FAST_DENSE_CJK_MAX_PIXELS &&
    width >= FAST_DENSE_CJK_MIN_WIDTH &&
    height >= FAST_DENSE_CJK_MIN_HEIGHT
      ? async () => {
          // Small, dense CJK boards are the one scene class where a confident
          // sparse fragment can hide most of the page. Build this candidate
          // lazily only after the primary pass is weak; the adaptive runner
          // accepts it only when confidence and recovered coverage both rise.
          const denseCjkInputPath = join(outputDir, "input_ocr_dense_cjk.png");
          await sharp(inputPath)
            .grayscale()
            .clahe({
              width: Math.max(1, Math.min(256, Math.round(width / 8))),
              height: Math.max(1, Math.min(256, Math.round(height / 8))),
              maxSlope: 2,
            })
            .sharpen({ sigma: 1 })
            .png()
            .toFile(denseCjkInputPath);
          return denseCjkInputPath;
        }
      : undefined;

  const megapixels = pixels / 1_000_000;
  const timeout = Math.max(600_000, megapixels * 30 * 1000);

  if (quality === "fast") {
    const result = await withProgressHeartbeat(
      (heartbeatProgress) =>
        runAdaptiveTesseract(inputPath, {
          language: (options.language ?? "auto") as TesseractLanguage,
          ...(automaticLowContrast && { blockLayoutOnly: true }),
          ...(recognitionInputPath !== inputPath && { recognitionInputPath }),
          ...(fallbackInputProvider && { fallbackInputProvider }),
          ...(denseCjkInputProvider && { denseCjkInputProvider }),
          timeoutMs: timeout,
          maxStdoutBytes: MAX_OCR_OUTPUT_BYTES,
          signal: options.signal,
          onProgress: heartbeatProgress,
        }),
      onProgress,
      10,
      "Running Fast OCR",
    );
    return {
      ...result,
      requestedQuality: "fast",
      actualQuality: "fast",
      degraded: false,
      warnings: automaticLowContrast ? ["Applied automatic low-contrast OCR preprocessing."] : [],
    };
  }

  const runtimeOptions = {
    quality,
    ...(options.language !== undefined && { language: options.language }),
    enhance: options.enhance ?? quality === "best",
  };

  onProgress?.(10, "Starting accurate OCR");
  const { result } = await withProgressHeartbeat(
    () =>
      runOcrRuntime("ocr", [inputPath, JSON.stringify(runtimeOptions)], {
        timeoutMs: timeout,
        signal: options.signal,
      }),
    onProgress,
    10,
    "Running accurate OCR",
  );
  onProgress?.(100, "Accurate OCR complete");
  return parseAccurateResult(result, quality);
}

// ── PDF OCR ───────────────────────────────────────────────────────────

export interface PdfOcrOptions {
  quality?: OcrQuality;
  language?: string;
  pages?: string;
  enhance?: boolean;
  signal?: AbortSignal;
}

export interface PdfOcrResult extends OcrExecutionMetadata {
  text: string;
  pages: number;
}

export async function extractPdfText(
  inputPath: string,
  opts: PdfOcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<PdfOcrResult> {
  const quality = opts.quality ?? "fast";
  assertFastLanguageSupported(quality, opts.language);
  if (quality === "fast") {
    const result = await withProgressHeartbeat(
      (heartbeatProgress) =>
        runTesseractPdf(inputPath, dirname(inputPath), {
          pages: opts.pages ?? "all",
          language: (opts.language ?? "auto") as TesseractLanguage,
          enhance: opts.enhance ?? false,
          signal: opts.signal,
          onProgress: heartbeatProgress,
        }),
      onProgress,
      10,
      "Running Fast PDF OCR",
    );
    return {
      text: result.text,
      pages: result.pages,
      engine: result.engine,
      provider: result.provider,
      device: result.device,
      requestedQuality: "fast",
      actualQuality: "fast",
      degraded: false,
      warnings: [],
    };
  }

  const prepared = await withProgressHeartbeat(
    (heartbeatProgress) =>
      preparePdfOcrPages(inputPath, dirname(inputPath), {
        pages: opts.pages ?? "all",
        signal: opts.signal,
        onProgress: heartbeatProgress,
      }),
    onProgress,
    10,
    "Preparing accurate PDF OCR",
  );
  try {
    onProgress?.(50, "Starting accurate PDF OCR");
    const { result } = await withProgressHeartbeat(
      () =>
        runOcrRuntime(
          "ocr_pdf",
          [
            JSON.stringify(prepared.pages),
            JSON.stringify({
              quality,
              language: opts.language ?? "auto",
              enhance: opts.enhance ?? quality === "best",
            }),
          ],
          {
            timeoutMs: prepared.remainingTimeoutMs(),
            signal: opts.signal,
          },
        ),
      onProgress,
      50,
      "Running accurate PDF OCR",
    );
    const ocr = parseAccurateResult(result, quality);
    const resultRecord = result as Record<string, unknown>;
    if (resultRecord.pages !== prepared.pages.length) {
      throw new Error(
        `PDF OCR runtime page count mismatch: expected ${prepared.pages.length}, received ${String(resultRecord.pages)}`,
      );
    }
    onProgress?.(100, "Accurate PDF OCR complete");
    return {
      ...ocr,
      pages: resultRecord.pages as number,
    };
  } finally {
    await prepared.cleanup();
  }
}
