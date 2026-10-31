import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

export interface FaceLandmarkPoint {
  x: number;
  y: number;
}

export interface FaceLandmarks {
  leftEye: FaceLandmarkPoint;
  rightEye: FaceLandmarkPoint;
  eyeCenter: FaceLandmarkPoint;
  chin: FaceLandmarkPoint;
  forehead: FaceLandmarkPoint;
  crown: FaceLandmarkPoint;
  nose: FaceLandmarkPoint;
  faceCenterX: number;
}

export interface FaceLandmarksResult {
  faceDetected: boolean;
  landmarks: FaceLandmarks | null;
  imageWidth: number;
  imageHeight: number;
}

export interface DetectFaceLandmarksOptions {
  toolId?: string;
  signal?: AbortSignal;
}

export async function detectFaceLandmarks(
  inputBuffer: Buffer,
  onProgress?: ProgressCallback,
  options: DetectFaceLandmarksOptions = {},
): Promise<FaceLandmarksResult> {
  const inputPath = join(tmpdir(), `face_landmarks_${Date.now()}.png`);
  const { signal, toolId = "passport-photo" } = options;

  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    const { stdout } = await runPythonWithProgress(
      "face_landmarks.py",
      [inputPath, "unused", "{}"],
      { onProgress, signal, toolId },
    );

    const result = parseStdoutJson(stdout);
    if (!result.success) {
      throw toSidecarError(result.error, "Face landmark detection failed");
    }

    return {
      faceDetected: result.faceDetected,
      landmarks: result.landmarks ?? null,
      imageWidth: result.imageWidth ?? 0,
      imageHeight: result.imageHeight ?? 0,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}
