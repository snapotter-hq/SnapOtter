/**
 * Unit tests for Redis-backed batch progress counters and cancel flag helpers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMocks = vi.hoisted(() => ({
  setex: vi.fn(async () => "OK"),
  del: vi.fn(async () => 1),
  exists: vi.fn(async () => 0),
  incr: vi.fn(async () => 1),
  get: vi.fn(async () => null as string | null),
  rpush: vi.fn(async () => 1),
  expire: vi.fn(async () => 1),
  lrange: vi.fn(async () => [] as string[]),
}));

const updateJobProgressMock = vi.hoisted(() => vi.fn());

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => redisMocks,
}));

vi.mock("../../../apps/api/src/jobs/types.js", () => ({
  bullPrefix: () => "snapotter-test",
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  updateJobProgress: updateJobProgressMock,
}));

import {
  clearBatchCanceled,
  isBatchCanceled,
  markBatchCanceled,
  readBatchCounters,
  recordChildOutcome,
} from "../../../apps/api/src/jobs/batch-progress.js";

describe("batch cancel flag helpers (#767, #2739)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("markBatchCanceled sets the Redis cancel key with a 3600s TTL", async () => {
    await markBatchCanceled("parent-123");
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    expect(redisMocks.setex).toHaveBeenCalledWith(
      "snapotter-test:batch:parent-123:canceled",
      3600,
      "1",
    );
  });

  it("clearBatchCanceled deletes the Redis cancel key (#2739)", async () => {
    await clearBatchCanceled("parent-123");
    expect(redisMocks.del).toHaveBeenCalledTimes(1);
    expect(redisMocks.del).toHaveBeenCalledWith("snapotter-test:batch:parent-123:canceled");
  });

  it("isBatchCanceled returns true when the key exists, false when absent or on Redis fault", async () => {
    redisMocks.exists.mockResolvedValueOnce(1);
    await expect(isBatchCanceled("parent-123")).resolves.toBe(true);
    expect(redisMocks.exists).toHaveBeenCalledWith("snapotter-test:batch:parent-123:canceled");

    redisMocks.exists.mockResolvedValueOnce(0);
    await expect(isBatchCanceled("parent-123")).resolves.toBe(false);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = new Error("redis down");
      redisMocks.exists.mockRejectedValueOnce(err);
      await expect(isBatchCanceled("parent-123")).resolves.toBe(false);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err, parentId: "parent-123" },
        "batch cancel flag read failed",
      );
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      // Close the failure burst so later reads start from a healthy state.
      await isBatchCanceled("parent-123");
    }
  });

  it("isBatchCanceled logs one line per Redis failure burst, not one per read (#4177)", async () => {
    // Every queued child and step reads the flag, so an outage would
    // otherwise write a line per file into the support bundle.
    redisMocks.exists.mockRejectedValueOnce(new Error("redis down"));
    redisMocks.exists.mockRejectedValueOnce(new Error("redis down"));
    redisMocks.exists.mockRejectedValueOnce(new Error("redis down"));
    await isBatchCanceled("parent-a");
    await isBatchCanceled("parent-b");
    await isBatchCanceled("parent-c");
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);

    // A good read ends the burst; the next failure is a new one.
    redisMocks.exists.mockResolvedValueOnce(0);
    await expect(isBatchCanceled("parent-a")).resolves.toBe(false);
    const err = new Error("redis down again");
    redisMocks.exists.mockRejectedValueOnce(err);
    await isBatchCanceled("parent-d");
    expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    expect(loggerMock.warn).toHaveBeenLastCalledWith(
      { err, parentId: "parent-d" },
      "batch cancel flag read failed",
    );

    await isBatchCanceled("parent-a");
  });
});

describe("recordChildOutcome and readBatchCounters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a successful child outcome and emits processing progress", async () => {
    redisMocks.incr.mockResolvedValueOnce(2);
    redisMocks.get.mockResolvedValueOnce("1");
    redisMocks.lrange.mockResolvedValueOnce([
      JSON.stringify({ filename: "bad.png", error: "Failed" }),
    ]);

    await recordChildOutcome("batch-1", 5, "good.png");

    expect(redisMocks.incr).toHaveBeenCalledWith("snapotter-test:batch:batch-1:done");
    expect(redisMocks.get).toHaveBeenCalledWith("snapotter-test:batch:batch-1:failed");
    expect(redisMocks.rpush).not.toHaveBeenCalled();
    expect(updateJobProgressMock).toHaveBeenCalledWith({
      jobId: "batch-1",
      status: "processing",
      totalFiles: 5,
      completedFiles: 3,
      failedFiles: 1,
      errors: [{ filename: "bad.png", error: "Failed" }],
      currentFile: "good.png",
    });
  });

  it("records a failed child outcome, strips internal paths, and reads counters", async () => {
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.get.mockResolvedValueOnce("2");
    redisMocks.lrange.mockResolvedValueOnce([
      JSON.stringify({ filename: "bad.png", error: "Failed at [path]" }),
    ]);

    await recordChildOutcome("batch-1", 4, "bad.png", "Failed at /var/data/secret/file.png");

    expect(redisMocks.incr).toHaveBeenCalledWith("snapotter-test:batch:batch-1:failed");
    expect(redisMocks.rpush).toHaveBeenCalledWith(
      "snapotter-test:batch:batch-1:errors",
      expect.stringContaining("bad.png"),
    );

    redisMocks.get.mockResolvedValueOnce("2").mockResolvedValueOnce("1");
    redisMocks.lrange.mockResolvedValueOnce([
      JSON.stringify({ filename: "bad.png", error: "Failed" }),
    ]);
    await expect(readBatchCounters("batch-1")).resolves.toEqual({
      done: 2,
      failed: 1,
      errors: [{ filename: "bad.png", error: "Failed" }],
    });
  });
});
