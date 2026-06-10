/**
 * Unit tests for effective permissions logic.
 *
 * Covers hasEffectivePermission (role + API key scoping),
 * getPermissions edge cases, and hasPermission edge cases.
 */

import type { Permission, Role } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: () => null }) }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { roles: {}, settings: {} },
}));

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
    it("admin can use any permission", async () => {
      const admin = makeUser({ role: "admin" });
      const allAdmin = await getPermissions("admin");
      for (const perm of allAdmin) {
        expect(await hasEffectivePermission(admin, perm)).toBe(true);
      }
    });

    it("editor can use all editor permissions", async () => {
      const editor = makeUser({ role: "editor" });
      const editorPerms = await getPermissions("editor");
      for (const perm of editorPerms) {
        expect(await hasEffectivePermission(editor, perm)).toBe(true);
      }
    });

    it("editor cannot use admin-only permissions", async () => {
      const editor = makeUser({ role: "editor" });
      expect(await hasEffectivePermission(editor, "users:manage")).toBe(false);
      expect(await hasEffectivePermission(editor, "settings:write")).toBe(false);
      expect(await hasEffectivePermission(editor, "teams:manage")).toBe(false);
      expect(await hasEffectivePermission(editor, "features:manage")).toBe(false);
      expect(await hasEffectivePermission(editor, "system:health")).toBe(false);
      expect(await hasEffectivePermission(editor, "audit:read")).toBe(false);
    });

    it("user can use all user permissions", async () => {
      const user = makeUser({ role: "user" });
      const userPerms = await getPermissions("user");
      for (const perm of userPerms) {
        expect(await hasEffectivePermission(user, perm)).toBe(true);
      }
    });

    it("user cannot use editor or admin permissions", async () => {
      const user = makeUser({ role: "user" });
      expect(await hasEffectivePermission(user, "files:all")).toBe(false);
      expect(await hasEffectivePermission(user, "pipelines:all")).toBe(false);
      expect(await hasEffectivePermission(user, "users:manage")).toBe(false);
      expect(await hasEffectivePermission(user, "settings:write")).toBe(false);
    });

    it("unknown role has no effective permissions", async () => {
      const unknown = makeUser({ role: "ghost" });
      expect(await hasEffectivePermission(unknown, "tools:use")).toBe(false);
      expect(await hasEffectivePermission(unknown, "users:manage")).toBe(false);
    });
  });

  describe("API key scoping restricts permissions", () => {
    it("admin scoped to tools:use can only use tools:use", async () => {
      const admin = makeUser({
        role: "admin",
        apiKeyPermissions: ["tools:use"],
      });
      expect(await hasEffectivePermission(admin, "tools:use")).toBe(true);
      expect(await hasEffectivePermission(admin, "users:manage")).toBe(false);
      expect(await hasEffectivePermission(admin, "files:all")).toBe(false);
    });

    it("editor scoped to files:own and tools:use only has those", async () => {
      const editor = makeUser({
        role: "editor",
        apiKeyPermissions: ["files:own", "tools:use"],
      });
      expect(await hasEffectivePermission(editor, "files:own")).toBe(true);
      expect(await hasEffectivePermission(editor, "tools:use")).toBe(true);
      expect(await hasEffectivePermission(editor, "files:all")).toBe(false);
      expect(await hasEffectivePermission(editor, "settings:read")).toBe(false);
    });

    it("user scoped to settings:read only has that", async () => {
      const user = makeUser({
        role: "user",
        apiKeyPermissions: ["settings:read"],
      });
      expect(await hasEffectivePermission(user, "settings:read")).toBe(true);
      expect(await hasEffectivePermission(user, "tools:use")).toBe(false);
      expect(await hasEffectivePermission(user, "files:own")).toBe(false);
    });
  });

  describe("API key cannot grant permissions the role lacks", () => {
    it("user with apiKeyPermissions including users:manage still denied", async () => {
      const user = makeUser({
        role: "user",
        apiKeyPermissions: ["tools:use", "users:manage"],
      });
      expect(await hasEffectivePermission(user, "users:manage")).toBe(false);
      // But role-granted permission that is also in the key works
      expect(await hasEffectivePermission(user, "tools:use")).toBe(true);
    });

    it("editor with apiKeyPermissions including settings:write still denied", async () => {
      const editor = makeUser({
        role: "editor",
        apiKeyPermissions: ["settings:write", "files:all"],
      });
      expect(await hasEffectivePermission(editor, "settings:write")).toBe(false);
      // files:all is in editor role, so it works
      expect(await hasEffectivePermission(editor, "files:all")).toBe(true);
    });

    it("unknown role gains nothing even with full apiKeyPermissions", async () => {
      const unknown = makeUser({
        role: "nobody",
        apiKeyPermissions: ["tools:use", "files:own", "users:manage", "settings:write"],
      });
      expect(await hasEffectivePermission(unknown, "tools:use")).toBe(false);
      expect(await hasEffectivePermission(unknown, "users:manage")).toBe(false);
    });
  });

  describe("empty apiKeyPermissions blocks everything", () => {
    it("admin with empty array has no effective permissions", async () => {
      const admin = makeUser({ role: "admin", apiKeyPermissions: [] });
      const allAdmin = await getPermissions("admin");
      for (const perm of allAdmin) {
        expect(await hasEffectivePermission(admin, perm)).toBe(false);
      }
    });

    it("user with empty array has no effective permissions", async () => {
      const user = makeUser({ role: "user", apiKeyPermissions: [] });
      expect(await hasEffectivePermission(user, "tools:use")).toBe(false);
      expect(await hasEffectivePermission(user, "files:own")).toBe(false);
    });
  });

  describe("undefined apiKeyPermissions inherits all role permissions", () => {
    it("admin without apiKeyPermissions gets full admin access", async () => {
      const admin = makeUser({ role: "admin" });
      expect(admin.apiKeyPermissions).toBeUndefined();
      expect(await hasEffectivePermission(admin, "users:manage")).toBe(true);
      expect(await hasEffectivePermission(admin, "audit:read")).toBe(true);
    });

    it("user without apiKeyPermissions gets full user access", async () => {
      const user = makeUser({ role: "user" });
      expect(user.apiKeyPermissions).toBeUndefined();
      expect(await hasEffectivePermission(user, "tools:use")).toBe(true);
      expect(await hasEffectivePermission(user, "pipelines:own")).toBe(true);
    });
  });
});

