/**
 * API key edge-case tests — name validation, delete behavior, key revocation.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `akec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// Helper: register a user, clear mustChangePassword, return credentials + token
async function createUserAndLogin(
  opts: { role?: string } = {},
): Promise<{ username: string; password: string; id: string; token: string }> {
  const username = uid();
  const password = "ValidPass1";
  const regRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, ...opts },
  });
  if (regRes.statusCode !== 201) {
    throw new Error(`createUserAndLogin register failed: ${regRes.statusCode} ${regRes.body}`);
  }
  const regBody = JSON.parse(regRes.body);

  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username))
    .run();

  const loginRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  const loginBody = JSON.parse(loginRes.body);
  if (!loginBody.token) {
    throw new Error(`createUserAndLogin login failed: ${loginRes.body}`);
  }

  return { username, password, id: regBody.id, token: loginBody.token };
}

// ═══════════════════════════════════════════════════════════════════════════
// Creation validation
// ═══════════════════════════════════════════════════════════════════════════
describe("API key creation validation", () => {
  it("rejects name longer than 100 chars", async () => {
    const longName = "x".repeat(101);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: longName },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("uses default name when body is empty", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("Default API Key");
  });

  it("trims whitespace from name", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "  padded-name  " },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("padded-name");
  });

  it("returns raw key starting with si_ only on creation", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "raw-key-check" },
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.key).toBeDefined();
    expect(createBody.key.startsWith("si_")).toBe(true);

    // GET list must NOT include the raw key
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const listBody = JSON.parse(listRes.body);
    const match = listBody.apiKeys.find((k: any) => k.id === createBody.id);
    expect(match).toBeDefined();
    expect(match.key).toBeUndefined();
  });

  it("rejects invalid expiresAt format", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "bad-date-key", expiresAt: "not-a-date" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Delete behavior
// ═══════════════════════════════════════════════════════════════════════════
describe("API key delete behavior", () => {
  it("user can delete own key", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "delete-me" },
    });
    const keyId = JSON.parse(createRes.body).id;

    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${keyId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    const body = JSON.parse(delRes.body);
    expect(body.ok).toBe(true);
  });

  it("user cannot delete another user's key", async () => {
    // Admin creates a key
    const adminKeyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "admin-owned-key" },
    });
    const adminKeyId = JSON.parse(adminKeyRes.body).id;

    // Create a separate user
    const other = await createUserAndLogin({ role: "user" });

    // Other user tries to delete admin's key
    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${adminKeyId}`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(delRes.statusCode).toBe(404);
  });

  it("delete non-existent key returns 404", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/api-keys/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("deleted key stops working immediately", async () => {
    // Create a key and verify it works
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "revoke-test-key" },
    });
    const { id: keyId, key: rawKey } = JSON.parse(createRes.body);

    // Use the key — should succeed
    const beforeRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(beforeRes.statusCode).toBe(200);

    // Delete the key
    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${keyId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    // Use the key again — should fail
    const afterRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(afterRes.statusCode).toBe(401);
  });
});
