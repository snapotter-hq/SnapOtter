/**
 * Unit tests for effective permissions logic.
 *
 * Covers hasEffectivePermission (role + API key scoping),
 * getPermissions edge cases, and hasPermission edge cases.
 */

import type { Permission, Role } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

// Mock the auth plugin to avoid transitively opening a SQLite connection
vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: () => null,
}));

import {
  getPermissions,
  hasEffectivePermission,
  hasPermission,
} from "../../../apps/api/src/permissions.js";
import type { AuthUser } from "../../../apps/api/src/plugins/auth.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthUser> & { role: string }): AuthUser {
  return {
    id: "u-1",
    username: "testuser",
    ...overrides,
  };
}

// ── hasEffectivePermission ───────────────────────────────────────────

describe("hasEffectivePermission", () => {
  describe("without API key scoping (apiKeyPermissions undefined)", () => {
    it("admin can use any permission", () => {
      const admin = makeUser({ role: "admin" });
      const allAdmin = getPermissions("admin");
      for (const perm of allAdmin) {
        expect(hasEffectivePermission(admin, perm)).toBe(true);
      }
    });

    it("editor can use all editor permissions", () => {
      const editor = makeUser({ role: "editor" });
      const editorPerms = getPermissions("editor");
      for (const perm of editorPerms) {
        expect(hasEffectivePermission(editor, perm)).toBe(true);
      }
    });

    it("editor cannot use admin-only permissions", () => {
      const editor = makeUser({ role: "editor" });
      expect(hasEffectivePermission(editor, "users:manage")).toBe(false);
      expect(hasEffectivePermission(editor, "settings:write")).toBe(false);
      expect(hasEffectivePermission(editor, "teams:manage")).toBe(false);
      expect(hasEffectivePermission(editor, "branding:manage")).toBe(false);
      expect(hasEffectivePermission(editor, "features:manage")).toBe(false);
      expect(hasEffectivePermission(editor, "system:health")).toBe(false);
      expect(hasEffectivePermission(editor, "audit:read")).toBe(false);
    });

    it("user can use all user permissions", () => {
      const user = makeUser({ role: "user" });
      const userPerms = getPermissions("user");
      for (const perm of userPerms) {
        expect(hasEffectivePermission(user, perm)).toBe(true);
      }
    });

    it("user cannot use editor or admin permissions", () => {
      const user = makeUser({ role: "user" });
      expect(hasEffectivePermission(user, "files:all")).toBe(false);
      expect(hasEffectivePermission(user, "pipelines:all")).toBe(false);
      expect(hasEffectivePermission(user, "users:manage")).toBe(false);
      expect(hasEffectivePermission(user, "settings:write")).toBe(false);
    });

    it("unknown role has no effective permissions", () => {
      const unknown = makeUser({ role: "ghost" });
      expect(hasEffectivePermission(unknown, "tools:use")).toBe(false);
      expect(hasEffectivePermission(unknown, "users:manage")).toBe(false);
    });
  });

  describe("API key scoping restricts permissions", () => {
    it("admin scoped to tools:use can only use tools:use", () => {
      const admin = makeUser({
        role: "admin",
        apiKeyPermissions: ["tools:use"],
      });
      expect(hasEffectivePermission(admin, "tools:use")).toBe(true);
      expect(hasEffectivePermission(admin, "users:manage")).toBe(false);
      expect(hasEffectivePermission(admin, "files:all")).toBe(false);
    });

    it("editor scoped to files:own and tools:use only has those", () => {
      const editor = makeUser({
        role: "editor",
        apiKeyPermissions: ["files:own", "tools:use"],
      });
      expect(hasEffectivePermission(editor, "files:own")).toBe(true);
      expect(hasEffectivePermission(editor, "tools:use")).toBe(true);
      expect(hasEffectivePermission(editor, "files:all")).toBe(false);
      expect(hasEffectivePermission(editor, "settings:read")).toBe(false);
    });

    it("user scoped to settings:read only has that", () => {
      const user = makeUser({
        role: "user",
        apiKeyPermissions: ["settings:read"],
      });
      expect(hasEffectivePermission(user, "settings:read")).toBe(true);
      expect(hasEffectivePermission(user, "tools:use")).toBe(false);
      expect(hasEffectivePermission(user, "files:own")).toBe(false);
    });
  });

  describe("API key cannot grant permissions the role lacks", () => {
    it("user with apiKeyPermissions including users:manage still denied", () => {
      const user = makeUser({
        role: "user",
        apiKeyPermissions: ["tools:use", "users:manage"],
      });
      expect(hasEffectivePermission(user, "users:manage")).toBe(false);
      // But role-granted permission that is also in the key works
      expect(hasEffectivePermission(user, "tools:use")).toBe(true);
    });

    it("editor with apiKeyPermissions including settings:write still denied", () => {
      const editor = makeUser({
        role: "editor",
        apiKeyPermissions: ["settings:write", "files:all"],
      });
      expect(hasEffectivePermission(editor, "settings:write")).toBe(false);
      // files:all is in editor role, so it works
      expect(hasEffectivePermission(editor, "files:all")).toBe(true);
    });

    it("unknown role gains nothing even with full apiKeyPermissions", () => {
      const unknown = makeUser({
        role: "nobody",
        apiKeyPermissions: ["tools:use", "files:own", "users:manage", "settings:write"],
      });
      expect(hasEffectivePermission(unknown, "tools:use")).toBe(false);
      expect(hasEffectivePermission(unknown, "users:manage")).toBe(false);
    });
  });

  describe("empty apiKeyPermissions blocks everything", () => {
    it("admin with empty array has no effective permissions", () => {
      const admin = makeUser({ role: "admin", apiKeyPermissions: [] });
      const allAdmin = getPermissions("admin");
      for (const perm of allAdmin) {
        expect(hasEffectivePermission(admin, perm)).toBe(false);
      }
    });

    it("user with empty array has no effective permissions", () => {
      const user = makeUser({ role: "user", apiKeyPermissions: [] });
      expect(hasEffectivePermission(user, "tools:use")).toBe(false);
      expect(hasEffectivePermission(user, "files:own")).toBe(false);
    });
  });

  describe("undefined apiKeyPermissions inherits all role permissions", () => {
    it("admin without apiKeyPermissions gets full admin access", () => {
      const admin = makeUser({ role: "admin" });
      expect(admin.apiKeyPermissions).toBeUndefined();
      expect(hasEffectivePermission(admin, "users:manage")).toBe(true);
      expect(hasEffectivePermission(admin, "audit:read")).toBe(true);
    });

    it("user without apiKeyPermissions gets full user access", () => {
      const user = makeUser({ role: "user" });
      expect(user.apiKeyPermissions).toBeUndefined();
      expect(hasEffectivePermission(user, "tools:use")).toBe(true);
      expect(hasEffectivePermission(user, "pipelines:own")).toBe(true);
    });
  });
});

