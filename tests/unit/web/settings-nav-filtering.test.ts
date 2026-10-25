// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/components/settings/two-factor-settings", () => ({
  TwoFactorSettings: () => null,
}));

import {
  RolesSection,
  SecuritySection,
  SettingsDialog,
} from "@/components/settings/settings-dialog";

const nav = en.settings.nav;

const ALL_NAV_LABELS = [
  nav.general,
  nav.systemSettings,
  nav.security,
  nav.people,
  nav.teams,
  nav.roles,
  nav.auditLog,
  nav.usage,
  nav.apiKeys,
  nav.aiFeatures,
  nav.tools,
  nav.about,
];

const USER_PERMISSIONS = [
  "tools:use",
  "files:own",
  "apikeys:own",
  "pipelines:own",
  "settings:read",
];

const ADMIN_PERMISSIONS = [
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
  "compliance:manage",
  "webhooks:manage",
  "security:manage",
];

function mockAuth(permissions: string[], authEnabled = true) {
  const set = new Set(permissions);
  useAuth.mockReturnValue({
    loading: false,
    authEnabled,
    isAuthenticated: true,
    mustChangePassword: false,
    username: "testuser",
    role: "custom",
    permissions,
    hasPermission: (p: string) => set.has(p),
    hasLocalPassword: true,
    totpEnabled: false,
  });
}

async function renderedNavLabels(): Promise<string[]> {
  render(createElement(SettingsDialog, { open: true, onClose: () => {} }));
  await screen.findByText("testuser");
  return ALL_NAV_LABELS.filter((label) => screen.queryByRole("button", { name: label }) !== null);
}

