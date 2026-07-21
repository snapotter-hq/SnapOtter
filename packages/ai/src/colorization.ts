import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

export interface ColorizeOptions {
  intensity?: number;
  model?: string;
}

export interface ColorizeResult {
  buffer: Buffer;
  width: number;
  height: number;
  method: string;
}

export async function colorize(
  inputBuffer: Buffer,
  outputDir: string,
  options: ColorizeOptions = {},
  onProgress?: ProgressCallback,
): Promise<ColorizeResult> {
  const inputPath = join(outputDir, "input_colorize.png");
  const outputPath = join(outputDir, "output_colorize.png");

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);
  const { stdout } = await runPythonWithProgress(
    "colorize.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw toSidecarError(result.error, "Colorization failed");
  }

  const actualOutputPath = result.output_path || outputPath;
  const buffer = await readFile(actualOutputPath);
  return {
    buffer,
    width: result.width,
    height: result.height,
    method: result.method ?? "unknown",
  };
}
