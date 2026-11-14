import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSafeMessageError,
  isToolInputError,
  PIXEL_LIMIT_IMAGE_MESSAGE,
  SafeError,
  ToolInputError,
} from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

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

import {
  CPU_LACKS_AVX_MESSAGE,
  GPU_OUT_OF_MEMORY_MESSAGE,
  toSidecarError,
} from "../../../packages/ai/src/bridge.js";
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

  it("replaces CUDA's long out-of-memory dump with a constant GPU message (NODE-6F)", () => {
    const reason =
      "CUDA out of memory. Tried to allocate 2.98 GiB. GPU 0 has a total capacity of 8.00 GiB of which 0 bytes is free. Including non-PyTorch memory, this process has 17179869184.00 GiB memory in use. Of the allocated memory 7.83 GiB is allocated by PyTorch, and 2.25 GiB is reserved by PyTorch but unallocated.";
    const err = toSidecarError(reason, "Face enhancement failed") as SafeError;
    expect(err.message).toBe(GPU_OUT_OF_MEMORY_MESSAGE);
    // Memory-aware callers (the background-removal model fallback) match this text.
    expect(err.message).toMatch(/out of memory/);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("gpu-oom");
  });

  it("names a CPU without AVX instead of passing on the library's abort text (NODE-AC)", () => {
    const err = toSidecarError(
      "FATAL ERROR: This binary was compiled with avx enabled, but this feature is not available on this processor (go/sigill-fail-fast).",
      "Photo restoration failed",
    ) as SafeError;
    expect(err.message).toBe(CPU_LACKS_AVX_MESSAGE);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("cpu-no-avx");
  });

  it("turns Pillow's decompression-bomb refusal into the same input error sharp's pixel limit gives (NODE-AR)", () => {
    const err = toSidecarError(
      "Image size (199756800 pixels) exceeds limit of 178956970 pixels, could be decompression bomb DOS attack.",
      "Animated background removal failed",
    );
    expect(isToolInputError(err)).toBe(true);
    expect(isSafeMessageError(err)).toBe(false);
    expect(err.message).toBe(PIXEL_LIMIT_IMAGE_MESSAGE);

    const traceback = toSidecarError(
      "PIL.Image.DecompressionBombError: Image size (199756800 pixels) exceeds limit of 178956970 pixels, could be decompression bomb DOS attack.",
      "Failed",
    );
    expect(isToolInputError(traceback)).toBe(true);

    const prefixed = toSidecarError(
      "Failed to open image: Image size (199756800 pixels) exceeds limit of 178956970 pixels, could be decompression bomb DOS attack.",
      "Failed",
    );
    expect(isToolInputError(prefixed)).toBe(true);

    // Pillow prints the same text as a warning for smaller images; that is not the failure.
    const warning = toSidecarError(
      "Image.py:3402: DecompressionBombWarning: Image size (99756800 pixels) exceeds limit of 89478485 pixels, could be decompression bomb DOS attack.",
      "Failed",
    );
    expect(isToolInputError(warning)).toBe(false);
  });

  it("classifies a module missing from an installed bundle as operational (NODE-4W)", () => {
    const err = toSidecarError(
      "Background removal is installed but its libraries did not load (No module named 'rembg'). Reinstall Background Removal from Settings > AI Features, or use Reset AI Environment if that does not help.",
      "Background removal failed",
    ) as SafeError;
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("ai-module-missing");
    expect(err.message).toContain("Reinstall Background Removal");
  });

  it.skipIf(!hasPython)("classifies remove_bg.py's import failure as a broken install", () => {
    const pyDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/ai/python");
    const res = spawnSync(
      pythonBin as string,
      [
        "-c",
        `import sys; sys.path.insert(0, ${JSON.stringify(pyDir)}); import remove_bg; print(remove_bg.background_removal_import_message("No module named 'rembg'"))`,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    expect(res.status, res.stderr).toBe(0);
    const err = toSidecarError(res.stdout.trim(), "Background removal failed") as SafeError;
    expect(err.message).toContain("No module named 'rembg'");
    expect(err.message).toContain("Reinstall Background Removal");
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("ai-module-missing");
  });

  it("classifies a bundled weight that went missing as operational", () => {
    const err = toSidecarError(
      "CodeFormer weight codeformer.pth is missing and automatic downloads are disabled. Reinstall the feature bundle from Settings, or explicitly set SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1 to permit runtime downloads.",
      "Face enhancement failed",
    ) as SafeError;
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("model-weight-missing");
  });

  it("keeps a bare missing module a bug, since no bundle may ship it", () => {
    const err = toSidecarError("No module named 'newdep'", "Upscaling failed") as SafeError;
    expect(err.kind).toBe("bug");
  });

  it("keeps a lookup error from our code as a bug with its reason", () => {
    const err = toSidecarError("KeyError: 'tile'", "Upscaling failed") as SafeError;
    expect(err.kind).toBe("bug");
    expect(err.message).toBe("KeyError: 'tile'");
  });

  it("passes an input error through untouched", () => {
    const input = new ToolInputError(PIXEL_LIMIT_IMAGE_MESSAGE);
    expect(toSidecarError(input, "Failed")).toBe(input);
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
      await transcribeAudio("/nonexistent/input.wav", { language: "en" });
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
