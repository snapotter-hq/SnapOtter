import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, runPythonWithProgress } from "./bridge.js";

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
}

export async function extractText(
  inputBuffer: Buffer,
  outputDir: string,
  options: OcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const inputPath = join(outputDir, "input_ocr.png");

  // Convert any input format (HEIC, AVIF, WebP, TIFF, etc.) to PNG
  // so Tesseract and PaddleOCR can read it reliably.
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);

  const { stdout } = await runPythonWithProgress("ocr.py", [inputPath, JSON.stringify(options)], {
    onProgress,
    timeout: 600_000, // 10 min timeout for VLM on CPU
  });

  const result = JSON.parse(stdout);
  if (!result.success) {
    throw new Error(result.error || "OCR failed");
  }

  return {
    text: result.text,
  };
}
