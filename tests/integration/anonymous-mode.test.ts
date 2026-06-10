import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { ensureAnonymousUser, hashPassword } from "../../apps/api/src/plugins/auth.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  await ensureAnonymousUser();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("ensureAnonymousUser", () => {
  it("creates anonymous row in the users table", async () => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(row).toBeDefined();
    expect(row?.username).toBe("anonymous");
    expect(row?.role).toBe("admin");
    expect(row?.mustChangePassword).toBe(false);
  });

  it("is idempotent", async () => {
    await ensureAnonymousUser();
    await ensureAnonymousUser();
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(rows).toHaveLength(1);
  });
});

describe("FK constraint with anonymous userId", () => {
  it("can insert an API key with userId 'anonymous'", async () => {
    const keyHash = await hashPassword("si_test");
    await expect(
      db.insert(schema.apiKeys).values({
        id: randomUUID(),
        userId: "anonymous",
        keyHash,
        keyPrefix: "si_te",
        name: "FK test key",
      }),
    ).resolves.toBeDefined();
  });

  it("can insert a pipeline with userId 'anonymous'", async () => {
    await expect(
      db.insert(schema.pipelines).values({
        id: randomUUID(),
        userId: "anonymous",
        name: "FK test pipeline",
        steps: JSON.stringify([{ toolId: "resize", settings: { width: 100 } }]),
      }),
    ).resolves.toBeDefined();
  });

  it("can insert a user file with userId 'anonymous'", async () => {
    await expect(
      db.insert(schema.userFiles).values({
        id: randomUUID(),
        userId: "anonymous",
        originalName: "test.png",
        storedName: "fk-test-stored.png",
        mimeType: "image/png",
        size: 1024,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects FK violation for nonexistent userId", async () => {
    const keyHash = await hashPassword("si_bad");
    await expect(
      db.insert(schema.apiKeys).values({
        id: randomUUID(),
        userId: "nonexistent-user-id",
        keyHash,
        keyPrefix: "si_ba",
        name: "bad FK key",
      }),
    ).rejects.toThrow();
  });
});

describe("admin settings save (issue #135 regression guard)", () => {
  it("admin can PUT /api/v1/settings", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { defaultToolView: "fullscreen" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("admin can GET /api/v1/settings with saved value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.settings.defaultToolView).toBe("fullscreen");
  });

  it("user role cannot PUT /api/v1/settings", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "anon-test-user", password: "Testpass1!", role: "user" },
    });
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "anon-test-user", password: "Testpass1!" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { defaultToolView: "sidebar" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("admin API key operations", () => {
  it("admin can create and list API keys", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "integration-test-key" },
    });
    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.key).toBeDefined();
    expect(body.key.startsWith("si_")).toBe(true);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(Array.isArray(listBody.apiKeys)).toBe(true);
  });
});

describe("admin pipeline operations", () => {
  it("admin can save and list pipelines", async () => {
    const saveRes = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "integration-test-pipeline",
        steps: [{ toolId: "resize", settings: { width: 200, height: 200, fit: "cover" } }],
      },
    });
    expect(saveRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(Array.isArray(body.pipelines)).toBe(true);
    expect(
      body.pipelines.some((p: { name: string }) => p.name === "integration-test-pipeline"),
    ).toBe(true);
  });
});
