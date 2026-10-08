import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** What the parent-row select resolves with, or an Error it rejects with. */
  result: [] as unknown[] | Error,
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
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
  vi.mocked(log.warn).mockClear();
});

describe("settledFailureResponse (#2180)", () => {
  it("answers null for a row that is not settled as failed", async () => {
    for (const status of ["processing", "completed", "canceled"]) {
      state.result = [{ status, error: { message: "Boom" } }];
      expect(await settledFailureResponse("parent", log)).toBeNull();
    }
  });

  it("answers null when there is no row", async () => {
    state.result = [];
    expect(await settledFailureResponse("parent", log)).toBeNull();
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
