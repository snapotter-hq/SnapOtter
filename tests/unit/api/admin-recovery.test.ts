import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Array<{
    id: string;
    username: string;
    role: string;
    team: string;
    passwordHash: string | null;
    mustChangePassword: boolean;
    totpEnabled: boolean;
    totpSecret: string | null;
    recoveryCodesHash: string | null;
  }>,
  teams: [{ id: "default-team-00000000", name: "Default" }] as Array<{
    id: string;
    name: string;
  }>,
  settings: new Map<string, string>(),
  settingsFault: null as Error | null,
  auditEvents: [] as Array<{ event: string; details: Record<string, unknown> }>,
  deletedSessionsFor: [] as string[],
  deletedApiKeysFor: [] as string[],
  redisStatus: "ready",
  redisDel: vi.fn<(key: string) => Promise<number>>(async () => 0),
  insertConflict: false,
}));

vi.mock("../../../apps/api/src/db/index.js", () => {
  const schema = {
    DEFAULT_TEAM_ID: "default-team-00000000",
    users: {
      __table: "users",
      id: { name: "id" },
      username: { name: "username" },
      role: { name: "role" },
      passwordHash: { name: "passwordHash" },
      totpEnabled: { name: "totpEnabled" },
    },
    teams: {
      __table: "teams",
      id: { name: "id" },
      name: { name: "name" },
    },
    sessions: {
      __table: "sessions",
      userId: { name: "userId" },
    },
    apiKeys: {
      __table: "apiKeys",
      userId: { name: "userId" },
    },
    roles: {
      __table: "roles",
      id: { name: "id" },
      name: { name: "name" },
    },
    settings: {
      __table: "settings",
      key: { name: "key" },
      value: { name: "value" },
    },
  };

  function matchPred(
    row: Record<string, unknown>,
    pred: { col?: string; val?: unknown } | undefined,
  ): boolean {
    if (!pred?.col) return true;
    return row[pred.col] === pred.val;
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock DB runner
  const makeRunner = (): any => ({
    select: (projection?: Record<string, unknown>) => ({
      from: (table: { __table?: string }) => {
        const rows =
          table.__table === "users" ? state.users : table.__table === "teams" ? state.teams : [];
        const project = (list: Record<string, unknown>[]) => {
          if (!projection) return list;
          return list.map((r) => {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(projection)) {
              out[k] = r[k];
            }
            return out;
          });
        };
        const basePromise = Promise.resolve(project(rows as Record<string, unknown>[]));
        return Object.assign(basePromise, {
          where: (pred?: { col?: string; val?: unknown }) => {
            const filtered = project(
              (rows as Record<string, unknown>[]).filter((r) => matchPred(r, pred)),
            );
            return Object.assign(Promise.resolve(filtered), {
              for: () => Promise.resolve(filtered),
            });
          },
        });
      },
    }),
    insert: (table: { __table?: string }) => ({
      values: (row: Record<string, unknown>) => {
        const applyInsert = () => {
          if (table.__table === "users") {
            if (
              state.insertConflict ||
              state.users.some((u) => u.username === row.username || u.id === row.id)
            ) {
              return { rowCount: 0 };
            }
            state.users.push({
              id: String(row.id),
              username: String(row.username),
              role: String(row.role ?? "user"),
              team: String(row.team ?? "default-team-00000000"),
              passwordHash: (row.passwordHash as string | null) ?? null,
              mustChangePassword: Boolean(row.mustChangePassword ?? true),
              totpEnabled: Boolean(row.totpEnabled ?? false),
              totpSecret: (row.totpSecret as string | null) ?? null,
              recoveryCodesHash: (row.recoveryCodesHash as string | null) ?? null,
            });
            return { rowCount: 1 };
          }
          return { rowCount: 1 };
        };
        return Object.assign(
          Promise.resolve().then(() => applyInsert()),
          {
            onConflictDoNothing: async () => applyInsert(),
          },
        );
      },
    }),
    update: (table: { __table?: string }) => ({
      set: (updates: Record<string, unknown>) => ({
        where: async (pred?: { col?: string; val?: unknown }) => {
          if (table.__table === "users") {
            for (const u of state.users) {
              if (matchPred(u as unknown as Record<string, unknown>, pred)) {
                Object.assign(u, updates);
              }
            }
          }
        },
      }),
    }),
    delete: (table: { __table?: string }) => ({
      where: async (pred?: { col?: string; val?: unknown }) => {
        if (table.__table === "sessions" && pred?.val) {
          state.deletedSessionsFor.push(String(pred.val));
        }
        if (table.__table === "apiKeys" && pred?.val) {
          state.deletedApiKeysFor.push(String(pred.val));
        }
      },
    }),
    transaction: async <T>(fn: (tx: ReturnType<typeof makeRunner>) => Promise<T>): Promise<T> =>
      fn(makeRunner()),
  });

  return {
    db: makeRunner(),
    pool: {},
    closeDb: async () => {},
    schema,
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: { name?: string }, val: unknown) => ({ col: col?.name, val }),
  };
});

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => ({
    status: state.redisStatus,
    del: (key: string) => state.redisDel(key),
    once: () => {},
    off: () => {},
  }),
  closeRedis: async () => {},
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: async (_logger: unknown, event: string, details: Record<string, unknown>) => {
    state.auditEvents.push({ event, details });
  },
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>();
  return {
    ...actual,
    getSettingStrict: async (key: string) => {
      if (state.settingsFault) throw state.settingsFault;
      return state.settings.get(key);
    },
    upsertSetting: async (key: string, value: string) => {
      state.settings.set(key, value);
    },
  };
});

