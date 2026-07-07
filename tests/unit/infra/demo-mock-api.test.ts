import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchDemoRoute } from "../../../apps/demo/src/mock-api.js";

const packageJson = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
) as { version: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe("demo mock API", () => {
  it("reports the same app version as the current package build", async () => {
    const response = matchDemoRoute("/api/v1/health", "GET");

    expect(response?.status).toBe(200);
    await expect(readJson(response as Response)).resolves.toMatchObject({
      status: "ok",
      version: packageJson.version,
    });
  });

  it("returns the full auth configuration shape consumed by the real web app", async () => {
    const response = matchDemoRoute("/api/v1/config/auth", "GET");

    expect(response?.status).toBe(200);
    await expect(readJson(response as Response)).resolves.toEqual({
      authEnabled: true,
      oidcEnabled: false,
      oidcProviderName: null,
      samlEnabled: false,
      samlProviderName: null,
      ssoEnforced: false,
    });
  });

  it("returns an authenticated admin session so the demo skips the login screen", async () => {
    const response = matchDemoRoute("/api/auth/session", "GET");
    expect(response?.status).toBe(200);
    const data = (await readJson(response as Response)) as {
      user: { role: string; mustChangePassword: boolean; permissions: string[] };
    };
    expect(data.user.role).toBe("admin");
    expect(data.user.mustChangePassword).toBe(false);
    expect(Array.isArray(data.user.permissions)).toBe(true);
  });

  // These lock in the exact response shapes the admin settings screens read.
  // A missing array here is what produced the "can't access property filter"
  // crash: the People tab calls /auth/users, and the mock used to answer only
  // /v1/users, so `data.users` was undefined and `users.filter()` threw.

  it("serves the People list at /auth/users with a populated users array", async () => {
    const response = matchDemoRoute("/api/auth/users", "GET");
    expect(response?.status).toBe(200);
    const data = (await readJson(response as Response)) as {
      users: Array<Record<string, unknown>>;
      maxUsers: number;
    };
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users.length).toBeGreaterThan(3);
    expect(typeof data.maxUsers).toBe("number");
    for (const user of data.users) {
      expect(typeof user.username).toBe("string");
      expect(typeof user.role).toBe("string");
      expect(typeof user.team).toBe("string");
      expect(typeof user.createdAt).toBe("string");
    }
  });

  it("serves teams, roles, and api keys as real arrays", async () => {
    const teams = (await readJson(matchDemoRoute("/api/v1/teams", "GET") as Response)) as {
      teams: unknown[];
    };
    const roles = (await readJson(matchDemoRoute("/api/v1/roles", "GET") as Response)) as {
      roles: unknown[];
    };
    const keys = (await readJson(matchDemoRoute("/api/v1/api-keys", "GET") as Response)) as {
      apiKeys: unknown[];
    };
    expect(Array.isArray(teams.teams)).toBe(true);
    expect(teams.teams.length).toBeGreaterThan(0);
    expect(Array.isArray(roles.roles)).toBe(true);
    expect(roles.roles.length).toBeGreaterThan(0);
    expect(Array.isArray(keys.apiKeys)).toBe(true);
    expect(keys.apiKeys.length).toBeGreaterThan(0);
  });

  it("paginates the audit log and honours the action filter", async () => {
    const page1 = (await readJson(
      matchDemoRoute("/api/v1/audit-log?page=1&limit=25", "GET") as Response,
    )) as { entries: unknown[]; total: number };
    expect(Array.isArray(page1.entries)).toBe(true);
    expect(page1.entries.length).toBeGreaterThan(0);
    expect(page1.entries.length).toBeLessThanOrEqual(25);
    expect(page1.total).toBeGreaterThanOrEqual(page1.entries.length);

    const filtered = (await readJson(
      matchDemoRoute("/api/v1/audit-log?page=1&limit=25&action=LOGIN_SUCCESS", "GET") as Response,
    )) as { entries: Array<{ action: string }> };
    for (const entry of filtered.entries) {
      expect(entry.action).toBe("LOGIN_SUCCESS");
    }
  });

  it("returns a complete usage payload with every array the dashboard maps", async () => {
    const usage = (await readJson(
      matchDemoRoute("/api/v1/admin/usage?days=30", "GET") as Response,
    )) as Record<string, unknown>;
    for (const key of ["jobsPerDay", "topTools", "perUser", "durations", "teamStorage"]) {
      expect(Array.isArray(usage[key])).toBe(true);
      expect((usage[key] as unknown[]).length).toBeGreaterThan(0);
    }
    const storage = usage.storage as { libraryBytes: string; libraryFiles: number };
    expect(typeof storage.libraryBytes).toBe("string");
    expect(typeof storage.libraryFiles).toBe("number");
  });

  it("exposes settings and preferences objects the settings tabs read", async () => {
    const settings = (await readJson(matchDemoRoute("/api/v1/settings", "GET") as Response)) as {
      settings: Record<string, string>;
    };
    expect(settings.settings.fileUploadLimitMb).toBeTruthy();
    expect(settings.settings.passwordMinLength).toBeTruthy();
    const prefs = (await readJson(matchDemoRoute("/api/v1/preferences", "GET") as Response)) as {
      preferences: Record<string, unknown>;
    };
    expect(typeof prefs.preferences).toBe("object");
  });

  it("creates an API key and returns the one-time raw key", async () => {
    const response = matchDemoRoute(
      "/api/v1/api-keys",
      "POST",
      JSON.stringify({ name: "Demo test key" }),
    );
    expect(response?.status).toBe(200);
    const data = (await readJson(response as Response)) as { key: string; name: string };
    expect(data.name).toBe("Demo test key");
    expect(data.key.startsWith("si_")).toBe(true);
  });

  it("adds a user via /auth/register so the People tab reload shows it", async () => {
    const created = matchDemoRoute(
      "/api/auth/register",
      "POST",
      JSON.stringify({ username: "test.newbie", role: "user", team: "Design" }),
    );
    expect(created?.status).toBe(200);
    const list = (await readJson(matchDemoRoute("/api/auth/users", "GET") as Response)) as {
      users: Array<{ username: string }>;
    };
    expect(list.users.some((u) => u.username === "test.newbie")).toBe(true);
  });

  it("disables file processing with a clear demo message", async () => {
    const response = matchDemoRoute("/api/v1/tools/compress-image", "POST", "{}");
    expect(response?.status).toBe(403);
    const data = (await readJson(response as Response)) as { error: string };
    expect(data.error).toContain("demo");
  });
});
