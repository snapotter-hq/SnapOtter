import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

export interface OutpaintOptions {
  extendTop: number;
  extendRight: number;
  extendBottom: number;
  extendLeft: number;
  tier?: "fast" | "balanced" | "high";
}

export async function outpaint(
  inputBuffer: Buffer,
  options: OutpaintOptions,
  outputDir: string,
  onProgress?: ProgressCallback,
): Promise<Buffer> {
  const inputPath = join(outputDir, "input_outpaint.png");
  const outputPath = join(outputDir, "output_outpaint.png");

  const pngInput = await sharp(inputBuffer).png().toBuffer();
  await writeFile(inputPath, pngInput);

  const { stdout } = await runPythonWithProgress(
    "outpaint.py",
    [
      inputPath,
      outputPath,
      String(options.extendTop),
      String(options.extendRight),
      String(options.extendBottom),
      String(options.extendLeft),
      options.tier ?? "balanced",
    ],
    { onProgress },
  );

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw toSidecarError(result.error, "Outpainting failed");
  }

  return readFile(outputPath);
}
