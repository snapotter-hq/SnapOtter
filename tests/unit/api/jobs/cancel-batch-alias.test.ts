/**
 * A batch started with a clientJobId runs under a server-generated parent id
 * (the client id would otherwise name its public download path). The web
 * client still cancels by its own id, which lands on the alias row, so
 * requestCancel must follow the alias to the batch it points at.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  publishes: [] as string[],
  selectRows: [] as Array<Record<string, unknown>>,
}));

const markBatchCanceledMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../../../../apps/api/src/db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/db/index.js")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            const next = stubs.selectRows.shift();
            return next ? [next] : [];
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
  markBatchCanceled: markBatchCanceledMock,
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
  getQueue: () => ({ getJob: async () => undefined }),
}));

const { requestCancel } = await import("../../../../apps/api/src/jobs/cancel.js");

describe("requestCancel on a batch alias row", () => {
  beforeEach(() => {
    stubs.publishes.length = 0;
    stubs.selectRows.length = 0;
    markBatchCanceledMock.mockClear();
  });

  it("cancels the server batch the client id points at", async () => {
    stubs.selectRows.push(
      {
        type: "batch-alias",
        toolId: null,
        status: "completed",
        settings: { batchJobId: "server-batch", batchToolId: "resize" },
      },
      {
        type: "batch",
        toolId: "resize",
        status: "processing",
        settings: { flowChildCount: 2 },
      },
    );

    await expect(requestCancel("client-batch")).resolves.toBe(true);
    expect(markBatchCanceledMock).toHaveBeenCalledWith("server-batch");
    expect(stubs.publishes).toEqual(["server-batch-f0", "server-batch-f1"]);
  });

  it("reports nothing canceled when the batch it points at already finished", async () => {
    stubs.selectRows.push(
      {
        type: "batch-alias",
        toolId: null,
        status: "completed",
        settings: { batchJobId: "server-batch", batchToolId: "resize" },
      },
      {
        type: "batch",
        toolId: "resize",
        status: "completed",
        settings: { flowChildCount: 2 },
      },
    );

    await expect(requestCancel("client-batch")).resolves.toBe(false);
    expect(markBatchCanceledMock).not.toHaveBeenCalled();
    expect(stubs.publishes).toEqual([]);
  });
});
