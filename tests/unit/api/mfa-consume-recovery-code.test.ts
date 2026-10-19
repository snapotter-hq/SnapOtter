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
  schema: { users: { id: {}, recoveryCodesHash: {}, totpSecret: {} } },
}));

import { env } from "../../../apps/api/src/config.js";
import { decrypt, encrypt } from "../../../apps/api/src/lib/encryption.js";
import {
  consumeRecoveryCode,
  decryptSecret,
  hashRecoveryCodes,
} from "../../../apps/api/src/plugins/mfa.js";

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

describe("decryptSecret (#2033)", () => {
  const KEY_A = "a".repeat(64);
  const KEY_B = "b".repeat(64);
  const SECRET = "JBSWY3DPEHPK3PXP";
  const originalKey = env.DATA_ENCRYPTION_KEY;
  const originalPrev = env.DATA_ENCRYPTION_KEY_PREVIOUS;

  beforeEach(() => {
    env.DATA_ENCRYPTION_KEY = originalKey;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = originalPrev;
  });

  it("decrypts with DATA_ENCRYPTION_KEY without writing back to the database", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    const stored = await encrypt(SECRET, KEY_B);

    await expect(decryptSecret("u1", stored)).resolves.toBe(SECRET);
    expect(db.updates).toHaveLength(0);
  });

  it("re-encrypts with DATA_ENCRYPTION_KEY and persists when opened via DATA_ENCRYPTION_KEY_PREVIOUS", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    const stored = await encrypt(SECRET, KEY_A);

    await expect(decryptSecret("u1", stored)).resolves.toBe(SECRET);
    expect(db.updates).toHaveLength(1);
    const reencrypted = db.updates[0].set.totpSecret as string;
    expect(await decrypt(reencrypted, KEY_B)).toBe(SECRET);
    expect(await decrypt(reencrypted, KEY_A)).toBeNull();
  });

  it("returns null and does not write when neither key can decrypt the secret", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = "c".repeat(64);
    const stored = await encrypt(SECRET, KEY_A);

    await expect(decryptSecret("u1", stored)).resolves.toBeNull();
    expect(db.updates).toHaveLength(0);
  });

  it("returns null without writing when DATA_ENCRYPTION_KEY_PREVIOUS is unset and current key fails", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
    const stored = await encrypt(SECRET, KEY_A);

    await expect(decryptSecret("u1", stored)).resolves.toBeNull();
    expect(db.updates).toHaveLength(0);
  });

  it("returns null without writing when DATA_ENCRYPTION_KEY is unset for an encrypted secret", async () => {
    env.DATA_ENCRYPTION_KEY = "";
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    const stored = await encrypt(SECRET, KEY_A);

    await expect(decryptSecret("u1", stored)).resolves.toBeNull();
    expect(db.updates).toHaveLength(0);
  });

  it("passes plaintext secrets through without writing", async () => {
    env.DATA_ENCRYPTION_KEY = KEY_B;
    env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;

    await expect(decryptSecret("u1", SECRET)).resolves.toBe(SECRET);
    expect(db.updates).toHaveLength(0);
  });
});
