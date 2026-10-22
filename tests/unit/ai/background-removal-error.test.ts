import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
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
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { getToolConfig, type ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
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

  it("wraps thrown errors from the OOM fallback retry in a SafeError (#3462)", async () => {
    // 1. parseStdoutJson throws a plain Error on the fallback attempt
    runPythonWithProgress.mockResolvedValue({ stdout: "not json" });
    parseStdoutJson
      .mockReturnValueOnce({ success: false, error: "CUDA out of memory" })
      .mockImplementationOnce(() => {
        throw new Error("No JSON response from Python script");
      });

    let caught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "birefnet-general" });
    } catch (e) {
      caught = e;
    }

    expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("No JSON response from Python script");
    expect((caught as SafeError).kind).toBe("bug");

    // 2. readFile(outputPath) rejects with ENOENT on the primary and fallback attempts
    runPythonWithProgress.mockReset();
    parseStdoutJson.mockReset();
    runPythonWithProgress.mockResolvedValue({ stdout: '{"success":true}' });
    parseStdoutJson.mockReturnValueOnce({ success: true });

    let primaryReadCaught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "u2net" });
    } catch (e) {
      primaryReadCaught = e;
    }

    expect(runPythonWithProgress).toHaveBeenCalledTimes(1);
    expect(isSafeMessageError(primaryReadCaught)).toBe(true);
    expect((primaryReadCaught as SafeError).message).toMatch(/ENOENT/);
    expect((primaryReadCaught as SafeError).kind).toBe("bug");

    runPythonWithProgress.mockReset();
    parseStdoutJson.mockReset();
    runPythonWithProgress.mockResolvedValue({ stdout: '{"success":true}' });
    parseStdoutJson
      .mockReturnValueOnce({ success: false, error: "CUDA out of memory" })
      .mockReturnValueOnce({ success: true });

    let readCaught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "birefnet-general" });
    } catch (e) {
      readCaught = e;
    }

    expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
    expect(isSafeMessageError(readCaught)).toBe(true);
    expect((readCaught as SafeError).message).toMatch(/ENOENT/);
    expect((readCaught as SafeError).kind).toBe("bug");

    // 3. runPythonWithProgress rejects with a plain Error on the fallback attempt
    runPythonWithProgress.mockReset();
    parseStdoutJson.mockReset();
    runPythonWithProgress
      .mockResolvedValueOnce({ stdout: "{}" })
      .mockRejectedValueOnce(new Error("spawn python3 EACCES"));
    parseStdoutJson.mockReturnValueOnce({ success: false, error: "CUDA out of memory" });

    let rejectCaught: unknown;
    try {
      await removeBackground(png, tmpdir(), { model: "birefnet-general" });
    } catch (e) {
      rejectCaught = e;
    }

    expect(runPythonWithProgress).toHaveBeenCalledTimes(2);
    expect(isSafeMessageError(rejectCaught)).toBe(true);
    expect((rejectCaught as SafeError).message).toBe("spawn python3 EACCES");
    expect((rejectCaught as SafeError).kind).toBe("bug");

    // 4. Bridge SafeError on the fallback attempt passes through unchanged
    runPythonWithProgress.mockReset();
    parseStdoutJson.mockReset();
    const timeout = new SafeError("Python script timed out", {
      kind: "operational",
      code: "timeout",
    });
    runPythonWithProgress.mockResolvedValueOnce({ stdout: "{}" }).mockRejectedValueOnce(timeout);
    parseStdoutJson.mockReturnValueOnce({ success: false, error: "CUDA out of memory" });

    await expect(removeBackground(png, tmpdir(), { model: "birefnet-general" })).rejects.toBe(
      timeout,
    );
  });
});

