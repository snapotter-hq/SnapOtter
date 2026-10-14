import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const thisDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(thisDir, "../../../apps/api/src/jobs/storage-reconciliation.ts"),
  "utf-8",
);

describe("storage-reconciliation module exports", () => {
  it("exports storageReconciliationJob as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/storage-reconciliation.js");
    expect(typeof mod.storageReconciliationJob).toBe("function");
  });

  it("storageReconciliationJob is the only named export", async () => {
    const mod = await import("../../../apps/api/src/jobs/storage-reconciliation.js");
    expect(Object.keys(mod)).toEqual(["storageReconciliationJob"]);
  });
});

describe("storage-reconciliation structure", () => {
  it("sums file sizes per user from userFiles without narrowing to a 32-bit int", () => {
    expect(source).toContain("schema.userFiles.userId");
    expect(source).toMatch(/sum\(\s*\$\{schema\.userFiles\.size\}/);
    expect(source).not.toContain("::int");
  });

  it("updates storageUsed on the users table", () => {
    expect(source).toContain("schema.users");
    expect(source).toContain("storageUsed");
  });

  it("groups file sizes by userId", () => {
    expect(source).toContain("groupBy(schema.userFiles.userId)");
  });

  it("corrects only users whose storageUsed differs from actual", () => {
    expect(source).toMatch(/storageUsed\}\s*!=\s*\$\{totalSize\}/);
  });

  it("zeros out users with no files but nonzero storageUsed", () => {
    expect(source).toContain("storageUsed: 0");
    expect(source).toContain("notInArray(schema.users.id, usersWithFiles)");
    expect(source).not.toMatch(/storageUsed\}\s*>\s*0/);
  });

  it("handles case where no users have files", () => {
    expect(source).toContain("// No users have files");
    expect(source.match(/storageUsed\}\s*!=\s*0/g)?.length).toBe(2);
  });

  it("coerces bigint sum string from node-postgres to Number before updating storageUsed", () => {
    expect(source).toContain("Number(row.totalSize)");
  });
});

describe("storage-reconciliation behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function setupMockedReconciliation(
    actualRows: Array<{ userId: string | null; totalSize: number | string }>,
    updateRowCounts: Array<number | undefined>,
  ) {
    vi.resetModules();
    const whereCalls: unknown[] = [];
    const setPayloads: unknown[] = [];
    let callIndex = 0;

    const groupByMock = vi.fn().mockResolvedValue(actualRows);
    const fromMock = vi.fn(() => ({ groupBy: groupByMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));

    const whereMock = vi.fn((cond: unknown) => {
      whereCalls.push(cond);
      const rowCount = updateRowCounts[callIndex++];
      return Promise.resolve({ rowCount });
    });
    const setMock = vi.fn((payload: unknown) => {
      setPayloads.push(payload);
      return { where: whereMock };
    });
    const updateMock = vi.fn(() => ({ set: setMock }));

    vi.doMock("drizzle-orm", () => ({
      and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
      eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
      notInArray: vi.fn((col: unknown, vals: unknown[]) => ({ op: "notInArray", col, vals })),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.reduce(
          (acc, str, idx) => acc + str + (idx < values.length ? String(values[idx]) : ""),
          "",
        ),
    }));

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: selectMock,
        update: updateMock,
      },
      schema: {
        userFiles: {
          userId: "userFiles.userId",
          size: "userFiles.size",
        },
        users: {
          id: "users.id",
          storageUsed: "users.storageUsed",
        },
      },
    }));

    const mod = await import("../../../apps/api/src/jobs/storage-reconciliation.js");
    return {
      storageReconciliationJob: mod.storageReconciliationJob,
      whereCalls,
      setPayloads,
    };
  }

  it("zeros fileless users with != 0 in the else branch and includes zero-outs in checked and corrected counts", async () => {
    const { storageReconciliationJob, whereCalls, setPayloads } = await setupMockedReconciliation(
      [{ userId: null, totalSize: 999 }],
      [2],
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await storageReconciliationJob();

    expect(setPayloads).toEqual([{ storageUsed: 0 }]);
    expect(whereCalls).toEqual(["users.storageUsed != 0"]);
    expect(logSpy).toHaveBeenCalledWith(
      "Storage reconciliation complete: 2 users checked, 2 corrected",
    );
  });

  it("zeros fileless users with != 0 in the notInArray branch, skips null userId in checked count, and sums per-user and zero-out corrections", async () => {
    const { storageReconciliationJob, whereCalls, setPayloads } = await setupMockedReconciliation(
      [
        { userId: null, totalSize: 100 },
        { userId: "u-1", totalSize: "500" },
        { userId: "u-2", totalSize: 1200 },
      ],
      [1, 0, 3],
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await storageReconciliationJob();

    expect(setPayloads).toEqual([{ storageUsed: 500 }, { storageUsed: 1200 }, { storageUsed: 0 }]);
    expect(whereCalls[2]).toEqual({
      op: "and",
      args: ["users.storageUsed != 0", { op: "notInArray", col: "users.id", vals: ["u-1", "u-2"] }],
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Storage reconciliation complete: 5 users checked, 4 corrected",
    );
  });

  it("treats undefined rowCount from zero-out updates as 0 corrections in both branches", async () => {
    const elseRun = await setupMockedReconciliation([], [undefined]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await elseRun.storageReconciliationJob();
    expect(logSpy).toHaveBeenCalledWith(
      "Storage reconciliation complete: 0 users checked, 0 corrected",
    );

    logSpy.mockClear();
    const notInArrayRun = await setupMockedReconciliation(
      [{ userId: "u-1", totalSize: 400 }],
      [0, undefined],
    );
    await notInArrayRun.storageReconciliationJob();
    expect(logSpy).toHaveBeenCalledWith(
      "Storage reconciliation complete: 1 users checked, 0 corrected",
    );
  });
});
