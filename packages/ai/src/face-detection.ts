import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { type ProgressCallback, parseStdoutJson, runPythonWithProgress } from "./bridge.js";

export interface BlurFacesOptions {
  blurRadius?: number;
  sensitivity?: number;
}

export interface DetectFacesOptions {
  sensitivity?: number;
}

export interface FaceRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BlurFacesResult {
  buffer: Buffer;
  facesDetected: number;
  faces: FaceRegion[];
}

export interface DetectFacesResult {
  facesDetected: number;
  faces: FaceRegion[];
}

export async function blurFaces(
  inputBuffer: Buffer,
  outputDir: string,
  options: BlurFacesOptions = {},
  onProgress?: ProgressCallback,
): Promise<BlurFacesResult> {
  const inputPath = join(outputDir, "input_faces.png");
  const outputPath = join(outputDir, "output_faces.png");

  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngBuffer);
  const { stdout } = await runPythonWithProgress(
    "detect_faces.py",
    [inputPath, outputPath, JSON.stringify(options)],
    { onProgress },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw new Error(result.error || "Face detection failed");
  }

  const buffer = await readFile(outputPath);
  return {
    buffer,
    facesDetected: result.facesDetected,
    faces: result.faces ?? [],
  };
}

export async function detectFaces(
  inputBuffer: Buffer,
  options: DetectFacesOptions = {},
  onProgress?: ProgressCallback,
): Promise<DetectFacesResult> {
  const inputPath = join(tmpdir(), `detect_faces_${Date.now()}.png`);

  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    const { stdout } = await runPythonWithProgress(
      "detect_faces.py",
      [inputPath, "unused", JSON.stringify({ ...options, detectOnly: true })],
      { onProgress },
    );

    const result = parseStdoutJson(stdout);
    if (!result.success) {
      throw new Error(result.error || "Face detection failed");
    }

    return {
      facesDetected: result.facesDetected,
      faces: result.faces ?? [],
    };
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}
