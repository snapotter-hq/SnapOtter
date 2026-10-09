import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** What the parent-row select resolves with, or an Error it rejects with. */
  result: [] as unknown[] | Error,
  /** Results served first, one per read, before `result` (#2209). */
  queue: [] as unknown[][],
  reads: 0,
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          state.reads += 1;
          const queued = state.queue.shift();
          if (queued) return queued;
          if (state.result instanceof Error) throw state.result;
          return state.result;
        },
      }),
    }),
  },
  schema: { jobs: { id: "id" } },
}));

import { STORAGE_FAULT_CODES } from "../../../apps/api/src/lib/object-storage.js";
import { settledFailureResponse } from "../../../apps/api/src/lib/settled-failure.js";

const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

const failedRow = (error: unknown) => [{ status: "failed", error }];

beforeEach(() => {
  state.result = [];
  state.queue = [];
  state.reads = 0;
  vi.mocked(log.warn).mockClear();
});

describe("settledFailureResponse (#2180)", () => {
  it("answers null at once for a row that finished another way", async () => {
    for (const status of ["completed", "canceled"]) {
      state.reads = 0;
      state.result = [{ status, error: { message: "Boom" } }];
      expect(await settledFailureResponse("parent", log)).toBeNull();
      expect(state.reads).toBe(1);
    }
  });

  it("answers null when there is no row", async () => {
    state.result = [];
    expect(await settledFailureResponse("parent", log)).toBeNull();
    expect(state.reads).toBe(1);
  });

  it("waits for a row the worker is still settling (#2209)", async () => {
    // A finalize that died by stall or crash is settled only by the worker's
    // failed handler, which doesn't await its write, so the route can read
    // the row before it flips.
    state.queue = [
      [{ status: "processing", error: null }],
      [{ status: "processing", error: null }],
    ];
    state.result = failedRow({ message: "Failed to package batch results" });

    expect(await settledFailureResponse("parent", log)).toEqual({
      status: 500,
      body: { error: "Failed to package batch results", errors: [] },
    });
    expect(state.reads).toBe(3);
  });

  it("gives up promptly on a row that stays in flight (#2209)", async () => {
    state.result = [{ status: "processing", error: null }];
    const started = Date.now();

    expect(await settledFailureResponse("parent", log)).toBeNull();
    expect(state.reads).toBeGreaterThan(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("answers null when the failed row carries no reason", async () => {
    for (const error of [null, {}, { message: "" }, { code: "workspace-cap" }]) {
      state.result = failedRow(error);
      expect(await settledFailureResponse("parent", log)).toBeNull();
    }
  });

  it("answers 500 with the row's message and no code when the failure has none", async () => {
    state.result = failedRow({ message: "Failed to package batch results" });

    const response = await settledFailureResponse("parent", log);

    expect(response).toEqual({
      status: 500,
      body: { error: "Failed to package batch results", errors: [] },
    });
    expect(response?.body).not.toHaveProperty("code");
  });

  it("answers 500 for a code outside the storage faults and keeps the code", async () => {
    state.result = failedRow({ message: "Nope", code: "something-else" });

    expect(await settledFailureResponse("parent", log)).toMatchObject({
      status: 500,
      body: { error: "Nope", code: "something-else" },
    });
  });

  it.each([...STORAGE_FAULT_CODES])("answers 503 for the storage fault %s", async (code) => {
    state.result = failedRow({ message: "Storage says no", code });

    expect(await settledFailureResponse("parent", log)).toMatchObject({
      status: 503,
      body: { error: "Storage says no", code },
    });
  });

  it("drops a code that isn't a string", async () => {
    state.result = failedRow({ message: "Odd", code: 503 });

    const response = await settledFailureResponse("parent", log);

    expect(response?.status).toBe(500);
    expect(response?.body).not.toHaveProperty("code");
  });

  it("carries the row's details as the errors list, and nothing else", async () => {
    const details = [{ filename: "", error: "Failed to package batch results" }];
    state.result = failedRow({ message: "Failed", details });
    expect((await settledFailureResponse("parent", log))?.body.errors).toEqual(details);

    state.result = failedRow({ message: "Failed", details: "not a list" });
    expect((await settledFailureResponse("parent", log))?.body.errors).toEqual([]);
  });

  it("logs and answers null when the row can't be read, so the caller keeps its own error", async () => {
    state.result = new Error("connection reset");

    expect(await settledFailureResponse("parent", log)).toBeNull();
    expect(log.warn).toHaveBeenCalledOnce();
  });
});
