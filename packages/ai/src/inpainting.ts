import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

/**
 * Inpainting backend. "fast" is the always-available LaMa ONNX path
 * (`inpaint.py`); "hq" is the optional diffusion path (`inpaint_hq.py`), gated
 * behind the `inpaint-hq` feature bundle. The route decides which mode to pass;
 * the sidecar/per-request feature gate independently rejects "hq" when the
 * bundle is absent.
 */
export type InpaintQuality = "fast" | "hq";

export async function inpaint(
  inputBuffer: Buffer,
  maskBuffer: Buffer,
  outputDir: string,
  onProgress?: ProgressCallback,
  quality: InpaintQuality = "fast",
): Promise<Buffer> {
  const inputPath = join(outputDir, "input_inpaint.png");
  const maskPath = join(outputDir, "mask_inpaint.png");
  const outputPath = join(outputDir, "output_inpaint.png");

  const pngInput = await sharp(inputBuffer).png().toBuffer();
  const pngMask = await sharp(maskBuffer).png().toBuffer();
  await writeFile(inputPath, pngInput);
  await writeFile(maskPath, pngMask);

  const script = quality === "hq" ? "inpaint_hq.py" : "inpaint.py";
  const { stdout } = await runPythonWithProgress(script, [inputPath, maskPath, outputPath], {
    onProgress,
  });

  const result = parseStdoutJson(stdout);
  if (!result.success) {
    throw toSidecarError(result.error, "Inpainting failed");
  }

  return readFile(outputPath);
}