// ── getPermissions ───────────────────────────────────────────────────

describe("getPermissions", () => {
  describe("exact counts for built-in roles", () => {
    it("admin has exactly 14 permissions", async () => {
      expect(await getPermissions("admin")).toHaveLength(14);
    });

    it("editor has exactly 7 permissions", async () => {
      expect(await getPermissions("editor")).toHaveLength(7);
    });

    it("user has exactly 5 permissions", async () => {
      expect(await getPermissions("user")).toHaveLength(5);
    });
  });

  describe("invalid and edge-case role names", () => {
    it("empty string returns empty array", async () => {
      expect(await getPermissions("")).toEqual([]);
    });

    it("null coerced to string returns empty array", async () => {
      expect(await getPermissions(null as unknown as Role)).toEqual([]);
    });

    it("undefined coerced to string returns empty array", async () => {
      expect(await getPermissions(undefined as unknown as Role)).toEqual([]);
    });

    it("case-sensitive: Admin (capitalized) returns empty array", async () => {
      expect(await getPermissions("Admin" as Role)).toEqual([]);
    });

    it("case-sensitive: ADMIN (uppercase) returns empty array", async () => {
      expect(await getPermissions("ADMIN" as Role)).toEqual([]);
    });

    it("case-sensitive: User (capitalized) returns empty array", async () => {
      expect(await getPermissions("User" as Role)).toEqual([]);
    });

    it("whitespace-padded role name returns empty array", async () => {
      expect(await getPermissions(" admin " as Role)).toEqual([]);
    });
  });

  describe("role permission subsets", () => {
    it("editor permissions are a subset of admin permissions", async () => {
      const adminPerms = await getPermissions("admin");
      const editorPerms = await getPermissions("editor");
      for (const perm of editorPerms) {
        expect(adminPerms).toContain(perm);
      }
    });

    it("user permissions are a subset of admin permissions", async () => {
      const adminPerms = await getPermissions("admin");
      const userPerms = await getPermissions("user");
      for (const perm of userPerms) {
        expect(adminPerms).toContain(perm);
      }
    });

    it("user permissions are a subset of editor permissions", async () => {
      const editorPerms = await getPermissions("editor");
      const userPerms = await getPermissions("user");
      for (const perm of userPerms) {
        expect(editorPerms).toContain(perm);
      }
    });
  });
});

// ── hasPermission edge cases ─────────────────────────────────────────

describe("hasPermission edge cases", () => {
  it("returns false for a non-existent permission string", async () => {
    expect(await hasPermission("admin", "fake:perm" as Permission)).toBe(false);
  });

  it("returns false for an empty string permission", async () => {
    expect(await hasPermission("admin", "" as Permission)).toBe(false);
  });

  it("returns false for unknown role even with valid permission", async () => {
    expect(await hasPermission("visitor" as Role, "tools:use")).toBe(false);
  });

  it("returns false for both unknown role and unknown permission", async () => {
    expect(await hasPermission("visitor" as Role, "x:y" as Permission)).toBe(false);
  });
});
