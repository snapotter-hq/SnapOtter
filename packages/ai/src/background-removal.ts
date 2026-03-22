import { runPythonScript } from "./bridge.js";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface RemoveBackgroundOptions {
  model?: string;
  backgroundColor?: string;
}

export async function removeBackground(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundOptions = {},
): Promise<Buffer> {
  const inputPath = join(outputDir, "input_bg.png");
  const outputPath = join(outputDir, "output_bg.png");

  await writeFile(inputPath, inputBuffer);
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

  return readFile(outputPath);
}
