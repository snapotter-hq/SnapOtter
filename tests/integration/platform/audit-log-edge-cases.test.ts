import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const TINY_PNG = readFixture(fixtures.image.edge.px1);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

interface AuditLogItem {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

async function fetchAuditLog(
  qs = "",
): Promise<{ entries: AuditLogItem[]; total: number; page: number; limit: number }> {
  const res = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/audit-log${qs ? `?${qs}` : ""}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

/* ------------------------------------------------------------------ */
/*  Event recording                                                    */
/* ------------------------------------------------------------------ */

describe("audit log event recording", () => {
  it("LOGIN_SUCCESS recorded after login", async () => {
    const body = await fetchAuditLog("action=LOGIN_SUCCESS");
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].action).toBe("LOGIN_SUCCESS");
  });

  it("USER_CREATED, USER_UPDATED, PASSWORD_RESET, and USER_DELETED record actorUsername and targetId (#3978)", async () => {
    const regRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "audit_edge_user",
        password: "AuditEdge1",
        role: "user",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const createdUser = JSON.parse(regRes.body);

    const createdBody = await fetchAuditLog("action=USER_CREATED");
    const createdEntry = createdBody.entries.find((e) => e.targetId === createdUser.id);
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.actorUsername).toBe("admin");
    expect(createdEntry?.targetType).toBe("user");
    expect(createdEntry?.targetId).toBe(createdUser.id);

    const updateRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${createdUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(updateRes.statusCode).toBe(200);

    const updatedBody = await fetchAuditLog("action=USER_UPDATED");
    const updatedEntry = updatedBody.entries.find((e) => e.targetId === createdUser.id);
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.actorUsername).toBe("admin");
    expect(updatedEntry?.targetType).toBe("user");

    const resetRes = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${createdUser.id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "AuditEdge2" },
    });
    expect(resetRes.statusCode).toBe(200);

    const resetBody = await fetchAuditLog("action=PASSWORD_RESET");
    const resetEntry = resetBody.entries.find((e) => e.targetId === createdUser.id);
    expect(resetEntry).toBeDefined();
    expect(resetEntry?.actorUsername).toBe("admin");
    expect(resetEntry?.targetType).toBe("user");

