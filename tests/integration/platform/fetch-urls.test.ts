/**
 * Integration tests for the fetch-urls route.
 *
 * Uses a public IP (1.2.3.4) in test URLs so the real safeFetch SSRF
 * validation passes without any module mocking. The global `fetch` is
 * stubbed via vi.stubGlobal to return canned responses, avoiding real
 * network calls entirely.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const JPG = readFixture(fixtures.image.base.jpg100);
const TIFF = readFixture(fixtures.image.formats("tiff"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

// Public IP that passes SSRF private-IP validation (not 10.x, 127.x, 192.168.x, etc.)
const MOCK_ORIGIN = "http://1.2.3.4:9999";

function mockResponse(
  body: Buffer | string | null,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const buf = body ? (typeof body === "string" ? Buffer.from(body) : body) : Buffer.alloc(0);
  return new Response(body === null || buf.length === 0 ? null : buf, {
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
    headers: new Headers(init.headers),
  });
}

function createMockFetch() {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const path = new URL(urlStr).pathname;

    switch (path) {
      case "/photo.jpg":
        return mockResponse(JPG, { headers: { "Content-Type": "image/jpeg" } });
      case "/not-image.txt":
        return mockResponse("This is not an image", {
          headers: { "Content-Type": "text/plain" },
        });
      case "/redirect":
        return mockResponse(null, {
          status: 302,
          headers: { Location: `${new URL(urlStr).origin}/photo.jpg` },
        });
      case "/missing.jpg":
        return mockResponse("Not Found", { status: 404 });
      case "/photo.tiff":
        return mockResponse(TIFF, { headers: { "Content-Type": "image/tiff" } });
      case "/empty":
        return mockResponse(null, { headers: { "Content-Type": "image/jpeg" } });
      case "/server-error":
        return mockResponse("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      case "/slow-close":
        return mockResponse(null, {
          headers: { "Content-Type": "image/jpeg", "Content-Length": "0" },
        });
      default:
        return mockResponse("Not Found", { status: 404 });
    }
  });
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

let mockFetch: ReturnType<typeof createMockFetch>;

beforeEach(() => {
  mockFetch = createMockFetch();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/v1/fetch-urls", () => {
  it("fetches a valid image URL and returns metadata + download URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/photo.jpg`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.url).toBe(`${MOCK_ORIGIN}/photo.jpg`);
    expect(result.filename).toBe("photo.jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.size).toBeGreaterThan(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.downloadUrl).toMatch(/^\/api\/v1\/download\/.+\/photo\.jpg$/);
    expect(result.previewUrl).toBeNull();
  });

  it("returns failure for a 404 URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/missing.jpg`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain("404");
  });

  it("accepts non-image content (multimodal)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/not-image.txt`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].downloadUrl).toBeDefined();
  });

  it("handles mixed batch with successes and failures", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        urls: [
          `${MOCK_ORIGIN}/photo.jpg`,
          `${MOCK_ORIGIN}/missing.jpg`,
          `${MOCK_ORIGIN}/not-image.txt`,
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(3);

    expect(body.results[0].success).toBe(true);
    expect(body.results[0].filename).toBe("photo.jpg");
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].error).toContain("404");
    expect(body.results[2].success).toBe(true);
  });

  it("returns 400 for an empty URL array", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it("returns 400 for more than 50 URLs", async () => {
    const urls = Array.from({ length: 51 }, (_, i) => `http://1.2.3.4/img${i}.jpg`);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it("follows redirects to fetch the final image", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/redirect`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.size).toBe(JPG.length);
  });

  it("download URL serves the actual image", async () => {
    const fetchRes = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/photo.jpg`] },
    });

    const body = JSON.parse(fetchRes.body);
    const downloadUrl = body.results[0].downloadUrl;
    expect(downloadUrl).toBeTruthy();

    const downloadRes = await app.inject({
      method: "GET",
      url: downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers["content-type"]).toBe("image/jpeg");
    expect(downloadRes.rawPayload.length).toBe(JPG.length);
  });

  it("deduplicates filenames when multiple URLs resolve to the same name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/photo.jpg`, `${MOCK_ORIGIN}/photo.jpg`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(2);

    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(true);

    const names = [body.results[0].filename, body.results[1].filename];
    expect(new Set(names).size).toBe(2);
    expect(names).toContain("photo.jpg");
    expect(names).toContain("photo_1.jpg");

    expect(body.results[0].downloadUrl).not.toBe(body.results[1].downloadUrl);

    for (const result of body.results) {
      const dl = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dl.statusCode).toBe(200);
      expect(dl.rawPayload.length).toBe(JPG.length);
    }
  });

  it("returns 400 for invalid URL format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: ["not-a-valid-url"] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it("generates a preview for non-browser-previewable formats", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/photo.tiff`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.contentType).toBe("image/tiff");
    expect(result.previewUrl).toBeTruthy();
    expect(result.previewUrl).toContain("preview-");
    expect(result.previewUrl).toContain(".webp");

    const previewRes = await app.inject({
      method: "GET",
      url: result.previewUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
  });

  it("returns failure for empty response body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/empty`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain("Empty");
  });

  it("returns failure for 500 server error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/server-error`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain("500");
  });

  it("returns failure when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/unreachable.jpg`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toBeTruthy();
  });

  it("returns failure for zero-length content", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/slow-close`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain("Empty");
  });
});
