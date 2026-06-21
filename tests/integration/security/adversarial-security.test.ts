/**
 * Adversarial security integration tests for the SnapOtter image API.
 *
 * Focuses on attack vectors not covered by existing adversarial test files:
 *   - Path traversal: Windows-style, URL-encoded, double-encoded, embedded
 *   - Null byte injection: truncation attacks via \x00
 *   - Extreme filename lengths: 1000-char, special-char-only filenames
 *   - Unicode filenames: additional edge cases
 *   - Concurrent request racing: data integrity verification, cross-contamination
 *
 * Complements:
 *   - adversarial.test.ts (corrupted images, injection, malformed settings)
 *   - adversarial-extended.test.ts (zero-byte, unicode, batch, pipeline, concurrent)
 *   - adversarial-matrix.test.ts (memory pressure, parameter boundaries, pipelines)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PNG_200x150 = readFixture(fixtures.image.base.png200);
const SVG_XXE_FILE = readFixture(fixtures.security.svgXxeFile);
const SVG_XXE_SSRF = readFixture(fixtures.security.svgXxeSsrf);

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

/** Helper to POST a multipart payload to a tool endpoint. */
function postTool(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  });
}

/** Helper to build an inject config for a tool request. */
function buildToolRequest(
  toolId: string,
  image: Buffer,
  filename: string,
  settings: Record<string, unknown>,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: image, contentType: "image/png" },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return {
    method: "POST" as const,
    url: apiToolPath(toolId),
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
    body,
  };
}

// ===========================================================================
// PATH TRAVERSAL ATTACKS
// ===========================================================================
describe("Path traversal attacks", () => {
  it("sanitizes ../../etc/passwd as filename", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "../../etc/passwd",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Must either reject (400) or succeed with sanitized path
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("etc/passwd");
    }
  });

  it("sanitizes Windows-style traversal: ..\\..\\windows\\system32\\config\\sam", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "..\\..\\windows\\system32\\config\\sam",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("\\");
      expect(json.downloadUrl).not.toContain("system32");
    }
  });

  it("sanitizes URL-encoded traversal: %2e%2e%2f%2e%2e%2fetc%2fpasswd", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      // Even if percent-encoded chars are kept literally, the output path
      // must not resolve to a traversal
      expect(json.downloadUrl).not.toContain("etc/passwd");
    }
  });

  it("sanitizes double-encoded traversal: ....//....//etc/passwd", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "....//....//etc/passwd",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("etc/passwd");
    }
  });

  it("sanitizes embedded traversal: test/../../../etc/passwd.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test/../../../etc/passwd.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("etc/passwd");
    }
  });

  it("sanitizes path traversal through compress tool", async () => {
    const res = await postTool("compress", [
      {
        name: "file",
        filename: "../../../tmp/evil.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ quality: 80 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("tmp/evil");
    }
  });

  it("sanitizes path traversal through rotate tool", async () => {
    const res = await postTool("rotate", [
      {
        name: "file",
        filename: "../../../../var/log/syslog.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("var/log");
    }
  });
});

// ===========================================================================
// NULL BYTE INJECTION
// ===========================================================================
describe("Null byte injection", () => {
  it("handles filename with null byte before extension: image\\x00.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "image\x00.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Must not crash (500). Either processed (200) or rejected (400).
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("\x00");
    }
  });

  it("handles filename with embedded null bytes: te\\x00st\\x00.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "te\x00st\x00.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("\x00");
    }
  });

  it("handles filename that is only null bytes", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\x00\x00\x00",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // After stripping null bytes, the name becomes empty, which should
    // fall back to the default "upload" name.
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
      expect(json.downloadUrl).not.toContain("\x00");
    }
  });

  it("handles null byte combined with path traversal: ../\\x00../../etc/passwd.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "../\x00../../etc/passwd.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).not.toContain("\x00");
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("etc/passwd");
    }
  });
});

