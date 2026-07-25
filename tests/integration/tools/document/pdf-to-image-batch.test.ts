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
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);
const PDF_ENCRYPTED = readFixture(fixtures.document.encrypted);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
/** Session for a role that deliberately lacks tools:use. */
let noToolsToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  await app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: "nopdftools",
      description: "Everything except running tools",
      permissions: ["files:own"],
    },
  });
  noToolsToken = (await createUserAndLogin(app, "nopdfuser", "nopdftools")).token;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** POST the given files to a tool's /batch endpoint with `dpi: 72` settings. */
function postBatch(
  toolId: string,
  files: Array<{ filename: string; content: Buffer }>,
  settings: Record<string, unknown> = { dpi: 72 },
  opts: { token?: string | null; clientJobId?: string } = {},
) {
  const { body, contentType } = createMultipartPayload([
    ...files.map((f) => ({
      name: "file",
      filename: f.filename,
      contentType: "application/pdf",
      content: f.content,
    })),
    { name: "settings", content: JSON.stringify(settings) },
    ...(opts.clientJobId ? [{ name: "clientJobId", content: opts.clientJobId }] : []),
  ]);
  const token = opts.token === undefined ? adminToken : opts.token;
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/pdf/${toolId}/batch`,
    body,
    headers: {
      "content-type": contentType,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Parse the index -> output filename map the web client uses to fan results out. */
function fileResults(res: { headers: Record<string, unknown> }): Record<string, string> {
  return JSON.parse(decodeURIComponent(String(res.headers["x-file-results"] ?? "%7B%7D")));
}

describe("POST /api/v1/tools/pdf/:toolId/batch (issue #632)", () => {
  // pdf-to-image is in the list because it shares registerPdfToImageRoute, not
  // because the web client batches it: the base tool drives its own
  // usePdfToImageStore and only ever posts one file. Its /batch is
  // API-consumer surface that comes along with the presets' fix.
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

  it("keeps index alignment when an upload is empty", async () => {
    // The client maps results back onto its own file list by index. Dropping a
    // zero-byte part would shift every later index and label a converted file
    // with the wrong source name.
    const res = await postBatch("pdf-to-jpg", [
      { filename: "empty.pdf", content: Buffer.alloc(0) },
      { filename: "good.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({ "1": "good-pages.zip" });
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
    expect(data.errors[0].error).toMatch(/Invalid or corrupt PDF/i);
  });

  it("rejects a password-protected PDF without failing its siblings", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "locked.pdf", content: PDF_ENCRYPTED },
      { filename: "open.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({ "1": "open-pages.zip" });
  });

  it("reports the locked-PDF reason rather than a generic failure", async () => {
    const res = await postBatch("pdf-to-jpg", [
      { filename: "locked.pdf", content: PDF_ENCRYPTED },
      { filename: "alsolocked.pdf", content: PDF_ENCRYPTED },
    ]);

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).errors[0].error).toMatch(/password/i);
  });

  it("echoes the client job id so the progress stream can be matched up", async () => {
    const res = await postBatch(
      "pdf-to-jpg",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 72 },
      { clientJobId: "batch-632-client-job" },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-job-id"]).toBe("batch-632-client-job");
  });

  it("cleans up the intermediate page objects it only needed to build the ZIP", async () => {
    const clientJobId = "batch-632-cleanup";
    const res = await postBatch(
      "pdf-to-jpg",
      [{ filename: "a.pdf", content: PDF_3PAGE }],
      { dpi: 72 },
      { clientJobId },
    );
    expect(res.statusCode).toBe(200);

    // Only the streamed outer ZIP is ever read, so nothing should be left on
    // the volume waiting for the 72h storage sweep. Cleanup runs once the
    // response is on the wire, so poll rather than assume it already landed.
    const { objectExists } = await import("../../../../apps/api/src/lib/object-storage.js");
    const gone = async () =>
      !(await objectExists(`outputs/${clientJobId}-f0/page-1.jpg`)) &&
      !(await objectExists(`outputs/${clientJobId}-f0/a-pages.zip`));
    for (let i = 0; i < 100 && !(await gone()); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await gone()).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await postBatch(
      "pdf-to-jpg",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 72 },
      { token: null },
    );

    expect(res.statusCode).toBe(401);
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

  it("refuses a PDF with no pages instead of returning an empty ZIP", async () => {
    // mupdf repairs and opens a /Count 0 document, so the page loop produces
    // nothing and the old shape reported "converted" with a 22-byte archive.
    const emptyPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n" +
        "trailer<</Root 1 0 R>>\n%%EOF\n",
    );
    const res = await postBatch("pdf-to-jpg", [
      { filename: "nopages.pdf", content: emptyPdf },
      { filename: "good.pdf", content: PDF_2PAGE },
    ]);

    expect(res.statusCode).toBe(200);
    expect(fileResults(res)).toEqual({ "1": "good-pages.zip" });
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
      expect(JSON.parse(res.body).error).toMatch(/Failed to parse multipart request/i);
    } finally {
      env.MAX_BATCH_SIZE = original;
    }
  });
});

/**
 * The literal /batch path shadows the generic `:section/:toolId/batch` route,
 * which gates on requireToolAccess. Without the same gate here, adding the
 * route would have turned a 403 into a converted ZIP for roles that cannot run
 * tools. The sibling endpoints on this route are held to the same rule so a
 * blocked user cannot simply convert one file at a time instead.
 */
describe("pdf-to-image endpoints enforce tool access", () => {
  it("returns 403 on /batch for a role without tools:use", async () => {
    const res = await postBatch(
      "pdf-to-jpg",
      [
        { filename: "a.pdf", content: PDF_3PAGE },
        { filename: "b.pdf", content: PDF_2PAGE },
      ],
      { dpi: 72 },
      { token: noToolsToken },
    );

    expect(res.statusCode).toBe(403);
  });

  it.each(["", "/info", "/preview"])(
    "returns 403 on %s for a role without tools:use",
    async (suffix) => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "a.pdf",
          contentType: "application/pdf",
          content: PDF_3PAGE,
        },
        { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tools/pdf/pdf-to-jpg${suffix}`,
        body,
        headers: { "content-type": contentType, authorization: `Bearer ${noToolsToken}` },
      });

      expect(res.statusCode).toBe(403);
    },
  );

  it("still lets an admin through every endpoint", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF_3PAGE },
      { name: "settings", content: JSON.stringify({ dpi: 72, pages: "1" }) },
    ]);
    for (const suffix of ["", "/info", "/preview"]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tools/pdf/pdf-to-jpg${suffix}`,
        body,
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode, `${suffix || "/"} -> ${res.body.slice(0, 200)}`).toBe(200);
    }
  });
});
