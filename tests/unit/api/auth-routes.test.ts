/**
 * Unit tests for auth route helper functions and validation logic.
 *
 * Tests getAuthUser, requireAuth, requireAdmin, validatePasswordStrength and
 * validateUsername (the real exports of apps/api/src/plugins/auth.ts, #1570, #2039),
 * plus isPublicRoute, which is reproduced here.
 */
import { PASSWORD_MAX_LENGTH } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMockState = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertRowCount: 1,
}));

// Mock DB to avoid SQLite connection
vi.mock("../../../apps/api/src/db/index.js", () => {
  const makeSelect = () => ({
    from: () => ({
      where: () => {
        const rows = dbMockState.selectQueue.shift() ?? [];
        const res = Promise.resolve(rows);
        return Object.assign(res, {
          get: () => rows[0] ?? null,
          all: () => rows,
          for: () => Promise.resolve(rows),
        });
      },
      all: () => [],
    }),
  });
  const dbObj = {
    select: makeSelect,
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve({ rowCount: dbMockState.insertRowCount }),
        run: vi.fn(),
      }),
    }),
    delete: () => ({ where: () => Promise.resolve({ run: vi.fn() }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve({ run: vi.fn() }) }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return {
    db: dbObj,
    pool: {},
    closeDb: async () => {},
    schema: {
      users: { id: {}, username: {}, role: {}, passwordHash: {} },
      sessions: { id: {}, userId: {} },
      settings: { key: {} },
      apiKeys: { id: {}, userId: {}, keyPrefix: {} },
      teams: { id: {}, name: {} },
      roles: { id: {}, name: {} },
      userFiles: { id: {}, storedName: {}, userId: {} },
      auditLog: {},
    },
  };
});

vi.mock("../../../apps/api/src/lib/user-limit.js", () => ({
  userLimitReached: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("../../../apps/api/src/lib/last-admin.js", () => ({
  assertNotLastAdmin: vi.fn(() => Promise.resolve()),
  LastAdminError: class LastAdminError extends Error {},
}));

vi.mock("../../../apps/api/src/lib/library-cleanup.js", () => ({
  deleteLibraryFileStorage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/lib/user-mfa.js", () => ({
  clearUserMfa: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
  isEnterpriseFeatureEnabled: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    AUTH_ENABLED: true,
    DEFAULT_USERNAME: "admin",
    DEFAULT_PASSWORD: "Adminpass1",
    SKIP_MUST_CHANGE_PASSWORD: false,
    SESSION_DURATION_HOURS: 168,
    RATE_LIMIT_PER_MIN: 10000,
    LOGIN_ATTEMPT_LIMIT: 500,
    MAX_USERS: 50,
  },
}));

const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: {
    warn: loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// The password policy reads its settings through these helpers; a map stands in
// for the settings table so the defaults and a changed policy can both be tried.
const policy = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failKey: null as string | null,
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>();
  return {
    ...actual,
    getSettingString: async (key: string, fallback = "") => policy.values.get(key) ?? fallback,
    getSettingNumber: async (key: string, fallback = 0) =>
      actual.parseNumericSettingValue(key, policy.values.get(key), fallback),
    getSettingStrict: async (key: string) => {
      if (policy.failKey === key) {
        throw new Error(`simulated DB failure reading ${key}`);
      }
      return policy.values.get(key);
    },
    setSettingIfAbsent: async () => {},
    upsertSetting: async () => {},
  };
});

const auditFn = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const auditLogSpy = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: auditLogSpy,
  auditFromRequest: () => auditFn,
  sanitizeAuditInput: (raw: string) => raw,
}));

import {
  authRoutes,
  computeKeyPrefix,
  getAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  validatePasswordStrength,
  validateUsername,
  verifyPassword,
} from "../../../apps/api/src/plugins/auth.js";
import { registerMfa } from "../../../apps/api/src/plugins/mfa.js";
import { registerScimRoutes } from "../../../apps/api/src/routes/enterprise/scim.js";

beforeEach(() => {
  policy.values.clear();
  policy.failKey = null;
  loggerWarn.mockReset();
  auditFn.mockClear();
  auditLogSpy.mockClear();
  dbMockState.selectQueue = [];
  dbMockState.insertRowCount = 1;
});

// ── getAuthUser ─────────────────────────────────────────────────────────

