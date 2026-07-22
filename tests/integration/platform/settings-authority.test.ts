import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const DEDICATED_OR_SERVER_SETTING_KEYS = [
  "cookie_secret",
  "instance_id",
  "scim_token_hash",
  "siem_config",
  "webhook_destinations",
  "ipAllowlist",
  "siem_last_forwarded_at",
  "siem_consecutive_failures",
  "audit_archival_state",
  "backup_last_completed",
  "sqlite_import",
  "onboarding.firstProcessedAt",
] as const;

let testApp: TestApp;
let adminToken: string;
let settingsManagerToken: string;
let settingsManagerRoleId: string;
let settingsManagerUserId: string;
let settingsOnlyApiKey: string;
let securityApiKey: string;
let complianceApiKey: string;
const originalSettings = new Map<string, string | undefined>();

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function readSetting(key: string): Promise<string | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key));
  return row?.value;
}

async function createApiKey(name: string, permissions: string[]): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, permissions },
  });
  if (res.statusCode !== 201) throw new Error(`Failed to create ${name}: ${res.body}`);
  return JSON.parse(res.body).key as string;
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  for (const key of [
    ...DEDICATED_OR_SERVER_SETTING_KEYS,
    "defaultTheme",
    "loginAttemptLimit",
    "auditRetentionDays",
    "oidc_client_secret",
    "passwordRequireDigit",
    "passwordRequireNumber",
    "ssoEnforcement",
  ]) {
    originalSettings.set(key, await readSetting(key));
  }

  const suffix = Date.now().toString(36);
  const roleName = `settings-manager-${suffix}`;
  const username = `settings-manager-user-${suffix}`;
  const roleRes = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: roleName, permissions: ["settings:read", "settings:write"] },
  });
  if (roleRes.statusCode !== 201) throw new Error(`Failed to create role: ${roleRes.body}`);
  settingsManagerRoleId = JSON.parse(roleRes.body).id as string;

  const registerRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password: "SettingsPass1", role: roleName },
  });
  if (registerRes.statusCode !== 201) {
    throw new Error(`Failed to create settings manager: ${registerRes.body}`);
  }
  settingsManagerUserId = JSON.parse(registerRes.body).id as string;
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.id, settingsManagerUserId));

  const loginRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "SettingsPass1" },
  });
  if (loginRes.statusCode !== 200) throw new Error(`Failed to log in manager: ${loginRes.body}`);
  settingsManagerToken = JSON.parse(loginRes.body).token as string;

  settingsOnlyApiKey = await createApiKey(`settings-only-${suffix}`, [
    "settings:read",
    "settings:write",
  ]);
  securityApiKey = await createApiKey(`settings-security-${suffix}`, [
    "settings:read",
    "settings:write",
    "security:manage",
  ]);
  complianceApiKey = await createApiKey(`settings-compliance-${suffix}`, [
    "settings:read",
    "settings:write",
    "compliance:manage",
  ]);
}, 30_000);

afterAll(async () => {
  for (const [key, value] of originalSettings) {
    if (value === undefined) {
      await db.delete(schema.settings).where(eq(schema.settings.key, key));
    } else {
      await upsertSetting(key, value);
    }
  }
  if (settingsManagerUserId) {
    await db.delete(schema.users).where(eq(schema.users.id, settingsManagerUserId));
  }
  if (settingsManagerRoleId) {
    await db.delete(schema.roles).where(eq(schema.roles.id, settingsManagerRoleId));
  }
  await testApp.cleanup();
}, 10_000);

