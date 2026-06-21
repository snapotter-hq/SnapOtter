import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

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

  it("dry-run mode returns changes without applying", async () => {
    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      headers: { authorization: `Bearer ${licensedToken}` },
      payload: {
        dryRun: true,
        config: {
          configSchemaVersion: 1,
          settings: { testSetting: "hello" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dryRun).toBe(true);
    expect(body.changes).toBeDefined();
    expect(body.changes.settings).toBeGreaterThanOrEqual(1);
    expect(body.details).toBeDefined();
    expect(body.details.settings).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "testSetting" })]),
    );
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

  it("empty config import succeeds with no changes", async () => {
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
