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

describe("role permissions", () => {
  it("admin has all 14 permissions", async () => {
    const perms = await getPermissions("admin");
    expect(perms).toContain("tools:use");
    expect(perms).toContain("files:all");
    expect(perms).toContain("users:manage");
    expect(perms).toContain("features:manage");
    expect(perms).toContain("system:health");
    expect(perms).toContain("audit:read");
    expect(perms.length).toBe(14);
  });

  it("editor has collaborative but not admin permissions", async () => {
    const perms = await getPermissions("editor");
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

  it("user has basic permissions only", async () => {
    const perms = await getPermissions("user");
    expect(perms).toContain("tools:use");
    expect(perms).toContain("files:own");
    expect(perms).toContain("apikeys:own");
    expect(perms).toContain("pipelines:own");
    expect(perms).toContain("settings:read");
    expect(perms).not.toContain("files:all");
    expect(perms).not.toContain("users:manage");
  });

  it("unknown role returns empty permissions", async () => {
    const perms = await getPermissions("bogus" as any);
    expect(perms).toEqual([]);
  });

  it("hasPermission checks correctly", async () => {
    expect(await hasPermission("admin", "users:manage")).toBe(true);
    expect(await hasPermission("editor", "users:manage")).toBe(false);
    expect(await hasPermission("user", "tools:use")).toBe(true);
    expect(await hasPermission("user", "files:all")).toBe(false);
  });
});
