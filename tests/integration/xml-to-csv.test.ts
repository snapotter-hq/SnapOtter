import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

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
    url: "/api/v1/tools/xml-to-csv",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("xml-to-csv (pure JS, no skipIf)", () => {
  it("converts XML with 2 repeated elements to CSV with 2 data rows", async () => {
    const xml = Buffer.from(
      '<?xml version="1.0"?><items><item><name>Ada</name><age>36</age></item><item><name>Grace</name><age>85</age></item></items>',
    );
    const res = await runTool("data.xml", xml);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    expect(envelope.rows).toBe(2);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = dl.payload;
    const lines = text.trim().split("\n");
    // header + 2 data rows
    expect(lines.length).toBe(3);
    expect(text).toContain("Ada");
    expect(text).toContain("Grace");
  }, 30_000);

  it("rejects XML with no repeating elements", async () => {
    const xml = Buffer.from('<?xml version="1.0"?><root><single>value</single></root>');
    const res = await runTool("flat.xml", xml);
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/no repeating elements/i);
  }, 30_000);
});
