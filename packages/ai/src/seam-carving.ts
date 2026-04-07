import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ProgressCallback, runPythonWithProgress } from "./bridge.js";

export interface SeamCarveOptions {
  width?: number;
  height?: number;
  protectFaces?: boolean;
}

export interface SeamCarveResult {
  buffer: Buffer;
  width: number;
  height: number;
}

export async function seamCarve(
  inputBuffer: Buffer,
  outputDir: string,
  options: SeamCarveOptions = {},
  onProgress?: ProgressCallback,
): Promise<SeamCarveResult> {
  const inputPath = join(outputDir, "input_seam_carve.png");
  const outputPath = join(outputDir, "output_seam_carve.png");

  await writeFile(inputPath, inputBuffer);
  const { stdout } = await runPythonWithProgress(
    "seam_carve.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = JSON.parse(stdout);
  if (!result.success) {
    throw new Error(result.error || "Content-aware resize failed");
  }

  const buffer = await readFile(outputPath);
  return {
    buffer,
    width: result.width,
    height: result.height,
  };
}
