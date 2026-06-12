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

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/remove-pages",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("remove-pages (requires qpdf)", () => {
  it("removes page 2 from a 3-page pdf, leaving 2 pages", async () => {
    const res = await runTool({ pages: "2" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "remove-pages-test-"));
    try {
      const outPath = join(dir, "removed.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects removing every page (1-z) with 422", async () => {
    const res = await runTool({ pages: "1-z" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error || body.message).toMatch(/every page/i);
  }, 60_000);

  it("rejects out-of-range page with 422", async () => {
    const res = await runTool({ pages: "9" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error || body.message).toMatch(/out of range/i);
  }, 60_000);
});
