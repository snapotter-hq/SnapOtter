import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ProgressCallback, runPythonWithProgress } from "./bridge.js";

export interface EnhanceFacesOptions {
  model?: "auto" | "gfpgan" | "codeformer";
  strength?: number;
  onlyCenterFace?: boolean;
  sensitivity?: number;
}

export interface EnhanceFacesResult {
  buffer: Buffer;
  facesDetected: number;
  faces: Array<{ x: number; y: number; w: number; h: number }>;
  model: string;
}

export async function enhanceFaces(
  inputBuffer: Buffer,
  outputDir: string,
  options: EnhanceFacesOptions = {},
  onProgress?: ProgressCallback,
): Promise<EnhanceFacesResult> {
  const inputPath = join(outputDir, "input_enhance_faces.png");
  const outputPath = join(outputDir, "output_enhance_faces.png");

  await writeFile(inputPath, inputBuffer);
  const { stdout } = await runPythonWithProgress(
    "enhance_faces.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = JSON.parse(stdout);
  if (!result.success) {
    throw new Error(result.error || "Face enhancement failed");
  }

  const buffer = await readFile(outputPath);
  return {
    buffer,
    facesDetected: result.facesDetected,
    faces: result.faces ?? [],
    model: result.model ?? "unknown",
  };
}
