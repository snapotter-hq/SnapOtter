import { runPythonScript } from "./bridge.js";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export interface RemoveBackgroundOptions {
  model?: string;
  backgroundColor?: string;
}

export async function removeBackground(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundOptions = {},
): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `rembg_in_${id}.png`);
  const outputPath = join(outputDir, `rembg_out_${id}.png`);

  await writeFile(inputPath, inputBuffer);
  try {
    // BiRefNet models need longer timeout (up to 10 min for first load)
    const timeout = options.model?.startsWith("birefnet") ? 600000 : 300000;
    const { stdout } = await runPythonScript("remove_bg.py", [
      inputPath,
      outputPath,
      JSON.stringify(options),
    ], timeout);

    const result = JSON.parse(stdout);
    if (!result.success) {
      throw new Error(result.error || "Background removal failed");
    }

    const outputBuffer = await readFile(outputPath);
    return outputBuffer;
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
