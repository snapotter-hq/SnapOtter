import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { hasFitz } from "../../../helpers/python-gate.js";
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
    url: "/api/v1/tools/pdf/redact-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!hasFitz)("redact-pdf (requires PyMuPDF)", () => {
  it("redacts terms and reports found count", async () => {
    const res = await runTool({ terms: ["Page"], caseSensitive: false });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    expect(envelope.resultPayload).toBeDefined();
    expect(envelope.resultPayload.found).toBeGreaterThanOrEqual(0);

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});

describe("redact-pdf validation (ungated)", () => {
  it("rejects empty terms array with 400", async () => {
    const res = await runTool({ terms: [] });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects terms with empty string with 400", async () => {
    const res = await runTool({ terms: [""] });
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
