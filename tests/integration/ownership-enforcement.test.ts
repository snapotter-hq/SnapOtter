/**
 * Cross-user ownership enforcement tests.
 *
 * Validates that files and pipelines are properly scoped per-user,
 * that editors (files:all, pipelines:all) can see everything,
 * and that API key scoping respects ownership boundaries.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

// Unique suffix to avoid collisions with other test files sharing the DB
const ts = Date.now();
const userAName = `own_userA_${ts}`;
const userBName = `own_userB_${ts}`;
const editorName = `own_editor_${ts}`;

let userAToken: string;
let userBToken: string;
let editorToken: string;

// Shared state across tests
let userAFileId: string;
let userAPipelineId: string;

// Load test fixture
const fixtureBuffer = readFileSync(join(import.meta.dirname, "..", "fixtures", "test-1x1.png"));

/** Register a user, clear mustChangePassword, log in, return token. */
async function createAndLogin(
  app: TestApp["app"],
  token: string,
  username: string,
  role: "user" | "editor" | "admin",
): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${token}` },
    payload: { username, password: "TestPass1", role },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username))
    .run();
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "TestPass1" },
  });
  const body = JSON.parse(loginRes.body);
  if (!body.token) throw new Error(`Login failed for ${username}: ${loginRes.body}`);
  return body.token as string;
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Create three actors: userA (user), userB (user), editor
  userAToken = await createAndLogin(testApp.app, adminToken, userAName, "user");
  userBToken = await createAndLogin(testApp.app, adminToken, userBName, "user");
  editorToken = await createAndLogin(testApp.app, adminToken, editorName, "editor");
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ── File ownership ────────────────────────────────────────────────────

describe("file ownership enforcement", () => {
  it("1. user A uploads a file -> 201", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "userA-image.png",
        contentType: "image/png",
        content: fixtureBuffer,
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${userAToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const parsed = JSON.parse(res.body);
    expect(parsed.files).toHaveLength(1);
    userAFileId = parsed.files[0].id;
  });

  it("2. user A can access their own file -> 200", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${userAFileId}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.file.id).toBe(userAFileId);
  });

  it("3. user B cannot access user A's file -> 404", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${userAFileId}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("4. editor can access user A's file (has files:all) -> 200", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${userAFileId}`,
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.file.id).toBe(userAFileId);
  });

  it("5. admin can access user A's file -> 200", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${userAFileId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.file.id).toBe(userAFileId);
  });

  it("6. user B's file list does NOT contain user A's files", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    const ids = parsed.files.map((f: { id: string }) => f.id);
    expect(ids).not.toContain(userAFileId);
  });

  it("7. editor's file list DOES contain user A's files", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    const ids = parsed.files.map((f: { id: string }) => f.id);
    expect(ids).toContain(userAFileId);
  });

  it("8. user B cannot download user A's file -> 404", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${userAFileId}/download`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Pipeline ownership ────────────────────────────────────────────────

describe("pipeline ownership enforcement", () => {
  it("9. user A saves a pipeline -> 201", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: `Pipeline-A-${ts}`,
        steps: [{ toolId: "rotate", settings: { angle: 90 } }],
      },
    });
    expect(res.statusCode).toBe(201);
    const parsed = JSON.parse(res.body);
    userAPipelineId = parsed.id;
  });

  it("10. user B's pipeline list does NOT include user A's pipeline", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    const ids = parsed.pipelines.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(userAPipelineId);
  });

  it("11. editor CAN see user A's pipeline (has pipelines:all)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    const ids = parsed.pipelines.map((p: { id: string }) => p.id);
    expect(ids).toContain(userAPipelineId);
  });

  it("12. user B cannot delete user A's pipeline -> 403", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${userAPipelineId}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("13. editor can delete user A's pipeline (has pipelines:all) -> 200", async () => {
    // Save a second pipeline for user A so test 13 doesn't conflict with later tests
    const saveRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: `Pipeline-A-Deletable-${ts}`,
        steps: [{ toolId: "rotate", settings: { angle: 180 } }],
      },
    });
    const deletableId = JSON.parse(saveRes.body).id;

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${deletableId}`,
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
  });

  it("14. delete non-existent pipeline -> 404", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/pipeline/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── API key scoped ownership ──────────────────────────────────────────

describe("API key scoped ownership", () => {
  it("15. admin scoped key without files:all behaves like restricted user for file listing", async () => {
    // Create an API key for admin that only has files:own (not files:all)
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `scoped-no-files-all-${ts}`,
        permissions: ["tools:use", "files:own", "settings:read"],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const apiKey = JSON.parse(createRes.body).key;

    // List files using the scoped key -- should NOT see user A's files
    // because the key only has files:own, scoping to the admin's own files
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(listRes.statusCode).toBe(200);
    const parsed = JSON.parse(listRes.body);
    const ids = parsed.files.map((f: { id: string }) => f.id);
    // user A's file should not appear because the scoped key lacks files:all
    expect(ids).not.toContain(userAFileId);
  });
});
