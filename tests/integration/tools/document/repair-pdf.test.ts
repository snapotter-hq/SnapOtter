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
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(pdfBuffer: Buffer, filename = "test-3page.pdf") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/pdf", content: pdfBuffer },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/repair-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("repair-pdf (requires qpdf)", () => {
  it("repairs (round-trips) a valid PDF preserving 3 pages", async () => {
    const res = await runTool(PDF);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "repair-pdf-test-"));
    try {
      const outPath = join(dir, "repaired.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("handles a truncated PDF (dual outcome: repair or reject)", async () => {
    // Slice the PDF to ~60% of its length to produce structural damage
    const truncated = PDF.subarray(0, Math.floor(PDF.length * 0.6));

    const res = await runTool(truncated, "broken.pdf");

    // qpdf recovery either repairs (200) or rejects (422) depending on
    // where the truncation falls; both are acceptable outcomes.
    expect([200, 422]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const envelope = JSON.parse(res.body);
      const dl = await testApp.app.inject({
        method: "GET",
        url: envelope.downloadUrl,
      });
      expect(dl.statusCode).toBe(200);

      const dir = mkdtempSync(join(tmpdir(), "repair-pdf-test-trunc-"));
      try {
        const outPath = join(dir, "repaired.pdf");
        writeFileSync(outPath, dl.rawPayload);
        const pages = await qpdfPageCount(outPath);
        expect(pages).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
