import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

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

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);
  const { stdout } = await runPythonWithProgress(
    "enhance_faces.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw toSidecarError(result.error, "Face enhancement failed");
  }

  const buffer = await readFile(outputPath);
  return {
    buffer,
    facesDetected: result.facesDetected,
    faces: result.faces ?? [],
    model: result.model ?? "unknown",
  };
}
