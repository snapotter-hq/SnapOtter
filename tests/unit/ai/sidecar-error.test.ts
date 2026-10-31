import { tmpdir } from "node:os";
import { isSafeMessageError, SafeError } from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the process-spawning entry point; toSidecarError and
// parseStdoutJson stay real so the wrappers exercise the actual wrap logic.
const runPythonWithProgress = vi.fn();
vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>();
  return {
    ...actual,
    runPythonWithProgress: (...args: unknown[]) => runPythonWithProgress(...args),
  };
});

import { toSidecarError } from "../../../packages/ai/src/bridge.js";
import { transcribeAudio } from "../../../packages/ai/src/transcription.js";
import { upscale } from "../../../packages/ai/src/upscaling.js";

beforeEach(() => {
  runPythonWithProgress.mockReset();
});

describe("toSidecarError", () => {
  it("wraps a sidecar reason string in a SafeError bug that keeps the reason as message", () => {
    const err = toSidecarError("rembg model load failed", "Background removal failed");
    expect(isSafeMessageError(err)).toBe(true);
    expect(err.message).toBe("rembg model load failed");
    expect((err as SafeError).kind).toBe("bug");
  });

  it("classifies memory-allocation reasons as operational (environment, not our bug)", () => {
    for (const reason of [
      "CUDA out of memory",
      "Failed to allocate memory for requested buffer",
      "CUBLAS_STATUS_ALLOC_FAILED",
      "std::bad_alloc",
      "MemoryError",
      "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
      "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
      "cannot allocate memory",
      "[Errno 12] Nicht genügend Hauptspeicher verfügbar",
      "OSError: [Errno 12] Не удалось выделить память",
      "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
    ]) {
      const err = toSidecarError(reason, "Upscaling failed") as SafeError;
      expect(err.kind).toBe("operational");
    }
  });
  it("classifies file system limits and quotas as operational (environment, not our bug)", () => {
    for (const [reason, code] of [
      ["OSError: [Errno 28] No space left on device", "ENOSPC"],
      ["[Errno 13] Permission denied", "EACCES"],
      ["OSError: [Errno 30] Read-only file system", "EROFS"],
      ["[Errno 24] Too many open files", "EMFILE"],
    ]) {
      const err = toSidecarError(reason, "Failed") as SafeError;
      expect(err.kind).toBe("operational");
      expect(err.code).toBe(code);
    }
  });

  it("classifies other IO errors as bugs", () => {
    for (const nonTargetErrno of [
      "OSError: [Errno 122] Disk quota exceeded",
      "OSError: [Errno 2] No such file or directory",
    ]) {
      const err = toSidecarError(nonTargetErrno, "Failed") as SafeError;
      expect(err.kind).toBe("bug");
    }
  });

  it("falls back to the constant tool message when the reason is empty or whitespace-only", () => {
    for (const reason of [undefined, null, "", "   ", "\n\t"]) {
      const err = toSidecarError(reason, "Upscaling failed");
      expect(isSafeMessageError(err)).toBe(true);
      expect(err.message).toBe("Upscaling failed");
    }
  });

  it("passes an existing SafeError through unchanged so its kind is not masked", () => {
    const timeout = new SafeError("Python script timed out", {
      kind: "operational",
      code: "timeout",
    });
    expect(toSidecarError(timeout, "Upscaling failed")).toBe(timeout);
  });

  it("uses an Error reason's message", () => {
    const err = toSidecarError(new Error("model weights corrupt"), "Upscaling failed");
    expect(isSafeMessageError(err)).toBe(true);
    expect(err.message).toBe("model weights corrupt");
  });
});

describe("wrapper propagation (sidecar reason survives the Sentry scrubber)", () => {
  let png: Buffer;
  beforeAll(async () => {
    png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
  });

  it("upscale throws a SafeError carrying the sidecar reason", async () => {
    runPythonWithProgress.mockResolvedValue({
      stdout: JSON.stringify({ success: false, error: "RealESRGAN weights not found" }),
    });

    let caught: unknown;
    try {
      await upscale(png, tmpdir(), { scale: 2 });
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("RealESRGAN weights not found");
    expect((caught as SafeError).kind).toBe("bug");
  });

  it("transcribeAudio throws a SafeError carrying the sidecar reason", async () => {
    runPythonWithProgress.mockResolvedValue({
      stdout: JSON.stringify({ error: "audio stream unreadable" }),
    });

    let caught: unknown;
    try {
      await transcribeAudio("/nonexistent/input.wav", {});
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("audio stream unreadable");
  });

  it("transcribeAudio classifies a sidecar MemoryError as an operational SafeError", async () => {
    runPythonWithProgress.mockResolvedValue({
      stdout: JSON.stringify({ success: false, error: "MemoryError" }),
    });

    let caught: unknown;
    try {
      await transcribeAudio("/nonexistent/input.wav", { language: "auto" });
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("MemoryError");
    expect((caught as SafeError).kind).toBe("operational");
  });
});
