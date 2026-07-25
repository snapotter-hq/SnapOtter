/**
 * Batch conversion for the pdf-to-image base tool and its three presets
 * (pdf-to-jpg / pdf-to-png / pdf-to-tiff).
 *
 * Issue #632: the presets registered only a single-file route, so the web
 * client's 2+-file submission fell through to the generic
 * `/api/v1/tools/:section/:toolId/batch` route, whose registry lookup missed
 * and 404'd with `Tool "<id>" not found`.
 *
 * One PDF fans out to N page images, so the per-file output is a ZIP (the same
 * shape the single-file route already returns). A batch therefore nests: the
 * response ZIP holds one per-PDF ZIP per input, in upload order.
 */
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** POST the given files to a tool's /batch endpoint with `dpi: 72` settings. */
function postBatch(
  toolId: string,
  files: Array<{ filename: string; content: Buffer }>,
  settings: Record<string, unknown> = { dpi: 72 },
) {
  const { body, contentType } = createMultipartPayload([
    ...files.map((f) => ({
      name: "file",
      filename: f.filename,
      contentType: "application/pdf",
      content: f.content,
    })),
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/pdf/${toolId}/batch`,
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
  });
}

/** Parse the index -> output filename map the web client uses to fan results out. */
function fileResults(res: { headers: Record<string, unknown> }): Record<string, string> {
  return JSON.parse(decodeURIComponent(String(res.headers["x-file-results"] ?? "%7B%7D")));
}

describe("POST /api/v1/tools/pdf/:toolId/batch (issue #632)", () => {
  it.each(["pdf-to-jpg", "pdf-to-png", "pdf-to-tiff", "pdf-to-image"])(
    "%s converts 2 PDFs into one ZIP entry per input",
    async (toolId) => {
      const res = await postBatch(toolId, [
        { filename: "test-3page.pdf", content: PDF_3PAGE },
        { filename: "alt-2page.pdf", content: PDF_2PAGE },
      ]);

      expect(res.statusCode, res.body.slice(0, 500)).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");

      const entries = new AdmZip(res.rawPayload).getEntries();
      expect(entries.map((e) => e.entryName)).toEqual([
        "test-3page-pages.zip",
        "alt-2page-pages.zip",
      ]);
    },
  );

  it("maps every input index to its output name in X-File-Results", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "test-3page.pdf", content: PDF_3PAGE },
      { filename: "alt-2page.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({
      "0": "test-3page-pages.zip",
      "1": "alt-2page-pages.zip",
    });
  });

  it("nests each source PDF's pages in its own ZIP, in the preset's locked format", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "test-3page.pdf", content: PDF_3PAGE },
      { filename: "alt-2page.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    const outer = new AdmZip(res.rawPayload);

    const threePage = new AdmZip(outer.getEntry("test-3page-pages.zip")?.getData()).getEntries();
    expect(threePage.map((e) => e.entryName)).toEqual(["page-1.jpg", "page-2.jpg", "page-3.jpg"]);
    for (const entry of threePage) {
      expect(entry.header.size).toBeGreaterThan(0);
    }

    const twoPage = new AdmZip(outer.getEntry("alt-2page-pages.zip")?.getData()).getEntries();
    expect(twoPage.map((e) => e.entryName)).toEqual(["page-1.jpg", "page-2.jpg"]);
  });

  it("keeps the locked format even when the client asks for another one", async () => {
    const res = await postBatch(
      "pdf-to-png",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 72, format: "jpg" },
    );

    expect(res.statusCode).toBe(200);
    const outer = new AdmZip(res.rawPayload);
    const inner = new AdmZip(outer.getEntry("a-pages.zip")?.getData()).getEntries();
    expect(inner.every((e) => e.entryName.endsWith(".png"))).toBe(true);
  });

  it("honors a page range across every input", async () => {
    const res = await postBatch(
      "pdf-to-png",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 72, pages: "1" },
    );

    expect(res.statusCode).toBe(200);
    const outer = new AdmZip(res.rawPayload);
    for (const name of ["a-pages.zip", "b-pages.zip"]) {
      const inner = new AdmZip(outer.getEntry(name)?.getData()).getEntries();
      expect(inner.map((e) => e.entryName)).toEqual(["page-1.png"]);
    }
  });

  it("deduplicates outputs when two uploads share a filename", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "same.pdf", content: PDF_3PAGE },
      { filename: "same.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({
      "0": "same-pages.zip",
      "1": "same-pages_1.zip",
    });
  });

  it("skips an unreadable PDF and still returns the readable one", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "broken.pdf", content: Buffer.from("not a pdf at all") },
      { filename: "good.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    // Index 0 failed, so only index 1 maps to an output; the client marks the
    // rest failed rather than silently pairing the wrong result to the wrong file.
    expect(fileResults(res)).toEqual({ "1": "good-pages.zip" });
    const entries = new AdmZip(res.rawPayload).getEntries();
    expect(entries.map((e) => e.entryName)).toEqual(["good-pages.zip"]);
  });

  it("returns 422 with per-file reasons when every PDF fails", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "a.pdf", content: Buffer.from("nope") },
      { filename: "b.pdf", content: Buffer.from("also nope") },
    ]);

    expect(res.statusCode).toBe(422);
    const data = JSON.parse(res.body);
    expect(data.error).toMatch(/All files failed/i);
    expect(data.errors).toHaveLength(2);
    expect(data.errors[0].filename).toBe("a.pdf");
    expect(data.errors[0].error).toBeTruthy();
  });

  it("rejects a password-protected PDF without failing its siblings", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "locked.pdf", content: readFixture(fixtures.document.encrypted) },
      { filename: "open.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({ "1": "open-pages.zip" });
  });

  it("returns 400 when no files are provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
      body,
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/No PDF files/i);
  });

  it("returns 400 for invalid settings", async () => {
    const res = await postBatch(
      "pdf-to-jpg",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 5000 },
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Invalid settings/i);
  });

  it("rejects a batch larger than MAX_BATCH_SIZE instead of converting part of it", async () => {
    const { env } = await import("../../../../apps/api/src/config.js");
    const original = env.MAX_BATCH_SIZE;
    // multipartParts reads MAX_BATCH_SIZE per call, so busboy stops at the
    // limit and the iterator throws before the route's own guard is reached.
    // Either way the contract is the same: rejected outright, nothing converted.
    env.MAX_BATCH_SIZE = 1;
    try {
      const res = await postBatch("pdf-to-jpg", [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ]);
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).not.toContain("application/zip");
      expect(JSON.parse(res.body).error).toBeTruthy();
    } finally {
      env.MAX_BATCH_SIZE = original;
    }
  });
});
