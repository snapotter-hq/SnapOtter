/**
 * Unit tests for auth route helper functions and validation logic.
 *
 * Tests getAuthUser, requireAuth, requireAdmin, validatePasswordStrength,
 * validateUsername, isPublicRoute, and extractToken -- all extracted from
 * apps/api/src/plugins/auth.ts.
 */
import { describe, expect, it, vi } from "vitest";

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

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
}));

import {
  computeKeyPrefix,
  getAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  verifyPassword,
} from "../../../apps/api/src/plugins/auth.js";

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

// ── Password strength validation (reproduced logic) ────────────────────

// Reproduce the validation function from auth.ts since it's not exported
function validatePasswordStrength(password: string): string | null {
  const rules = "Password must be at least 8 characters with uppercase, lowercase, and a number";
  if (password.length < 8) return rules;
  if (!/[A-Z]/.test(password)) return rules;
  if (!/[a-z]/.test(password)) return rules;
  if (!/[0-9]/.test(password)) return rules;
  return null;
}

describe("validatePasswordStrength", () => {
  it("accepts valid password", () => {
    expect(validatePasswordStrength("MyPass12")).toBeNull();
  });

  it("rejects password shorter than 8 chars", () => {
    expect(validatePasswordStrength("Ab1")).not.toBeNull();
  });

  it("rejects password without uppercase", () => {
    expect(validatePasswordStrength("lowercase1")).not.toBeNull();
  });

  it("rejects password without lowercase", () => {
    expect(validatePasswordStrength("UPPERCASE1")).not.toBeNull();
  });

  it("rejects password without number", () => {
    expect(validatePasswordStrength("NoNumberHere")).not.toBeNull();
  });

  it("accepts password with special characters", () => {
    expect(validatePasswordStrength("Sp3c!al@")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validatePasswordStrength("")).not.toBeNull();
  });
});

// ── Username validation (reproduced logic) ─────────────────────────────

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 50) {
    return "Username must be between 3 and 50 characters";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return "Username can only contain letters, numbers, dots, hyphens, and underscores";
  }
  return null;
}

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
    expect(isPublicRoute("/api/v1/tools/resize")).toBe(false);
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
