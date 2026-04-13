/**
 * Integration tests for the Stirling-Image API.
 *
 * These tests build a real Fastify server backed by an in-memory SQLite DB
 * and exercise every endpoint with real HTTP-like requests via `app.inject()`.
 * The goal is adversarial: we try to BREAK the system with invalid inputs,
 * path traversal, missing auth, type confusion, and boundary conditions.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG_100x100 = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP_50x50 = readFileSync(join(FIXTURES, "test-50x50.webp"));
const PNG_1x1 = readFileSync(join(FIXTURES, "test-1x1.png"));
const EXIF_JPG = readFileSync(join(FIXTURES, "test-with-exif.jpg"));

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// adminToken is created once in beforeAll — reuse it throughout.
// Individual tests that need a fresh token should create their own.

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Auth endpoints", () => {
  // ── POST /api/auth/login ───────────────────────────────────────
  describe("POST /api/auth/login", () => {
    it("returns a token for valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: "Adminpass1" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.user.username).toBe("admin");
      expect(body.user.role).toBe("admin");
      expect(body.expiresAt).toBeDefined();
    });

    it("returns 401 for wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: "wrongpassword" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toMatch(/invalid/i);
    });

    it("returns 401 for non-existent user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "ghost", password: "whatever123" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when username is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: "Adminpass1" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when password is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when body is empty", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when body is null", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "content-type": "application/json" },
        payload: "null",
      });
      // The route checks body?.username — null body should trigger 400
      expect(res.statusCode).toBe(400);
    });

    it("handles SQL injection attempt in username gracefully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "' OR 1=1 --", password: "anything" },
      });
      // Should NOT succeed — parameterized queries prevent injection
      expect(res.statusCode).toBe(401);
    });

    it("handles extremely long username", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "a".repeat(10_000), password: "Adminpass1" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("handles unicode in credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "\u0000admin", password: "Adminpass1" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /api/auth/session ──────────────────────────────────────
  describe("GET /api/auth/session", () => {
    it("returns user info with a valid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.username).toBe("admin");
      expect(body.user.role).toBe("admin");
      expect(body.expiresAt).toBeDefined();
    });

    it("returns 401 with no token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with an invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: "Bearer totally-fake-token-12345" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with a malformed Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: "NotBearer something" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with empty Bearer token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: "Bearer " },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /api/auth/logout ──────────────────────────────────────
  describe("POST /api/auth/logout", () => {
    it("invalidates the session token", async () => {
      // Get a fresh token to logout
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: "Adminpass1" },
      });
      const freshToken = JSON.parse(loginRes.body).token;

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(JSON.parse(logoutRes.body).ok).toBe(true);

      // Verify the token no longer works
      const sessionRes = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(sessionRes.statusCode).toBe(401);
    });

    it("succeeds even without a token (idempotent)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
      });
      // Logout is on a public path prefix (/api/auth/) — should succeed
      expect(res.statusCode).toBe(200);
    });
  });

  // ── POST /api/auth/change-password ─────────────────────────────
  describe("POST /api/auth/change-password", () => {
    it("changes password with valid current password", async () => {
      // Create a disposable user first
      const regRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "changepw_user", password: "Original1234", role: "user" },
      });
      expect(regRes.statusCode).toBe(201);

      // Log in as the new user
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "changepw_user", password: "Original1234" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      // Change password
      const changeRes = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { currentPassword: "Original1234", newPassword: "Newpassword99" },
      });
      expect(changeRes.statusCode).toBe(200);
      expect(JSON.parse(changeRes.body).ok).toBe(true);

      // Verify old password no longer works
      const oldLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "changepw_user", password: "Original1234" },
      });
      expect(oldLoginRes.statusCode).toBe(401);

      // Verify new password works
      const newLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "changepw_user", password: "Newpassword99" },
      });
      expect(newLoginRes.statusCode).toBe(200);
    });

    it("rejects wrong current password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { currentPassword: "wrong_password_here", newPassword: "Newpass1234" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).code).toBe("INVALID_PASSWORD");
    });

    it("rejects new password shorter than 8 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { currentPassword: "Adminpass1", newPassword: "short" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { currentPassword: "Adminpass1" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        payload: { currentPassword: "Adminpass1", newPassword: "Newpass1234" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /api/auth/register ────────────────────────────────────
  describe("POST /api/auth/register", () => {
    it("admin can create a new user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "newuser1", password: "Password1234", role: "user" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.username).toBe("newuser1");
      expect(body.role).toBe("user");
      expect(body.id).toBeDefined();
    });

    it("returns 409 for duplicate username", async () => {
      // First creation
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "duplicate_user", password: "Password1234" },
      });
      // Second attempt
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "duplicate_user", password: "Differentpass1" },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).code).toBe("CONFLICT");
    });

    it("rejects password shorter than 8 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "shortpw_user", password: "short" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when username is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: "Password1234" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("non-admin cannot register users", async () => {
      // Create a regular user first
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "regular_user", password: "Password1234", role: "user" },
      });
      // Log in as regular user
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "regular_user", password: "Password1234" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      // Try to register — should fail with 403
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { username: "sneaky_user", password: "Password1234" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("defaults role to 'user' when invalid role provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "badrole_user", password: "Password1234", role: "superadmin" },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).role).toBe("user");
    });
  });

  // ── DELETE /api/auth/users/:id ─────────────────────────────────
  describe("DELETE /api/auth/users/:id", () => {
    it("admin can't delete themselves", async () => {
      // Get the admin's session to find their user ID
      const sessionRes = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const adminId = JSON.parse(sessionRes.body).user.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe("SELF_DELETE");
    });

    it("admin can delete another user", async () => {
      // Create a user to delete
      const regRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "doomed_user", password: "Password1234" },
      });
      const userId = JSON.parse(regRes.body).id;

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/auth/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).ok).toBe(true);

      // Verify the user can no longer log in
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "doomed_user", password: "Password1234" },
      });
      expect(loginRes.statusCode).toBe(401);
    });

    it("returns 404 for non-existent user ID", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/auth/users/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("non-admin cannot delete users", async () => {
      // Create + login as regular user
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "nonadmin_deleter", password: "Password1234", role: "user" },
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "nonadmin_deleter", password: "Password1234" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      const res = await app.inject({
        method: "DELETE",
        url: "/api/auth/users/some-random-id",
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD / DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════
describe("File upload/download", () => {
  // ── POST /api/v1/upload ────────────────────────────────────────
  describe("POST /api/v1/upload", () => {
    it("uploads a valid PNG and returns a jobId", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "test.png",
          contentType: "image/png",
          content: PNG_200x150,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jobId).toBeDefined();
      expect(body.files).toHaveLength(1);
      expect(body.files[0].name).toBe("test.png");
      expect(body.files[0].format).toBe("png");
      expect(body.files[0].size).toBeGreaterThan(0);
    });

    it("uploads multiple files at once", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP_50x50 },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).files).toHaveLength(3);
    });

    it("returns 400 for empty multipart (no files)", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        // Only a text field, no file
        { name: "metadata", content: "some text" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/no valid files/i);
    });

    it("returns 400 for a non-image file (text file disguised as upload)", async () => {
      const textContent = Buffer.from("This is not an image. Just plain text content.");
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "malicious.txt",
          contentType: "text/plain",
          content: textContent,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a file with image extension but non-image content", async () => {
      const fakeImage = Buffer.from("#!/bin/bash\necho 'gotcha'");
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "evil.png",
          contentType: "image/png",
          content: fakeImage,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("sanitizes path traversal in filename", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "../../../etc/passwd.png",
          contentType: "image/png",
          content: PNG_1x1,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      // Should succeed but the filename should be sanitized
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.files[0].name).not.toContain("..");
      expect(body.files[0].name).not.toContain("/");
    });
  });

  // ── GET /api/v1/download/:jobId/:filename ──────────────────────
  describe("GET /api/v1/download/:jobId/:filename", () => {
    let uploadJobId: string;
    let uploadedFilename: string;

    beforeAll(async () => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "download-test.png",
          contentType: "image/png",
          content: PNG_200x150,
        },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      const body = JSON.parse(res.body);
      uploadJobId = body.jobId;
      uploadedFilename = body.files[0].name;
    });

    it("downloads an uploaded file successfully", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/${uploadedFilename}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(res.headers["content-disposition"]).toContain("attachment");
      // Verify the downloaded bytes match what we uploaded
      expect(Buffer.from(res.rawPayload).length).toBe(PNG_200x150.length);
    });

    it("download is public (no auth required)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/${uploadedFilename}`,
        // No authorization header
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 404 for non-existent file", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/nonexistent.png`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for non-existent jobId", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/download/00000000-0000-0000-0000-000000000000/file.png",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for path traversal in jobId", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/download/..%2F..%2F..%2Fetc/passwd",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for path traversal in filename", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/..%2F..%2F..%2Fetc%2Fpasswd`,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 or 401 for backslash traversal in filename", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/..\\..\\..\\etc\\passwd`,
      });
      // Backslash may corrupt the URL path so the public-path check fails (401)
      // or the path-traversal guard catches it (400). Either way, blocked.
      expect([400, 401]).toContain(res.statusCode);
    });

    it("returns 400 for null bytes in filename", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/download/${uploadJobId}/file.png%00.txt`,
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOOL PROCESSING
// ═══════════════════════════════════════════════════════════════════════════
describe("Tool processing", () => {
  // ── Resize ─────────────────────────────────────────────────────
  describe("POST /api/v1/tools/resize", () => {
    it("resizes an image successfully", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "resize-me.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 100, height: 75 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jobId).toBeDefined();
      expect(body.downloadUrl).toBeDefined();
      expect(body.originalSize).toBeGreaterThan(0);
      expect(body.processedSize).toBeGreaterThan(0);
    });

    it("resizes by percentage", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pct.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ percentage: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 400 for invalid settings (negative width)", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "bad.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ width: -100 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when no file is provided", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "settings", content: JSON.stringify({ width: 100 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/no image/i);
    });

    it("returns 400 for malformed settings JSON", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: "{not valid json!!!" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/json/i);
    });

    it("returns 422 with empty settings (no dimensions given)", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "defaults.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: "{}" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      // All resize fields are optional at the Zod level, but Sharp needs at
      // least width or height — so processing fails with 422
      expect(res.statusCode).toBe(422);
    });

    it("download URL from resize result is accessible", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "chain.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const resizeRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      const { downloadUrl } = JSON.parse(resizeRes.body);

      const downloadRes = await app.inject({
        method: "GET",
        url: downloadUrl,
      });
      expect(downloadRes.statusCode).toBe(200);
    });
  });

  // ── Crop ───────────────────────────────────────────────────────
  describe("POST /api/v1/tools/crop", () => {
    it("crops an image successfully", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "crop.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ left: 10, top: 10, width: 50, height: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/crop",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBeDefined();
    });

    it("returns 400 when required crop fields are missing", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "crop.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ left: 10 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/crop",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 422 when crop exceeds image bounds", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "crop.png", contentType: "image/png", content: PNG_200x150 },
        {
          name: "settings",
          content: JSON.stringify({ left: 0, top: 0, width: 9999, height: 9999 }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/crop",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      // Sharp should throw when crop extends beyond image — wrapped as 422
      expect(res.statusCode).toBe(422);
    });
  });

  // ── Convert ────────────────────────────────────────────────────
  describe("POST /api/v1/tools/convert", () => {
    it("converts PNG to JPEG", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "convert.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ format: "jpg" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toContain(".jpg");
    });

    it("converts PNG to WebP", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "convert.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ format: "webp", quality: 80 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects unsupported format", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "convert.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ format: "bmp" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects quality outside valid range", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "convert.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ format: "jpg", quality: 999 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Rotate ─────────────────────────────────────────────────────
  describe("POST /api/v1/tools/rotate", () => {
    it("rotates 90 degrees", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "rotate.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ angle: 90 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/rotate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("flips horizontally", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "flip.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ horizontal: true }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/rotate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("works with default settings (no rotation)", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "norotate.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: "{}" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/rotate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Nonexistent tool ───────────────────────────────────────────
  describe("POST /api/v1/tools/nonexistent", () => {
    it("returns 404 for a tool that does not exist", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/nonexistent",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Different input formats ────────────────────────────────────
  describe("Input format handling", () => {
    it("processes JPEG input", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("processes WebP input", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP_50x50 },
        { name: "settings", content: JSON.stringify({ width: 25 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH & CONFIG
// ═══════════════════════════════════════════════════════════════════════════
describe("Health & Config", () => {
  describe("GET /api/v1/health", () => {
    it("returns only status and version without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("healthy");
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeUndefined();
      expect(body.database).toBeUndefined();
      expect(body.storage).toBeUndefined();
      expect(body.queue).toBeUndefined();
    });

    it("also works with auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/admin/health", () => {
    it("returns full diagnostics for admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/health",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("healthy");
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeDefined();
      expect(body.database).toBe("ok");
      expect(body.storage).toBeDefined();
      expect(body.queue).toBeDefined();
    });

    it("rejects unauthenticated requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/health",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for authenticated non-admin user", async () => {
      // Create a regular user and log in as them
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "health_nonadmin", password: "Password1234", role: "user" },
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "health_nonadmin", password: "Password1234" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/health",
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/v1/config/auth", () => {
    it("returns authEnabled flag without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/config/auth",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.authEnabled).toBe("boolean");
      expect(body.authEnabled).toBe(true); // We set AUTH_ENABLED=true in test-server
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════
describe("Auth middleware", () => {
  it("protected route without token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
    });
    expect(res.statusCode).toBe(401);
  });

  it("protected route with valid token succeeds", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("public route /api/v1/health works without token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("public route /api/v1/config/auth works without token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/config/auth" });
    expect(res.statusCode).toBe(200);
  });

  it("upload route requires auth", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { "content-type": contentType },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("tool routes require auth", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      { name: "settings", content: "{}" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("settings routes require auth", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      payload: { theme: "dark" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("expired token is rejected", async () => {
    // We can't easily create an expired session through the API, but we can
    // check that a completely fake token is rejected on protected routes.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: "Bearer expired-fake-token-xyz" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
describe("Settings", () => {
  describe("GET /api/v1/settings", () => {
    it("returns settings object (requires auth)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.settings).toBeDefined();
      expect(typeof body.settings).toBe("object");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PUT /api/v1/settings", () => {
    it("admin can save settings", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { theme: "dark", locale: "en" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.updatedCount).toBe(2);
    });

    it("saved settings are retrievable", async () => {
      // Save
      await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { testKey: "testValue" },
      });

      // Retrieve
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings/testKey",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.key).toBe("testKey");
      expect(body.value).toBe("testValue");
    });

    it("non-admin cannot save settings", async () => {
      // Create a regular user
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "settings_user", password: "Password1234", role: "user" },
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "settings_user", password: "Password1234" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { theme: "hacked" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 400 for non-object body", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: JSON.stringify([1, 2, 3]),
      });
      expect(res.statusCode).toBe(400);
    });

    it("settings upsert works (update existing key)", async () => {
      // Set initial value
      await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { upsertKey: "original" },
      });

      // Update
      await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { upsertKey: "updated" },
      });

      // Verify
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings/upsertKey",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(res.body).value).toBe("updated");
    });

    it("rejects HTML tags in setting values", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { app_name: "<script>alert('xss')</script>" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects HTML tags in setting keys", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { "<img src=x onerror=alert(1)>": "test" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("does not partially write entries when a later entry contains HTML tags", async () => {
      const cleanKey = `atomicity_test_clean_${Date.now()}`;
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          [cleanKey]: "safe_value",
          "<script>xss</script>": "evil",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");

      // The clean entry must NOT have been written
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/settings/${cleanKey}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("allows normal setting values without HTML", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { app_name: "My App (v2.0) - Production" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });
  });

  describe("GET /api/v1/settings/:key", () => {
    it("returns 404 for non-existent key", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings/nonexistent_key_xyz",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
describe("API Keys", () => {
  describe("POST /api/v1/api-keys", () => {
    it("generates a new API key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Test Key" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.key).toBeDefined();
      expect(body.key).toMatch(/^si_/);
      expect(body.name).toBe("Test Key");
      expect(body.id).toBeDefined();
    });

    it("uses default name when none provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).name).toBe("Default API Key");
    });

    it("rejects name longer than 100 chars", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "x".repeat(101) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("requires auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        payload: { name: "Sneaky Key" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/api-keys", () => {
    it("lists user's API keys (without exposing raw keys)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.apiKeys).toBeDefined();
      expect(Array.isArray(body.apiKeys)).toBe(true);
      // Verify that no raw key is returned in list
      for (const key of body.apiKeys) {
        expect(key.key).toBeUndefined();
        expect(key.keyHash).toBeUndefined();
        expect(key.id).toBeDefined();
        expect(key.name).toBeDefined();
      }
    });
  });

  describe("DELETE /api/v1/api-keys/:id", () => {
    it("deletes own API key", async () => {
      // Create a key
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "To Delete" },
      });
      const keyId = JSON.parse(createRes.body).id;

      // Delete it
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/api-keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).ok).toBe(true);
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/api-keys/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STITCH
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/v1/tools/stitch", () => {
  it("stitches two images horizontally with default settings", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeDefined();
    expect(body.downloadUrl).toMatch(/\/api\/v1\/download\//);
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("stitches vertically", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ direction: "vertical" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("outputs jpeg when requested", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ format: "jpeg" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/stitch\.jpeg$/);
  });

  it("returns 400 with only one image", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/at least 2/i);
  });

  it("returns 400 with no images", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(400);
  });

  it("accepts gap and backgroundColor settings", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ gap: 10, backgroundColor: "#FF0000" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("stitches in grid mode with 2 columns", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "file", filename: "c.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "d.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ direction: "grid", gridColumns: 2 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeDefined();
    expect(body.downloadUrl).toMatch(/\/api\/v1\/download\//);
  });

  it("applies alignment setting", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ alignment: "start" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("applies border and cornerRadius", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ border: 20, cornerRadius: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects quality setting for jpeg", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ format: "jpeg", quality: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles resizeMode stretch", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ resizeMode: "stretch" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles resizeMode crop", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ resizeMode: "crop" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
describe("Pipeline", () => {
  describe("POST /api/v1/pipeline/execute", () => {
    it("executes a multi-step pipeline (resize then rotate)", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 100 } },
          { toolId: "rotate", settings: { angle: 90 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pipeline.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(2);
      expect(body.downloadUrl).toBeDefined();
    });

    it("returns 400 when pipeline references non-existent tool", async () => {
      const pipeline = {
        steps: [{ toolId: "fake-tool-xyz", settings: {} }],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pipeline.png", contentType: "image/png", content: PNG_1x1 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when pipeline has no steps", async () => {
      const pipeline = { steps: [] };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pipeline.png", contentType: "image/png", content: PNG_1x1 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 without pipeline definition", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pipeline.png", contentType: "image/png", content: PNG_1x1 },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when a step has invalid settings", async () => {
      const pipeline = {
        steps: [
          { toolId: "crop", settings: { left: -1, top: -1 } }, // invalid: min(0)
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "pipeline.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("executes Social Media Ready template pipeline", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 1080, height: 1080, fit: "cover" } },
          { toolId: "compress", settings: { quality: 80 } },
          { toolId: "strip-metadata", settings: {} },
          { toolId: "convert", settings: { format: "webp" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "social.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(4);
      expect(body.steps).toHaveLength(4);
      expect(body.steps[0].toolId).toBe("resize");
      expect(body.steps[1].toolId).toBe("compress");
      expect(body.steps[2].toolId).toBe("strip-metadata");
      expect(body.steps[3].toolId).toBe("convert");
      expect(body.downloadUrl).toContain(".webp");
      // Note: upscaling from 200x150 to 1080x1080 increases size
      expect(body.processedSize).toBeGreaterThan(0);
    });

    it("executes Privacy Clean template pipeline", async () => {
      const pipeline = {
        steps: [
          { toolId: "strip-metadata", settings: {} },
          { toolId: "convert", settings: { format: "jpg" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "privacy.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(2);
      expect(body.downloadUrl).toContain(".jpg");
    });

    it("executes Web Optimization template pipeline", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 1920, fit: "inside" } },
          { toolId: "convert", settings: { format: "webp" } },
          { toolId: "compress", settings: { quality: 80 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "web.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(3);
    });

    it("executes Profile Picture template pipeline", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 400, height: 400, fit: "cover" } },
          { toolId: "compress", settings: { quality: 85 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "profile.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(2);
    });

    it("executes Watermark Batch template pipeline", async () => {
      const pipeline = {
        steps: [
          { toolId: "watermark-text", settings: { text: "SAMPLE", opacity: 30 } },
          { toolId: "strip-metadata", settings: {} },
          { toolId: "compress", settings: { quality: 85 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "watermark.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(3);
    });

    it("executes a single-step pipeline", async () => {
      const pipeline = {
        steps: [{ toolId: "convert", settings: { format: "webp" } }],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "single.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(1);
      expect(body.downloadUrl).toContain(".webp");
    });

    it("returns full step details in response", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 50 } },
          { toolId: "convert", settings: { format: "jpg" } },
          { toolId: "compress", settings: { quality: 60 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "details.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jobId).toBeDefined();
      expect(typeof body.jobId).toBe("string");
      expect(body.originalSize).toBeGreaterThan(0);
      expect(body.processedSize).toBeGreaterThan(0);
      expect(body.steps).toHaveLength(3);
      for (const step of body.steps) {
        expect(step.step).toBeGreaterThan(0);
        expect(step.toolId).toBeDefined();
        expect(step.size).toBeGreaterThan(0);
      }
    });

    it("returns 400 for invalid JSON pipeline", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "bad.png", contentType: "image/png", content: PNG_1x1 },
        { name: "pipeline", content: "not valid json{{{" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain("JSON");
    });

    it("returns 400 when no file is provided", async () => {
      const pipeline = {
        steps: [{ toolId: "resize", settings: { width: 100 } }],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("handles pipeline with different image formats (JPG input)", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 50 } },
          { toolId: "convert", settings: { format: "png" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(2);
      expect(body.downloadUrl).toContain(".png");
    });

    it("handles pipeline with WebP input", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 25 } },
          { toolId: "convert", settings: { format: "jpg" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP_50x50 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(2);
    });

    it("executes a pipeline with border + rotate combo", async () => {
      const pipeline = {
        steps: [
          { toolId: "border", settings: { borderWidth: 10, borderColor: "#ff0000" } },
          { toolId: "rotate", settings: { angle: 45 } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "bordered.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).stepsCompleted).toBe(2);
    });

    it("executes pipeline with 5 steps chained", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 150 } },
          { toolId: "rotate", settings: { angle: 90 } },
          { toolId: "strip-metadata", settings: {} },
          { toolId: "compress", settings: { quality: 70 } },
          { toolId: "convert", settings: { format: "webp" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "chain.png", contentType: "image/png", content: PNG_200x150 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stepsCompleted).toBe(5);
      expect(body.steps).toHaveLength(5);
    });

    it("rejects pipeline exceeding 20 steps", async () => {
      const steps = Array.from({ length: 21 }, () => ({
        toolId: "resize",
        settings: { width: 100 },
      }));

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "too-many.png", contentType: "image/png", content: PNG_1x1 },
        { name: "pipeline", content: JSON.stringify({ steps }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("processes result file is downloadable", async () => {
      const pipeline = {
        steps: [{ toolId: "resize", settings: { width: 50 } }],
      };

      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "downloadable.png",
          contentType: "image/png",
          content: PNG_200x150,
        },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      // Verify the download URL is valid
      const dlRes = await app.inject({
        method: "GET",
        url: body.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);
      expect(dlRes.rawPayload.length).toBeGreaterThan(0);
    });

    it("returns 400 with mixed valid and invalid tool IDs", async () => {
      const pipeline = {
        steps: [
          { toolId: "resize", settings: { width: 100 } },
          { toolId: "nonexistent-tool", settings: {} },
          { toolId: "convert", settings: { format: "jpg" } },
        ],
      };

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "mixed.png", contentType: "image/png", content: PNG_1x1 },
        { name: "pipeline", content: JSON.stringify(pipeline) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain("nonexistent-tool");
    });
  });

  describe("Pipeline CRUD", () => {
    let savedPipelineId: string;

    it("saves a pipeline definition", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "My Pipeline",
          description: "Test pipeline",
          steps: [
            { toolId: "resize", settings: { width: 100 } },
            { toolId: "convert", settings: { format: "jpg" } },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe("My Pipeline");
      savedPipelineId = body.id;
    });

    it("lists saved pipelines", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/list",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.pipelines).toBeDefined();
      expect(body.pipelines.length).toBeGreaterThan(0);
    });

    it("deletes a saved pipeline", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/pipeline/${savedPipelineId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it("returns 404 deleting non-existent pipeline", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/pipeline/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects pipeline save with invalid tool ID", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Bad Pipeline",
          steps: [{ toolId: "does-not-exist", settings: {} }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects pipeline save with empty name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "",
          steps: [{ toolId: "resize", settings: {} }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("saves pipeline without description", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "No Description Pipeline",
          steps: [{ toolId: "resize", settings: { width: 100 } }],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("No Description Pipeline");
      expect(body.description).toBeNull();

      // Cleanup
      await app.inject({
        method: "DELETE",
        url: `/api/v1/pipeline/${body.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
    });

    it("saves and retrieves pipeline with correct step data", async () => {
      const steps = [
        { toolId: "resize", settings: { width: 200, height: 200, fit: "cover" } },
        { toolId: "compress", settings: { quality: 75 } },
        { toolId: "convert", settings: { format: "webp" } },
      ];

      const saveRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Full Pipeline", description: "With all data", steps },
      });
      expect(saveRes.statusCode).toBe(201);
      const saved = JSON.parse(saveRes.body);

      // List and verify the pipeline steps are correctly stored
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/list",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listed = JSON.parse(listRes.body);
      const found = listed.pipelines.find((p: { id: string }) => p.id === saved.id);
      expect(found).toBeDefined();
      expect(found.steps).toHaveLength(3);
      expect(found.steps[0].toolId).toBe("resize");
      expect(found.steps[0].settings.width).toBe(200);
      expect(found.steps[1].toolId).toBe("compress");
      expect(found.steps[2].toolId).toBe("convert");
      expect(found.createdAt).toBeDefined();

      // Cleanup
      await app.inject({
        method: "DELETE",
        url: `/api/v1/pipeline/${saved.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
    });

    it("rejects pipeline name exceeding 100 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "A".repeat(101),
          steps: [{ toolId: "resize", settings: {} }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects pipeline description exceeding 500 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Long Desc",
          description: "D".repeat(501),
          steps: [{ toolId: "resize", settings: {} }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects saving pipeline with more than 20 steps", async () => {
      const steps = Array.from({ length: 21 }, () => ({
        toolId: "resize",
        settings: { width: 100 },
      }));

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Too Many Steps", steps },
      });
      expect(res.statusCode).toBe(400);
    });

    it("can save and delete multiple pipelines", async () => {
      // Save two pipelines
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Pipeline A",
          steps: [{ toolId: "resize", settings: { width: 100 } }],
        },
      });
      const res2 = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/save",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Pipeline B",
          steps: [{ toolId: "convert", settings: { format: "jpg" } }],
        },
      });
      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      const id1 = JSON.parse(res1.body).id;
      const id2 = JSON.parse(res2.body).id;

      // List should have both
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/list",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const pipelines = JSON.parse(listRes.body).pipelines;
      expect(pipelines.some((p: { id: string }) => p.id === id1)).toBe(true);
      expect(pipelines.some((p: { id: string }) => p.id === id2)).toBe(true);

      // Delete both
      await app.inject({
        method: "DELETE",
        url: `/api/v1/pipeline/${id1}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/pipeline/${id2}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
    });
  });

  describe("GET /api/v1/pipeline/tools", () => {
    it("returns the list of pipeline-compatible tool IDs", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.toolIds)).toBe(true);
      expect(body.toolIds.length).toBeGreaterThan(0);
    });

    it("includes factory-registered tools (resize, crop, convert)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { toolIds } = JSON.parse(res.body);
      expect(toolIds).toContain("resize");
      expect(toolIds).toContain("crop");
      expect(toolIds).toContain("convert");
      expect(toolIds).toContain("compress");
      expect(toolIds).toContain("rotate");
    });

    it("includes AI tools registered for pipeline use", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { toolIds } = JSON.parse(res.body);
      expect(toolIds).toContain("remove-background");
      expect(toolIds).toContain("upscale");
      expect(toolIds).toContain("blur-faces");
    });

    it("excludes tools that are not pipeline-compatible", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/pipeline/tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { toolIds } = JSON.parse(res.body);
      expect(toolIds).not.toContain("ocr");
      expect(toolIds).not.toContain("erase-object");
      expect(toolIds).not.toContain("info");
      expect(toolIds).not.toContain("collage");
      expect(toolIds).not.toContain("compare");
    });
  });

  describe("Pipeline rejects incompatible tools", () => {
    const customRouteTools = ["ocr", "erase-object"];

    for (const toolId of customRouteTools) {
      it(`returns 400 when pipeline uses "${toolId}" (custom-route tool)`, async () => {
        const pipeline = { steps: [{ toolId, settings: {} }] };

        const { body: payload, contentType } = createMultipartPayload([
          { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
          { name: "pipeline", content: JSON.stringify(pipeline) },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/pipeline/execute",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          payload,
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toContain("not found");
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCR API
// ═══════════════════════════════════════════════════════════════════════════
describe("OCR API", () => {
  describe("POST /api/v1/tools/ocr", () => {
    it("accepts quality param and returns text without engine field", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "ocr-test.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ quality: "fast" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });

      // OCR may fail with 422 if Python sidecar/engines are not installed (CI)
      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        expect(body.text).toBeDefined();
        expect(body.jobId).toBeDefined();
        expect(body).not.toHaveProperty("engine");
      } else {
        // 422 = OCR engine not available, which is acceptable in test environments
        expect(res.statusCode).toBe(422);
      }
    });

    it("backward compat: old engine param is still accepted", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "ocr-compat.png",
          contentType: "image/png",
          content: PNG_200x150,
        },
        { name: "settings", content: JSON.stringify({ engine: "tesseract" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });

      // Should not be a 400 — engine param must still be accepted
      expect(res.statusCode).not.toBe(400);
      // Either succeeds (200) or OCR engine unavailable (422)
      expect([200, 422]).toContain(res.statusCode);
    });

    it("accepts language auto and enhance params", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "ocr-lang.png", contentType: "image/png", content: PNG_200x150 },
        {
          name: "settings",
          content: JSON.stringify({ quality: "balanced", language: "auto", enhance: true }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });

      // All three params should be accepted without validation errors
      expect(res.statusCode).not.toBe(400);
      expect([200, 422]).toContain(res.statusCode);
    });

    it("returns 400 for invalid quality value", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "ocr-bad.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ quality: "ultra" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when no file is provided", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "settings", content: JSON.stringify({ quality: "fast" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/no image/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH PROCESSING
// ═══════════════════════════════════════════════════════════════════════════
describe("Batch processing", () => {
  describe("POST /api/v1/tools/:toolId/batch", () => {
    it("processes multiple images in a batch and returns ZIP", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "file", filename: "b.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      // Batch streams a ZIP directly — raw status comes from writeHead
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["x-job-id"]).toBeDefined();
    });

    it("returns 404 for non-existent batch tool", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: "{}" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/nonexistent/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for batch with no files", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("batch converts multiple images to webp", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "img1.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "img2.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "settings", content: JSON.stringify({ format: "webp" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch compresses images with quality setting", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "settings", content: JSON.stringify({ quality: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/compress/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch strips metadata from images", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "meta1.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "meta2.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/strip-metadata/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch rotates images", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "rot1.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "rot2.webp", contentType: "image/webp", content: WEBP_50x50 },
        { name: "settings", content: JSON.stringify({ angle: 180 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/rotate/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("returns 400 for batch with invalid settings", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ format: "invalid-format" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/convert/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("batch with single file works", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "solo.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 100 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch uses default settings when none provided", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "default.png", contentType: "image/png", content: PNG_200x150 },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/strip-metadata/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch includes X-File-Results header", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "first.png", contentType: "image/png", content: PNG_1x1 },
        { name: "file", filename: "second.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-file-results"]).toBeDefined();
      const parsed = JSON.parse(res.headers["x-file-results"] as string);
      expect(parsed["0"]).toBeDefined();
      expect(parsed["1"]).toBeDefined();
    });

    it("returns ZIP with content-disposition attachment header", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain("batch-resize");
    });

    it("batch with clientJobId uses provided ID", async () => {
      const clientJobId = "my-custom-job-id-12345";
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_1x1 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: clientJobId },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-job-id"]).toBe(clientJobId);
    });

    it("batch handles mixed file formats", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP_50x50 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("batch returns X-File-Results header with index-to-filename mapping", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "first.png", contentType: "image/png", content: PNG_1x1 },
        { name: "file", filename: "second.png", contentType: "image/png", content: PNG_200x150 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);

      const fileResults = res.headers["x-file-results"];
      expect(fileResults).toBeDefined();
      const parsed = JSON.parse(fileResults as string);
      expect(parsed["0"]).toBeDefined();
      expect(parsed["1"]).toBeDefined();
      expect(typeof parsed["0"]).toBe("string");
      expect(typeof parsed["1"]).toBe("string");
    });

    it("batch X-File-Results entries contain original filename stems in order", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "aaa.png", contentType: "image/png", content: PNG_1x1 },
        { name: "file", filename: "bbb.png", contentType: "image/png", content: PNG_200x150 },
        { name: "file", filename: "ccc.jpg", contentType: "image/jpeg", content: JPG_100x100 },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/resize/batch",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);

      const fileResults = JSON.parse(res.headers["x-file-results"] as string);
      const names = [fileResults["0"], fileResults["1"], fileResults["2"]];
      expect(names[0]).toContain("aaa");
      expect(names[1]).toContain("bbb");
      expect(names[2]).toContain("ccc");
    });
  });

  describe("Batch rejects incompatible tools", () => {
    const customRouteTools = ["ocr", "erase-object"];

    for (const toolId of customRouteTools) {
      it(`returns 404 for batch "${toolId}" (custom-route tool)`, async () => {
        const { body: payload, contentType } = createMultipartPayload([
          { name: "file", filename: "a.png", contentType: "image/png", content: PNG_200x150 },
          { name: "settings", content: JSON.stringify({}) },
        ]);

        const res = await app.inject({
          method: "POST",
          url: `/api/v1/tools/${toolId}/batch`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          payload,
        });
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).error).toContain("not found");
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SMART CROP FORMAT PRESERVATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Smart crop format preservation", () => {
  it("preserves JPEG format for JPEG input in content mode", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ mode: "content", threshold: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.jpg/);
  });

  it("preserves PNG format for PNG input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "image.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ mode: "content", threshold: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.png/);
  });

  it("preserves WebP format for WebP input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "image.webp", contentType: "image/webp", content: WEBP_50x50 },
      { name: "settings", content: JSON.stringify({ mode: "content", threshold: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.webp/);
  });

  it("preserves JPEG format in attention mode", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ mode: "attention", width: 50, height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.jpg/);
  });

  it("accepts quality setting without error", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "content", threshold: 30, quality: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
  });

  it("subject mode with entropy strategy", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "subject", strategy: "entropy", width: 50, height: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.jpg/);
  });

  it("subject mode with padding", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "subject", width: 50, height: 50, padding: 10 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.jpg/);
  });

  it("trim mode with new mode name", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "trim", threshold: 30 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.png/);
  });

  it("defaults to subject mode when no mode specified", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      {
        name: "settings",
        content: JSON.stringify({ width: 50, height: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/_smartcrop\.jpg/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROP FORMAT PRESERVATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Crop format preservation", () => {
  it("preserves JPEG format for JPEG input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sharp = (await import("sharp")).default;
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("preserves PNG format for PNG input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "image.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ left: 0, top: 0, width: 50, height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sharp = (await import("sharp")).default;
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COLOR ADJUSTMENTS FORMAT PRESERVATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Color adjustments format preservation", () => {
  it("preserves JPEG format for JPEG input via brightness-contrast", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      { name: "settings", content: JSON.stringify({ brightness: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/brightness-contrast",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sharp = (await import("sharp")).default;
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("preserves PNG format for PNG input via saturation", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "image.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ saturation: 20 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/saturation",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sharp = (await import("sharp")).default;
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES & ADVERSARIAL INPUTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Edge cases & adversarial inputs", () => {
  it("rejects a zero-byte file upload", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    // Empty files are skipped, resulting in "No valid files uploaded"
    expect(res.statusCode).toBe(400);
  });

  it("handles a file with only null bytes", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "nulls.png",
        contentType: "image/png",
        content: Buffer.alloc(1024, 0),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("handles concurrent requests without corruption", async () => {
    const requests = Array.from({ length: 5 }, (_, i) => {
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: `concurrent-${i}.png`,
          contentType: "image/png",
          content: PNG_1x1,
        },
        { name: "settings", content: JSON.stringify({ width: 1 }) },
      ]);

      return app.inject({
        method: "POST",
        url: "/api/v1/tools/resize",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
    });

    const results = await Promise.all(requests);
    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jobId).toBeDefined();
    }

    // Verify all jobIds are unique
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(5);
  });

  it("rejects a JSON body on multipart-only endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { width: 100 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("handles extremely long tool settings values gracefully", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      { name: "settings", content: JSON.stringify({ width: 1, fit: "a".repeat(10_000) }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    // Zod should reject the invalid enum value
    expect(res.statusCode).toBe(400);
  });

  it("handles type confusion in settings (string where number expected)", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      { name: "settings", content: JSON.stringify({ width: "not-a-number" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("handles array where object expected in login body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(["admin", "Adminpass1"]),
    });
    expect(res.statusCode).toBe(400);
  });

  it("handles deeply nested JSON in settings", async () => {
    // Create a deeply nested object
    let nested: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 50; i++) {
      nested = { nested };
    }

    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      { name: "settings", content: JSON.stringify(nested) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    // Zod schema only cares about the expected keys; extra nesting is ignored.
    // Sharp may fail (422) if no valid resize dimensions are derived.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles NaN/Infinity in numeric settings", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG_1x1 },
      { name: "settings", content: '{"width": NaN}' },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    // NaN is not valid JSON, so it should fail to parse
    expect(res.statusCode).toBe(400);
  });

  it("rejects double-encoded path traversal in download", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/download/%252e%252e%252f%252e%252e%252fetc/passwd",
    });
    // Even after double decoding, path traversal should be blocked or 404
    expect([400, 404]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════
describe("Workspace integrity", () => {
  it("upload creates workspace with input dir", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "ws-test.png", contentType: "image/png", content: PNG_1x1 },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(uploadRes.statusCode).toBe(200);

    const { jobId } = JSON.parse(uploadRes.body);

    // The uploaded file should be downloadable from the workspace
    const downloadRes = await app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/ws-test.png`,
    });
    expect(downloadRes.statusCode).toBe(200);
  });

  it("tool processing creates both input and output in workspace", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "ws-tool.png", contentType: "image/png", content: PNG_200x150 },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const toolRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(toolRes.statusCode).toBe(200);

    const { jobId, downloadUrl } = JSON.parse(toolRes.body);

    // Output file is downloadable
    const outputRes = await app.inject({
      method: "GET",
      url: downloadUrl,
    });
    expect(outputRes.statusCode).toBe(200);

    // Input file is also saved in workspace (from tool-factory.ts)
    const inputRes = await app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/ws-tool.png`,
    });
    expect(inputRes.statusCode).toBe(200);
  });

  it("each job gets a unique workspace (no cross-contamination)", async () => {
    const makeReq = () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "isolated.png", contentType: "image/png", content: PNG_1x1 },
      ]);
      return app.inject({
        method: "POST",
        url: "/api/v1/upload",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
    };

    const [res1, res2] = await Promise.all([makeReq(), makeReq()]);

    const jobId1 = JSON.parse(res1.body).jobId;
    const jobId2 = JSON.parse(res2.body).jobId;

    expect(jobId1).not.toBe(jobId2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDIT METADATA
// ═══════════════════════════════════════════════════════════════════════════
describe("Edit metadata", () => {
  describe("POST /api/v1/tools/edit-metadata/inspect", () => {
    it("returns parsed EXIF for JPEG with metadata", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "exif.jpg", contentType: "image/jpeg", content: EXIF_JPG },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.filename).toBe("exif.jpg");
      expect(body.exif).toBeTruthy();
      expect(body.exif.Artist).toBe("Test Artist");
      expect(body.exif.Copyright).toBe("2026 Test Copyright");
    });

    it("returns no exif for metadata-free PNG", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "plain.png", contentType: "image/png", content: PNG_1x1 },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.exif).toBeNull();
    });

    it("rejects request with no file", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "multipart/form-data; boundary=---test",
        },
        payload: Buffer.from("-----test--\r\n"),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/tools/edit-metadata", () => {
    it("writes metadata and returns downloadable file", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "edit.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({ artist: "New Author" }) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBeDefined();
      expect(body.jobId).toBeDefined();
    });

    it("strips specific fields via fieldsToRemove", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "strip.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({ fieldsToRemove: ["Software"] }) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("preserves metadata with empty settings", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "noop.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({}) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

describe("Image Enhancement", () => {
  it("POST /api/v1/tools/image-enhancement processes an image", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
      {
        name: "settings",
        content: JSON.stringify({
          mode: "auto",
          intensity: 50,
          corrections: {
            exposure: true,
            contrast: true,
            whiteBalance: true,
            saturation: true,
            sharpness: true,
            denoise: true,
          },
        }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeDefined();
    expect(body.downloadUrl).toBeDefined();
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("POST /api/v1/tools/image-enhancement/analyze returns analysis data", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG_200x150 },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement/analyze",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scores).toBeDefined();
    expect(body.corrections).toBeDefined();
    expect(body.issues).toBeInstanceOf(Array);
    expect(body.suggestedMode).toBeDefined();
    expect(typeof body.scores.exposure).toBe("number");
  });

  it("preserves JPEG format through enhancement", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG_100x100 },
      {
        name: "settings",
        content: JSON.stringify({
          mode: "auto",
          intensity: 50,
        }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toMatch(/\.jpg/);
  });

  it("rejects empty file", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
      {
        name: "settings",
        content: JSON.stringify({ mode: "auto" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-enhancement",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});
