import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { inpaint } from "../../../packages/ai/src/inpainting.js";

const IMG = Buffer.from("fake-image");
const MASK = Buffer.from("fake-mask");
const DIR = "/tmp/test-inpaint";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({ stdout: '{"success": true}', stderr: "" });
  vi.mocked(parseStdoutJson).mockReturnValue({ success: true, method: "lama-onnx" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inpaint quality-mode script selection", () => {
  const ARGS = [`${DIR}/input_inpaint.png`, `${DIR}/mask_inpaint.png`, `${DIR}/output_inpaint.png`];

  it("runs the LaMa script (inpaint.py) by default", async () => {
    await inpaint(IMG, MASK, DIR);
    expect(runPythonWithProgress).toHaveBeenCalledWith("inpaint.py", ARGS, expect.any(Object));
  });

  it("runs the LaMa script when quality is explicitly 'fast'", async () => {
    await inpaint(IMG, MASK, DIR, undefined, "fast");
    expect(runPythonWithProgress).toHaveBeenCalledWith("inpaint.py", ARGS, expect.any(Object));
  });

  it("runs the diffusion script (inpaint_hq.py) when quality is 'hq'", async () => {
    await inpaint(IMG, MASK, DIR, undefined, "hq");
    // A regression here would silently run LaMa while the UI reported High Quality.
    expect(runPythonWithProgress).toHaveBeenCalledWith("inpaint_hq.py", ARGS, expect.any(Object));
    expect(runPythonWithProgress).not.toHaveBeenCalledWith(
      "inpaint.py",
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("inpaint contract", () => {
  it("writes the input and mask as PNGs and returns the output buffer", async () => {
    const out = await inpaint(IMG, MASK, DIR, undefined, "hq");
    expect(writeFile).toHaveBeenCalledWith(
      `${DIR}/input_inpaint.png`,
      Buffer.from("mock-png-data"),
    );
    expect(writeFile).toHaveBeenCalledWith(`${DIR}/mask_inpaint.png`, Buffer.from("mock-png-data"));
    expect(readFile).toHaveBeenCalledWith(`${DIR}/output_inpaint.png`);
    expect(out).toEqual(Buffer.from("mock-output-data"));
  });

  it("forwards onProgress to the bridge", async () => {
    const onProgress = vi.fn();
    await inpaint(IMG, MASK, DIR, onProgress, "hq");
    expect(runPythonWithProgress).toHaveBeenCalledWith(
      "inpaint_hq.py",
      expect.any(Array),
      expect.objectContaining({ onProgress }),
    );
  });

  it("throws the Python error (no silent fallback) when the script fails", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({
      success: false,
      error: "High-quality inpainting model not found",
    });
    await expect(inpaint(IMG, MASK, DIR, undefined, "hq")).rejects.toThrow(
      "High-quality inpainting model not found",
    );
  });

  it("throws a fallback message when the script fails without an error string", async () => {
    vi.mocked(parseStdoutJson).mockReturnValue({ success: false });
    await expect(inpaint(IMG, MASK, DIR, undefined, "hq")).rejects.toThrow("Inpainting failed");
  });
});
