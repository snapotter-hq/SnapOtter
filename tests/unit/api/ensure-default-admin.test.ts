import { readFileSync } from "node:fs";
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
const originalUsername = env.DEFAULT_USERNAME;

beforeEach(() => {
  store.users = [];
  store.values.mockClear();
  env.DEFAULT_PASSWORD = originalPassword;
  env.DEFAULT_USERNAME = originalUsername;
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

  it("refuses to create the admin when DEFAULT_PASSWORD has too many code units (over 4096)", async () => {
    env.DEFAULT_PASSWORD = "a".repeat(4097);

    await expect(ensureDefaultAdmin()).rejects.toThrow(
      "DEFAULT_PASSWORD must be at most 4096 characters; sign-in refuses a longer password",
    );
    expect(store.values).not.toHaveBeenCalled();
  });

  it("refuses to create the admin when DEFAULT_USERNAME fails login validation (#2330)", async () => {
    env.DEFAULT_USERNAME = "a".repeat(256);
    await expect(ensureDefaultAdmin()).rejects.toThrow(
      "Username must be between 3 and 50 characters",
    );
    expect(store.values).not.toHaveBeenCalled();
  });

  it("refuses to create the admin when DEFAULT_USERNAME has invalid characters (#2330)", async () => {
    env.DEFAULT_USERNAME = "admin\n";
    await expect(ensureDefaultAdmin()).rejects.toThrow(
      "Username can only contain letters, numbers, dots, hyphens, and underscores",
    );
    expect(store.values).not.toHaveBeenCalled();
  });

  it("counts characters in code points like the login schema, so 513 emoji are within the limit", async () => {
    env.DEFAULT_PASSWORD = "\u{1F600}".repeat(PASSWORD_MAX_LENGTH / 2 + 1);

    await ensureDefaultAdmin();

    expect(store.values).toHaveBeenCalledTimes(1);
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

describe("API startup (#2333)", () => {
  it("catches a rejected default-user check, prints a FATAL line, and exits 1", () => {
    // index.ts boots the full service on import, so pin the startup try/catch
    // around ensureDefaultAdmin / ensureAnonymousUser in the entry point's source.
    const source = readFileSync(new URL("../../../apps/api/src/index.ts", import.meta.url), "utf8");
    const start = source.indexOf("await ensureDefaultTeam();");
    const end = source.indexOf("async function ensureInstanceId()", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toMatch(
      /try\s*\{\s*if\s*\(env\.AUTH_ENABLED\)\s*\{\s*await ensureDefaultAdmin\(\);\s*\}\s*else\s*\{\s*await ensureAnonymousUser\(\);\s*\}\s*\}\s*catch\s*\(err\)\s*\{\s*console\.error\(`FATAL: \$\{\(err as Error\)\.message\}`\);\s*console\.error\(err\);\s*process\.exit\(1\);\s*\}/,
    );
  });
});
