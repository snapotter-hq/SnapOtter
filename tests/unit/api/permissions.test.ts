/**
 * Unit tests for the permission map and helper functions.
 *
 * Verifies that each role gets the correct set of permissions
 * and that the hasPermission check works as expected.
 */

import type { Role } from "@snapotter/shared";
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

import { getPermissions, hasPermission } from "../../../apps/api/src/permissions.js";

describe("permissions", () => {
  describe("getPermissions", () => {
    it("returns all 14 permissions for admin", async () => {
      const perms = await getPermissions("admin");
      expect(perms).toHaveLength(14);
      expect(perms).toContain("tools:use");
      expect(perms).toContain("files:own");
      expect(perms).toContain("files:all");
      expect(perms).toContain("apikeys:own");
      expect(perms).toContain("apikeys:all");
      expect(perms).toContain("pipelines:own");
      expect(perms).toContain("pipelines:all");
      expect(perms).toContain("settings:read");
      expect(perms).toContain("settings:write");
      expect(perms).toContain("users:manage");
      expect(perms).toContain("teams:manage");
      expect(perms).toContain("features:manage");
      expect(perms).toContain("system:health");
      expect(perms).toContain("audit:read");
    });

    it("returns only basic permissions for user role", async () => {
      const perms = await getPermissions("user");
      expect(perms).toEqual([
        "tools:use",
        "files:own",
        "apikeys:own",
        "pipelines:own",
        "settings:read",
      ]);
    });

    it("does NOT contain admin-only permissions for user role", async () => {
      const perms = await getPermissions("user");
      expect(perms).not.toContain("files:all");
      expect(perms).not.toContain("apikeys:all");
      expect(perms).not.toContain("pipelines:all");
      expect(perms).not.toContain("settings:write");
      expect(perms).not.toContain("users:manage");
      expect(perms).not.toContain("teams:manage");
    });

    it("returns empty array for unknown role", async () => {
      const perms = await getPermissions("unknown" as Role);
      expect(perms).toEqual([]);
    });
  });

  describe("hasPermission", () => {
    it("returns true for admin with users:manage", async () => {
      expect(await hasPermission("admin", "users:manage")).toBe(true);
    });

    it("returns true for user with tools:use", async () => {
      expect(await hasPermission("user", "tools:use")).toBe(true);
    });

    it("returns false for user with users:manage", async () => {
      expect(await hasPermission("user", "users:manage")).toBe(false);
    });

    it("returns false for user with settings:write", async () => {
      expect(await hasPermission("user", "settings:write")).toBe(false);
    });
  });
});
