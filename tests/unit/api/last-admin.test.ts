import { describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    and: (...conds: unknown[]) => ({ op: "and", conds }),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: {
    users: { id: "users.id", role: "users.role" },
  },
}));

import { assertNotLastAdmin, LastAdminError } from "../../../apps/api/src/lib/last-admin.js";

interface Row {
  id: string;
  role: string;
}

function matches(row: Row, pred: unknown): boolean {
  const p = pred as { op?: string; col?: string; val?: string; conds?: unknown[] };
  if (!p) return true;
  if (p.op === "and") return (p.conds ?? []).every((c) => matches(row, c));
  if (p.op === "eq") {
    const val = p.col === "users.id" ? row.id : row.role;
    return val === p.val;
  }
  if (p.op === "ne") {
    const val = p.col === "users.id" ? row.id : row.role;
    return val !== p.val;
  }
  return true;
}

function makeTx(rows: Row[]) {
  return {
    execute: vi.fn(async () => undefined),
    select: (shape: Record<string, unknown>) => ({
      from: () => ({
        where: async (pred: unknown) => {
          const matched = rows.filter((r) => matches(r, pred));
          if ("count" in shape) return [{ count: matched.length }];
          return matched.map((r) => ({ role: r.role }));
        },
      }),
    }),
  };
}

describe("assertNotLastAdmin (#2459)", () => {
  it("refuses to remove the sole real admin when the passwordless anonymous row is present", async () => {
    const tx = makeTx([
      { id: "anonymous", role: "admin" },
      { id: "admin-1", role: "admin" },
    ]);

    await expect(assertNotLastAdmin(tx as never, "admin-1")).rejects.toThrow(LastAdminError);
  });

  it("allows removing a real admin when a second real admin exists alongside anonymous", async () => {
    const tx = makeTx([
      { id: "anonymous", role: "admin" },
      { id: "admin-1", role: "admin" },
      { id: "admin-2", role: "admin" },
    ]);

    await expect(assertNotLastAdmin(tx as never, "admin-1")).resolves.toBeUndefined();
  });

  it("allows removing the synthetic anonymous row when a real admin exists", async () => {
    const tx = makeTx([
      { id: "anonymous", role: "admin" },
      { id: "admin-1", role: "admin" },
    ]);

    await expect(assertNotLastAdmin(tx as never, "anonymous")).resolves.toBeUndefined();
  });
});
