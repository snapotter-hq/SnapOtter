import { gsAvailable } from "@snapotter/doc-engine";
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

describe.skipIf(!gsAvailable())("compress-pdf (requires gs)", () => {
  async function run(settings: Record<string, unknown>) {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
      { name: "settings", content: JSON.stringify(settings) },
    ]);
    return testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/compress-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
  }

  async function expectValidPdf(res: Awaited<ReturnType<typeof run>>): Promise<number> {
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    return dl.rawPayload.length;
  }

  it("compresses by quality and returns a valid PDF", async () => {
    await expectValidPdf(await run({ mode: "quality", quality: 60 }));
  }, 60_000);

  it("compresses to a target size (DPI binary search) and returns a valid PDF", async () => {
    // Output is content-dependent (text PDFs barely shrink), so assert a valid
    // PDF rather than an exact size; this exercises the binary-search path.
    await expectValidPdf(await run({ mode: "targetSize", targetSizeKb: 50 }));
  }, 120_000);
});
