/**
 * Integration tests for the user file library (user-files.ts).
 *
 * Covers upload, list, detail with version chain, download, thumbnail,
 * bulk delete, save-result versioning, search, and pagination.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const _WEBP = readFixture(fixtures.image.base.webp50);
const TINY_PNG = readFixture(fixtures.image.edge.px1);

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

// ── Upload ───────────────────────────────────────────────────────
describe("File upload", () => {
  it("uploads a single image file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "upload-test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].originalName).toBe("upload-test.png");
    expect(result.files[0].width).toBe(200);
    expect(result.files[0].height).toBe(150);
    expect(result.files[0].version).toBe(1);
    expect(result.files[0].parentId).toBeNull();
  });

  it("uploads multiple image files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "multi-a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "multi-b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.files).toHaveLength(2);
  });

  it("rejects upload with no files", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "other", content: "nothing" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no valid files/i);
  });
});

// ── List ─────────────────────────────────────────────────────────
describe("File listing", () => {
  it("lists uploaded files", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.files).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.limit).toBeDefined();
    expect(result.offset).toBeDefined();
  });

  it("supports pagination with limit and offset", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files?limit=1&offset=0",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
    expect(result.files.length).toBeLessThanOrEqual(1);
  });

  it("supports search by filename", async () => {
    // Upload a file with a unique name for searching
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "searchable-unicorn.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files?search=unicorn",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.files.length).toBeGreaterThanOrEqual(1);
    expect(
      result.files.some((f: { originalName: string }) => f.originalName.includes("unicorn")),
    ).toBe(true);
  });

  it("requires authentication to list files", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files",
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── File detail and version history ─────────────────────────────
describe("File detail", () => {
  it("returns file details and version history", async () => {
    // Upload a file
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "detail-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.file).toBeDefined();
    expect(result.file.id).toBe(fileId);
    expect(result.versions).toBeDefined();
    expect(Array.isArray(result.versions)).toBe(true);
    expect(result.versions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for non-existent file ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Download ─────────────────────────────────────────────────────
describe("File download", () => {
  it("downloads an uploaded file", async () => {
    // Upload
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "download-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // Download
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain("download-test.png");
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it("returns 404 for non-existent file download", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000/download",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Thumbnail ────────────────────────────────────────────────────
describe("Thumbnail generation", () => {
  it("generates a JPEG thumbnail for an uploaded file", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "thumb-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("max-age");

    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    // Should be constrained to 300px width max
    expect(meta.width).toBeLessThanOrEqual(300);
  });

  it("returns 404 for non-existent file thumbnail", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000/thumbnail",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Bulk delete ──────────────────────────────────────────────────
describe("Bulk delete", () => {
  it("deletes files by their IDs", async () => {
    // Upload a file to delete
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "to-delete.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // Delete it
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: [fileId] },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    // Verify it's gone
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(404);
  });

  it("rejects delete with empty ids array", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects delete without ids field", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("handles delete of non-existent IDs gracefully", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: ["00000000-0000-0000-0000-000000000000"] },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.deleted).toBe(0);
  });
});

// ── Save result (versioning) ────────────────────────────────────
describe("Save result", () => {
  it("creates a new version linked to a parent file", async () => {
    // Upload the parent file
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "parent.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const parentId = JSON.parse(uploadRes.body).files[0].id;

    // Save a "processed" result as a new version
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "result.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: parentId },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.file).toBeDefined();
    expect(result.file.version).toBe(2);
    expect(result.file.parentId).toBe(parentId);
    expect(result.file.toolChain).toContain("resize");
  });

  it("rejects save-result without a file", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "parentId", content: "some-id" },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/no file/i);
  });

  it("rejects save-result without parentId", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "orphan.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/parentId/i);
  });

  it("returns 404 when parent file does not exist", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "nope.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: "00000000-0000-0000-0000-000000000000" },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(404);
  });

  it("builds version chain correctly across multiple saves", async () => {
    // Upload parent
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "chain-root.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const v1Id = JSON.parse(uploadRes.body).files[0].id;

    // Save version 2
    const { body: v2Body, contentType: v2Ct } = createMultipartPayload([
      { name: "file", filename: "v2.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: v1Id },
      { name: "toolId", content: "resize" },
    ]);

    const v2Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v2Ct, authorization: `Bearer ${adminToken}` },
      body: v2Body,
    });

    const v2Id = JSON.parse(v2Res.body).file.id;

    // Save version 3
    const { body: v3Body, contentType: v3Ct } = createMultipartPayload([
      { name: "file", filename: "v3.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: v2Id },
      { name: "toolId", content: "compress" },
    ]);

    const v3Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v3Ct, authorization: `Bearer ${adminToken}` },
      body: v3Body,
    });

    expect(v3Res.statusCode).toBe(201);
    const v3 = JSON.parse(v3Res.body).file;
    expect(v3.version).toBe(3);
    expect(v3.toolChain).toEqual(["resize", "compress"]);

    // Get detail for v3 — should include full chain
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${v3.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const detail = JSON.parse(detailRes.body);
    expect(detail.versions.length).toBe(3);
    expect(detail.versions[0].version).toBe(1);
    expect(detail.versions[2].version).toBe(3);
  });
});
