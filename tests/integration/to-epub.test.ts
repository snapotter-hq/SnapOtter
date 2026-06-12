// to-epub integration suite.
// Requires pandoc. Skips locally (pandoc absent on dev Macs);
// the Docker compose smoke is the real proof.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pandocAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MD = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.md"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/to-epub",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pandocAvailable())("to-epub (requires pandoc)", () => {
  it("converts tiny.md to EPUB with PK magic", async () => {
    const res = await runTool("tiny.md", MD);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // EPUB is a ZIP archive (PK magic bytes)
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 30_000);
});

// Ungated: runs locally without pandoc
it("rejects unsupported file types with 415", async () => {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: "data.csv",
      contentType: "text/csv",
      content: Buffer.from("a,b\n1,2"),
    },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/to-epub",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(415);
});
