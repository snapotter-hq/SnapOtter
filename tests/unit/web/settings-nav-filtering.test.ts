// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

interface NavItem {
  id: string;
  label: string;
  requiredPermission?: string;
  authRequired?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General" },
  { id: "system", label: "System Settings", requiredPermission: "settings:write" },
  { id: "security", label: "Security", authRequired: true },
  { id: "people", label: "People", requiredPermission: "users:manage", authRequired: true },
  { id: "teams", label: "Teams", requiredPermission: "teams:manage", authRequired: true },
  { id: "roles", label: "Roles", requiredPermission: "users:manage", authRequired: true },
  { id: "audit-log", label: "Audit Log", requiredPermission: "audit:read" },
  { id: "api-keys", label: "API Keys" },
  { id: "ai-features", label: "AI Features", requiredPermission: "features:manage" },
  { id: "tools", label: "Tools" },
  { id: "analytics", label: "Product Analytics" },
  { id: "about", label: "About" },
];

function filterNavItems(
  items: NavItem[],
  hasPermission: (p: string) => boolean,
  authEnabled: boolean,
): NavItem[] {
  return items.filter(
    (item) =>
      (!item.requiredPermission || hasPermission(item.requiredPermission)) &&
      (!item.authRequired || authEnabled),
  );
}

describe("settings nav filtering", () => {
  const _allPerms = (_p: string) => true;
  const userPerms = (p: string) =>
    ["tools:use", "files:own", "apikeys:own", "pipelines:own", "settings:read"].includes(p);
  const adminPerms = (p: string) =>
    [
      "tools:use",
      "files:own",
      "files:all",
      "apikeys:own",
      "apikeys:all",
      "pipelines:own",
      "pipelines:all",
      "settings:read",
      "settings:write",
      "users:manage",
      "teams:manage",
      "features:manage",
      "system:health",
      "audit:read",
    ].includes(p);

  describe("auth disabled (anonymous admin)", () => {
    it("hides security, people, teams, roles when auth is disabled", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, false);
      const ids = visible.map((i) => i.id);
      expect(ids).not.toContain("security");
      expect(ids).not.toContain("people");
      expect(ids).not.toContain("teams");
      expect(ids).not.toContain("roles");
    });

    it("shows general, system, api-keys, ai-features, tools, analytics, about", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, false);
      const ids = visible.map((i) => i.id);
      expect(ids).toContain("general");
      expect(ids).toContain("system");
      expect(ids).toContain("api-keys");
      expect(ids).toContain("ai-features");
      expect(ids).toContain("tools");
      expect(ids).toContain("analytics");
      expect(ids).toContain("about");
    });

    it("shows audit-log (not authRequired, only needs audit:read)", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, false);
      const ids = visible.map((i) => i.id);
      expect(ids).toContain("audit-log");
    });

    it("returns exactly 8 items for anonymous admin", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, false);
      expect(visible).toHaveLength(8);
    });
  });

  describe("auth enabled + admin", () => {
    it("shows all 12 items for authenticated admin", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, true);
      expect(visible).toHaveLength(12);
    });

    it("includes auth-dependent sections", () => {
      const visible = filterNavItems(NAV_ITEMS, adminPerms, true);
      const ids = visible.map((i) => i.id);
      expect(ids).toContain("security");
      expect(ids).toContain("people");
      expect(ids).toContain("teams");
      expect(ids).toContain("roles");
    });
  });

  describe("auth enabled + user role", () => {
    it("hides permission-gated sections for user role", () => {
      const visible = filterNavItems(NAV_ITEMS, userPerms, true);
      const ids = visible.map((i) => i.id);
      expect(ids).not.toContain("system");
      expect(ids).not.toContain("people");
      expect(ids).not.toContain("teams");
      expect(ids).not.toContain("roles");
      expect(ids).not.toContain("audit-log");
      expect(ids).not.toContain("ai-features");
    });

    it("shows general, security, api-keys, tools, analytics, about for user role", () => {
      const visible = filterNavItems(NAV_ITEMS, userPerms, true);
      const ids = visible.map((i) => i.id);
      expect(ids).toContain("general");
      expect(ids).toContain("security");
      expect(ids).toContain("api-keys");
      expect(ids).toContain("tools");
      expect(ids).toContain("analytics");
      expect(ids).toContain("about");
    });

    it("returns exactly 6 items for user role", () => {
      const visible = filterNavItems(NAV_ITEMS, userPerms, true);
      expect(visible).toHaveLength(6);
    });
  });
});