import {
  createAdminUser,
  generateRecoveryPassword,
  resetUserPassword,
  runRecoveryCli,
  unlockUser,
} from "../../../apps/api/src/scripts/admin-recovery.js";

beforeEach(() => {
  state.users = [];
  state.teams = [{ id: "default-team-00000000", name: "Default" }];
  state.settings.clear();
  state.settingsFault = null;
  state.auditEvents = [];
  state.deletedSessionsFor = [];
  state.deletedApiKeysFor = [];
  state.insertConflict = false;
  state.redisStatus = "ready";
  state.redisDel.mockReset();
  state.redisDel.mockResolvedValue(0);
});

describe("generateRecoveryPassword (#812)", () => {
  it("generates at least 20 characters satisfying uppercase, lowercase, digit, and special rules", async () => {
    const pw = await generateRecoveryPassword();
    expect(pw.length).toBeGreaterThanOrEqual(20);
    expect(/\p{Lu}/u.test(pw)).toBe(true);
    expect(/\p{Ll}/u.test(pw)).toBe(true);
    expect(/\p{Nd}/u.test(pw)).toBe(true);
    expect(/[\p{P}\p{S}\p{Zs}]/u.test(pw)).toBe(true);
  });

  it("sizes the generated password up when passwordMinLength exceeds 20", async () => {
    state.settings.set("passwordMinLength", "32");
    const pw = await generateRecoveryPassword();
    expect(pw.length).toBe(32);
  });

  it("propagates a database fault reading passwordMinLength instead of silently falling back", async () => {
    state.settingsFault = new Error("settings table unreachable");
    await expect(generateRecoveryPassword()).rejects.toThrow("settings table unreachable");
  });
});