    const deleteRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${createdUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    const deletedBody = await fetchAuditLog("action=USER_DELETED");
    const deletedEntry = deletedBody.entries.find((e) => e.targetId === createdUser.id);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.actorUsername).toBe("admin");
    expect(deletedEntry?.targetType).toBe("user");
    expect(deletedEntry?.targetId).toBe(createdUser.id);
  });

  it("API_KEY_CREATED and API_KEY_DELETED record actorUsername and targetId (#3981)", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "audit-edge-key" },
    });
    expect(createRes.statusCode).toBe(201);
    const createdKey = JSON.parse(createRes.body) as { id: string };

    const createdBody = await fetchAuditLog("action=API_KEY_CREATED");
    const createdEntry = createdBody.entries.find((e) => e.targetId === createdKey.id);
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.actorUsername).toBe("admin");
    expect(createdEntry?.targetType).toBe("api_key");

    const deleteRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${createdKey.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    const deletedBody = await fetchAuditLog("action=API_KEY_DELETED");
    const deletedEntry = deletedBody.entries.find((e) => e.targetId === createdKey.id);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.actorUsername).toBe("admin");
    expect(deletedEntry?.targetType).toBe("api_key");
  });

  it("FILE_UPLOADED, FILE_DELETED, and LOGOUT record actorUsername (#3981)", async () => {
    const { body: uploadBody, contentType } = createMultipartPayload([
      { name: "file", filename: "audit-edge.png", contentType: "image/png", content: TINY_PNG },
    ]);
    const uploadRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const uploadedFiles = JSON.parse(uploadRes.body).files as Array<{ id: string }>;
    const fileId = uploadedFiles[0].id;

    const uploadedAudit = await fetchAuditLog("action=FILE_UPLOADED");
    expect(uploadedAudit.entries[0]?.actorUsername).toBe("admin");
    expect(uploadedAudit.entries[0]?.targetType).toBe("file");

    const deleteRes = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [fileId] },
    });
    expect(deleteRes.statusCode).toBe(200);

    const deletedAudit = await fetchAuditLog("action=FILE_DELETED");
    expect(deletedAudit.entries[0]?.actorUsername).toBe("admin");
    expect(deletedAudit.entries[0]?.targetType).toBe("file");

    const regRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "audit_logout_user",
        password: "AuditLogout1",
        role: "user",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const logoutUser = JSON.parse(regRes.body) as { id: string; username: string };

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "audit_logout_user",
        password: "AuditLogout1",
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token: logoutUserToken } = JSON.parse(loginRes.body) as { token: string };

    const logoutRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${logoutUserToken}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const logoutAudit = await fetchAuditLog("action=LOGOUT");
    expect(logoutAudit.entries[0]?.actorUsername).toBe("audit_logout_user");
    expect(logoutAudit.entries[0]?.targetType).toBe("user");

    await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${logoutUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
  });

  it("ROLE_CREATED, ROLE_UPDATED, and ROLE_DELETED record actorUsername and targetId (#3978)", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "audit-edge-role",
        description: "role for audit edge test",
        permissions: ["tools:use"],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdRole = JSON.parse(createRes.body);

    const body = await fetchAuditLog("action=ROLE_CREATED");
    const createdEntry = body.entries.find((e) => e.targetId === createdRole.id);
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.actorUsername).toBe("admin");
    expect(createdEntry?.targetType).toBe("role");

    const updateRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${createdRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { description: "updated role for audit edge test" },
    });
    expect(updateRes.statusCode).toBe(200);

    const updatedBody = await fetchAuditLog("action=ROLE_UPDATED");
    const updatedEntry = updatedBody.entries.find((e) => e.targetId === createdRole.id);
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.actorUsername).toBe("admin");
    expect(updatedEntry?.targetType).toBe("role");

    const deleteRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${createdRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    const deletedBody = await fetchAuditLog("action=ROLE_DELETED");
    const deletedEntry = deletedBody.entries.find((e) => e.targetId === createdRole.id);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.actorUsername).toBe("admin");
    expect(deletedEntry?.targetType).toBe("role");
  });
});

/* ------------------------------------------------------------------ */
/*  Pagination edge cases                                              */
/* ------------------------------------------------------------------ */

describe("audit log pagination edge cases", () => {
  it("page=0 clamped to 1", async () => {
    const body = await fetchAuditLog("page=0");
    expect(body.page).toBe(1);
  });

  it("negative page clamped to 1", async () => {
    const body = await fetchAuditLog("page=-5");
    expect(body.page).toBe(1);
  });

  it("limit=500 clamped to 100", async () => {
    const body = await fetchAuditLog("limit=500");
    expect(body.limit).toBe(100);
  });

  it("limit=0 falls back to default (50)", async () => {
    const body = await fetchAuditLog("limit=0");
    expect(body.limit).toBe(50);
  });

  it("non-numeric values use defaults", async () => {
    const body = await fetchAuditLog("page=abc&limit=xyz");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
  });

  it("high page number returns empty entries", async () => {
    const body = await fetchAuditLog("page=99999");
    expect(body.entries).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Entry structure                                                    */
/* ------------------------------------------------------------------ */

describe("audit log entry structure", () => {
  it("each entry has id, actorUsername, action, createdAt (valid ISO date)", async () => {
    const body = await fetchAuditLog("limit=10");
    expect(body.entries.length).toBeGreaterThan(0);

    for (const entry of body.entries) {
      expect(entry).toHaveProperty("id");
      expect(typeof entry.id).toBe("string");

      expect(entry).toHaveProperty("actorUsername");
      expect(typeof entry.actorUsername).toBe("string");

      expect(entry).toHaveProperty("action");
      expect(typeof entry.action).toBe("string");

      expect(entry).toHaveProperty("createdAt");
      expect(typeof entry.createdAt).toBe("string");
      const parsed = new Date(entry.createdAt);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    }
  });
});
