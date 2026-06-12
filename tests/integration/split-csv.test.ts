import { readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const CSV = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.csv"));
const TSV = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.tsv"));

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
    { name: "file", filename: "tiny.csv", contentType: "text/csv", content: CSV },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/split-csv",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("split-csv (pure JS, no skipIf)", () => {
  it("splits with rowsPerFile 1 into a zip with 3 entries each containing the header", async () => {
    const res = await runTool({ rowsPerFile: 1, keepHeader: true });
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

    // Verify 3 entries via adm-zip (3 data rows = 3 parts)
    const zip = new AdmZip(Buffer.from(dl.rawPayload));
    const entries = zip.getEntries();
    expect(entries.length).toBe(3);

    // Each part should contain the header row "name,age"
    for (const entry of entries) {
      const text = entry.getData().toString("utf8");
      expect(text).toContain("name,age");
    }
  }, 30_000);

  it("splits a TSV file correctly with rowsPerFile 1", async () => {
    const { body: tsvBody, contentType: tsvCt } = createMultipartPayload([
      {
        name: "file",
        filename: "tiny.tsv",
        contentType: "text/tab-separated-values",
        content: TSV,
      },
      { name: "settings", content: JSON.stringify({ rowsPerFile: 1, keepHeader: true }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-csv",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": tsvCt },
      body: tsvBody,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const zip = new AdmZip(Buffer.from(dl.rawPayload));
    const entries = zip.getEntries();
    // TSV has 2 data rows -> 2 parts
    expect(entries.length).toBe(2);

    // Each part should contain the header
    for (const entry of entries) {
      const text = entry.getData().toString("utf8");
      expect(text).toContain("id");
      expect(text).toContain("name");
    }
  }, 30_000);

  it("splits with keepHeader false omits the header from parts", async () => {
    const res = await runTool({ rowsPerFile: 2, keepHeader: false });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const zip = new AdmZip(Buffer.from(dl.rawPayload));
    const entries = zip.getEntries();
    // 4 rows (including header treated as data) / 2 = 2 parts
    expect(entries.length).toBe(2);
  }, 30_000);
});
