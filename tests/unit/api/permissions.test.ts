/**
 * Unit tests for the permission map and helper functions.
 *
 * Verifies that each role gets the correct set of permissions
 * and that the hasPermission check works as expected.
 */

import type { Role } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

// Mock the auth plugin to avoid transitively opening a SQLite connection
// (permissions.ts -> auth.ts -> db/index.ts), which causes lock contention
// when running in parallel with other DB-using test files like cleanup.test.ts.
vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: () => null,
}));

import { getPermissions, hasPermission } from "../../../apps/api/src/permissions.js";

describe("permissions", () => {
  describe("getPermissions", () => {
    it("returns all 15 permissions for admin", () => {
      const perms = getPermissions("admin");
      expect(perms).toHaveLength(15);
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
      expect(perms).toContain("branding:manage");
      expect(perms).toContain("features:manage");
      expect(perms).toContain("system:health");
      expect(perms).toContain("audit:read");
    });

    it("returns only basic permissions for user role", () => {
      const perms = getPermissions("user");
      expect(perms).toEqual([
        "tools:use",
        "files:own",
        "apikeys:own",
        "pipelines:own",
        "settings:read",
      ]);
    });

    it("does NOT contain admin-only permissions for user role", () => {
      const perms = getPermissions("user");
      expect(perms).not.toContain("files:all");
      expect(perms).not.toContain("apikeys:all");
      expect(perms).not.toContain("pipelines:all");
      expect(perms).not.toContain("settings:write");
      expect(perms).not.toContain("users:manage");
      expect(perms).not.toContain("teams:manage");
      expect(perms).not.toContain("branding:manage");
    });

    it("returns empty array for unknown role", () => {
      const perms = getPermissions("unknown" as Role);
      expect(perms).toEqual([]);
    });
  });

  describe("hasPermission", () => {
    it("returns true for admin with users:manage", () => {
      expect(hasPermission("admin", "users:manage")).toBe(true);
    });

    it("returns true for user with tools:use", () => {
      expect(hasPermission("user", "tools:use")).toBe(true);
    });

    it("returns false for user with users:manage", () => {
      expect(hasPermission("user", "users:manage")).toBe(false);
    });

    it("returns false for user with settings:write", () => {
      expect(hasPermission("user", "settings:write")).toBe(false);
    });
  });
});
