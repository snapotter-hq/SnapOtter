/**
 * The remove() lock race (#889): a worker can take a queued job's lock
 * between requestCancel's getState and its remove. BullMQ then throws a
 * locked-removal error, which used to escape and 500 a cancel that should
 * have resolved as "the job is active now, signal its worker". The window
 * is one queue round-trip wide, so this is pinned with a stubbed queue
 * instead of a real race.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  publishes: [] as string[],
  removeError: null as Error | null,
  rowUpdates: 0,
}));

vi.mock("../../../../apps/api/src/db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/db/index.js")>();
  return {
    ...actual,
    db: {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      update: () => ({
        set: () => ({
          where: async () => {
            stubs.rowUpdates++;
            return { rowCount: 1 };
          },
        }),
      }),
    },
  };
});

vi.mock("../../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
  markBatchCanceled: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/connection.js", () => ({
  createRedisSubscriberConnection: vi.fn(),
  sharedRedis: () => ({
    publish: async (_channel: string, id: string) => {
      stubs.publishes.push(id);
      return 1;
    },
  }),
}));

vi.mock("../../../../apps/api/src/jobs/queues.js", () => ({
  getQueue: (pool: string) =>
    pool === "image"
      ? {
          getJob: async () => ({
            getState: async () => "waiting",
            remove: async () => {
              if (stubs.removeError) throw stubs.removeError;
            },
          }),
        }
      : { getJob: async () => undefined },
}));

const { requestCancel } = await import("../../../../apps/api/src/jobs/cancel.js");

describe("requestCancel when remove() races the worker lock (#889)", () => {
  it("falls through to the active signal when the job is locked", async () => {
    stubs.publishes.length = 0;
    stubs.rowUpdates = 0;
    stubs.removeError = new Error(
      "Job j1 could not be removed because it is locked by another worker",
    );

    await expect(requestCancel("j1")).resolves.toBe(true);
    expect(stubs.publishes).toContain("j1");
    // The worker's abort path owns the terminal write for active jobs; a
    // row write here would recreate the row-vs-worker disagreement the
    // repair machinery exists for.
    expect(stubs.rowUpdates).toBe(0);
  });

  it("pins the BullMQ wording the lock-race match relies on", () => {
    // The fallthrough matches BullMQ's message because it throws no typed
    // error. A BullMQ upgrade that rewords it silently turns the fix back
    // into 500s; this fails the upgrade PR instead. The regex lives in
    // apps/api/src/jobs/cancel.ts (cancelQueueJob).
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("bullmq/dist/cjs/classes/job.js"), "utf8");
    expect(source).toContain("could not be removed because it is locked by another worker");
  });

  it("still propagates removal failures that are not the lock race", async () => {
    stubs.publishes.length = 0;
    stubs.removeError = new Error("Connection is closed.");

    await expect(requestCancel("j2")).rejects.toThrow("Connection is closed.");
    expect(stubs.publishes).toHaveLength(0);
  });
});
