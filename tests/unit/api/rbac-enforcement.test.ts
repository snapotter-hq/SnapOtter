import { describe, expect, it } from "vitest";
import { getPermissions, hasPermission } from "../../../apps/api/src/permissions.js";

describe("role permissions", () => {
  it("admin has all 15 permissions", () => {
    const perms = getPermissions("admin");
    expect(perms).toContain("tools:use");
    expect(perms).toContain("files:all");
    expect(perms).toContain("users:manage");
    expect(perms).toContain("features:manage");
    expect(perms).toContain("system:health");
    expect(perms).toContain("audit:read");
    expect(perms.length).toBe(15);
  });

  it("editor has collaborative but not admin permissions", () => {
    const perms = getPermissions("editor");
    expect(perms).toContain("tools:use");
    expect(perms).toContain("files:own");
    expect(perms).toContain("files:all");
    expect(perms).toContain("pipelines:all");
    expect(perms).toContain("settings:read");
    expect(perms).not.toContain("users:manage");
    expect(perms).not.toContain("settings:write");
    expect(perms).not.toContain("teams:manage");
    expect(perms).not.toContain("features:manage");
    expect(perms).not.toContain("system:health");
    expect(perms).not.toContain("audit:read");
  });

  it("user has basic permissions only", () => {
    const perms = getPermissions("user");
    expect(perms).toContain("tools:use");
    expect(perms).toContain("files:own");
    expect(perms).toContain("apikeys:own");
    expect(perms).toContain("pipelines:own");
    expect(perms).toContain("settings:read");
    expect(perms).not.toContain("files:all");
    expect(perms).not.toContain("users:manage");
  });

  it("unknown role returns empty permissions", () => {
    const perms = getPermissions("bogus" as any);
    expect(perms).toEqual([]);
  });

  it("hasPermission checks correctly", () => {
    expect(hasPermission("admin", "users:manage")).toBe(true);
    expect(hasPermission("editor", "users:manage")).toBe(false);
    expect(hasPermission("user", "tools:use")).toBe(true);
    expect(hasPermission("user", "files:all")).toBe(false);
  });
});
