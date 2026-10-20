import { tmpdir } from "node:os";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the sidecar bridge by its resolved path so background-removal's
// `./bridge.js` import receives these stubs.
const runPythonWithProgress = vi.fn();
const parseStdoutJson = vi.fn();
vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>();
  return {
    ...actual,
    runPythonWithProgress: (...args: unknown[]) => runPythonWithProgress(...args),
    parseStdoutJson: (...args: unknown[]) => parseStdoutJson(...args),
  };
});

import { isSafeMessageError, SafeError } from "@snapotter/shared";
import {
  isMemoryAllocError,
  removeBackground,
} from "../../../packages/ai/src/background-removal.js";

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
    // The specific sidecar reason is preserved as the message (and survives scrubbing).
    expect((caught as SafeError).message).toBe("rembg model load failed");
    expect((caught as SafeError).kind).toBe("bug");
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
    expect((caught as SafeError).message).toBe("still failing");
  });

  it("recognizes Python MemoryError and PyTorch CPU allocator errors as allocation failures and retries with the lighter model (#2543)", async () => {
    for (const msg of [
      "MemoryError",
      "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
      "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
      "Cannot allocate memory",
      "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
    ]) {
      expect(isMemoryAllocError(new Error(msg))).toBe(true);
    }
    expect(isMemoryAllocError(null)).toBe(false);
    expect(isMemoryAllocError("out of memory")).toBe(false);
    expect(
      isMemoryAllocError(new Error("RuntimeError: DefaultCPUAllocator: invalid alignment")),
    ).toBe(false);

    for (const oomError of [
      "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
      "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
    ]) {
      runPythonWithProgress.mockReset();
      parseStdoutJson.mockReset();
      parseStdoutJson
        .mockReturnValueOnce({
          success: false,
          error: oomError,
        })
        .mockReturnValueOnce({ success: false, error: "still failing" });
      runPythonWithProgress.mockResolvedValue({ stdout: "{}" });

      let caught: unknown;
      try {
        await removeBackground(png, tmpdir(), { model: "isnet-general-use" });
      } catch (e) {
        caught = e;
      }

      expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
      const secondCallArgs = runPythonWithProgress.mock.calls[1]?.[1] as string[];
      expect(JSON.parse(secondCallArgs[2])).toMatchObject({ model: "u2net" });
      expect(isSafeMessageError(caught)).toBe(true);
      expect((caught as SafeError).message).toBe("still failing");
    }
  });

  it("surfaces CPU allocator OOM as an operational SafeError without retrying when already on u2net (#2543)", async () => {
    for (const cpuOom of [
      "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
      "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
    ]) {
      runPythonWithProgress.mockReset();
      parseStdoutJson.mockReset();
      parseStdoutJson.mockReturnValueOnce({ success: false, error: cpuOom });
      runPythonWithProgress.mockResolvedValue({ stdout: "{}" });

      let caught: unknown;
      try {
        await removeBackground(png, tmpdir(), { model: "u2net" });
      } catch (e) {
        caught = e;
      }

      expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
      expect(isSafeMessageError(caught)).toBe(true);
      expect((caught as SafeError).kind).toBe("operational");
      expect((caught as SafeError).message).toBe(cpuOom);
    }
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