beforeEach(() => {
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/auth/session")) {
      return { user: { id: 1, username: "testuser", role: "custom" } };
    }
    if (path.startsWith("/v1/preferences")) return { preferences: {} };
    if (path.startsWith("/v1/settings")) return { settings: {} };
    if (path.startsWith("/v1/roles")) {
      return {
        roles: [
          {
            id: "r-builtin",
            name: "admin",
            description: "Administrator",
            permissions: ADMIN_PERMISSIONS,
            isBuiltin: true,
            userCount: 1,
          },
          {
            id: "r-custom",
            name: "reviewer",
            description: "Custom role",
            permissions: ["tools:use"],
            isBuiltin: false,
            userCount: 2,
          },
        ],
      };
    }
    throw new Error(`unexpected GET ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiGet.mockReset();
  useAuth.mockReset();
});

describe("settings nav filtering", () => {
  describe("auth disabled (anonymous admin)", () => {
    it("hides security, people, teams, roles when auth is disabled", async () => {
      mockAuth(ADMIN_PERMISSIONS, false);
      const visible = await renderedNavLabels();
      expect(visible).not.toContain(nav.security);
      expect(visible).not.toContain(nav.people);
      expect(visible).not.toContain(nav.teams);
      expect(visible).not.toContain(nav.roles);
    });

    it("shows general, system, audit-log, usage, api-keys, ai-features, tools, about", async () => {
      mockAuth(ADMIN_PERMISSIONS, false);
      const visible = await renderedNavLabels();
      expect(visible).toEqual([
        nav.general,
        nav.systemSettings,
        nav.auditLog,
        nav.usage,
        nav.apiKeys,
        nav.aiFeatures,
        nav.tools,
        nav.about,
      ]);
    });
  });

  describe("auth enabled + admin", () => {
    it("shows all 12 items for authenticated admin", async () => {
      mockAuth(ADMIN_PERMISSIONS, true);
      const visible = await renderedNavLabels();
      expect(visible).toEqual(ALL_NAV_LABELS);
      expect(visible).toHaveLength(12);
    });
  });

  describe("auth enabled + user role", () => {
    it("shows only general, security, api-keys, about for user role", async () => {
      mockAuth(USER_PERMISSIONS, true);
      const visible = await renderedNavLabels();
      expect(visible).toEqual([nav.general, nav.security, nav.apiKeys, nav.about]);
    });
  });

  describe("Roles tab and section permission alignment (#1549)", () => {
    it("hides Roles tab when a custom role has users:manage without audit:read", async () => {
      mockAuth(["users:manage"], true);
      const visible = await renderedNavLabels();
      expect(visible).toContain(nav.people);
      expect(visible).not.toContain(nav.roles);
    });

    it("shows Roles tab when a custom role has audit:read without users:manage", async () => {
      mockAuth(["audit:read"], true);
      const visible = await renderedNavLabels();
      expect(visible).toContain(nav.roles);
      expect(visible).not.toContain(nav.people);
    });

    it("hides role create, edit, and delete controls when the user lacks security:manage", async () => {
      mockAuth(["audit:read"], true);
      render(createElement(RolesSection));

      expect(await screen.findByText("reviewer")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: en.settings.roles.createButton })).toBeNull();
      expect(screen.queryByRole("button", { name: en.a11y.editRole })).toBeNull();
      expect(screen.queryByRole("button", { name: en.a11y.deleteRole })).toBeNull();
    });

    it("shows role create, edit, and delete controls when the user has security:manage", async () => {
      mockAuth(["audit:read", "security:manage"], true);
      render(createElement(RolesSection));

      expect(await screen.findByText("reviewer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: en.settings.roles.createButton }),
      ).toBeInTheDocument();
      // Only the custom role (reviewer) renders edit/delete buttons; built-in admin stays locked.
      expect(screen.getAllByRole("button", { name: en.a11y.editRole })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: en.a11y.deleteRole })).toHaveLength(1);
    });

    it("unmounts open role create and edit forms if security:manage is lost on re-render", async () => {
      mockAuth(["audit:read", "security:manage"], true);
      const view = render(createElement(RolesSection));

      expect(await screen.findByText("reviewer")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: en.settings.roles.createButton }));
      fireEvent.click(screen.getByRole("button", { name: en.a11y.editRole }));
      expect(screen.getByText(en.settings.roles.newRoleHeading)).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText(en.settings.roles.roleNamePlaceholder)).toHaveLength(2);

      mockAuth(["audit:read"], true);
      view.rerender(createElement(RolesSection));

      expect(screen.queryByText(en.settings.roles.newRoleHeading)).toBeNull();
      expect(screen.queryByPlaceholderText(en.settings.roles.roleNamePlaceholder)).toBeNull();
    });
  });

  describe("API Keys tab permission alignment (#1549)", () => {
    it("hides API Keys tab when a custom role has neither apikeys:own nor apikeys:all", async () => {
      mockAuth(["tools:use", "files:own", "settings:read"], true);
      const visible = await renderedNavLabels();
      expect(visible).not.toContain(nav.apiKeys);
    });

    it("shows API Keys tab when a custom role has apikeys:own", async () => {
      mockAuth(["apikeys:own"], true);
      const visible = await renderedNavLabels();
      expect(visible).toContain(nav.apiKeys);
    });

    it("shows API Keys tab when a custom role has only apikeys:all", async () => {
      mockAuth(["apikeys:all"], true);
      const visible = await renderedNavLabels();
      expect(visible).toContain(nav.apiKeys);
    });
  });

  describe("Admin security settings permission alignment (#1549)", () => {
    it.each([
      ["missing settings:read", ["settings:write", "security:manage"]],
      ["missing settings:write", ["settings:read", "security:manage"]],
      ["missing security:manage", ["settings:read", "settings:write"]],
    ])("does not mount AdminSecuritySettings when %s", async (_label, perms) => {
      mockAuth(perms, true);
      render(createElement(SecuritySection));

      expect(await screen.findByText(en.settings.security.heading)).toBeInTheDocument();
      expect(screen.queryByText(en.settings.security.adminHeading)).toBeNull();
      expect(apiGet).not.toHaveBeenCalledWith("/v1/settings");
    });

    it("mounts AdminSecuritySettings when the user has settings:read, settings:write, and security:manage", async () => {
      mockAuth(["settings:read", "settings:write", "security:manage"], true);
      render(createElement(SecuritySection));

      expect(await screen.findByText(en.settings.security.adminHeading)).toBeInTheDocument();
      expect(apiGet).toHaveBeenCalledWith("/v1/settings");
    });
  });
});
