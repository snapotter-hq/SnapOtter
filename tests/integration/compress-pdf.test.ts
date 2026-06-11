import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gsAvailable } from "@snapotter/doc-engine";
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

describe.skipIf(!gsAvailable())("compress-pdf (requires gs)", () => {
  it("compresses with ebook preset and returns valid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
      { name: "settings", content: JSON.stringify({ preset: "ebook" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/compress-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // Verify the output starts with %PDF-
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});
