import { isSafeMessageError, isToolInputError, toolInputErrorCode } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

const runInWorker = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/lib/run-in-worker.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/run-in-worker.js")>()),
  runInWorker,
}));

import {
  WorkerOutOfMemoryError,
  WorkerTimeoutError,
} from "../../../apps/api/src/lib/run-in-worker.js";
import {
  optimizeOnWorker,
  optimizeSvgBuffer,
  SLOW_HOST_TIMEOUT_MAX_BYTES,
} from "../../../apps/api/src/routes/tools/optimize-svg.js";

const small = "<svg/>";
const large = "x".repeat(SLOW_HOST_TIMEOUT_MAX_BYTES + 1);

async function failWith(err: Error, svg: string) {
  runInWorker.mockRejectedValueOnce(err);
  return optimizeOnWorker(svg, {}).catch((e: unknown) => e);
}

describe("optimizeOnWorker error mapping", () => {
  it("answers a timeout on a small input as a retryable 503, not a bad file", async () => {
    const err = (await failWith(new WorkerTimeoutError(30_000), small)) as {
      statusCode?: number;
      code?: string;
    };
    expect(isToolInputError(err)).toBe(false);
    expect(isSafeMessageError(err)).toBe(true);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("ENGINE_UNAVAILABLE");
  });

  it("treats an input exactly at the threshold as small", async () => {
    const err = (await failWith(
      new WorkerTimeoutError(30_000),
      "x".repeat(SLOW_HOST_TIMEOUT_MAX_BYTES),
    )) as {
      statusCode?: number;
    };
    expect(err.statusCode).toBe(503);
  });

  it("keeps a timeout on a large input as a 400 too-complex error", async () => {
    const err = await failWith(new WorkerTimeoutError(30_000), large);
    expect(isToolInputError(err)).toBe(true);
    expect((err as { code?: string }).code).toBe("SVG_TOO_LARGE");
  });

  it("keeps out-of-memory as a 400 whatever the input size", async () => {
    for (const svg of [small, large]) {
      const err = await failWith(new WorkerOutOfMemoryError(new Error("oom")), svg);
      expect(isToolInputError(err)).toBe(true);
    }
  });

  it("rethrows other worker errors untouched", async () => {
    const boom = new Error("boom");
    expect(await failWith(boom, small)).toBe(boom);
  });
});

describe("optimizeSvgBuffer sanitizer refusals", () => {
  it("keeps the sanitizer's own code instead of calling every refusal too large", async () => {
    const svg = Buffer.from(
      '<?xml version="1.0" encoding="EUC-KR"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const err = await optimizeSvgBuffer(svg, {} as never, "a.svg").catch((e: unknown) => e);
    expect(toolInputErrorCode(err)).toBe("SVG_ENCODING_UNSUPPORTED");
  });
});
