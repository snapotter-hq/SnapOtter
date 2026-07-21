import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../fixtures/index.js";
import { hasFitz } from "../helpers/python-gate.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const PDF = readFixture(fixtures.document.pdf3);
const SIG = readFixture(fixtures.image.base.png200);
const ENCRYPTED_PDF = readFixture(fixtures.document.encrypted);

// The stamping test invokes the docs profile's doc_sign script (PyMuPDF) and is
// gated on fitz so it skips where PyMuPDF is not installed (e.g. CI integration
// shards). The validation test returns 400 before any Python call, so it always
// runs (it needs only Postgres/Redis, which CI provides).
describe("sign-pdf", () => {
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

  function postFields(
    fields: Parameters<typeof createMultipartPayload>[0],
  ): ReturnType<typeof testApp.app.inject> {
    const { body, contentType } = createMultipartPayload(fields);
    return testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/sign-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
  }

  (hasFitz ? it : it.skip)(
    "stamps a signature and returns a PDF",
    async () => {
      const res = await runTool([{ sig: 0, page: 0, x: 0.5, y: 0.5, w: 0.25, h: 0.05 }]);
      expect([200, 202]).toContain(res.statusCode);
      const body = JSON.parse(res.body);
      expect(body.jobId).toBeTruthy();
      if (res.statusCode === 200) {
        expect(body.downloadUrl).toContain("/api/v1/download/");
      }
    },
    60_000,
  );

  it("rejects when no placements are provided", async () => {
    const res = await runTool([]);
    expect(res.statusCode).toBe(400);
  });

  it("rejects when the PDF file part is missing", async () => {
    const res = await postFields([
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
      },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "No PDF file provided" });
  });

  it("rejects when the placements field is missing", async () => {
    const res = await postFields([
      { name: "file", filename: "in.pdf", contentType: "application/pdf", content: PDF },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "No placements provided" });
  });

  it("rejects malformed placement JSON", async () => {
    const res = await postFields([
      { name: "file", filename: "in.pdf", contentType: "application/pdf", content: PDF },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
      { name: "placements", content: "[not-json" },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "Invalid placements" });
  });

  it("rejects placements that reference an omitted signature image", async () => {
    const res = await postFields([
      { name: "file", filename: "in.pdf", contentType: "application/pdf", content: PDF },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
      },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({
      error: "Missing signature image for placement (sig 0)",
    });
  });

  it("rejects an invalid PDF before enqueueing work", async () => {
    const res = await postFields([
      {
        name: "file",
        filename: "not-a-pdf.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
      },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "Invalid PDF" });
  });

  it("rejects a password-protected PDF before enqueueing work", async () => {
    // A signature can't be stamped onto an encrypted PDF without the password;
    // reject it up front (before any Python call) with guidance to unlock first.
    const res = await postFields([
      {
        name: "file",
        filename: "encrypted.pdf",
        contentType: "application/pdf",
        content: ENCRYPTED_PDF,
      },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
      },
    ]);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.details || body.error).toMatch(/password-protected|unlock/i);
  });

  it("rejects an invalid signature image before enqueueing work", async () => {
    const res = await postFields([
      { name: "file", filename: "in.pdf", contentType: "application/pdf", content: PDF },
      {
        name: "sig0",
        filename: "sig0.png",
        contentType: "image/png",
        content: Buffer.from("not an image"),
      },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
      },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/^Invalid signature image:/);
  });
});