describe("generic settings authority", () => {
  it("keeps ordinary settings available to a delegated settings manager", async () => {
    await upsertSetting("defaultTheme", "system");
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsManagerToken}` },
      payload: { defaultTheme: "dark" },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(await readSetting("defaultTheme")).toBe("dark");
  });

  it("keeps ordinary settings available to a permission-scoped API key", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsOnlyApiKey}` },
      payload: { defaultTheme: "light" },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(await readSetting("defaultTheme")).toBe("light");
  });

  it.each(DEDICATED_OR_SERVER_SETTING_KEYS)(
    "rejects generic writes to protected setting %s without changing it",
    async (key) => {
      const originalValue = (await readSetting(key)) ?? `original-${key}`;
      if ((await readSetting(key)) === undefined) await upsertSetting(key, originalValue);

      const res = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${settingsManagerToken}` },
        payload: { [key]: `replacement-${key}` },
      });

      expect.soft(res.statusCode, res.body).toBe(400);
      expect.soft(JSON.parse(res.body).code).toBe("READONLY_SETTING");
      expect(await readSetting(key)).toBe(originalValue);
    },
  );

  it("rejects dedicated-endpoint settings even for a full administrator", async () => {
    const originalValue = "full-admin-scim-sentinel";
    await upsertSetting("scim_token_hash", originalValue);

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scim_token_hash: "full-admin-replacement" },
    });

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("READONLY_SETTING");
    expect(await readSetting("scim_token_hash")).toBe(originalValue);
  });

  it("requires security authority for authentication-policy settings", async () => {
    await upsertSetting("loginAttemptLimit", "5");

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsOnlyApiKey}` },
      payload: { loginAttemptLimit: "25" },
    });

    expect.soft(res.statusCode, res.body).toBe(403);
    expect.soft(JSON.parse(res.body).code).toBe("FORBIDDEN");
    expect(await readSetting("loginAttemptLimit")).toBe("5");
  });

  it("allows a correctly scoped security manager to update a valid policy", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
      payload: { loginAttemptLimit: "25" },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(await readSetting("loginAttemptLimit")).toBe("25");
  });

  it("rejects malformed security-policy values", async () => {
    await upsertSetting("loginAttemptLimit", "5");

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
      payload: { loginAttemptLimit: "0" },
    });

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
    expect(await readSetting("loginAttemptLimit")).toBe("5");
  });

  it("rejects SSO enforcement without a configured provider atomically", async () => {
    await upsertSetting("defaultTheme", "system");
    await upsertSetting("ssoEnforcement", "false");

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
      payload: { defaultTheme: "dark", ssoEnforcement: "true" },
    });

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("DEPENDENCY_VALIDATION_FAILED");
    expect.soft(await readSetting("defaultTheme")).toBe("system");
    expect(await readSetting("ssoEnforcement")).toBe("false");
  });

  it("requires compliance authority for audit-retention settings", async () => {
    await upsertSetting("auditRetentionDays", "30");

    const denied = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsOnlyApiKey}` },
      payload: { auditRetentionDays: "7" },
    });
    expect.soft(denied.statusCode, denied.body).toBe(403);
    expect.soft(await readSetting("auditRetentionDays")).toBe("30");

    const allowed = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${complianceApiKey}` },
      payload: { auditRetentionDays: "7" },
    });
    expect.soft(allowed.statusCode, allowed.body).toBe(200);
    expect(await readSetting("auditRetentionDays")).toBe("7");
  });

  it("keeps security and compliance scopes independent", async () => {
    await upsertSetting("loginAttemptLimit", "5");
    await upsertSetting("auditRetentionDays", "30");

    const securityToCompliance = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
      payload: { auditRetentionDays: "7" },
    });
    const complianceToSecurity = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${complianceApiKey}` },
      payload: { loginAttemptLimit: "25" },
    });

    expect.soft(securityToCompliance.statusCode, securityToCompliance.body).toBe(403);
    expect.soft(complianceToSecurity.statusCode, complianceToSecurity.body).toBe(403);
    expect.soft(await readSetting("auditRetentionDays")).toBe("30");
    expect(await readSetting("loginAttemptLimit")).toBe("5");
  });

  it("rejects an unauthorized mixed batch without writing its safe entries", async () => {
    await upsertSetting("defaultTheme", "system");
    await upsertSetting("loginAttemptLimit", "5");

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsManagerToken}` },
      payload: {
        defaultTheme: "dark",
        loginAttemptLimit: "50",
      },
    });

    expect.soft(res.statusCode, res.body).toBe(403);
    expect.soft(await readSetting("defaultTheme")).toBe("system");
    expect(await readSetting("loginAttemptLimit")).toBe("5");
  });

  it("rejects a mixed read-only batch without writing its ordinary entries", async () => {
    await upsertSetting("defaultTheme", "system");
    await upsertSetting("scim_token_hash", "mixed-batch-sentinel");

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { defaultTheme: "dark", scim_token_hash: "replacement" },
    });

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(await readSetting("defaultTheme")).toBe("system");
    expect(await readSetting("scim_token_hash")).toBe("mixed-batch-sentinel");
  });

  it("rejects unknown setting keys instead of granting them default authority", async () => {
    const unknownKey = `unknown_setting_${Date.now().toString(36)}`;
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { [unknownKey]: "value" },
    });

    expect.soft(res.statusCode, res.body).toBe(400);
    expect.soft(JSON.parse(res.body).code).toBe("UNKNOWN_SETTING");
    expect(await readSetting(unknownKey)).toBeUndefined();
  });

  it("does not let a scoped built-in-admin key cross the full-admin secret boundary", async () => {
    await upsertSetting("oidc_client_secret", "secret-value");

    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsOnlyApiKey}` },
    });
    const keyRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/oidc_client_secret",
      headers: { authorization: `Bearer ${settingsOnlyApiKey}` },
    });

    expect.soft(listRes.statusCode, listRes.body).toBe(200);
    expect.soft(JSON.parse(listRes.body).settings).not.toHaveProperty("oidc_client_secret");
    expect(keyRes.statusCode, keyRes.body).toBe(403);
  });

  it("requires security authority to read authentication-policy settings", async () => {
    await upsertSetting("loginAttemptLimit", "5");

    const deniedList = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsManagerToken}` },
    });
    const deniedKey = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/loginAttemptLimit",
      headers: { authorization: `Bearer ${settingsManagerToken}` },
    });
    const allowedKey = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/loginAttemptLimit",
      headers: { authorization: `Bearer ${securityApiKey}` },
    });

    expect.soft(JSON.parse(deniedList.body).settings).not.toHaveProperty("loginAttemptLimit");
    expect.soft(deniedKey.statusCode, deniedKey.body).toBe(403);
    expect(allowedKey.statusCode, allowedKey.body).toBe(200);
  });

  it("normalizes the legacy password-number alias on writes and reads", async () => {
    await upsertSetting("passwordRequireNumber", "true");
    await upsertSetting("passwordRequireDigit", "true");

    const writeRes = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
      payload: { passwordRequireNumber: "false" },
    });
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${securityApiKey}` },
    });
    const keyRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings/passwordRequireNumber",
      headers: { authorization: `Bearer ${securityApiKey}` },
    });

    expect.soft(writeRes.statusCode, writeRes.body).toBe(200);
    expect.soft(await readSetting("passwordRequireDigit")).toBe("false");
    expect.soft(JSON.parse(listRes.body).settings).not.toHaveProperty("passwordRequireNumber");
    expect.soft(JSON.parse(listRes.body).settings.passwordRequireDigit).toBe("false");
    expect(keyRes.statusCode, keyRes.body).toBe(200);
    expect(JSON.parse(keyRes.body)).toMatchObject({
      key: "passwordRequireDigit",
      value: "false",
    });
  });

  it("reserves legacy identity-provider secrets for full administrators", async () => {
    const denied = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${settingsManagerToken}` },
      payload: { oidc_client_secret: "manager-secret" },
    });
    expect.soft(denied.statusCode, denied.body).toBe(403);

    const allowed = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { oidc_client_secret: "admin-secret" },
    });
    expect.soft(allowed.statusCode, allowed.body).toBe(200);
    expect(await readSetting("oidc_client_secret")).toBe("admin-secret");
  });
});