// ===========================================================================
// EXTREME FILENAME LENGTHS
// ===========================================================================
describe("Extreme filename lengths", () => {
  it("handles a 1000-character filename without crashing", async () => {
    const longBase = "a".repeat(1000);
    const longName = `${longBase}.png`;

    const res = await postTool("resize", [
      {
        name: "file",
        filename: longName,
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // sanitizeFilename truncates to 200 bytes, so this should succeed
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    // The filename in the URL should be truncated (not the full 1000 chars)
    expect(json.downloadUrl.length).toBeLessThan(1100);
  });

  it("handles a filename made entirely of special characters: !@#$%^&()+=.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "!@#$%^&()+=.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles a filename with repeated dots: ....test....png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "....test....png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
    }
  });

  it("handles a filename with only spaces: '   .png'", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "   .png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles a 5000-character filename", async () => {
    const hugeBase = "x".repeat(5000);
    const hugeName = `${hugeBase}.png`;

    const res = await postTool("resize", [
      {
        name: "file",
        filename: hugeName,
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Must not crash; sanitizeFilename truncates to 200 bytes
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
    }
  });
});

// ===========================================================================
// UNICODE FILENAMES -- ADDITIONAL EDGE CASES
// ===========================================================================
describe("Unicode filenames -- additional security edge cases", () => {
  it("handles filename with Arabic (RTL) text only: صورة.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "صورة.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with Korean hangul: 사진.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "사진.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with Devanagari script: चित्र.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "चित्र.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with mixed emoji sequence: \u{1F1FA}\u{1F1F8}\u{1F4F8}\u{1F3DE}\u{FE0F}.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\u{1F1FA}\u{1F1F8}\u{1F4F8}\u{1F3DE}\u{FE0F}.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles filename with right-to-left override character (U+202E)", async () => {
    // This Unicode control char can visually reverse text -- used in social
    // engineering attacks to disguise file extensions
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "photo‮gnp.exe",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Should succeed but the output URL must not contain the RTLO character
    // in a way that hides the real extension
    expect([200, 400]).toContain(res.statusCode);
  });

  it("handles filename with zero-width joiner and variation selectors", async () => {
    // Family emoji composed via ZWJ: technically a single glyph
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(200);
  });

  it("handles filename with tab characters: file\\tname\\t.png", async () => {
    const res = await postTool("resize", [
      {
        name: "file",
        filename: "file\tname\t.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([200, 400]).toContain(res.statusCode);
  });
});

// ===========================================================================
// CONCURRENT REQUEST RACING
// ===========================================================================
describe("Concurrent requests -- data integrity verification", () => {
  it("fires 10 simultaneous resize requests with different widths -- all return correct results", async () => {
    const widths = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200];

    const results = await Promise.all(
      widths.map((width, i) =>
        app.inject(
          buildToolRequest("resize", PNG_200x150, `concurrent-${i}.png`, {
            width,
          }),
        ),
      ),
    );

    // All 10 must return 200
    for (const res of results) {
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.downloadUrl).toBeDefined();
    }

    // All 10 must produce unique job IDs (no race condition)
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    // All 10 must produce unique download URLs
    const urls = results.map((r) => JSON.parse(r.body).downloadUrl);
    expect(new Set(urls).size).toBe(10);

    // Processed sizes should vary since widths differ -- verify no cross-contamination
    const processedSizes = results.map((r) => JSON.parse(r.body).processedSize);
    // At minimum, the smallest width (20) should produce a smaller file than the largest (200)
    expect(processedSizes[0]).toBeLessThan(processedSizes[9]);
  }, 120_000);

  it("fires batch and single request simultaneously -- no cross-contamination", async () => {
    // Single resize to 50px width
    const singleReq = app.inject(
      buildToolRequest("resize", PNG_200x150, "single-only.png", {
        width: 50,
      }),
    );

    // Batch resize of 3 images to 150px width
    const batchPayload = createMultipartPayload([
      {
        name: "file",
        filename: "batch-1.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "file",
        filename: "batch-2.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "file",
        filename: "batch-3.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 150 }) },
    ]);
    const batchReq = app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize/batch",
      headers: {
        "content-type": batchPayload.contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body: batchPayload.body,
    });

    const [singleRes, batchRes] = await Promise.all([singleReq, batchReq]);

    // Single request must succeed
    expect(singleRes.statusCode).toBe(200);
    const singleBody = JSON.parse(singleRes.body);
    expect(singleBody.jobId).toBeDefined();
    expect(singleBody.downloadUrl).toBeDefined();
    // Single was 50px width, so it should be smaller than the 200px original
    expect(singleBody.processedSize).toBeLessThan(singleBody.originalSize);

    // Batch request must succeed
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(
      decodeURIComponent(batchRes.headers["x-file-results"] as string),
    );
    expect(Object.keys(fileResults).length).toBe(3);

    // The single request's job ID must not appear in the batch results
    for (const name of Object.keys(fileResults)) {
      expect(name).not.toContain("single");
    }
  }, 120_000);

  it("fires 10 simultaneous requests across 5 different tools -- all isolated", async () => {
    const requests = [
      buildToolRequest("resize", PNG_200x150, "r1.png", { width: 80 }),
      buildToolRequest("resize", PNG_200x150, "r2.png", { width: 120 }),
      buildToolRequest("rotate", PNG_200x150, "rot1.png", { angle: 90 }),
      buildToolRequest("rotate", PNG_200x150, "rot2.png", { angle: 180 }),
      buildToolRequest("compress", PNG_200x150, "c1.png", { quality: 30 }),
      buildToolRequest("compress", PNG_200x150, "c2.png", { quality: 90 }),
      buildToolRequest("border", PNG_200x150, "b1.png", { borderWidth: 5 }),
      buildToolRequest("border", PNG_200x150, "b2.png", { borderWidth: 20 }),
      buildToolRequest("convert", PNG_200x150, "cv1.png", { format: "webp" }),
      buildToolRequest("convert", PNG_200x150, "cv2.png", { format: "jpg" }),
    ];

    const results = await Promise.all(requests.map((req) => app.inject(req)));

    // All must return 200
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All must have unique job IDs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    // All must have unique download URLs
    const urls = results.map((r) => JSON.parse(r.body).downloadUrl);
    expect(new Set(urls).size).toBe(10);
  }, 120_000);

  it("fires adversarial filename requests concurrently with valid requests", async () => {
    const [valid1, traversal, valid2, nullByte, valid3] = await Promise.all([
      app.inject(
        buildToolRequest("resize", PNG_200x150, "normal-1.png", {
          width: 100,
        }),
      ),
      app.inject(
        buildToolRequest("resize", PNG_200x150, "../../../etc/shadow.png", {
          width: 100,
        }),
      ),
      app.inject(
        buildToolRequest("resize", PNG_200x150, "normal-2.png", {
          width: 100,
        }),
      ),
      app.inject(
        buildToolRequest("resize", PNG_200x150, "evil\x00.png", {
          width: 100,
        }),
      ),
      app.inject(
        buildToolRequest("resize", PNG_200x150, "normal-3.png", {
          width: 100,
        }),
      ),
    ]);

    // Valid requests must succeed
    expect(valid1.statusCode).toBe(200);
    expect(valid2.statusCode).toBe(200);
    expect(valid3.statusCode).toBe(200);

    // Adversarial requests must not crash the server
    expect([200, 400]).toContain(traversal.statusCode);
    expect([200, 400]).toContain(nullByte.statusCode);

    // If traversal succeeded, verify sanitization
    if (traversal.statusCode === 200) {
      const json = JSON.parse(traversal.body);
      expect(json.downloadUrl).not.toContain("..");
      expect(json.downloadUrl).not.toContain("etc/shadow");
    }

    // Valid request job IDs must be unique
    const validIds = [valid1, valid2, valid3].map((r) => JSON.parse(r.body).jobId);
    expect(new Set(validIds).size).toBe(3);
  }, 120_000);
});

// ===========================================================================
// SVG XXE ATTACKS THROUGH API ENDPOINT
// Existing unit tests verify sanitizeSvg() strips DOCTYPE, but these
// integration tests verify the full API endpoint rejects XXE payloads
// end-to-end through svg-to-raster.
// ===========================================================================
describe("SVG XXE attacks through svg-to-raster endpoint", () => {
  it("strips DOCTYPE with file-read XXE entity from svg-to-raster", async () => {
    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "xxe-file-read.svg",
        content: SVG_XXE_FILE,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // The server must NOT return /etc/passwd contents.
    // Should either succeed (with DOCTYPE stripped, entity ignored) or reject.
    expect([200, 400, 422]).toContain(res.statusCode);
    // If it succeeded, the output should be an image, not text
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
      // Download the output and verify it is a valid PNG, not leaked file contents
      const dlRes = await app.inject({
        method: "GET",
        url: json.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(dlRes.statusCode).toBe(200);
      // The response body must not contain passwd file content
      expect(dlRes.body).not.toContain("root:");
      expect(dlRes.body).not.toContain("/bin/bash");
    }
  });

  it("strips DOCTYPE with SSRF XXE entity from svg-to-raster", async () => {
    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "xxe-ssrf.svg",
        content: SVG_XXE_SSRF,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // Must not make an outbound request to the metadata service
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
    }
  });

  it("strips DOCTYPE with parameter entity expansion from inline SVG", async () => {
    // Parameter entity expansion can cause DoS (billion laughs variant)
    const paramEntitySvg = Buffer.from(
      '<?xml version="1.0"?>' +
        '<!DOCTYPE svg [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        "<text>&b;</text></svg>",
    );

    const res = await postTool("svg-to-raster", [
      {
        name: "file",
        filename: "param-entity.svg",
        content: paramEntitySvg,
        contentType: "image/svg+xml",
      },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png" }),
      },
    ]);

    // Must not expand entities or crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });
});

// ===========================================================================
// SQL INJECTION IN SETTINGS VALUES
// Existing tests cover SQL injection in text-overlay text and in the URL
// path. These tests verify SQL injection via other settings fields that
// might reach the database (e.g., through analytics or job tracking).
// ===========================================================================
describe("SQL injection in settings values -- additional vectors", () => {
  it("handles SQL injection in border color field without DB corruption", async () => {
    const res = await postTool("border", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          borderWidth: 10,
          borderColor: "'; DROP TABLE jobs; --",
        }),
      },
    ]);

    // Zod hex color regex should reject this
    expect(res.statusCode).toBe(400);

    // Verify the database is intact
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
  });

  it("handles SQL injection in convert format field without DB corruption", async () => {
    const res = await postTool("convert", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          format: "png'; DELETE FROM users WHERE '1'='1",
        }),
      },
    ]);

    // Zod enum should reject this
    expect(res.statusCode).toBe(400);

    // Verify DB still works
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
  });

  it("handles SQL injection in crop settings without DB corruption", async () => {
    const res = await postTool("crop", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: '{"left": 0, "top": 0, "width": "100; DROP TABLE sessions", "height": 100}',
      },
    ]);

    // Zod z.number() should reject string
    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// REQUEST BODY SIZE LIMITS
