import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, parseStdoutJson, runPythonWithProgress } from "./bridge.js";

export type OcrQuality = "fast" | "balanced" | "best";

export interface OcrOptions {
  quality?: OcrQuality;
  language?: string;
  enhance?: boolean;
  /** @deprecated Use quality instead. Kept for backward compat. */
  engine?: "tesseract" | "paddleocr";
}

export interface OcrResult {
  text: string;
  engine?: string;
}

export async function extractText(
  inputBuffer: Buffer,
  outputDir: string,
  options: OcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const inputPath = join(outputDir, "input_ocr.png");

  // Convert to PNG and cap at 2048px to prevent PaddleOCR OOM on large images.
  const MAX_OCR_DIM = 2048;
  const pngBuffer = await sharp(inputBuffer)
    .resize({ width: MAX_OCR_DIM, height: MAX_OCR_DIM, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  await writeFile(inputPath, pngBuffer);

  const meta = await sharp(pngBuffer).metadata();
  const megapixels = ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000;
  const timeout = Math.max(600_000, megapixels * 30 * 1000);

  const { stdout } = await runPythonWithProgress("ocr.py", [inputPath, JSON.stringify(options)], {
    onProgress,
    timeout,
  });

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw new Error(result.error || "OCR failed");
  }

  return {
    text: result.text,
    engine: result.engine,
  };
}

// ── PDF OCR ───────────────────────────────────────────────────────────

export interface PdfOcrOptions {
  quality?: OcrQuality;
  language?: string;
  pages?: string;
}

export interface PdfOcrResult {
  text: string;
  engine: string;
  pages: number;
}

export async function extractPdfText(
  inputPath: string,
  opts: PdfOcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<PdfOcrResult> {
  const optionsJson = JSON.stringify({
    quality: opts.quality ?? "balanced",
    language: opts.language ?? "auto",
    pages: opts.pages ?? "all",
  });

  const { stdout } = await runPythonWithProgress("ocr_pdf.py", [inputPath, optionsJson], {
    timeout: 30 * 60_000,
    onProgress,
  });

  const result = parseStdoutJson(stdout);
  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.success) {
    throw new Error(result.error || "PDF OCR failed");
  }

  return {
    text: result.text ?? "",
    engine: result.engine ?? "unknown",
    pages: result.pages ?? 0,
  };
}
