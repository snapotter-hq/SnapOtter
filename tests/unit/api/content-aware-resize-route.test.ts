/**
 * content-aware-resize runs through createToolRoute (#4338): its executionHint
 * is "long", so the factory answers 202 with a job id and the seam carving runs
 * on the queue with cancel and SSE progress. These tests pin that wiring and
 * the process fn the worker, pipelines and batch all call.
 */

import { isSafeMessageError, SafeError, ToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const seamCarve = vi.fn();

vi.mock("@snapotter/ai", () => ({
  seamCarve: (...args: unknown[]) => seamCarve(...args),
}));

const createToolRouteSpy = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/routes/tool-factory.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/routes/tool-factory.js")>();
  return {
    ...actual,
    createToolRoute: (...args: Parameters<typeof actual.createToolRoute>) => {
      createToolRouteSpy(...args);
      return actual.createToolRoute(...args);
    },
  };
});

import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";

const onePxPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const post = vi.fn();

function processFn() {
  const config = getToolConfig("content-aware-resize");
  if (!config) throw new Error("content-aware-resize missing from toolRegistry");
  return config.process;
}

beforeAll(() => {
  registerContentAwareResize({ post } as unknown as FastifyInstance);
});

beforeEach(() => {
  seamCarve.mockReset();
});

describe("content-aware-resize route", () => {
  it("registers through createToolRoute so requests go on the queue (#4338)", () => {
    expect(createToolRouteSpy).toHaveBeenCalledTimes(1);
    expect(createToolRouteSpy.mock.calls[0]?.[1]).toMatchObject({
      toolId: "content-aware-resize",
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe("/api/v1/tools/image/content-aware-resize");
  });

  it("keeps width and height in the result JSON and forwards the cancel signal (#4338)", async () => {
    seamCarve.mockResolvedValueOnce({ buffer: Buffer.from("png"), width: 7, height: 5 });
    const controller = new AbortController();

    const result = await processFn()(onePxPng, { width: 1 }, "photo.jpg", {
      signal: controller.signal,
      scratchDir: "/tmp",
      report: () => {},
    });

    expect(result).toMatchObject({
      filename: "photo_seam.png",
      contentType: "image/png",
      resultPayload: { width: 7, height: 5 },
    });
    expect(seamCarve.mock.calls[0]?.[2]).toMatchObject({ signal: controller.signal });
  });

  it("passes a cancel abort through untouched so the worker settles it as canceled", async () => {
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    seamCarve.mockRejectedValueOnce(abort);
    await expect(processFn()(onePxPng, { width: 1 }, "a.png")).rejects.toBe(abort);
  });

  it("preserves operational SafeError timeout message in the process fn (#2997)", async () => {
    const timeoutErr = new SafeError(
      "Content-aware resize timed out on this image. Try a smaller image or a larger target size.",
      { kind: "operational", code: "PROCESSING_TIMEOUT", statusCode: 422 },
    );
    seamCarve.mockRejectedValueOnce(timeoutErr);
    await expect(processFn()(onePxPng, { width: 1 }, "a.png")).rejects.toBe(timeoutErr);
  });

  it("passes ToolInputError from seamCarve through the process fn (#2997)", async () => {
    const inputErr = new ToolInputError(
      "Content-aware resize can enlarge each side by at most 2x (requested 8192 x 150 from 200 x 150)",
    );
    seamCarve.mockRejectedValueOnce(inputErr);
    await expect(processFn()(onePxPng, { width: 8192 }, "a.png")).rejects.toBe(inputErr);
  });

  it("surfaces 503 ENGINE_UNAVAILABLE when the caire binary is missing (#3858)", async () => {
    const missingCaireErr = new SafeError(
      "caire binary not found. Install via: go install github.com/esimov/caire/cmd/caire@v1.5.0",
      { kind: "operational", code: "ENGINE_UNAVAILABLE", statusCode: 503 },
    );
    seamCarve.mockRejectedValueOnce(missingCaireErr);
    await expect(processFn()(onePxPng, { width: 1 }, "a.png")).rejects.toBe(missingCaireErr);
  });

  it("classifies a V8 buffer allocation RangeError or SIGKILL as 503 ENGINE_UNAVAILABLE (#3905)", async () => {
    const oomMessage =
      "The image decoder ran out of memory decoding this image, or was killed. The image may need more memory than this server has.";
    for (const rawOom of [
      new RangeError("Array buffer allocation failed"),
      Object.assign(new Error("caire exited SIGKILL"), { signal: "SIGKILL" }),
    ]) {
      seamCarve.mockRejectedValueOnce(rawOom);
      await expect(processFn()(onePxPng, { width: 1 }, "a.png")).rejects.toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        message: oomMessage,
      });
    }
  });

  it("classifies operational write errnos from seamCarve as operational SafeErrors (#3905)", async () => {
    for (const errno of ["ENOSPC", "EACCES", "EROFS"]) {
      const writeErr = Object.assign(new Error(`${errno}: write failed`), {
        code: errno,
        syscall: "open",
      });
      seamCarve.mockRejectedValueOnce(writeErr);
      const err = await processFn()(onePxPng, { width: 1 }, "a.png").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err), errno).toBe(true);
      expect(err).toMatchObject({ kind: "operational", code: errno, cause: writeErr });
    }
  });

  it("wraps unexpected seamCarve failure as bug SafeError in the process fn (#2828)", async () => {
    const crashErr = new Error("caire exited with code 2");
    seamCarve.mockRejectedValueOnce(crashErr);
    const err = await processFn()(onePxPng, { width: 1 }, "a.png").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isSafeMessageError(err)).toBe(true);
    expect((err as SafeError).message).toBe("Content-aware resize failed");
    expect((err as SafeError).kind).toBe("bug");
    expect((err as SafeError).code).toBe("custom");
    expect((err as SafeError).cause).toBe(crashErr);
  });
});
