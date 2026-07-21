import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

export type GifBgFormat = "webp" | "gif" | "apng";

const FORMAT_CONTENT_TYPE: Record<GifBgFormat, string> = {
  webp: "image/webp",
  gif: "image/gif",
  apng: "image/apng",
};

const FORMAT_EXT: Record<GifBgFormat, string> = {
  webp: "webp",
  gif: "gif",
  apng: "png",
};

export interface RemoveBackgroundAnimatedOptions {
  model?: string;
  outputFormat?: GifBgFormat;
  backgroundType?: "transparent" | "color" | "gradient" | "blur" | "image";
  backgroundColor?: string;
  gradientColor1?: string;
  gradientColor2?: string;
  gradientAngle?: number;
  blurIntensity?: number;
  shadowEnabled?: boolean;
  shadowOpacity?: number;
  edgeRefine?: number;
  decontaminate?: boolean;
  /** Frame count from route detection; scales the sidecar timeout. */
  frames?: number;
  /** Path polled between frames; its presence aborts the loop early. */
  cancelFile?: string;
  /** Path to a staged background image for backgroundType "image". */
  bgImagePath?: string;
  /** Original input extension so the temp file round-trips its format. */
  inputExt?: string;
}

export interface AnimatedRemovalResult {
  buffer: Buffer;
  format: GifBgFormat;
  contentType: string;
  ext: string;
}

/** Thrown when the job was canceled mid-run (the Python loop saw the sentinel). */
export class AnimatedRemovalCanceledError extends Error {
  constructor() {
    super("canceled");
    this.name = "AnimatedRemovalCanceledError";
  }
}

export function resolveGifBgFormat(value: string | undefined): GifBgFormat {
  return value === "gif" || value === "apng" ? value : "webp";
}

export function gifBgContentType(format: GifBgFormat): string {
  return FORMAT_CONTENT_TYPE[format];
}

export function gifBgExt(format: GifBgFormat): string {
  return FORMAT_EXT[format];
}

/**
 * Scale the sidecar call timeout by frame count. The dispatcher's default 600s
 * ceiling would SIGTERM a long single-call animation (and take the shared
 * dispatcher down with it), so size the budget to the whole loop and cap it at
 * the 2h app-job ceiling.
 */
export function animatedTimeoutMs(frames: number, model: string | undefined): number {
  const perFrameMs = model?.startsWith("birefnet") ? 20_000 : 6_000;
  const n = frames > 0 ? frames : 150;
  return Math.min(7_200_000, Math.max(300_000, n * perFrameMs));
}

export async function removeBackgroundAnimated(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundAnimatedOptions = {},
  onProgress?: ProgressCallback,
): Promise<AnimatedRemovalResult> {
  const id = randomUUID();
  const format = resolveGifBgFormat(options.outputFormat);
  const inExt = (options.inputExt || "gif").replace(/^\./, "").toLowerCase();
  const inputPath = join(outputDir, `gifbg_in_${id}.${inExt}`);
  const outputPath = join(outputDir, `gifbg_out_${id}.${FORMAT_EXT[format]}`);
  await writeFile(inputPath, inputBuffer);

  const timeout = animatedTimeoutMs(options.frames ?? 0, options.model);

  try {
    const { stdout } = await runPythonWithProgress(
      "gif_remove_bg.py",
      [inputPath, outputPath, JSON.stringify(options)],
      { onProgress, timeout },
    );
    const result = parseStdoutJson(stdout);
    if (!result.success) {
      if (result.error === "canceled") throw new AnimatedRemovalCanceledError();
      throw toSidecarError(result.error, "Animated background removal failed");
    }
    const buffer = await readFile(outputPath);
    return { buffer, format, contentType: FORMAT_CONTENT_TYPE[format], ext: FORMAT_EXT[format] };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
