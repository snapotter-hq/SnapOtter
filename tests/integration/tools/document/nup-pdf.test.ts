import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfcpuAvailable, qpdfPageCount } from "@snapotter/doc-engine";
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
    url: "/api/v1/tools/pdf/nup-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pdfcpuAvailable())("nup-pdf (requires pdfcpu)", () => {
  it("arranges pages 2-up, collapsing a 3-page PDF to 2 sheets", async () => {
    const res = await runTool({ perSheet: 2 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");

    // Semantic oracle: 2-up imposition must collapse the 3-page fixture to
    // ceil(3/2) = 2 sheets. A no-op passthrough would leave 3 pages and still
    // pass the %PDF- magic check, so assert the actual output page count.
    const dir = mkdtempSync(join(tmpdir(), "nup-pdf-test-"));
    try {
      const outPath = join(dir, "nup.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(2);
      expect(pages).toBeLessThan(3); // fewer sheets than the 3 input pages
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("nup-pdf validation (ungated)", () => {
  it("rejects perSheet 5 with 400", async () => {
    const res = await runTool({ perSheet: 5 });
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
