import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, parseStdoutJson, runPythonWithProgress } from "./bridge.js";

export interface RedEyeRemovalOptions {
  sensitivity?: number;
  strength?: number;
  format?: string;
  quality?: number;
}

export interface RedEyeRemovalResult {
  buffer: Buffer;
  facesDetected: number;
  eyesCorrected: number;
  width: number;
  height: number;
  format: string;
}

export async function removeRedEye(
  inputBuffer: Buffer,
  outputDir: string,
  options: RedEyeRemovalOptions = {},
  onProgress?: ProgressCallback,
): Promise<RedEyeRemovalResult> {
  const inputPath = join(outputDir, "input_redeye.png");
  const outputPath = join(outputDir, "output_redeye.png");

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);
  const { stdout } = await runPythonWithProgress(
    "red_eye_removal.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw new Error(result.error || "Red eye removal failed");
  }

  const actualOutputPath = result.output_path || outputPath;
  const buffer = await readFile(actualOutputPath);
  return {
    buffer,
    facesDetected: result.facesDetected ?? 0,
    eyesCorrected: result.eyesCorrected ?? 0,
    width: result.width,
    height: result.height,
    format: result.format ?? "png",
  };
}