// ── getPermissions ───────────────────────────────────────────────────

describe("getPermissions", () => {
  describe("exact counts for built-in roles", () => {
    it("admin has exactly 15 permissions", () => {
      expect(getPermissions("admin")).toHaveLength(15);
    });

    it("editor has exactly 7 permissions", () => {
      expect(getPermissions("editor")).toHaveLength(7);
    });

    it("user has exactly 5 permissions", () => {
      expect(getPermissions("user")).toHaveLength(5);
    });
  });

  describe("invalid and edge-case role names", () => {
    it("empty string returns empty array", () => {
      expect(getPermissions("")).toEqual([]);
    });

    it("null coerced to string returns empty array", () => {
      expect(getPermissions(null as unknown as Role)).toEqual([]);
    });

    it("undefined coerced to string returns empty array", () => {
      expect(getPermissions(undefined as unknown as Role)).toEqual([]);
    });

    it("case-sensitive: Admin (capitalized) returns empty array", () => {
      expect(getPermissions("Admin" as Role)).toEqual([]);
    });

    it("case-sensitive: ADMIN (uppercase) returns empty array", () => {
      expect(getPermissions("ADMIN" as Role)).toEqual([]);
    });

    it("case-sensitive: User (capitalized) returns empty array", () => {
      expect(getPermissions("User" as Role)).toEqual([]);
    });

    it("whitespace-padded role name returns empty array", () => {
      expect(getPermissions(" admin " as Role)).toEqual([]);
    });
  });

  describe("role permission subsets", () => {
    it("editor permissions are a subset of admin permissions", () => {
      const adminPerms = getPermissions("admin");
      const editorPerms = getPermissions("editor");
      for (const perm of editorPerms) {
        expect(adminPerms).toContain(perm);
      }
    });

    it("user permissions are a subset of admin permissions", () => {
      const adminPerms = getPermissions("admin");
      const userPerms = getPermissions("user");
      for (const perm of userPerms) {
        expect(adminPerms).toContain(perm);
      }
    });

    it("user permissions are a subset of editor permissions", () => {
      const editorPerms = getPermissions("editor");
      const userPerms = getPermissions("user");
      for (const perm of userPerms) {
        expect(editorPerms).toContain(perm);
      }
    });
  });
});

// ── hasPermission edge cases ─────────────────────────────────────────

describe("hasPermission edge cases", () => {
  it("returns false for a non-existent permission string", () => {
    expect(hasPermission("admin", "fake:perm" as Permission)).toBe(false);
  });

  it("returns false for an empty string permission", () => {
    expect(hasPermission("admin", "" as Permission)).toBe(false);
  });

  it("returns false for unknown role even with valid permission", () => {
    expect(hasPermission("visitor" as Role, "tools:use")).toBe(false);
  });

  it("returns false for both unknown role and unknown permission", () => {
    expect(hasPermission("visitor" as Role, "x:y" as Permission)).toBe(false);
  });
});
