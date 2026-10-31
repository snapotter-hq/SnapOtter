/**
 * Authorization on the standalone upload, URL import, and preview endpoints.
 *
 * These four routes sit outside both enforcement points the rest of the API
 * relies on: `requireFileAccess`, which guards every route under /api/v1/files,
 * and the tool-access middleware, which only fires for routes registered under
 * /api/v1/tools/. Authentication alone used to be enough to reach them, so a
 * principal an operator had scoped down to, say, settings:read could still stage
 * bytes behind a public download URL and drive the image and media decoders.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;
/** Authenticates fine, holds neither tools:use nor files:own. */
let scopedKey: string;
/** The permissions a normal `user` role carries. */
let capableKey: string;

const PNG = readFixture(fixtures.image.base.png200);

async function createKey(name: string, permissions: string[]): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, permissions },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body).key;
}

function pngUpload(fieldName: string) {
  return createMultipartPayload([
    { name: fieldName, filename: "probe.png", contentType: "image/png", content: PNG },
  ]);
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  scopedKey = await createKey("no-file-rights", ["settings:read"]);
  capableKey = await createKey("file-rights", ["tools:use", "files:own"]);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("upload and preview authorization", () => {
  it("refuses an upload from a principal without file permissions", async () => {
    const { body, contentType } = pngUpload("file");
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { authorization: `Bearer ${scopedKey}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
    // Nothing may be persisted, since /api/v1/download serves it without auth.
    expect(JSON.parse(res.body)).not.toHaveProperty("jobId");
  });

  it("refuses a URL import from a principal without file permissions", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${scopedKey}` },
      // Loopback, so the SSRF guard would answer it without a network call if
      // the request ever got that far.
      payload: { urls: ["http://127.0.0.1/probe.png"] },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).not.toHaveProperty("results");
  });

  it("refuses an image preview from a principal without tool permissions", async () => {
    const { body, contentType } = pngUpload("file");
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview",
      headers: { authorization: `Bearer ${scopedKey}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
  });

  it("refuses a media preview from a principal without tool permissions", async () => {
    const { body, contentType } = pngUpload("file");
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview/generate",
      headers: { authorization: `Bearer ${scopedKey}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
  });

  it("still allows a principal that holds the permissions", async () => {
    const upload = pngUpload("file");
    const uploadRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { authorization: `Bearer ${capableKey}`, "content-type": upload.contentType },
      payload: upload.body,
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(JSON.parse(uploadRes.body).jobId).toBeTruthy();

    // Past the permission gate, the SSRF guard answers per URL.
    const fetchRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${capableKey}` },
      payload: { urls: ["http://127.0.0.1/probe.png"] },
    });
    expect(fetchRes.statusCode).toBe(200);
    expect(JSON.parse(fetchRes.body).results[0].error).toMatch(/private or reserved/i);

    const preview = pngUpload("file");
    const previewRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview",
      headers: { authorization: `Bearer ${capableKey}`, "content-type": preview.contentType },
      payload: preview.body,
    });
    expect(previewRes.statusCode).toBe(200);
  });

  it("still rejects anonymous callers with 401 rather than 403", async () => {
    const { body, contentType } = pngUpload("file");
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(401);

    const fetchRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      payload: { urls: ["http://127.0.0.1/probe.png"] },
    });
    expect(fetchRes.statusCode).toBe(401);
  });
});
