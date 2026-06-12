// markdown-to-html integration suite.
// Requires pandoc. Skips locally (pandoc absent on dev Macs);
// the Docker compose smoke is the real proof that this tool works end to end
// against the containerised pandoc install.

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
    url: "/api/v1/tools/markdown-to-html",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pandocAvailable())("markdown-to-html (requires pandoc)", () => {
  it("converts tiny.md to HTML containing source text", async () => {
    const res = await runTool("tiny.md", MD);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // The fixture contains "SnapOtter Markdown fixture" as a heading
    expect(dl.payload).toContain("SnapOtter Markdown fixture");
  }, 30_000);
});

it("rejects unsupported file types with 415", async () => {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: "readme.txt",
      contentType: "text/plain",
      content: Buffer.from("hello"),
    },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/markdown-to-html",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(415);
});
