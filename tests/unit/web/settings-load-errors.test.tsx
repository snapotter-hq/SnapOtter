// @vitest-environment jsdom

/**
 * A settings list or form that fails to load says so, with a Retry, instead
 * of rendering its empty state or a form of defaults (#1447). "No API keys"
 * after a 500 reads as "there are none", and an admin may go and create them
 * again; a System tab of invented defaults reads as the live configuration.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPost };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    permissions: [],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
  }),
}));

import {
  AdminSecuritySettings,
  ApiKeysSection,
  AuditLogSection,
  PeopleSection,
  RolesSection,
  SystemSection,
  TeamsSection,
} from "@/components/settings/settings-dialog";

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  apiPost.mockReset();
});

/** Resolve every GET from `data` by path prefix; reject the ones listed in `failing`. */
function serve(data: Record<string, unknown>, failing: string[]) {
  apiGet.mockImplementation(async (path: string) => {
    if (failing.some((prefix) => path.startsWith(prefix))) {
      throw new Error("Internal server error");
    }
    const hit = Object.keys(data).find((prefix) => path.startsWith(prefix));
    if (!hit) throw new Error(`unexpected GET ${path}`);
    return data[hit];
  });
}

const s = en.settings;

const team = {
  id: "t1",
  name: "Design",
  memberCount: 1,
  storageQuota: null,
  retentionHours: null,
  createdAt: "2026-01-01T00:00:00Z",
};
const role = {
  id: "r1",
  name: "auditor",
  description: "Reads the audit log",
  permissions: ["audit:read"],
  isBuiltin: false,
  userCount: 0,
};
const user = {
  id: "u1",
  username: "ada",
  role: "user",
  team: "Default",
  createdAt: "2026-01-01T00:00:00Z",
};
const apiKey = {
  id: 1,
  name: "ci key",
  prefix: "si_abc",
  createdAt: "2026-01-01T00:00:00Z",
  permissions: null,
  expiresAt: null,
};
const auditEntry = {
  id: "a1",
  actorId: "u1",
  actorUsername: "ada",
  action: "LOGIN_SUCCESS",
  targetType: null,
  targetId: null,
  details: null,
  ipAddress: null,
  requestId: null,
  createdAt: "2026-01-01T00:00:00Z",
};

interface Case {
  name: string;
  element: () => ReactElement;
  endpoint: string;
  data: Record<string, unknown>;
  /** The same endpoints answering with nothing in the list. */
  empty: Record<string, unknown>;
  failedText: string;
  emptyText: string;
  loadedText: string;
}

const cases: Case[] = [
  {
    name: "People",
    element: () => <PeopleSection />,
    endpoint: "/auth/users",
    data: {
      "/auth/users": { users: [user], maxUsers: 0 },
      "/v1/teams": { teams: [team] },
      "/v1/roles": { roles: [role] },
    },
    empty: {
      "/auth/users": { users: [], maxUsers: 0 },
      "/v1/teams": { teams: [] },
      "/v1/roles": { roles: [] },
    },
    failedText: s.people.loadFailed,
    emptyText: s.people.noUsersFound,
    loadedText: "ada",
  },
  {
    name: "API keys",
    element: () => <ApiKeysSection />,
    endpoint: "/v1/api-keys",
    data: { "/v1/api-keys": { apiKeys: [apiKey] } },
    empty: { "/v1/api-keys": { apiKeys: [] } },
    failedText: s.apiKeys.loadFailed,
    emptyText: s.apiKeys.emptyState,
    loadedText: "ci key",
  },
  {
    name: "Teams",
    element: () => <TeamsSection />,
    endpoint: "/v1/teams",
    data: { "/v1/teams": { teams: [team] } },
    empty: { "/v1/teams": { teams: [] } },
    failedText: s.teams.loadFailed,
    emptyText: s.teams.emptyState,
    loadedText: "Design",
  },
  {
    name: "Roles",
    element: () => <RolesSection />,
    endpoint: "/v1/roles",
    data: { "/v1/roles": { roles: [role] } },
    empty: { "/v1/roles": { roles: [] } },
    failedText: s.roles.loadFailed,
    emptyText: s.roles.emptyState,
    loadedText: "Reads the audit log",
  },
  {
    name: "Audit log",
    element: () => <AuditLogSection />,
    endpoint: "/v1/audit-log",
    data: { "/v1/audit-log": { entries: [auditEntry], total: 1 } },
    empty: { "/v1/audit-log": { entries: [], total: 0 } },
    failedText: s.auditLog.loadFailed,
    emptyText: s.auditLog.emptyState,
    loadedText: "ada",
  },
];

