import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const PDF = readFileSync(join(__dirname, "..", "fixtures", "test-3page.pdf"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!qpdfAvailable())("merge-pdf (requires qpdf)", () => {
  it("merges two PDFs into a 6-page document", async () => {
    // Send TWO file parts named "file" (the multi-input path)
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/merge-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Write downloaded PDF to temp and verify page count
    const dir = mkdtempSync(join(tmpdir(), "merge-pdf-test-"));
    try {
      const outPath = join(dir, "merged.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("returns 422 when only one PDF is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "only.pdf", contentType: "application/pdf", content: PDF },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/merge-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    // The worker throws "Merging needs at least two PDFs" which surfaces as 422
    // with a generic "Processing failed" error (the factory strips internal details)
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("Processing failed");
    expect(parsed.details).toMatch(/at least two/i);
  }, 60_000);
});