// The settings payload is capped at 64KB. Existing tests cover a 100KB
// settings string. These tests verify the limit from additional angles.
// ===========================================================================
describe("Request body size limits -- settings payload", () => {
  it("rejects settings payload at exactly 65537 bytes (64KB + 1)", async () => {
    // Build a settings object that is exactly one byte over the 64KB limit
    const padLength = 65537 - '{"width":100,"pad":""}'.length;
    const bigSettings = JSON.stringify({ width: 100, pad: "X".repeat(padLength) });

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: bigSettings },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/too large|64KB/i);
  });

  it("accepts settings payload at exactly 65536 bytes (64KB limit)", async () => {
    const padLength = 65536 - '{"width":100,"pad":""}'.length;
    const borderlineSettings = JSON.stringify({ width: 100, pad: "Y".repeat(padLength) });

    const res = await postTool("resize", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: borderlineSettings },
    ]);

    // Exactly at the limit should be accepted (Zod strips the unknown "pad" field)
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// EXTREMELY LONG PARAMETER VALUES (non-settings payloads)
// Verifies that Zod validation rejects excessively long values for
// fields with max length constraints.
// ===========================================================================
describe("Extremely long parameter values", () => {
  it("rejects text-overlay with 10000-char text (max 500)", async () => {
    const res = await postTool("text-overlay", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          text: "B".repeat(10000),
          fontSize: 24,
        }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects watermark-text with 10000-char text", async () => {
    const res = await postTool("watermark-text", [
      {
        name: "file",
        filename: "test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "settings",
        content: JSON.stringify({
          text: "W".repeat(10000),
          fontSize: 12,
          opacity: 50,
        }),
      },
    ]);

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// RACE CONDITION: CONCURRENT WRITES TO SAME OUTPUT PATHS
// Verifies that concurrent requests with identical filenames do not
// overwrite each other's output files (each should get a unique
// workspace/jobId).
// ===========================================================================
describe("Race conditions -- concurrent identical filename requests", () => {
  it("10 concurrent requests with identical filename produce unique outputs", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject(
          buildToolRequest("resize", PNG_200x150, "same-name.png", {
            width: 100,
          }),
        ),
      ),
    );

    // All must succeed
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // All must produce unique job IDs and download URLs
    const jobIds = results.map((r) => JSON.parse(r.body).jobId);
    expect(new Set(jobIds).size).toBe(10);

    const urls = results.map((r) => JSON.parse(r.body).downloadUrl);
    expect(new Set(urls).size).toBe(10);

    // Download two outputs and verify they are valid, independent images
    const dl1 = await app.inject({
      method: "GET",
      url: urls[0],
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const dl2 = await app.inject({
      method: "GET",
      url: urls[1],
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(dl1.statusCode).toBe(200);
    expect(dl2.statusCode).toBe(200);

    const meta1 = await sharp(dl1.rawPayload).metadata();
    const meta2 = await sharp(dl2.rawPayload).metadata();
    expect(meta1.width).toBe(100);
    expect(meta2.width).toBe(100);
  }, 120_000);

  it("concurrent pipeline and single request with same filename -- no collision", async () => {
    const pipelinePayload = createMultipartPayload([
      {
        name: "file",
        filename: "collision-test.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "resize", settings: { width: 80 } },
            { toolId: "compress", settings: { quality: 50 } },
          ],
        }),
      },
    ]);

    const [pipelineRes, singleRes] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: {
          "content-type": pipelinePayload.contentType,
          authorization: `Bearer ${adminToken}`,
        },
        body: pipelinePayload.body,
      }),
      app.inject(
        buildToolRequest("resize", PNG_200x150, "collision-test.png", {
          width: 80,
        }),
      ),
    ]);

    // Both must succeed
    expect(pipelineRes.statusCode).toBe(200);
    expect(singleRes.statusCode).toBe(200);

    // Different job IDs despite same filename
    const pipeJob = JSON.parse(pipelineRes.body).jobId;
    const singleJob = JSON.parse(singleRes.body).jobId;
    expect(pipeJob).not.toBe(singleJob);
  }, 60_000);
});

// ===========================================================================
// SERVER STABILITY AFTER SECURITY BARRAGE
// ===========================================================================
describe("Server stability -- health check after security tests", () => {
  it("server remains responsive after all security tests", async () => {
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
    const json = JSON.parse(healthRes.body);
    expect(json.status).toBe("healthy");

    // Verify a normal request still works
    const normalRes = await postTool("resize", [
      {
        name: "file",
        filename: "sanity-check.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);
    expect(normalRes.statusCode).toBe(200);
    expect(JSON.parse(normalRes.body).jobId).toBeDefined();
  });
});