describe("a settings list that fails to load (#1447)", () => {
  it.each(cases)("$name shows the failure and a Retry, not its empty state", async (c) => {
    serve(c.data, [c.endpoint]);

    render(c.element());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(c.failedText);
    expect(screen.queryByText(c.emptyText)).toBeNull();
  });

  it.each(cases)("$name loads on Retry once the server answers", async (c) => {
    serve(c.data, [c.endpoint]);
    render(c.element());
    const retry = await screen.findByRole("button", { name: en.common.retry });

    serve(c.data, []);
    fireEvent.click(retry);

    expect(await screen.findByText(c.loadedText)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(cases)(
    "$name that loads with nothing in it shows its empty state, no alert",
    async (c) => {
      serve(c.empty, []);

      render(c.element());

      expect(await screen.findByText(c.emptyText)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});

describe("People (#1447)", () => {
  it("shows no user count when the list didn't load", async () => {
    serve(cases[0].data, ["/auth/users"]);

    render(<PeopleSection />);
    await screen.findByRole("alert");

    // A failed load leaves the list empty; its count must not read as "0 users".
    expect(screen.queryByText(s.people.userCountPlural.replace("{count}", "0"))).toBeNull();
  });

  it("still shows the users when only the team and role pickers fail to load", async () => {
    // Those fetches need teams:manage and audit:read, which a users:manage
    // admin may not have; the pickers fall back to Default and the built-in
    // roles, and the user list must not be hidden behind their 403.
    serve(cases[0].data, ["/v1/teams", "/v1/roles"]);

    render(<PeopleSection />);

    expect(await screen.findByText("ada")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reloads the pickers and the password policy too on Retry", async () => {
    serve(cases[0].data, ["/auth/users", "/v1/teams", "/v1/roles"]);
    render(<PeopleSection />);
    const retry = await screen.findByRole("button", { name: en.common.retry });

    serve(cases[0].data, []);
    fireEvent.click(retry);
    await screen.findByText("ada");

    const paths = apiGet.mock.calls.map(([path]) => path as string);
    // /v1/settings feeds Generate's minimum length (#2027); the helper has no
    // answer for it, which the section tolerates.
    for (const endpoint of ["/auth/users", "/v1/teams", "/v1/roles", "/v1/settings"]) {
      expect(paths.filter((p) => p.startsWith(endpoint)).length, endpoint).toBe(2);
    }
  });

  it("edits a user with their current role and team selected when the pickers fell back", async () => {
    // With the fallback lists, "uploader" and "Design" aren't options; a
    // select whose value isn't an option shows the first one, so the admin
    // would read "User" and "Default" and a change to those would save nothing.
    serve(
      {
        "/auth/users": { users: [{ ...user, role: "uploader", team: "Design" }], maxUsers: 0 },
      },
      ["/v1/teams", "/v1/roles"],
    );
    render(<PeopleSection />);
    fireEvent.click(await screen.findByRole("button", { name: en.common.actions }));
    fireEvent.click(screen.getByText(s.people.editRoleTeamAction));

    expect(screen.getByDisplayValue("uploader")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Design")).toBeInTheDocument();
  });
});

describe("API keys (#1447)", () => {
  it("keeps a new key's one-time secret on screen when the list reload after it fails", async () => {
    // The secret is shown exactly once. Hiding it behind the load failure
    // would leave a working key nobody holds.
    serve({ "/v1/api-keys": { apiKeys: [] } }, []);
    apiPost.mockResolvedValue({ key: "si_secret_123" });
    render(<ApiKeysSection />);
    const generate = await screen.findByRole("button", { name: s.apiKeys.generateButton });

    serve({}, ["/v1/api-keys"]);
    fireEvent.click(generate);

    expect(await screen.findByText("si_secret_123")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(s.apiKeys.loadFailed);
  });
});

describe("settings forms that fail to load (#1447)", () => {
  const forms = [
    {
      name: "admin security",
      element: () => <AdminSecuritySettings />,
      failedText: s.security.adminSettingsLoadFailed,
      save: /save/i,
    },
    {
      name: "system",
      element: () => <SystemSection />,
      failedText: s.system.loadFailed,
      save: s.system.saveButton,
    },
  ];

  it.each(forms)("$name shows the failure and a Retry instead of a form of defaults", async (f) => {
    serve({ "/v1/settings": { settings: {} } }, ["/v1/settings"]);

    render(f.element());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(f.failedText);
    expect(screen.queryByRole("button", { name: f.save })).toBeNull();
  });

  it.each(forms)("$name loads the form on Retry once the server answers", async (f) => {
    serve({ "/v1/settings": { settings: {} } }, ["/v1/settings"]);
    render(f.element());
    await screen.findByRole("alert");

    serve({ "/v1/settings": { settings: {} } }, []);
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));

    expect(await screen.findByRole("button", { name: f.save })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
