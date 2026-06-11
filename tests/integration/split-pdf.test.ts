import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import AdmZip from "adm-zip";
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
    url: "/api/v1/tools/split-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("split-pdf (requires qpdf)", () => {
  it("extracts a page range into a 2-page PDF", async () => {
    const res = await runTool({ mode: "range", range: "1-2" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    // Verify page count by writing to temp
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "split-pdf-test-"));
    try {
      const outPath = join(dir, "split.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("splits every 1 page into a zip with 3 entries", async () => {
    const res = await runTool({ mode: "every", everyN: 1 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    // Verify zip magic (PK header: 0x50 0x4B)
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);

    // Verify 3 entries via adm-zip
    const zip = new AdmZip(Buffer.from(dl.rawPayload));
    const entries = zip.getEntries();
    expect(entries.length).toBe(3);
  }, 60_000);

  it("rejects an invalid range at the schema level", async () => {
    const res = await runTool({ mode: "range", range: "abc;x" });
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("Invalid settings");
  });

  it("rejects range mode without a range field", async () => {
    const res = await runTool({ mode: "range" });
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("Invalid settings");
  });
});