describe("getAuthUser", () => {
  it("returns null when request has no user property", () => {
    const req = {} as never;
    expect(getAuthUser(req)).toBeNull();
  });

  it("returns the user when request has user property", () => {
    const user = { id: "u1", username: "alice", role: "admin" };
    const req = { user } as never;
    expect(getAuthUser(req)).toEqual(user);
  });

  it("returns null when user is undefined", () => {
    const req = { user: undefined } as never;
    expect(getAuthUser(req)).toBeNull();
  });
});

// ── requireAuth ─────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("returns the user when authenticated", () => {
    const user = { id: "u1", username: "alice", role: "editor" };
    const req = { user } as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAuth(req, reply);
    expect(result).toEqual(user);
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).not.toHaveBeenCalled();
  });

  it("returns null and sends 401 when not authenticated", () => {
    const req = {} as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAuth(req, reply);
    expect(result).toBeNull();
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((reply as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Authentication required" }),
    );
  });
});

// ── requireAdmin ────────────────────────────────────────────────────────

describe("requireAdmin", () => {
  it("returns the user when role is admin", () => {
    const user = { id: "u1", username: "boss", role: "admin" };
    const req = { user } as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAdmin(req, reply);
    expect(result).toEqual(user);
  });

  it("returns null and sends 403 when role is not admin", () => {
    const user = { id: "u2", username: "worker", role: "user" };
    const req = { user } as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAdmin(req, reply);
    expect(result).toBeNull();
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(403);
    expect((reply as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Admin access required" }),
    );
  });

  it("returns null and sends 401 when not authenticated at all", () => {
    const req = {} as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAdmin(req, reply);
    expect(result).toBeNull();
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
  });

  it("returns null for editor role", () => {
    const user = { id: "u3", username: "editor", role: "editor" };
    const req = { user } as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = requireAdmin(req, reply);
    expect(result).toBeNull();
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(403);
  });
});

// ── Password hashing (deeper coverage) ─────────────────────────────────

describe("hashPassword (additional coverage)", () => {
  it("handles empty string password", async () => {
    const hash = await hashPassword("");
    const parts = hash.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(64);
    expect(parts[1]).toHaveLength(128);
  });

  it("handles very long passwords", async () => {
    const longPw = "A".repeat(1000);
    const hash = await hashPassword(longPw);
    const ok = await verifyPassword(longPw, hash);
    expect(ok).toBe(true);
  });

  it("different passwords produce different hashes even with same salt length", async () => {
    const h1 = await hashPassword("Password1");
    const h2 = await hashPassword("Password2");
    const hash1 = h1.split(":")[1];
    const hash2 = h2.split(":")[1];
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword (additional coverage)", () => {
  it("returns false for completely empty input", async () => {
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("returns false when stored has colon but empty salt", async () => {
    expect(await verifyPassword("test", ":somehash")).toBe(false);
  });

  it("handles special characters in password", async () => {
    const stored = await hashPassword("p@$$w0rd!#%^&*");
    expect(await verifyPassword("p@$$w0rd!#%^&*", stored)).toBe(true);
    expect(await verifyPassword("p@$$w0rd!#%^&", stored)).toBe(false);
  });
});

// ── computeKeyPrefix (additional coverage) ──────────────────────────────

describe("computeKeyPrefix (additional coverage)", () => {
  it("returns consistent 16-char prefix for empty string", () => {
    const prefix = computeKeyPrefix("");
    expect(prefix).toHaveLength(16);
    expect(prefix).toMatch(/^[0-9a-f]{16}$/);
  });

  it("prefix for binary-like input still works", () => {
    const prefix = computeKeyPrefix("\x00\x01\x02");
    expect(prefix).toHaveLength(16);
  });
});

// ── Password strength validation (the real function) ──────────────────

const rulesOf = async (password: string) => (await validatePasswordStrength(password))?.rules ?? [];

describe("validatePasswordStrength, default policy", () => {
  it("accepts valid password", async () => {
    expect(await validatePasswordStrength("MyPass12")).toBeNull();
  });

  it("rejects password shorter than 8 chars", async () => {
    const failure = await validatePasswordStrength("Ab1");
    expect(failure).toEqual({
      rule: "minLength",
      rules: ["minLength"],
      message: "Password must be at least 8 characters",
      minLength: 8,
    });
  });

  it("rejects password without uppercase", async () => {
    const failure = await validatePasswordStrength("lowercase1");
    expect(failure).toEqual({
      rule: "uppercase",
      rules: ["uppercase"],
      message: "Password must contain an uppercase letter",
    });
  });

  it("rejects password without lowercase", async () => {
    const failure = await validatePasswordStrength("UPPERCASE1");
    expect(failure).toEqual({
      rule: "lowercase",
      rules: ["lowercase"],
      message: "Password must contain a lowercase letter",
    });
  });

  it("rejects password without number", async () => {
    const failure = await validatePasswordStrength("NoNumberHere");
    expect(failure).toEqual({
      rule: "digit",
      rules: ["digit"],
      message: "Password must contain a digit",
    });
  });

  it("accepts password with special characters", async () => {
    expect(await validatePasswordStrength("Sp3c!al@")).toBeNull();
  });

  it("rejects password made of pure whitespace", async () => {
    const failure = await validatePasswordStrength("        ");
    expect(failure?.rules).toEqual(["uppercase", "lowercase", "digit"]);
    expect(failure?.rule).toBe("uppercase");
    expect(failure?.message).toBe("Password must contain an uppercase letter");
  });

  it("rejects empty string", async () => {
    const failure = await validatePasswordStrength("");
    expect(failure?.rules).toEqual(["minLength", "uppercase", "lowercase", "digit"]);
    expect(failure?.rule).toBe("minLength");
    expect(failure?.message).toBe("Password must be at least 8 characters");
  });

  it("lists every broken rule at once, first one as `rule`", async () => {
    const failure = await validatePasswordStrength("abc");

    expect(failure?.rules).toEqual(["minLength", "uppercase", "digit"]);
    expect(failure?.rule).toBe("minLength");
    expect(failure?.minLength).toBe(8);
    expect(failure?.message).toBe("Password must be at least 8 characters");
  });

  it("refuses a control character before anything else, even on a password that breaks other rules", async () => {
    const failure = await validatePasswordStrength("MyPass12\t");
    expect(failure).toEqual({
      rule: "controlCharacter",
      rules: ["controlCharacter"],
      message: "Password must not contain control characters",
    });

    const multiFailure = await validatePasswordStrength("ab\t");
    expect(multiFailure?.rules).toEqual(["controlCharacter"]);
    expect(multiFailure?.message).toBe("Password must not contain control characters");
  });

  it("refuses a lone UTF-16 surrogate before policy rules, while accepting a valid surrogate pair (#2170)", async () => {
    const failure = await validatePasswordStrength("MyPass12\uD800");
    expect(failure).toEqual({
      rule: "invalidCharacter",
      rules: ["invalidCharacter"],
      message: "Password must not contain invalid characters (an unpaired UTF-16 surrogate)",
    });
    expect((await validatePasswordStrength("MyPass12\uDC00"))?.rule).toBe("invalidCharacter");
    expect((await validatePasswordStrength("MyPass12\uDC00\uD800"))?.rule).toBe("invalidCharacter");

    const multiFailure = await validatePasswordStrength("ab\uD800");
    expect(multiFailure?.rules).toEqual(["invalidCharacter"]);
    expect(multiFailure?.message).toBe(
      "Password must not contain invalid characters (an unpaired UTF-16 surrogate)",
    );

    expect(await validatePasswordStrength("MyPass12\u{1F600}")).toBeNull();
  });

  it("counts a halfwidth katakana password the way it is hashed, not as typed (#2056)", async () => {
    // Four halfwidth kana with a voiced mark are 8 characters as typed and 4
    // once normalized: that is what gets hashed, so that is what is counted.
    expect(await rulesOf(`${"\uff76\uff9e".repeat(4)}Aa1`)).toEqual(["minLength"]);
  });

  it("refuses a password over the shared maximum and names the limit", async () => {
    const failure = await validatePasswordStrength(`Aa1${"a".repeat(PASSWORD_MAX_LENGTH)}`);

    expect(failure).toEqual({
      rule: "maxLength",
      rules: ["maxLength"],
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      maxLength: PASSWORD_MAX_LENGTH,
    });
  });

  it("accepts a password of exactly the shared maximum", async () => {
    expect(await validatePasswordStrength(`Aa1${"a".repeat(PASSWORD_MAX_LENGTH - 3)}`)).toBeNull();
  });
});

describe("validatePasswordStrength, a changed policy (#2039)", () => {
  it("follows the configured minimum length", async () => {
    policy.values.set("passwordMinLength", "12");

    const failure = await validatePasswordStrength("MyPass12");

    expect(failure).toEqual({
      rule: "minLength",
      rules: ["minLength"],
      message: "Password must be at least 12 characters",
      minLength: 12,
    });
  });

  it("accepts anything once every rule is off and the minimum is 1", async () => {
    policy.values.set("passwordMinLength", "1");
    for (const rule of ["Uppercase", "Lowercase", "Digit"]) {
      policy.values.set(`passwordRequire${rule}`, "false");
    }

    expect(await validatePasswordStrength("a")).toBeNull();
    expect(await validatePasswordStrength("!")).toBeNull();
  });

  it("requires a special character only when the switch is exactly true", async () => {
    expect(await validatePasswordStrength("MyPass12")).toBeNull();

    policy.values.set("passwordRequireSpecial", "true");
    const failure = await validatePasswordStrength("MyPass12");
    expect(failure).toEqual({
      rule: "special",
      rules: ["special"],
      message: "Password must contain a special character",
    });
    expect(await validatePasswordStrength("MyPass12!")).toBeNull();
  });

  it.each([
    ["Uppercase", "lowercase1", "uppercase"],
    ["Lowercase", "UPPERCASE1", "lowercase"],
    ["Digit", "NoNumberHere", "digit"],
  ])(
    "keeps the %s rule on for a stored value that isn't exactly false, and off for false (#2026)",
    async (key, password, rule) => {
      policy.values.set(`passwordRequire${key}`, "FALSE");
      expect(await rulesOf(password)).toEqual([rule]);

      policy.values.set(`passwordRequire${key}`, "false");
      expect(await rulesOf(password)).toEqual([]);
    },
  );

  it("falls back to the default minimum for a stored value that isn't a number", async () => {
    policy.values.set("passwordMinLength", "lots");

    expect((await validatePasswordStrength("Ab1"))?.minLength).toBe(8);
  });

  it.each(["", "   ", "0", "-1", "129", "Infinity", "8.5"])(
    "falls back to the default minimum of 8 when passwordMinLength is %j (#1713)",
    async (stored) => {
      policy.values.set("passwordMinLength", stored);

      const failure = await validatePasswordStrength("Aa1");
      expect(failure).toMatchObject({
        rule: "minLength",
        rules: ["minLength"],
        minLength: 8,
      });
      expect(loggerWarn).toHaveBeenCalledWith(
        { key: "passwordMinLength", value: stored },
        "invalid numeric setting, using default",
      );
      expect(await validatePasswordStrength("MyPass12")).toBeNull();
    },
  );

  it.each([
    "passwordMinLength",
    "passwordRequireUppercase",
    "passwordRequireLowercase",
    "passwordRequireDigit",
    "passwordRequireSpecial",
  ])("propagates a DB error when reading %s instead of failing open (#1713)", async (key) => {
    policy.failKey = key;

    await expect(validatePasswordStrength("MyPass12!")).rejects.toThrow(
      `simulated DB failure reading ${key}`,
    );
  });
});

// ── Username validation (the real function) ───────────────────────────

describe("validateUsername", () => {
  it("accepts valid usernames", () => {
    expect(validateUsername("alice")).toBeNull();
    expect(validateUsername("bob_123")).toBeNull();
    expect(validateUsername("user.name")).toBeNull();
    expect(validateUsername("a-b")).toBeNull();
  });

  it("rejects username shorter than 3 chars", () => {
    expect(validateUsername("ab")).not.toBeNull();
  });

  it("rejects username longer than 50 chars", () => {
    expect(validateUsername("a".repeat(51))).not.toBeNull();
  });

  it("rejects username with spaces", () => {
    expect(validateUsername("has space")).not.toBeNull();
  });

  it("rejects username with special characters", () => {
    expect(validateUsername("user@name")).not.toBeNull();
    expect(validateUsername("user!name")).not.toBeNull();
    expect(validateUsername("user#name")).not.toBeNull();
  });

  it("accepts exactly 3 chars", () => {
    expect(validateUsername("abc")).toBeNull();
  });

  it("accepts exactly 50 chars", () => {
    expect(validateUsername("a".repeat(50))).toBeNull();
  });
});

// ── isPublicRoute (reproduced logic) ────────────────────────────────────

const PUBLIC_PATHS = [
  "/api/v1/health",
  "/api/v1/config/",
  "/api/auth/",
  "/api/v1/download/",
  "/api/v1/jobs/",
  "/api/docs",
  "/api/v1/openapi.yaml",
  "/api/v1/meme-templates/",
];

function isPublicRoute(url: string): boolean {
  if (!url.startsWith("/api/")) return true;
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

describe("isPublicRoute", () => {
  it("treats non-API routes as public", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/some-page")).toBe(true);
    expect(isPublicRoute("/static/image.png")).toBe(true);
  });

  it("treats auth routes as public", () => {
    expect(isPublicRoute("/api/auth/login")).toBe(true);
    expect(isPublicRoute("/api/auth/logout")).toBe(true);
    expect(isPublicRoute("/api/auth/session")).toBe(true);
  });

  it("treats health endpoint as public", () => {
    expect(isPublicRoute("/api/v1/health")).toBe(true);
  });

  it("treats download routes as public", () => {
    expect(isPublicRoute("/api/v1/download/abc/file.png")).toBe(true);
  });

  it("treats job progress as public", () => {
    expect(isPublicRoute("/api/v1/jobs/some-id/progress")).toBe(true);
  });

  it("treats docs as public", () => {
    expect(isPublicRoute("/api/docs")).toBe(true);
    expect(isPublicRoute("/api/v1/openapi.yaml")).toBe(true);
  });

  it("treats tool endpoints as private", () => {
    expect(isPublicRoute("/api/v1/tools/image/resize")).toBe(false);
    expect(isPublicRoute("/api/v1/features")).toBe(false);
    expect(isPublicRoute("/api/v1/files")).toBe(false);
  });

  it("treats admin routes as private", () => {
    expect(isPublicRoute("/api/v1/admin/features/bundle/install")).toBe(false);
  });

  it("treats meme templates as public", () => {
    expect(isPublicRoute("/api/v1/meme-templates/list")).toBe(true);
  });
});

// ── Admin user route audit payloads (#3978) ───────────────────────────

describe("admin user route audit payloads (#3978)", () => {
  type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
  const postHandlers = new Map<string, RouteHandler>();
  const putHandlers = new Map<string, RouteHandler>();
  const deleteHandlers = new Map<string, RouteHandler>();

  beforeEach(async () => {
    postHandlers.clear();
    putHandlers.clear();
    deleteHandlers.clear();
    const fakeApp = {
      get: vi.fn(),
      post: vi.fn((path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) => {
        const handler = (
          typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler
        ) as RouteHandler;
        postHandlers.set(path, handler);
      }),
      put: vi.fn((path: string, handler: RouteHandler) => {
        putHandlers.set(path, handler);
      }),
      delete: vi.fn((path: string, handler: RouteHandler) => {
        deleteHandlers.set(path, handler);
      }),
      register: vi.fn(),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    await authRoutes(fakeApp as never);
    await registerMfa(fakeApp as never);
    await registerScimRoutes(fakeApp as never);
  });

  function makeReply() {
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      status: vi.fn((code: number) => {
        reply.statusCode = code;
        return reply;
      }),
      send: vi.fn((body: unknown) => {
        reply.payload = body;
        return reply;
      }),
    };
    return reply;
  }

  const adminActor = { id: "admin-1", username: "admin-user", role: "admin" };

  it("POST /api/auth/register emits USER_CREATED with acting admin username", async () => {
    dbMockState.selectQueue = [[{ id: "team-1", name: "Default" }], [], [{ role: "admin" }]];
    const reply = makeReply();
    await postHandlers.get("/api/auth/register")?.(
      {
        user: adminActor,
        body: { username: "newbie", password: "ValidPassword1", role: "editor" },
        log: { info: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(auditFn).toHaveBeenCalledWith("USER_CREATED", {
      adminId: "admin-1",
      username: "admin-user",
      newUserId: expect.any(String),
      newUsername: "newbie",
      role: "editor",
    });
  });

  it("PUT /api/auth/users/:id emits USER_UPDATED with acting admin username", async () => {
    dbMockState.selectQueue = [
      [{ id: "user-2", username: "target", role: "user" }],
      [{ role: "user" }],
      [{ role: "admin" }],
    ];
    const reply = makeReply();
    await putHandlers.get("/api/auth/users/:id")?.(
      {
        user: adminActor,
        params: { id: "user-2" },
        body: { role: "editor" },
        log: { info: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(auditFn).toHaveBeenCalledWith("USER_UPDATED", {
      adminId: "admin-1",
      username: "admin-user",
      targetUserId: "user-2",
      changes: { role: "editor", team: undefined },
    });
  });

  it("POST /api/auth/users/:id/reset-password emits PASSWORD_RESET with acting admin username", async () => {
    dbMockState.selectQueue = [
      [{ id: "user-2", username: "target", role: "user", passwordHash: "salt:hash" }],
      [{ role: "user", passwordHash: "salt:hash" }],
      [{ role: "admin" }],
    ];
    const reply = makeReply();
    await postHandlers.get("/api/auth/users/:id/reset-password")?.(
      {
        user: adminActor,
        params: { id: "user-2" },
        body: { newPassword: "NewPassword1" },
        log: { info: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(auditFn).toHaveBeenCalledWith("PASSWORD_RESET", {
      adminId: "admin-1",
      username: "admin-user",
      targetUserId: "user-2",
      targetUsername: "target",
    });
  });

  it("DELETE /api/auth/users/:id emits USER_DELETED with acting admin username", async () => {
    dbMockState.selectQueue = [
      [{ id: "user-2", username: "target", role: "user" }],
      [{ role: "admin" }],
      [{ role: "user" }],
      [],
      [{ role: "admin" }],
      [{ role: "user" }],
    ];
    const reply = makeReply();
    await deleteHandlers.get("/api/auth/users/:id")?.(
      {
        user: adminActor,
        params: { id: "user-2" },
        log: { info: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(auditFn).toHaveBeenCalledWith("USER_DELETED", {
      adminId: "admin-1",
      username: "admin-user",
      deletedUserId: "user-2",
      deletedUsername: "target",
    });
  });

  it("POST /api/auth/logout emits LOGOUT with userId and username (#3981)", async () => {
    const reply = makeReply();
    await postHandlers.get("/api/auth/logout")?.(
      {
        user: adminActor,
        headers: {},
        cookies: {},
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(auditFn).toHaveBeenCalledWith("LOGOUT", {
      userId: "admin-1",
      username: "admin-user",
    });
  });

  it("POST /api/auth/users/:id/mfa/reset emits MFA_RESET with acting admin username (#3981)", async () => {
    dbMockState.selectQueue = [
      [{ id: "user-2", username: "target", role: "user", totpEnabled: true }],
      [{ role: "admin" }],
      [{ role: "user" }],
    ];
    const reply = makeReply();
    await postHandlers.get("/api/auth/users/:id/mfa/reset")?.(
      {
        user: adminActor,
        params: { id: "user-2" },
        log: { info: vi.fn() },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(auditFn).toHaveBeenCalledWith("MFA_RESET", {
      adminId: "admin-1",
      username: "admin-user",
      targetUserId: "user-2",
      targetUsername: "target",
    });
  });

  it("POST and DELETE /api/v1/enterprise/scim/token emit SETTINGS_UPDATED with acting adminId and username (#3981)", async () => {
    dbMockState.selectQueue = [[{ role: "admin" }], [{ role: "admin" }]];
    const reqLog = { info: vi.fn() };
    const postReply = makeReply();
    await postHandlers.get("/api/v1/enterprise/scim/token")?.(
      {
        user: adminActor,
        log: reqLog,
        ip: "127.0.0.1",
        id: "req-scim-post",
      },
      postReply,
    );

    expect(postReply.statusCode).toBe(201);
    expect(auditLogSpy).toHaveBeenCalledWith(
      reqLog,
      "SETTINGS_UPDATED",
      {
        adminId: "admin-1",
        username: "admin-user",
        setting: "scim_token",
      },
      "127.0.0.1",
      "req-scim-post",
    );

    auditLogSpy.mockClear();
    const deleteReply = makeReply();
    await deleteHandlers.get("/api/v1/enterprise/scim/token")?.(
      {
        user: adminActor,
        log: reqLog,
        ip: "127.0.0.1",
        id: "req-scim-del",
      },
      deleteReply,
    );

    expect(deleteReply.statusCode).toBe(204);
    expect(auditLogSpy).toHaveBeenCalledWith(
      reqLog,
      "SETTINGS_UPDATED",
      {
        adminId: "admin-1",
        username: "admin-user",
        setting: "scim_token",
        action: "revoked",
      },
      "127.0.0.1",
      "req-scim-del",
    );
  });
});
