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
// PSD is a CLI-decoded format (file-validation.ts skips the Sharp dimension
// check for it). The route decodes it via decodeToSharpCompat() before
// generating a preview, so this fixture exercises that decode path.
const PSD = readFixture(fixtures.image.formats("psd"));
// Real iPhone-style HEIC (HEVC-encoded). Sharp's bundled libheif cannot
// decode HEVC pixels, so this exercises the decodeHeic() pre-processing
// step the route now runs before preview generation and dimension lookup.
const HEIC = readFixture(fixtures.image.base.heic200);
// A real PSD header with its image data sliced off: magic bytes ("8BPS")
// still detect as "psd" in validateImageBuffer, but the CLI decoder has no
// pixel data to work with and fails. Exercises the route's non-fatal
// decode-failure fallback (same posture as the pre-existing preview catch).
const PSD_TRUNCATED = PSD.subarray(0, 200);

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
      // A path whose basename has no extension: filenameFromUrl cannot derive
      // a name and falls back to a UUID-based "file-xxxxxxxx".
      case "/gallery/12345":
        return mockResponse(JPG, { headers: { "Content-Type": "image/jpeg" } });
      // Basename contains a stray percent sign that is not valid percent-
      // encoding, so decodeURIComponent throws and filenameFromUrl falls back.
      case "/bad%name.jpg":
        return mockResponse(JPG, { headers: { "Content-Type": "image/jpeg" } });
      // PSD validates as an image but is not browser-previewable; the route
      // must decode it via decodeToSharpCompat() before Sharp can re-encode
      // it to a webp preview.
      case "/layers.psd":
        return mockResponse(PSD, { headers: { "Content-Type": "image/vnd.adobe.photoshop" } });
      // Real HEVC-encoded HEIC, the format iPhones actually produce. Sharp's
      // bundled libheif cannot decode HEVC pixels directly; the route must
      // run decodeHeic() first.
      case "/photo.heic":
        return mockResponse(HEIC, { headers: { "Content-Type": "image/heic" } });
      // Validates as PSD (magic bytes intact) but the CLI decoder fails on
      // the missing image data -> the route's decode step throws and must
      // fall back to the raw buffer without failing the whole request.
      case "/broken.psd":
        return mockResponse(PSD_TRUNCATED, {
          headers: { "Content-Type": "image/vnd.adobe.photoshop" },
        });
      // Non-image body with NO content-type header at all: contentType falls
      // back to application/octet-stream.
      case "/blob.bin":
        return mockResponse("just some opaque bytes, definitely not an image");
      // Non-image body with a parameterized content-type: the "; charset=..."
      // suffix is stripped and trimmed to the bare media type.
      case "/report.dat":
        return mockResponse("PLAIN NON IMAGE PAYLOAD", {
          headers: { "Content-Type": "application/pdf; charset=binary" },
        });
      // 3xx redirect that omits the Location header -> safeFetch throws and the
      // route surfaces it as a failure result.
      case "/redirect-no-location":
        return mockResponse(null, { status: 302 });
      // Open-redirect attempt: the redirect target is a private/loopback IP.
      // safeFetch re-validates the hop and rejects it before any second fetch.
      case "/redirect-to-private":
        return mockResponse(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret.jpg" },
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

  it("falls back to a UUID filename when the URL path has no extension", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/gallery/12345`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    // filenameFromUrl fallback: "file-" + 8 hex chars, no extension.
    expect(result.filename).toMatch(/^file-[0-9a-f]{8}$/);
    // The image itself still validates and reports its true dimensions.
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it("falls back to a UUID filename when the basename cannot be URL-decoded", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      // "%na" is not a valid percent-escape, so decodeURIComponent throws
      // inside filenameFromUrl and the catch branch returns the fallback.
      payload: { urls: [`${MOCK_ORIGIN}/bad%name.jpg`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^file-[0-9a-f]{8}$/);
  });

  it("decodes a CLI-decoded format (PSD) to produce a real preview and real dimensions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/layers.psd`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.filename).toBe("layers.psd");
    // MIME comes from the detected format, not the response header.
    expect(result.contentType).toBe("image/vnd.adobe.photoshop");
    // The route decodes the PSD via decodeToSharpCompat() before computing
    // dimensions, so these reflect the real decoded image, not 0x0.
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    // A real webp preview is generated from the decoded buffer.
    expect(result.previewUrl).toBeTruthy();
    expect(result.previewUrl).toContain("preview-");
    expect(result.previewUrl).toContain(".webp");

    const previewRes = await app.inject({
      method: "GET",
      url: result.previewUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.headers["content-type"]).toBe("image/webp");

    // The original, undecoded PSD is still what gets saved for download.
    const dl = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBe(PSD.length);
  });

  it("decodes a real HEIC (HEVC) image to produce a real preview and real dimensions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/photo.heic`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.filename).toBe("photo.heic");
    expect(result.contentType).toBe("image/heic");
    // The route decodes the HEIC via decodeHeic() before computing
    // dimensions, so these reflect the real decoded image (200x150), not 0x0.
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    // Sharp's bundled libheif cannot re-encode HEVC pixels directly; the
    // route must decode first, so a real webp preview comes back non-null.
    expect(result.previewUrl).toBeTruthy();
    expect(result.previewUrl).toContain("preview-");
    expect(result.previewUrl).toContain(".webp");

    const previewRes = await app.inject({
      method: "GET",
      url: result.previewUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.headers["content-type"]).toBe("image/webp");

    // The original, undecoded HEIC is still what gets saved for download.
    const dl = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBe(HEIC.length);
  });

  it("succeeds without a preview when decoding a CLI-decoded format fails", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/broken.psd`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    // A per-URL decode failure is a soft failure, not a request failure:
    // the fetch itself succeeded, so the result still reports success with
    // the pre-decode fallback data, matching the resilience posture of the
    // pre-existing preview try/catch.
    expect(result.success).toBe(true);
    expect(result.filename).toBe("broken.psd");
    expect(result.contentType).toBe("image/vnd.adobe.photoshop");
    // Decode failed, so dimensions fall back to validateImageBuffer's 0x0
    // rather than throwing or failing the whole request.
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    // No preview could be generated from the undecoded, broken buffer.
    expect(result.previewUrl).toBeNull();

    // The raw fetched bytes are still saved for download despite the
    // decode failure.
    const dl = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBe(PSD_TRUNCATED.length);
  });

  it("defaults contentType to application/octet-stream when no header is present", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/blob.bin`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.filename).toBe("blob.bin");
    // Non-image body + missing content-type header -> octet-stream fallback.
    expect(result.contentType).toBe("application/octet-stream");
    // No image validation, so no dimensions and no preview.
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
    expect(result.previewUrl).toBeNull();
  });

  it("strips content-type parameters down to the bare media type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/report.dat`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    // "application/pdf; charset=binary" -> "application/pdf".
    expect(result.contentType).toBe("application/pdf");
  });

  it("returns failure for a redirect without a Location header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/redirect-no-location`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/[Ll]ocation/);
  });

  it("rejects a URL that resolves to a loopback IP (SSRF)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: ["http://127.0.0.1/internal.jpg"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/private or reserved/i);
    // The SSRF guard rejects before any network call is made.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a URL that resolves to an RFC1918 private IP (SSRF)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: ["http://10.0.0.1/admin.png"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/private or reserved/i);
  });

  it("rejects an IPv6 loopback URL (SSRF)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: ["http://[::1]/internal.jpg"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/private or reserved/i);
  });

  it("rejects a non-HTTP(S) protocol", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: ["ftp://files.example.com/archive.jpg"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/HTTP and HTTPS/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects an open redirect whose target is a private IP (SSRF via redirect)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { urls: [`${MOCK_ORIGIN}/redirect-to-private`] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toMatch(/private or reserved/i);
    // The first (public) hop is fetched; the private hop is never fetched.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves result order across concurrent fetches", async () => {
    // More URLs than URL_FETCH_CONCURRENCY (4) so the queue actually schedules
    // in waves; results must still line up with the input order.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fetch-urls",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        urls: [
          `${MOCK_ORIGIN}/photo.jpg`,
          `${MOCK_ORIGIN}/missing.jpg`,
          `${MOCK_ORIGIN}/photo.tiff`,
          `${MOCK_ORIGIN}/not-image.txt`,
          `${MOCK_ORIGIN}/server-error`,
          `${MOCK_ORIGIN}/empty`,
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(6);
    expect(body.results[0].filename).toBe("photo.jpg");
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].error).toContain("404");
    expect(body.results[2].filename).toBe("photo.tiff");
    expect(body.results[3].success).toBe(true);
    expect(body.results[4].success).toBe(false);
    expect(body.results[4].error).toContain("500");
    expect(body.results[5].success).toBe(false);
    expect(body.results[5].error).toContain("Empty");
  });
});
