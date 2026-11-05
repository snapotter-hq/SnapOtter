import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ rows: new Map<string, string>() }));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async (pred: { val: string }) => {
          const value = store.rows.get(pred.val);
          return value === undefined ? [] : [{ key: pred.val, value }];
        },
      }),
    }),
    insert: () => ({
      values: async (row: { key: string; value: string }) => {
        store.rows.set(row.key, row.value);
      },
    }),
  },
  schema: { settings: { key: "settings.key", value: "settings.value" } },
}));

import { ensureInstanceId } from "../../../apps/api/src/lib/instance-id.js";

const SEED_ID = "3f2c1a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  store.rows.clear();
});

describe("ensureInstanceId", () => {
  it("keeps an existing id, whatever the seed says", async () => {
    store.rows.set("instance_id", "existing-id");
    expect(await ensureInstanceId(SEED_ID)).toBe("existing-id");
    expect(store.rows.get("instance_id")).toBe("existing-id");
  });

  it("adopts the seed on first boot, so events sent before it share the id", async () => {
    expect(await ensureInstanceId(SEED_ID)).toBe(SEED_ID);
    expect(store.rows.get("instance_id")).toBe(SEED_ID);
  });

  it("creates a random v4 id when no seed is given", async () => {
    const id = await ensureInstanceId("");
    expect(id).toMatch(UUID_V4);
    expect(store.rows.get("instance_id")).toBe(id);
  });
});
