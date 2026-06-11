import { readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const CSV = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.csv"));
const XLSX_FIXTURE = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.xlsx"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer, settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/csv-excel",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("csv-excel (pure JS, no skipIf)", () => {
  it("converts CSV to XLSX with PK magic and reloadable content", async () => {
    const res = await runTool("tiny.csv", CSV);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    // XLSX files start with PK zip magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);

    // XLSX is a ZIP containing xl/worksheets/sheet1.xml.
    // Parse the zip and verify the first sheet's XML has the header "name".
    const zip = new AdmZip(Buffer.from(dl.rawPayload));
    const sheetEntry = zip.getEntry("xl/worksheets/sheet1.xml");
    expect(sheetEntry).toBeDefined();
    // The shared strings table stores cell values; look there
    const sst = zip.getEntry("xl/sharedStrings.xml");
    expect(sst).toBeDefined();
    const sstXml = sst?.getData().toString("utf8") ?? "";
    expect(sstXml).toContain("name");
  }, 30_000);

  it("converts XLSX to CSV containing the fixture content", async () => {
    // Use the committed tiny.xlsx from tests/fixtures/documents/
    // (Sheet1 with "SnapOtter" in A1)
    const res = await runTool("tiny.xlsx", XLSX_FIXTURE, { sheet: 1 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const csvText = dl.payload;
    expect(csvText).toContain("SnapOtter");
  }, 30_000);
});
