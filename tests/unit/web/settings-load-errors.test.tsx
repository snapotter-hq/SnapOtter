// @vitest-environment jsdom

/**
 * A settings list that fails to load says so, with a Retry, instead of
 * rendering its empty state (#1447). "No API keys" after a 500 reads as
 * "there are none", and an admin may go and create them again.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet };
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
  TeamsSection,
} from "@/components/settings/settings-dialog";

afterEach(() => {
  cleanup();
  apiGet.mockReset();
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
  failedText: string;
  emptyText: RegExp;
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
    failedText: "Couldn't load users.",
    emptyText: /No users found/,
    loadedText: "ada",
  },
  {
    name: "API keys",
    element: () => <ApiKeysSection />,
    endpoint: "/v1/api-keys",
    data: {
      "/v1/api-keys": {
        apiKeys: [
          {
            id: 1,
            name: "ci key",
            prefix: "si_abc",
            createdAt: "2026-01-01T00:00:00Z",
            permissions: null,
            expiresAt: null,
          },
        ],
      },
    },
    failedText: "Couldn't load your API keys.",
    emptyText: /No API keys yet/,
    loadedText: "ci key",
  },
  {
    name: "Teams",
    element: () => <TeamsSection />,
    endpoint: "/v1/teams",
    data: { "/v1/teams": { teams: [team] } },
    failedText: "Couldn't load teams.",
    emptyText: /No teams found/,
    loadedText: "Design",
  },
  {
    name: "Roles",
    element: () => <RolesSection />,
    endpoint: "/v1/roles",
    data: { "/v1/roles": { roles: [role] } },
    failedText: "Couldn't load roles.",
    emptyText: /No roles found/,
    loadedText: "Reads the audit log",
  },
  {
    name: "Audit log",
    element: () => <AuditLogSection />,
    endpoint: "/v1/audit-log",
    data: { "/v1/audit-log": { entries: [auditEntry], total: 1 } },
    failedText: "Couldn't load the audit log.",
    emptyText: /No audit log entries/,
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
    const retry = await screen.findByRole("button", { name: "Retry" });

    serve(c.data, []);
    fireEvent.click(retry);

    expect(await screen.findByText(c.loadedText)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still shows the users when only the team and role pickers fail to load", async () => {
    // Those fetches need teams:manage and audit:read, which a users:manage
    // admin may not have; the pickers fall back to Default and the built-in
    // roles, and the user list must not be hidden behind their 403.
    serve(
      {
        "/auth/users": { users: [user], maxUsers: 0 },
        "/v1/teams": { teams: [] },
        "/v1/roles": { roles: [] },
      },
      ["/v1/teams", "/v1/roles"],
    );

    render(<PeopleSection />);

    expect(await screen.findByText("ada")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("admin security settings that fail to load (#1447)", () => {
  it("shows the failure and a Retry instead of a form full of defaults", async () => {
    serve({ "/v1/settings": { settings: {} } }, ["/v1/settings"]);

    render(<AdminSecuritySettings />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the security settings.");
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("loads the form on Retry once the server answers", async () => {
    serve({ "/v1/settings": { settings: {} } }, ["/v1/settings"]);
    render(<AdminSecuritySettings />);
    await screen.findByRole("alert");

    serve({ "/v1/settings": { settings: {} } }, []);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