describe("transparency-fixer three-rung OOM fallback chain (#3059)", () => {
  const fakeApp = { post: vi.fn() } as unknown as FastifyInstance;

  function transparencyJob(): ToolJobData {
    return {
      jobId: "job-transparency-fixer-oom",
      toolId: "transparency-fixer",
      userId: null,
      pool: "ai",
      inputRefs: ["uploads/job-transparency-fixer-oom/photo.png"],
      filename: "photo.png",
      settings: { defringe: 0, outputFormat: "png", removeWatermark: false },
      kind: "ai-tool",
    };
  }

  function makeCtx(): ToolProcessCtx {
    return {
      signal: new AbortController().signal,
      scratchDir: tmpdir(),
      report: vi.fn(),
    };
  }

  function sidecarAttemptModels(): string[] {
    return runPythonWithProgress.mock.calls.map((call) => {
      const args = call[1] as string[];
      return (JSON.parse(args[2]) as { model?: string }).model ?? "";
    });
  }

  beforeAll(() => {
    registerTransparencyFixer(fakeApp);
  });

  it("steps from birefnet-hr-matting to birefnet-general without jumping straight to u2net", async () => {
    runPythonWithProgress.mockImplementation(async (_script: string, args: string[]) => {
      const { model } = JSON.parse(args[2]) as { model?: string };
      if (model === "birefnet-hr-matting") {
        throw new Error("CUDA out of memory");
      }
      await writeFile(args[1], png);
      return { stdout: '{"success": true}', stderr: "" };
    });
    parseStdoutJson.mockReturnValue({ success: true });

    const ctx = makeCtx();
    const result = await runAiToolJob(transparencyJob(), png, ctx);

    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting", "birefnet-general"]);
    expect(ctx.report).toHaveBeenCalledWith(5, "Retrying with fallback model (birefnet-general)");
    expect(result.filename).toBe("photo_fixed.png");
  });

  it("steps birefnet-hr-matting -> birefnet-general -> u2net when the first two OOM", async () => {
    runPythonWithProgress.mockImplementation(async (_script: string, args: string[]) => {
      const { model } = JSON.parse(args[2]) as { model?: string };
      if (model === "birefnet-hr-matting" || model === "birefnet-general") {
        throw new Error("Unable to allocate 1.86 GiB for an array");
      }
      await writeFile(args[1], png);
      return { stdout: '{"success": true}', stderr: "" };
    });
    parseStdoutJson.mockReturnValue({ success: true });

    const ctx = makeCtx();
    const result = await runAiToolJob(transparencyJob(), png, ctx);

    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting", "birefnet-general", "u2net"]);
    expect(ctx.report).toHaveBeenCalledWith(5, "Retrying with fallback model (birefnet-general)");
    expect(ctx.report).toHaveBeenCalledWith(5, "Retrying with lighter model (u2net)");
    expect(result.filename).toBe("photo_fixed.png");
  });

  it("stops after 3 sidecar calls (birefnet-hr-matting -> birefnet-general -> u2net) when all three OOM, including via pipeline processor", async () => {
    runPythonWithProgress.mockResolvedValue({ stdout: "{}" });
    parseStdoutJson.mockReturnValue({ success: false, error: "CUDA out of memory" });

    const ctx = makeCtx();
    let caught: unknown;
    try {
      await runAiToolJob(transparencyJob(), png, ctx);
    } catch (err) {
      caught = err;
    }

    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting", "birefnet-general", "u2net"]);
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).kind).toBe("operational");
    expect((caught as SafeError).message).toBe("CUDA out of memory");

    runPythonWithProgress.mockClear();
    const config = getToolConfig("transparency-fixer");
    expect(config).toBeDefined();
    await expect(
      config?.process(
        png,
        { defringe: 0, outputFormat: "png", removeWatermark: false },
        "photo.png",
        makeCtx(),
      ),
    ).rejects.toThrow("CUDA out of memory");
    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting", "birefnet-general", "u2net"]);
  });

  it("stops after 1 sidecar call when birefnet-hr-matting fails with a non-OOM error", async () => {
    runPythonWithProgress.mockResolvedValue({ stdout: "{}" });
    parseStdoutJson.mockReturnValue({ success: false, error: "rembg model load failed" });

    await expect(runAiToolJob(transparencyJob(), png, makeCtx())).rejects.toThrow(
      "rembg model load failed",
    );
    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting"]);
  });

  it("preserves the sidecar failure message instead of 'Transparency fix failed' when the u2net fallback throws (#3462)", async () => {
    runPythonWithProgress.mockResolvedValue({ stdout: "not json" });
    parseStdoutJson
      .mockReturnValueOnce({ success: false, error: "CUDA out of memory" })
      .mockReturnValueOnce({ success: false, error: "CUDA out of memory" })
      .mockImplementationOnce(() => {
        throw new Error("No JSON response from Python script");
      });

    let caught: unknown;
    try {
      await runAiToolJob(transparencyJob(), png, makeCtx());
    } catch (err) {
      caught = err;
    }

    expect(sidecarAttemptModels()).toEqual(["birefnet-hr-matting", "birefnet-general", "u2net"]);
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("No JSON response from Python script");
  });
});