describe("resetUserPassword unit cases (#812)", () => {
  it("still resets the password in Postgres and logs a plain warning if clearing the Redis throttle fails", async () => {
    state.users.push({
      id: "u1",
      username: "admin",
      role: "admin",
      team: "default-team-00000000",
      passwordHash: "old:hash",
      mustChangePassword: false,
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
    state.redisStatus = "reconnecting";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await resetUserPassword("admin", "StrongPass1");
      expect(res).toEqual({ status: "reset", generatedPassword: undefined });
      expect(state.users[0].passwordHash).not.toBe("old:hash");
      expect(state.users[0].mustChangePassword).toBe(true);
      expect(state.deletedSessionsFor).toEqual(["u1"]);
      expect(state.deletedApiKeysFor).toEqual(["u1"]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("clearing the Redis login-throttle key failed"),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("[audit]"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("warns when resetting the password of a disabled user", async () => {
    state.users.push({
      id: "u_disabled",
      username: "locked_admin",
      role: "disabled:admin",
      team: "default-team-00000000",
      passwordHash: "old:hash",
      mustChangePassword: false,
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await resetUserPassword("locked_admin", "StrongPass1");
      expect(res.status).toBe("reset");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("currently disabled (disabled:admin)"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("createAdminUser unit cases (#812)", () => {
  it("returns already-exists if a concurrent insert wins before our insert", async () => {
    state.insertConflict = true;
    const res = await createAdminUser("raceadmin", "StrongPass1");
    expect(res).toEqual({ status: "already-exists", username: "raceadmin" });
    expect(state.auditEvents).toHaveLength(0);
  });
});

describe("unlockUser unit cases (#812)", () => {
  it("restores legacy bare 'disabled' role to 'user'", async () => {
    state.users.push({
      id: "u2",
      username: "legacy_user",
      role: "disabled",
      team: "default-team-00000000",
      passwordHash: "salt:hash",
      mustChangePassword: false,
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });

    const res = await unlockUser("legacy_user");
    expect(res).toBe("unlocked");
    expect(state.users[0].role).toBe("user");
  });

  it("still records USER_UPDATED and returns unlocked when a disabled user is re-enabled while Redis is down", async () => {
    state.users.push({
      id: "u_dis_redis",
      username: "disabled_admin",
      role: "disabled:admin",
      team: "default-team-00000000",
      passwordHash: null,
      mustChangePassword: false,
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
    state.redisStatus = "reconnecting";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await unlockUser("disabled_admin");
      expect(res).toBe("unlocked");
      expect(state.users[0].role).toBe("admin");
      expect(state.auditEvents).toEqual([
        {
          event: "USER_UPDATED",
          details: {
            targetUserId: "u_dis_redis",
            targetUsername: "disabled_admin",
            changes: { role: "admin" },
            via: "cli",
          },
        },
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("clearing the Redis login-throttle key failed"),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("has no local password set"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("propagates a Redis failure instead of falsely reporting already-clear when user is not disabled", async () => {
    state.users.push({
      id: "u3",
      username: "throttled_admin",
      role: "admin",
      team: "default-team-00000000",
      passwordHash: "salt:hash",
      mustChangePassword: false,
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
    state.redisDel.mockRejectedValueOnce(new Error("redis down"));

    await expect(unlockUser("throttled_admin")).rejects.toThrow("redis down");
  });
});

describe("runRecoveryCli usage, help, and argument validation (#812)", () => {
  it("lists reset-password, create-admin, and unlock-user in help output and handles --help on subcommands", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["help"])).toBe(0);
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("reset-password");
      expect(output).toContain("create-admin");
      expect(output).toContain("unlock-user");

      expect(await runRecoveryCli(["create-admin", "--help"])).toBe(0);
      expect(await runRecoveryCli(["reset-password", "-h"])).toBe(0);
      expect(state.users).toHaveLength(0);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects unknown flags and excess positional arguments across subcommands", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["status", "extra"])).toBe(1);
      expect(await runRecoveryCli(["reset-mfa-policy", "extra"])).toBe(1);
      expect(await runRecoveryCli(["disable-mfa", "--flag"])).toBe(1);
      expect(await runRecoveryCli(["disable-mfa", "admin", "extra"])).toBe(1);
      expect(await runRecoveryCli(["reset-password", "--flag"])).toBe(1);
      expect(await runRecoveryCli(["reset-password", "admin", "Pass1", "extra"])).toBe(1);
      expect(await runRecoveryCli(["create-admin", "--username", "admin"])).toBe(1);
      expect(await runRecoveryCli(["create-admin", "admin", "Pass1", "extra"])).toBe(1);
      expect(await runRecoveryCli(["unlock-user", "--flag"])).toBe(1);
      expect(await runRecoveryCli(["unlock-user", "admin", "extra"])).toBe(1);
      expect(state.users).toHaveLength(0);
    } finally {
      errSpy.mockRestore();
    }
  });
});
