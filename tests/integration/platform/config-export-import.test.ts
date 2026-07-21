import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

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

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("config export without enterprise license", () => {
  it("returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("config import without enterprise license", () => {
  it("returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1 },
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1 },
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("config export with enterprise license", () => {
  let licensedApp: TestApp;
  let licensedToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["config_export_import"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedToken = await loginAsAdmin(licensedApp.app);
  }, 30_000);

  afterAll(async () => {
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  it("returns 200 with config object", async () => {
    const res = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${licensedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("config has configSchemaVersion field", async () => {
    const res = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${licensedToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.configSchemaVersion).toBe(1);
  });

  it("config has settings object", async () => {
    const res = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${licensedToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.settings).toBeDefined();
    expect(typeof body.settings).toBe("object");
  });

  it("redacted keys are not present in export", async () => {
    const redactedKeys = [
      "cookie_secret",
      "instance_id",
      "siem_config",
      "scim_token_hash",
      "oidc_client_secret",
      "saml_idp_certificate",
      "siem_last_forwarded_at",
      "siem_consecutive_failures",
      "audit_archival_state",
      "backup_last_completed",
      "webhook_destinations",
    ];

    for (const key of redactedKeys) {
      await db.insert(schema.settings).values({ key, value: "secret-value" }).onConflictDoNothing();
    }

    const res = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${licensedToken}` },
    });
    const body = JSON.parse(res.body);

    for (const key of redactedKeys) {
      expect(body.settings[key]).toBeUndefined();
    }
  });
});

describe("config import with enterprise license", () => {
  let licensedApp: TestApp;
  let licensedToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["config_export_import"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedToken = await loginAsAdmin(licensedApp.app);
  }, 30_000);

  afterAll(async () => {
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  it("returns 403 for non-admin users", async () => {
    await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        username: "configimportuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "configimportuser"));

    const loginRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "configimportuser", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1 },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies config import to a custom role even when it has every admin permission", async () => {
    const suffix = Date.now().toString(36);
    const roleName = `config-health-${suffix}`;
    const username = `config-health-user-${suffix}`;
    const settingKey = `configImportAuthzSentinel${suffix}`;
    let roleId: string | undefined;
    let userId: string | undefined;

    try {
      const roleRes = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/roles",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: { name: roleName, permissions: ADMIN_PERMISSIONS },
      });
      if (roleRes.statusCode !== 201) {
        throw new Error(`Failed to create config test role: ${roleRes.body}`);
      }
      roleId = JSON.parse(roleRes.body).id as string;

      const registerRes = await licensedApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: { username, password: "TestPass1", role: roleName },
      });
      if (registerRes.statusCode !== 201) {
        throw new Error(`Failed to create config test user: ${registerRes.body}`);
      }
      userId = JSON.parse(registerRes.body).id as string;

      await db
        .update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.id, userId));

      const loginRes = await licensedApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password: "TestPass1" },
      });
      const actorToken = JSON.parse(loginRes.body).token as string;

      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${actorToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { [settingKey]: "must-not-be-imported" },
          },
        },
      });

      const body = JSON.parse(res.body);
      const [importedSetting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, settingKey));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(body.code).toBe("ESCALATION_DENIED");
      expect(importedSetting).toBeUndefined();
    } finally {
      await db.delete(schema.settings).where(eq(schema.settings.key, settingKey));
      if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
      if (roleId) await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
    }
  });

  it("denies config import through a permission-scoped built-in admin API key", async () => {
    const suffix = Date.now().toString(36);
    const settingKey = `configImportScopedKeySentinel${suffix}`;
    const keyRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        name: `config-import-scoped-${suffix}`,
        permissions: ["system:health"],
      },
    });
    expect(keyRes.statusCode, keyRes.body).toBe(201);
    const scopedKey = JSON.parse(keyRes.body).key as string;

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${scopedKey}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { [settingKey]: "must-not-be-imported" },
          },
        },
      });
      const [importedSetting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, settingKey));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(JSON.parse(res.body).code).toBe("ESCALATION_DENIED");
      expect(importedSetting).toBeUndefined();
    } finally {
      await db.delete(schema.settings).where(eq(schema.settings.key, settingKey));
    }
  });

  it.each([
    {
      caseName: "unknown permissions",
      roleName: "config-invalid-permission",
      role: {
        name: "config-invalid-permission",
        permissions: ["users:impersonate"],
      },
    },
    {
      caseName: "unknown tool permission modes",
      roleName: "config-invalid-tool-mode",
      role: {
        name: "config-invalid-tool-mode",
        permissions: ["tools:use"],
        toolPermissions: { mode: "everything", allowed: ["compress-image"] },
      },
    },
    {
      caseName: "invalid role names",
      roleName: "INVALID ROLE!",
      role: {
        name: "INVALID ROLE!",
        permissions: ["settings:read"],
      },
    },
  ])("rejects $caseName before mutating any configuration", async ({ roleName, role }) => {
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const settingKey = `configInvalidRoleSentinel${suffix}`;

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { [settingKey]: "must-not-be-imported" },
            roles: [role],
          },
        },
      });
      const [importedSetting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, settingKey));
      const [importedRole] = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, roleName));

      expect.soft(res.statusCode, res.body).toBe(400);
      expect.soft(JSON.parse(res.body).error).toBe("Invalid import payload");
      expect.soft(importedSetting).toBeUndefined();
      expect(importedRole).toBeUndefined();
    } finally {
      await db.delete(schema.settings).where(eq(schema.settings.key, settingKey));
      await db.delete(schema.roles).where(eq(schema.roles.name, roleName));
    }
  });

  it("dry-run reports setting, role, and team changes without mutating them", async () => {
    const suffix = Date.now().toString(36);
    const settingKey = `configDryRunSetting${suffix}`;
    const roleName = `config-dry-run-role-${suffix}`;
    const teamName = `config-dry-run-team-${suffix}`;

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: true,
        config: {
          configSchemaVersion: 1,
          settings: { [settingKey]: "hello" },
          roles: [{ name: roleName, permissions: ["settings:read"] }],
          teams: [{ name: teamName }],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dryRun).toBe(true);
    expect(body.changes).toBeDefined();
    expect(body.changes).toEqual({ settings: 1, roles: 1, teams: 1 });
    expect(body.details).toBeDefined();
    expect(body.details.settings).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: settingKey, action: "create" })]),
    );
    expect(body.details.roles).toContainEqual({ name: roleName, action: "create" });
    expect(body.details.teams).toContainEqual({ name: teamName, action: "create" });

    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, settingKey));
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));
    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.name, teamName));
    expect.soft(setting).toBeUndefined();
    expect.soft(role).toBeUndefined();
    expect(team).toBeUndefined();
  });

  it("rejects future schema versions", async () => {
    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 999 },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Unsupported config schema version");
  });

  it("allows the full built-in admin to import an empty config", async () => {
    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.applied).toBe(true);
    expect(body.changes.settings).toBe(0);
    expect(body.changes.roles).toBe(0);
    expect(body.changes.teams).toBe(0);
  });

  it("import with valid settings applies them", async () => {
    const settingKey = "configImportTestKey";
    const settingValue = "configImportTestValue";

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: {
          configSchemaVersion: 1,
          settings: { [settingKey]: settingValue },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.applied).toBe(true);
    expect(body.changes.settings).toBe(1);

    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, settingKey));
    expect(row).toBeDefined();
    expect(row.value).toBe(settingValue);
  });
});

describe("config round-trip", () => {
  let licensedApp: TestApp;
  let licensedToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["config_export_import"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedToken = await loginAsAdmin(licensedApp.app);
  }, 30_000);

  afterAll(async () => {
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  it("export then dry-run import reports 0 changes", async () => {
    const exportRes = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${licensedToken}` },
    });
    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.body);

    const importRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: true,
        config: {
          configSchemaVersion: exported.configSchemaVersion,
          settings: exported.settings,
          roles: exported.roles,
          teams: exported.teams,
        },
      },
    });
    expect(importRes.statusCode).toBe(200);
    const body = JSON.parse(importRes.body);
    expect(body.dryRun).toBe(true);

    for (const detail of body.details.settings) {
      expect(detail.action).toBe("update");
    }
    for (const detail of body.details.roles) {
      expect(detail.action).toBe("update");
    }
    for (const detail of body.details.teams) {
      expect(detail.action).toBe("update");
    }
  });
});
