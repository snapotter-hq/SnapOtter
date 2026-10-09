import { PASSWORD_MAX_LENGTH } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A DEFAULT_PASSWORD that browsers cannot type creates an admin nobody can sign
// in as (#2085). The check lives in ensureDefaultAdmin, after its "users already
// exist" return, so an established install with a stale value keeps booting.
const store = vi.hoisted(() => ({
  users: [] as unknown[],
  values: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () =>
        Object.assign(Promise.resolve(store.users), {
          where: () => Promise.resolve([]),
        }),
    }),
    insert: () => ({
      values: (row: unknown) => {
        store.values(row);
        return { onConflictDoNothing: async () => ({ rowCount: 1 }) };
      },
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { users: {}, teams: { id: {}, name: {} }, DEFAULT_TEAM_ID: "default-team" },
}));

import { env } from "../../../apps/api/src/config.js";
import { ensureDefaultAdmin } from "../../../apps/api/src/plugins/auth.js";

const originalPassword = env.DEFAULT_PASSWORD;

beforeEach(() => {
  store.users = [];
  store.values.mockClear();
  env.DEFAULT_PASSWORD = originalPassword;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("ensureDefaultAdmin", () => {
  it.each([
    ["a trailing newline", "hunter2\n"],
    ["a carriage return", "hunter2\r"],
    ["a tab", "hunter\t2"],
    ["DEL", "hunter2\u007f"],
  ])("refuses to create the admin when DEFAULT_PASSWORD has %s", async (_label, password) => {
    env.DEFAULT_PASSWORD = password;

    await expect(ensureDefaultAdmin()).rejects.toThrow(
      "DEFAULT_PASSWORD must not contain control characters",
    );
    expect(store.values).not.toHaveBeenCalled();
  });

  it("refuses to create the admin when DEFAULT_PASSWORD is longer than login accepts (#2307)", async () => {
    env.DEFAULT_PASSWORD = "a".repeat(PASSWORD_MAX_LENGTH + 1);

    await expect(ensureDefaultAdmin()).rejects.toThrow(
      `DEFAULT_PASSWORD must be at most ${PASSWORD_MAX_LENGTH} characters`,
    );
    expect(store.values).not.toHaveBeenCalled();
  });

  it("refuses to create the admin when DEFAULT_PASSWORD is empty (#2307)", async () => {
    env.DEFAULT_PASSWORD = "";

    await expect(ensureDefaultAdmin()).rejects.toThrow("DEFAULT_PASSWORD must not be empty");
    expect(store.values).not.toHaveBeenCalled();
  });

  it("counts characters in UTF-16 units like the login schema, so 513 emoji are over the limit", async () => {
    env.DEFAULT_PASSWORD = "\u{1F600}".repeat(PASSWORD_MAX_LENGTH / 2 + 1);

    await expect(ensureDefaultAdmin()).rejects.toThrow("DEFAULT_PASSWORD must be at most");
  });

  it("creates the admin for a DEFAULT_PASSWORD of exactly the longest length login accepts", async () => {
    env.DEFAULT_PASSWORD = "a".repeat(PASSWORD_MAX_LENGTH);

    await ensureDefaultAdmin();

    expect(store.values).toHaveBeenCalledTimes(1);
  });

  it("creates the admin for a password with no control characters", async () => {
    env.DEFAULT_PASSWORD = "pässwörd with spaces-密码";

    await ensureDefaultAdmin();

    expect(store.values).toHaveBeenCalledTimes(1);
  });

  it("leaves an established install alone, whatever DEFAULT_PASSWORD holds", async () => {
    store.users = [{ id: "existing-admin" }];
    env.DEFAULT_PASSWORD = `stale-value\n${"a".repeat(PASSWORD_MAX_LENGTH)}`;

    await expect(ensureDefaultAdmin()).resolves.toBeUndefined();
    expect(store.values).not.toHaveBeenCalled();
  });
});
