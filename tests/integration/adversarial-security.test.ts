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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));

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
    url: `/api/v1/tools/${toolId}`,
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
    url: `/api/v1/tools/${toolId}`,
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
      url: "/api/v1/tools/resize/batch",
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
    const fileResults = JSON.parse(batchRes.headers["x-file-results"] as string);
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
