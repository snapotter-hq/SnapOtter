/**
 * Unit tests for auth route helper functions and validation logic.
 *
 * Tests getAuthUser, requireAuth, requireAdmin, validatePasswordStrength and
 * validateUsername (the real exports of apps/api/src/plugins/auth.ts, #2039),
 * plus isPublicRoute, which is reproduced here.
 */
import { PASSWORD_MAX_LENGTH } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock DB to avoid SQLite connection
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null, all: () => [] }),
        all: () => [],
      }),
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ run: vi.fn() }), run: vi.fn() }),
    }),
    delete: () => ({ where: () => ({ run: vi.fn() }) }),
    update: () => ({ set: () => ({ where: () => ({ run: vi.fn() }) }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    users: { id: {}, username: {}, role: {} },
    sessions: { id: {}, userId: {} },
    settings: { key: {} },
    apiKeys: { id: {}, userId: {}, keyPrefix: {} },
    teams: { id: {}, name: {} },
    roles: { name: {} },
    auditLog: {},
  },
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

// The password policy reads its settings through these helpers; a map stands in
// for the settings table so the defaults and a changed policy can both be tried.
const policy = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", () => ({
  getSettingString: async (key: string, fallback = "") => policy.values.get(key) ?? fallback,
  getSettingNumber: async (key: string, fallback = 0) => {
    const number = Number(policy.values.get(key));
    return policy.values.has(key) && !Number.isNaN(number) ? number : fallback;
  },
  getSettingStrict: async (key: string) => policy.values.get(key),
  setSettingIfAbsent: async () => {},
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
}));

import {
  computeKeyPrefix,
  getAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  validatePasswordStrength,
  validateUsername,
  verifyPassword,
} from "../../../apps/api/src/plugins/auth.js";

beforeEach(() => {
  policy.values.clear();
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
    expect(await rulesOf("Ab1")).toEqual(["minLength"]);
  });

  it("rejects password without uppercase", async () => {
    expect(await rulesOf("lowercase1")).toEqual(["uppercase"]);
  });

  it("rejects password without lowercase", async () => {
    expect(await rulesOf("UPPERCASE1")).toEqual(["lowercase"]);
  });

  it("rejects password without number", async () => {
    expect(await rulesOf("NoNumberHere")).toEqual(["digit"]);
  });

  it("accepts password with special characters", async () => {
    expect(await validatePasswordStrength("Sp3c!al@")).toBeNull();
  });

  it("rejects empty string", async () => {
    expect((await rulesOf("")).length).toBeGreaterThan(0);
  });

  it("lists every broken rule at once, first one as `rule`", async () => {
    const failure = await validatePasswordStrength("abc");

    expect(failure?.rules).toEqual(["minLength", "uppercase", "digit"]);
    expect(failure?.rule).toBe("minLength");
    expect(failure?.minLength).toBe(8);
  });

  it("refuses a control character before anything else, even on a password that breaks other rules", async () => {
    expect((await validatePasswordStrength("MyPass12\t"))?.rule).toBe("controlCharacter");

    const failure = await validatePasswordStrength("ab\t");
    expect(failure?.rules).toEqual(["controlCharacter"]);
  });

  it("counts a halfwidth katakana password the way it is hashed, not as typed (#2056)", async () => {
    // Four halfwidth kana with a voiced mark are 8 characters as typed and 4
    // once normalized: that is what gets hashed, so that is what is counted.
    expect(await rulesOf(`${"\uff76\uff9e".repeat(4)}Aa1`)).toEqual(["minLength"]);
  });

  it("refuses a password over the shared maximum and names the limit", async () => {
    const failure = await validatePasswordStrength(`Aa1${"a".repeat(PASSWORD_MAX_LENGTH)}`);

    expect(failure?.rule).toBe("maxLength");
    expect(failure?.maxLength).toBe(PASSWORD_MAX_LENGTH);
  });

  it("accepts a password of exactly the shared maximum", async () => {
    expect(await validatePasswordStrength(`Aa1${"a".repeat(PASSWORD_MAX_LENGTH - 3)}`)).toBeNull();
  });
});

describe("validatePasswordStrength, a changed policy (#2039)", () => {
  it("follows the configured minimum length", async () => {
    policy.values.set("passwordMinLength", "12");

    const failure = await validatePasswordStrength("MyPass12");

    expect(failure?.rules).toEqual(["minLength"]);
    expect(failure?.minLength).toBe(12);
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
    expect(await rulesOf("MyPass12")).toEqual(["special"]);
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
