import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../fixtures/index.js";
import { hasFitz } from "../helpers/python-gate.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const PDF = readFixture(fixtures.document.pdf3);
const SIG = readFixture(fixtures.image.base.png200);

// Stamping invokes the docs profile's doc_sign script (PyMuPDF). Gate the whole
// suite on fitz so it skips cleanly where PyMuPDF is not installed; the app
// setup lives inside the block so a skip needs no Postgres/Redis.
describe.skipIf(!hasFitz)("sign-pdf (requires PyMuPDF)", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  function runTool(placements: unknown) {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "in.pdf", contentType: "application/pdf", content: PDF },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
      { name: "placements", content: JSON.stringify(placements) },
    ]);
    return testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/sign-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
  }

  it("stamps a signature and returns a PDF", async () => {
    const res = await runTool([{ sig: 0, page: 0, x: 0.5, y: 0.5, w: 0.25, h: 0.05 }]);
    expect([200, 202]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeTruthy();
    if (res.statusCode === 200) {
      expect(body.downloadUrl).toContain("/api/v1/download/");
    }
  }, 60_000);

  it("rejects when no placements are provided", async () => {
    const res = await runTool([]);
    expect(res.statusCode).toBe(400);
  });
});
