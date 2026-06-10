/**
 * Unit tests for security hardening of auth-related env defaults and Zod schemas.
 *
 * These tests verify that:
 * - Rate limit and login attempt defaults were lowered to secure values
 * - Auth Zod schemas enforce max length on username/password fields
 * - New storage env vars have correct defaults
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

import { loadEnv } from "../../apps/api/src/lib/env.js";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../../apps/api/src/plugins/auth.js";

// ── Env defaults ─────────────────────────────────────────────────────────────

describe("Security: env defaults", () => {
  it("LOGIN_ATTEMPT_LIMIT defaults to 30", () => {
    const env = loadEnv();
    expect(env.LOGIN_ATTEMPT_LIMIT).toBe(30);
  });

  it("RATE_LIMIT_PER_MIN is parsed correctly (test env overrides to 10000)", () => {
    // vitest.config.ts sets RATE_LIMIT_PER_MIN=10000 for tests
    const env = loadEnv();
    expect(env.RATE_LIMIT_PER_MIN).toBe(10000);
  });

  it("MAX_STORAGE_PER_USER_MB defaults to 5000", () => {
    const env = loadEnv();
    expect(env.MAX_STORAGE_PER_USER_MB).toBe(5000);
  });

  it("MAX_WORKSPACE_SIZE_GB defaults to 10", () => {
    const env = loadEnv();
    expect(env.MAX_WORKSPACE_SIZE_GB).toBe(10);
  });
});

// ── Auth Zod schema max length enforcement ───────────────────────────────────

describe("Security: loginSchema max lengths", () => {
  it("rejects username longer than 255 chars", () => {
    const result = loginSchema.safeParse({
      username: "a".repeat(256),
      password: "ValidPass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Username too long")).toBe(true);
    }
  });

  it("accepts username at exactly 255 chars", () => {
    const result = loginSchema.safeParse({
      username: "a".repeat(255),
      password: "ValidPass1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password longer than 1024 chars", () => {
    const result = loginSchema.safeParse({
      username: "testuser",
      password: "a".repeat(1025),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Password too long")).toBe(true);
    }
  });

  it("accepts password at exactly 1024 chars", () => {
    const result = loginSchema.safeParse({
      username: "testuser",
      password: "a".repeat(1024),
    });
    expect(result.success).toBe(true);
  });
});

describe("Security: changePasswordSchema max lengths", () => {
  it("rejects oversized currentPassword", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "a".repeat(1025),
      newPassword: "ValidPass1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized newPassword", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "ValidPass1",
      newPassword: "a".repeat(1025),
    });
    expect(result.success).toBe(false);
  });
});

describe("Security: registerSchema max lengths", () => {
  it("rejects username longer than 255 chars", () => {
    const result = registerSchema.safeParse({
      username: "a".repeat(256),
      password: "ValidPass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Username too long")).toBe(true);
    }
  });

  it("rejects password longer than 1024 chars", () => {
    const result = registerSchema.safeParse({
      username: "testuser",
      password: "a".repeat(1025),
    });
    expect(result.success).toBe(false);
  });
});

describe("Security: resetPasswordSchema max lengths", () => {
  it("rejects newPassword longer than 1024 chars", () => {
    const result = resetPasswordSchema.safeParse({
      newPassword: "a".repeat(1025),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Password too long")).toBe(true);
    }
  });
});

describe("Security: all schemas accept valid input", () => {
  it("all schemas pass with normal-length fields", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "Pass1234" }).success).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Pass1234", newPassword: "NewPass1" })
        .success,
    ).toBe(true);
    expect(registerSchema.safeParse({ username: "newuser", password: "Pass1234" }).success).toBe(
      true,
    );
    expect(resetPasswordSchema.safeParse({ newPassword: "Pass1234" }).success).toBe(true);
  });
});
