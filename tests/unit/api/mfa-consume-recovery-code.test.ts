import { beforeEach, describe, expect, it, vi } from "vitest";

// consumeRecoveryCode spends a recovery code with a write that is conditional
// on the list it read (#2275). The database is a double here so each way a
// race can go is exercised directly: the integration test can only hope two
// requests interleave.
const db = vi.hoisted(() => ({
  updateResults: [] as { id: string }[][],
  selectResults: [] as { recoveryCodesHash: string | null }[][],
  updates: [] as { set: Record<string, unknown> }[],
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    update: () => ({
      set: (set: Record<string, unknown>) => {
        db.updates.push({ set });
        return {
          where: () => ({ returning: async () => db.updateResults.shift() ?? [] }),
        };
      },
    }),
    select: () => ({
      from: () => ({ where: async () => db.selectResults.shift() ?? [] }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { users: { id: {}, recoveryCodesHash: {} } },
}));

import { consumeRecoveryCode, hashRecoveryCodes } from "../../../apps/api/src/plugins/mfa.js";

const CODES = ["aaaa1111", "bbbb2222", "cccc3333"];
const list = (codes: string[]) => hashRecoveryCodes(codes);

beforeEach(() => {
  db.updateResults = [];
  db.selectResults = [];
  db.updates = [];
});

describe("consumeRecoveryCode", () => {
  it("spends the code when its conditional write lands", async () => {
    db.updateResults = [[{ id: "u1" }]];

    await expect(consumeRecoveryCode("u1", "bbbb2222", list(CODES))).resolves.toBe("consumed");

    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].set.recoveryCodesHash).toBe(list(["aaaa1111", "cccc3333"]));
  });

  it("writes null when the last code is spent", async () => {
    db.updateResults = [[{ id: "u1" }]];

    await consumeRecoveryCode("u1", "aaaa1111", list(["aaaa1111"]));

    expect(db.updates[0].set.recoveryCodesHash).toBeNull();
  });

  it("says invalid, and writes nothing, for a code that isn't in the list", async () => {
    await expect(consumeRecoveryCode("u1", "zzzz9999", list(CODES))).resolves.toBe("invalid");

    expect(db.updates).toHaveLength(0);
  });

  it("retries on the list another login just wrote, and still spends its own code", async () => {
    // Someone spent aaaa1111 first, so our conditional write finds nothing.
    db.updateResults = [[], [{ id: "u1" }]];
    db.selectResults = [[{ recoveryCodesHash: list(["bbbb2222", "cccc3333"]) }]];

    await expect(consumeRecoveryCode("u1", "bbbb2222", list(CODES))).resolves.toBe("consumed");

    expect(db.updates).toHaveLength(2);
    expect(db.updates[1].set.recoveryCodesHash).toBe(list(["cccc3333"]));
  });

  it("reports a concurrent spend when the same code is gone on the re-read", async () => {
    db.updateResults = [[]];
    db.selectResults = [[{ recoveryCodesHash: list(["aaaa1111", "cccc3333"]) }]];

    await expect(consumeRecoveryCode("u1", "bbbb2222", list(CODES))).resolves.toBe(
      "spent_concurrently",
    );
  });

  it("reports a concurrent spend when the whole list was cleared meanwhile", async () => {
    db.updateResults = [[]];
    db.selectResults = [[{ recoveryCodesHash: null }]];

    await expect(consumeRecoveryCode("u1", "bbbb2222", list(CODES))).resolves.toBe(
      "spent_concurrently",
    );
  });

  it("keeps trying as long as the code is still in the list, up to one round per hash", async () => {
    // Two other logins win in turn; the third round is ours.
    db.updateResults = [[], [], [{ id: "u1" }]];
    db.selectResults = [
      [{ recoveryCodesHash: list(["bbbb2222", "cccc3333"]) }],
      [{ recoveryCodesHash: list(["bbbb2222"]) }],
    ];

    await expect(consumeRecoveryCode("u1", "bbbb2222", list(CODES))).resolves.toBe("consumed");
  });
});
