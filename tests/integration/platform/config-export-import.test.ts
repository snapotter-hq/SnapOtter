import { randomUUID } from "node:crypto";
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
      "siem_webhook_auth",
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

  it("exports the canonical password-digit key without its legacy alias", async () => {
    const keys = ["passwordRequireDigit", "passwordRequireNumber"];
    const originalRows = await db.select().from(schema.settings);
    const originals = new Map(
      originalRows.filter((row) => keys.includes(row.key)).map((row) => [row.key, row.value]),
    );

    try {
      await db
        .insert(schema.settings)
        .values({ key: "passwordRequireDigit", value: "false" })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: "false" } });
      await db
        .insert(schema.settings)
        .values({ key: "passwordRequireNumber", value: "true" })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: "true" } });

      const res = await licensedApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/config/export",
        headers: { authorization: `Bearer ${licensedToken}` },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode, res.body).toBe(200);
      expect(body.settings.passwordRequireDigit).toBe("false");
      expect(body.settings.passwordRequireNumber).toBeUndefined();
    } finally {
      for (const key of keys) {
        const original = originals.get(key);
        if (original === undefined) {
          await db.delete(schema.settings).where(eq(schema.settings.key, key));
        } else {
          await db
            .update(schema.settings)
            .set({ value: original })
            .where(eq(schema.settings.key, key));
        }
      }
    }
  });

  it("exports custom roles with their permissions but omits built-in roles", async () => {
    const suffix = Date.now().toString(36);
    const roleName = `config-export-role-${suffix}`;
    const roleId = randomUUID();
    const permissions = ["settings:read", "audit:read"];
    const toolPermissions = { mode: "tool", allowed: ["compress-image"] };

    try {
      await db.insert(schema.roles).values({
        id: roleId,
        name: roleName,
        description: "exported custom role",
        permissions,
        toolPermissions,
        isBuiltin: false,
      });

      const res = await licensedApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/config/export",
        headers: { authorization: `Bearer ${licensedToken}` },
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);

      const exportedRoles = (body.roles ?? []) as Array<Record<string, unknown>>;
      const exported = exportedRoles.find((role) => role.name === roleName);
      expect(exported).toBeDefined();
      expect(exported?.description).toBe("exported custom role");
      expect(exported?.permissions).toEqual(permissions);
      expect(exported?.toolPermissions).toEqual(toolPermissions);

      // Built-in roles must never leak into the export.
      const builtinNames = exportedRoles.map((role) => role.name);
      expect(builtinNames).not.toContain("admin");
      expect(builtinNames).not.toContain("user");
      expect(builtinNames).not.toContain("editor");
    } finally {
      await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
    }
  });

  it("denies config export to a custom role even with every admin permission", async () => {
    const suffix = Date.now().toString(36);
    const roleName = `config-export-${suffix}`;
    const username = `config-export-user-${suffix}`;
    let roleId: string | undefined;
    let userId: string | undefined;

    try {
      const roleRes = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/roles",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: { name: roleName, permissions: ADMIN_PERMISSIONS },
      });
      expect(roleRes.statusCode, roleRes.body).toBe(201);
      roleId = JSON.parse(roleRes.body).id as string;

      const registerRes = await licensedApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: { username, password: "TestPass1", role: roleName },
      });
      expect(registerRes.statusCode, registerRes.body).toBe(201);
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
        method: "GET",
        url: "/api/v1/enterprise/config/export",
        headers: { authorization: `Bearer ${actorToken}` },
      });

      expect.soft(res.statusCode, res.body).toBe(403);
      expect(JSON.parse(res.body).code).toBe("ESCALATION_DENIED");
    } finally {
      if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
      if (roleId) await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
    }
  });

  it("denies config export through a permission-scoped built-in admin API key", async () => {
    const suffix = Date.now().toString(36);
    const keyRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        name: `config-export-scoped-${suffix}`,
        permissions: ["system:health"],
      },
    });
    expect(keyRes.statusCode, keyRes.body).toBe(201);
    const scopedKey = JSON.parse(keyRes.body).key as string;

    const res = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/config/export",
      headers: { authorization: `Bearer ${scopedKey}` },
    });

    expect.soft(res.statusCode, res.body).toBe(403);
    expect(JSON.parse(res.body).code).toBe("ESCALATION_DENIED");
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
    const settingKey = "defaultToolView";
    const roleName = `config-dry-run-role-${suffix}`;
    const teamName = `config-dry-run-team-${suffix}`;
    await db.delete(schema.settings).where(eq(schema.settings.key, settingKey));

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: true,
        config: {
          configSchemaVersion: 1,
          settings: { [settingKey]: "fullscreen" },
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

  it.each([
    { field: "retentionHours", value: 2_147_483_648 },
    { field: "storageQuota", value: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects out-of-range team $field during dry-run and apply", async ({ field, value }) => {
    const teamName = `config-out-of-range-${field}-${Date.now().toString(36)}`;
    const config = {
      configSchemaVersion: 1,
      teams: [{ name: teamName, [field]: value }],
    };

    try {
      for (const dryRun of [true, false]) {
        const res = await licensedApp.app.inject({
          method: "POST",
          url: "/api/v1/enterprise/config/import",
          headers: { authorization: `Bearer ${licensedToken}` },
          payload: { dryRun, config },
        });

        expect(res.statusCode, res.body).toBe(400);
      }

      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.name, teamName));
      expect(team).toBeUndefined();
    } finally {
      await db.delete(schema.teams).where(eq(schema.teams.name, teamName));
    }
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

  it("rejects an unlicensed MFA policy atomically during config import", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "optional" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "optional" } });

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: {
          configSchemaVersion: 1,
          settings: { defaultTheme: "dark", mfaPolicy: "required" },
        },
      },
    });
    const [theme] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultTheme"));
    const [mfaPolicy] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "mfaPolicy"));

    expect.soft(res.statusCode, res.body).toBe(403);
    expect.soft(JSON.parse(res.body).code).toBe("FEATURE_NOT_LICENSED");
    expect.soft(theme?.value).toBe("system");
    expect(mfaPolicy?.value).toBe("optional");
  });

  it("rejects SSO enforcement without a configured provider atomically", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });
    await db
      .insert(schema.settings)
      .values({ key: "ssoEnforcement", value: "false" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "false" } });

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: {
          configSchemaVersion: 1,
          settings: { defaultTheme: "dark", ssoEnforcement: "true" },
        },
      },
    });
    const [theme] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultTheme"));
    const [ssoEnforcement] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "ssoEnforcement"));

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("DEPENDENCY_VALIDATION_FAILED");
    expect.soft(theme?.value).toBe("system");
    expect(ssoEnforcement?.value).toBe("false");
  });

  it("rejects duplicate imported roles without partially applying settings", async () => {
    const roleName = `config-duplicate-role-${Date.now().toString(36)}`;
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { defaultTheme: "dark" },
            roles: [
              { name: roleName, permissions: ["settings:read"] },
              { name: roleName, permissions: ["settings:read"] },
            ],
          },
        },
      });
      const [theme] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "defaultTheme"));
      const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));

      expect.soft(res.statusCode, res.body).toBe(400);
      expect.soft(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
      expect.soft(theme?.value).toBe("system");
      expect(role).toBeUndefined();
    } finally {
      await db.delete(schema.roles).where(eq(schema.roles.name, roleName));
    }
  });

  it("rejects built-in role names without partially applying settings", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: {
          configSchemaVersion: 1,
          settings: { defaultTheme: "dark" },
          roles: [{ name: "admin", permissions: ["settings:read"] }],
        },
      },
    });
    const [theme] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultTheme"));
    const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "admin"));

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
    expect.soft(theme?.value).toBe("system");
    expect(adminRole?.isBuiltin).toBe(true);
  });

  it("rejects duplicate imported teams without partially applying settings", async () => {
    const teamName = `Config Duplicate Team ${Date.now().toString(36)}`;
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { defaultTheme: "dark" },
            teams: [{ name: teamName }, { name: teamName }],
          },
        },
      });
      const [theme] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "defaultTheme"));
      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.name, teamName));

      expect.soft(res.statusCode, res.body).toBe(400);
      expect.soft(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
      expect.soft(theme?.value).toBe("system");
      expect(team).toBeUndefined();
    } finally {
      await db.delete(schema.teams).where(eq(schema.teams.name, teamName));
    }
  });

  it("rejects dedicated settings atomically during config import", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "defaultTheme", value: "system" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "system" } });
    await db
      .insert(schema.settings)
      .values({ key: "ipAllowlist", value: "[]" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "[]" } });

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: {
          configSchemaVersion: 1,
          settings: { defaultTheme: "dark", ipAllowlist: '["0.0.0.0/0"]' },
        },
      },
    });
    const [theme] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultTheme"));
    const [allowlist] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "ipAllowlist"));

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("READONLY_SETTING");
    expect.soft(theme?.value).toBe("system");
    expect(allowlist?.value).toBe("[]");
  });

  it("rejects unknown and malformed setting keys during config import", async () => {
    const unknownKey = `config_unknown_${Date.now().toString(36)}`;
    const unknownRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1, settings: { [unknownKey]: "value" } },
      },
    });
    const malformedRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: false,
        config: { configSchemaVersion: 1, settings: { loginAttemptLimit: "0" } },
      },
    });
    const [unknownSetting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, unknownKey));

    expect.soft(unknownRes.statusCode, unknownRes.body).toBe(400);
    expect.soft(JSON.parse(unknownRes.body).code).toBe("UNKNOWN_SETTING");
    expect.soft(malformedRes.statusCode, malformedRes.body).toBe(400);
    expect.soft(JSON.parse(malformedRes.body).code).toBe("VALIDATION_ERROR");
    expect(unknownSetting).toBeUndefined();
  });

  it("import with valid settings applies them", async () => {
    const settingKey = "defaultLocale";
    const settingValue = "fr";

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

  it("rejects two aliased setting keys that collapse to the same storage key", async () => {
    // passwordRequireNumber has storageKey "passwordRequireDigit"; importing both
    // in one payload must be rejected as a same-import duplicate, not silently merged.
    const originalRows = await db.select().from(schema.settings);
    const keys = ["passwordRequireDigit", "passwordRequireNumber"];
    const originals = new Map(
      originalRows.filter((row) => keys.includes(row.key)).map((row) => [row.key, row.value]),
    );
    await db
      .insert(schema.settings)
      .values({ key: "passwordRequireDigit", value: "true" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "true" } });

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { passwordRequireDigit: "false", passwordRequireNumber: "false" },
          },
        },
      });

      expect.soft(res.statusCode, res.body).toBe(400);
      const body = JSON.parse(res.body);
      expect.soft(body.code).toBe("VALIDATION_ERROR");
      expect.soft(body.error).toContain("duplicates");

      // The rejected import must not have mutated the seeded digit value.
      const [digit] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "passwordRequireDigit"));
      expect(digit?.value).toBe("true");
    } finally {
      for (const key of keys) {
        const original = originals.get(key);
        if (original === undefined) {
          await db.delete(schema.settings).where(eq(schema.settings.key, key));
        } else {
          await db
            .update(schema.settings)
            .set({ value: original })
            .where(eq(schema.settings.key, key));
        }
      }
    }
  });

  it("applies settings, roles, and teams, both updating existing rows and inserting new ones", async () => {
    const suffix = Date.now().toString(36);
    const updateSettingKey = "defaultToolView";
    const insertSettingKey = "defaultLocale";
    const updateRoleName = `cfg-upd-${suffix}`;
    const insertRoleName = `cfg-ins-${suffix}`;
    const updateTeamName = `Config Apply Update Team ${suffix}`;
    const insertTeamName = `Config Apply Insert Team ${suffix}`;
    const updateRoleId = randomUUID();
    const updateTeamId = randomUUID();

    // Seed the pre-existing rows the apply path should UPDATE (not INSERT).
    await db
      .insert(schema.settings)
      .values({ key: updateSettingKey, value: "sidebar" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "sidebar" } });
    await db
      .insert(schema.settings)
      .values({ key: insertSettingKey, value: "en" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "en" } });
    await db.insert(schema.roles).values({
      id: updateRoleId,
      name: updateRoleName,
      description: "before",
      permissions: ["settings:read"],
      toolPermissions: null,
      isBuiltin: false,
    });
    await db.insert(schema.teams).values({
      id: updateTeamId,
      name: updateTeamName,
      storageQuota: 100,
      retentionHours: 24,
    });

    try {
      const res = await licensedApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        headers: { authorization: `Bearer ${licensedToken}` },
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { [updateSettingKey]: "fullscreen", [insertSettingKey]: "de" },
            roles: [
              {
                name: updateRoleName,
                description: "after",
                permissions: ["settings:read", "audit:read"],
                toolPermissions: { mode: "category", allowed: ["image"] },
              },
              { name: insertRoleName, permissions: ["files:own"] },
            ],
            teams: [
              { name: updateTeamName, storageQuota: 200, retentionHours: 48 },
              { name: insertTeamName, storageQuota: 500 },
            ],
          },
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.applied).toBe(true);
      expect(body.changes).toEqual({ settings: 2, roles: 2, teams: 2 });

      // Settings: one updated, one updated-from-existing (both existed, so both update).
      const [updatedSetting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, updateSettingKey));
      const [otherSetting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, insertSettingKey));
      expect(updatedSetting?.value).toBe("fullscreen");
      expect(otherSetting?.value).toBe("de");

      // Role UPDATE branch: same id, new description/permissions/toolPermissions.
      const [updatedRole] = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, updateRoleName));
      expect(updatedRole?.id).toBe(updateRoleId);
      expect(updatedRole?.description).toBe("after");
      expect(updatedRole?.permissions).toEqual(["settings:read", "audit:read"]);
      expect(updatedRole?.toolPermissions).toEqual({ mode: "category", allowed: ["image"] });
      expect(updatedRole?.isBuiltin).toBe(false);

      // Role INSERT branch: brand-new custom role.
      const [insertedRole] = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, insertRoleName));
      expect(insertedRole).toBeDefined();
      expect(insertedRole?.permissions).toEqual(["files:own"]);
      expect(insertedRole?.description).toBe("");
      expect(insertedRole?.toolPermissions).toBeNull();
      expect(insertedRole?.isBuiltin).toBe(false);

      // Team UPDATE branch: same id, new quotas.
      const [updatedTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, updateTeamName));
      expect(updatedTeam?.id).toBe(updateTeamId);
      expect(updatedTeam?.storageQuota).toBe(200);
      expect(updatedTeam?.retentionHours).toBe(48);

      // Team INSERT branch: brand-new team, unspecified retentionHours defaults to null.
      const [insertedTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, insertTeamName));
      expect(insertedTeam).toBeDefined();
      expect(insertedTeam?.storageQuota).toBe(500);
      expect(insertedTeam?.retentionHours).toBeNull();
    } finally {
      await db.delete(schema.roles).where(eq(schema.roles.name, updateRoleName));
      await db.delete(schema.roles).where(eq(schema.roles.name, insertRoleName));
      await db.delete(schema.teams).where(eq(schema.teams.name, updateTeamName));
      await db.delete(schema.teams).where(eq(schema.teams.name, insertTeamName));
      await db.delete(schema.settings).where(eq(schema.settings.key, insertSettingKey));
    }
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

  it("export then dry-run import classifies existing records as updates", async () => {
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
