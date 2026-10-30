import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deletePrefix: vi.fn(),
  rows: [] as Array<unknown[]>,
}));

vi.mock("../../../../apps/api/src/lib/object-storage.js", () => ({
  deletePrefix: mocks.deletePrefix,
}));
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          const next = mocks.rows.shift();
          if (!next) throw new Error("db down");
          return next;
        }),
      })),
    })),
  },
  schema: {
    users: { id: "users.id", legalHold: "users.legalHold", team: "users.team" },
    teams: { id: "teams.id", legalHold: "teams.legalHold" },
  },
}));

const { batchChildDirs, reclaimBatchChildStorage } = await import(
  "../../../../apps/api/src/jobs/batch-reclaim.js"
);

const dirs = ["b-f0", "b-f1"];

beforeEach(() => {
  mocks.deletePrefix.mockReset().mockResolvedValue(undefined);
  mocks.rows = [];
});

describe("reclaimBatchChildStorage (#1241)", () => {
  it("deletes uploads and outputs for every dir when no user is involved", async () => {
    await reclaimBatchChildStorage({ parentId: "b", userId: null, dirs });
    expect(mocks.deletePrefix.mock.calls.map(([p]) => p)).toEqual([
      "uploads/b-f0",
      "outputs/b-f0",
      "uploads/b-f1",
      "outputs/b-f1",
    ]);
  });

  it("deletes when neither the user nor their team is held", async () => {
    mocks.rows = [[{ legalHold: false, team: "t1" }], [{ legalHold: false }]];
    await reclaimBatchChildStorage({ parentId: "b", userId: "u1", dirs });
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(4);
  });

  it("keeps everything when the user is under legal hold", async () => {
    mocks.rows = [[{ legalHold: true, team: "t1" }]];
    await reclaimBatchChildStorage({ parentId: "b", userId: "u1", dirs });
    expect(mocks.deletePrefix).not.toHaveBeenCalled();
  });

  it("keeps everything when the user's team is under legal hold", async () => {
    mocks.rows = [[{ legalHold: false, team: "t1" }], [{ legalHold: true }]];
    await reclaimBatchChildStorage({ parentId: "b", userId: "u1", dirs });
    expect(mocks.deletePrefix).not.toHaveBeenCalled();
  });

  it("keeps everything when the hold lookup fails", async () => {
    await reclaimBatchChildStorage({ parentId: "b", userId: "u1", dirs });
    expect(mocks.deletePrefix).not.toHaveBeenCalled();
  });

  it("runs deletes in parallel, capped, so a large batch isn't a long serial walk (#4184)", async () => {
    let inFlight = 0;
    let peak = 0;
    mocks.deletePrefix.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    const many = Array.from({ length: 40 }, (_, i) => `b-f${i}`);
    await reclaimBatchChildStorage({ parentId: "b", userId: null, dirs: many });
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(80);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("keeps going past a failed delete", async () => {
    mocks.deletePrefix.mockRejectedValueOnce(new Error("EBUSY"));
    await reclaimBatchChildStorage({ parentId: "b", userId: null, dirs });
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(4);
  });
});

describe("batchChildDirs", () => {
  it("covers flow children, steps, and dirs named by keys, ignoring foreign dirs", () => {
    const out = batchChildDirs("b.1", 1, 2, [
      "outputs/b.1-f0-s5/x.png",
      "outputs/b.1/batch.zip",
      "outputs/other-f0/y.png",
      undefined,
    ]);
    expect(out.sort()).toEqual(["b.1-f0", "b.1-f0-s0", "b.1-f0-s1", "b.1-f0-s5"]);
  });
});
