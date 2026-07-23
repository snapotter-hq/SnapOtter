import { describe, expect, it, vi } from "vitest";
import type { AiJobOutput, AiPathJobInput } from "../../../apps/api/src/jobs/ai-handlers.js";
import {
  hasAiJobHandler,
  hasAiPathJobHandler,
  registerAiJobHandler,
  registerAiPathJobHandler,
  runAiPathToolJob,
  runAiToolJob,
} from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: "/tmp/ai-handler-registry-test",
  report: vi.fn(),
};

function job(toolId: string): ToolJobData {
  return {
    jobId: `job-${toolId}`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-${toolId}/input.png`],
    filename: "input.png",
    settings: {},
    kind: "ai-tool",
  };
}

const output: AiJobOutput = {
  buffer: Buffer.from("out"),
  filename: "input_done.png",
  contentType: "image/png",
};

// Unique per-test tool ids keep the module-level registry Maps isolated between
// cases so registration in one test never leaks into another.
describe("AI job handler registry", () => {
  describe("buffer-backed handlers", () => {
    it("reports no handler for a tool id that was never registered", () => {
      expect(hasAiJobHandler("registry-buffer-unregistered")).toBe(false);
    });

    it("registers a handler and dispatches the job to it", async () => {
      const handler = vi.fn(async () => output);
      registerAiJobHandler("registry-buffer-dispatch", handler);

      expect(hasAiJobHandler("registry-buffer-dispatch")).toBe(true);

      const input = Buffer.from("in");
      const data = job("registry-buffer-dispatch");
      const result = await runAiToolJob(data, input, ctx);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(input, data, ctx);
      expect(result).toBe(output);
    });

    it("throws a descriptive error when running a job with no registered handler", async () => {
      expect(hasAiJobHandler("registry-buffer-missing")).toBe(false);

      await expect(
        runAiToolJob(job("registry-buffer-missing"), Buffer.from("x"), ctx),
      ).rejects.toThrow("No AI job handler for registry-buffer-missing");
    });

    it("overwrites an existing handler when the same tool id is registered twice", async () => {
      const first = vi.fn(async () => output);
      const second = vi.fn(async () => ({ ...output, filename: "second.png" }));
      registerAiJobHandler("registry-buffer-overwrite", first);
      registerAiJobHandler("registry-buffer-overwrite", second);

      const result = await runAiToolJob(job("registry-buffer-overwrite"), Buffer.from("x"), ctx);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(result.filename).toBe("second.png");
    });
  });

  describe("path-backed handlers", () => {
    const pathInput: AiPathJobInput = { path: "/tmp/scan.pdf", size: 42 };

    it("reports no path handler for a tool id that was never registered", () => {
      expect(hasAiPathJobHandler("registry-path-unregistered")).toBe(false);
    });

    it("keeps the buffer and path registries independent", () => {
      registerAiJobHandler(
        "registry-buffer-only",
        vi.fn(async () => output),
      );

      // A buffer registration must not register the id as a path handler.
      expect(hasAiJobHandler("registry-buffer-only")).toBe(true);
      expect(hasAiPathJobHandler("registry-buffer-only")).toBe(false);
    });

    it("registers a path handler and dispatches the job to it", async () => {
      const handler = vi.fn(async () => output);
      registerAiPathJobHandler("registry-path-dispatch", handler);

      expect(hasAiPathJobHandler("registry-path-dispatch")).toBe(true);
      // The path registration must not leak into the buffer registry.
      expect(hasAiJobHandler("registry-path-dispatch")).toBe(false);

      const data = job("registry-path-dispatch");
      const result = await runAiPathToolJob(data, pathInput, ctx);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(pathInput, data, ctx);
      expect(result).toBe(output);
    });

    it("throws a descriptive error when running a path job with no registered handler", async () => {
      expect(hasAiPathJobHandler("registry-path-missing")).toBe(false);

      await expect(runAiPathToolJob(job("registry-path-missing"), pathInput, ctx)).rejects.toThrow(
        "No path-backed AI job handler for registry-path-missing",
      );
    });

    it("does not fall back to a buffer handler for a path job dispatch", async () => {
      // Only a buffer handler exists for this id; the path dispatch must still fail.
      registerAiJobHandler(
        "registry-path-no-fallback",
        vi.fn(async () => output),
      );

      expect(hasAiJobHandler("registry-path-no-fallback")).toBe(true);
      expect(hasAiPathJobHandler("registry-path-no-fallback")).toBe(false);

      await expect(
        runAiPathToolJob(job("registry-path-no-fallback"), pathInput, ctx),
      ).rejects.toThrow("No path-backed AI job handler for registry-path-no-fallback");
    });
  });
});
