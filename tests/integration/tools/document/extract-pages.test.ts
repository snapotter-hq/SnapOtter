import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/extract-pages",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("extract-pages (requires qpdf)", () => {
  it("extracts pages 1-2 from a 3-page pdf", async () => {
    const res = await runTool({ range: "1-2" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "extract-pages-test-"));
    try {
      const outPath = join(dir, "extracted.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects an invalid page range with 400", async () => {
    const res = await runTool({ range: "abc;x" });
    expect(res.statusCode).toBe(400);
  }, 60_000);

  // Sentry NODE-A4: a page past the end used to reach qpdf, exit 2, and come
  // back as a 422 "Processing failed" reported as our bug (#4415).
  it("rejects a page past the end with a coded 400 before qpdf runs", async () => {
    const res = await runTool({ range: "7" });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("PAGE_OUT_OF_RANGE");
    expect(body.error).toMatch(/out of range for a 3-page document/);
  }, 60_000);

  it("rejects page syntax qpdf can't parse with a coded 400", async () => {
    const res = await runTool({ range: "1z" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("INVALID_PAGE_RANGE");
  }, 60_000);
});
