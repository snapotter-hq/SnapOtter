import { tmpdir } from "node:os";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the sidecar bridge by its resolved path so background-removal's
// `./bridge.js` import receives these stubs.
const runPythonWithProgress = vi.fn();
const parseStdoutJson = vi.fn();
vi.mock("../../../packages/ai/src/bridge.js", () => ({
  runPythonWithProgress: (...args: unknown[]) => runPythonWithProgress(...args),
  parseStdoutJson: (...args: unknown[]) => parseStdoutJson(...args),
}));

import { isSafeMessageError, SafeError } from "@snapotter/shared";
import { removeBackground } from "../../../packages/ai/src/background-removal.js";

function causeMessage(err: unknown): string {
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error ? cause.message : String(cause ?? "");
}

let png: Buffer;
beforeAll(async () => {
  png = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
});

beforeEach(() => {
  runPythonWithProgress.mockReset();
  parseStdoutJson.mockReset();
});

describe("removeBackground error surfacing", () => {
  it("throws a SafeError titled 'Background removal failed' with the sidecar reason in the cause", async () => {
    runPythonWithProgress.mockResolvedValue({ stdout: "{}" });
    parseStdoutJson.mockReturnValue({ success: false, error: "rembg model load failed" });

    let caught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "u2net" });
    } catch (e) {
      caught = e;
    }

    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("Background removal failed");
    expect((caught as SafeError).kind).toBe("bug");
    // The real reason is preserved in the cause (kept out of the scrubbed title).
    expect(causeMessage(caught)).toContain("rembg model load failed");
    expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
  });

  it("still retries with the lighter model on OOM, and wraps the fallback failure too", async () => {
    parseStdoutJson
      .mockReturnValueOnce({ success: false, error: "CUDA out of memory" })
      .mockReturnValueOnce({ success: false, error: "still failing" });
    runPythonWithProgress.mockResolvedValue({ stdout: "{}" });

    let caught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "isnet-general-use" });
    } catch (e) {
      caught = e;
    }

    // OOM detection still works: the fallback attempt fired (two sidecar calls).
    expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("Background removal failed");
    expect(causeMessage(caught)).toContain("still failing");
  });

  it("passes a bridge SafeError (e.g. timeout) through unchanged, not re-wrapped as a bug", async () => {
    const timeout = new SafeError("Python script timed out", {
      kind: "operational",
      code: "timeout",
    });
    runPythonWithProgress.mockRejectedValue(timeout);

    await expect(removeBackground(png, tmpdir(), { model: "u2net" })).rejects.toBe(timeout);
  });
});
