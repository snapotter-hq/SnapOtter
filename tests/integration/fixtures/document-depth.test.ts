/**
 * Tier-2 depth tests: real multipage PDF heroes through real document tool routes.
 *
 * Exercises split-pdf, merge-pdf, compress-pdf, and pdf-to-image with the typed
 * fixture registry, verifying page counts (qpdf), valid PDF headers, and image
 * output via Sharp. Each tool is gated on its required binary.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gsAvailable, qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PDF_MULTI = readFixture(fixtures.document.pdfMulti); // 6-page
const PDF_2 = readFixture(fixtures.document.pdf2); // 2-page

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

/** Download a result and return the raw payload. */
async function download(downloadUrl: string): Promise<Buffer> {
  const dl = await app.inject({
    method: "GET",
    url: downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

/** Write buffer to temp, count pages, clean up. */
async function countPages(buf: Buffer): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "doc-depth-"));
  try {
    const outPath = join(dir, "output.pdf");
    writeFileSync(outPath, buf);
    return await qpdfPageCount(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------
// Split PDF depth tests
// -----------------------------------------------------------------------
describe.skipIf(!qpdfAvailable())("Document depth: split-pdf multipage hero", () => {
  it("extracts pages 1-3 from 6-page PDF, output has 3 pages", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "multipage-6.pdf",
        contentType: "application/pdf",
        content: PDF_MULTI,
      },
      { name: "settings", content: JSON.stringify({ mode: "range", range: "1-3" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/split-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    // Verify PDF header
    expect(payload.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = await countPages(payload);
    expect(pages).toBe(3);
  }, 60_000);
});

// -----------------------------------------------------------------------
// Merge PDF depth tests
// -----------------------------------------------------------------------
describe.skipIf(!qpdfAvailable())("Document depth: merge-pdf real heroes", () => {
  it("merges 6-page + 2-page PDF into 8-page document", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "multipage-6.pdf",
        contentType: "application/pdf",
        content: PDF_MULTI,
      },
      {
        name: "file",
        filename: "alt-2page.pdf",
        contentType: "application/pdf",
        content: PDF_2,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/merge-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    expect(payload.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = await countPages(payload);
    expect(pages).toBe(8);
  }, 60_000);
});

// -----------------------------------------------------------------------
// Compress PDF depth tests
// -----------------------------------------------------------------------
describe.skipIf(!gsAvailable())("Document depth: compress-pdf multipage hero", () => {
  it("compresses 6-page PDF, output is a valid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "multipage-6.pdf",
        contentType: "application/pdf",
        content: PDF_MULTI,
      },
      {
        name: "settings",
        content: JSON.stringify({ mode: "quality", quality: 60 }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/compress-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    // compress-pdf has executionHint "long": 202 + poll the durable job row.
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const { db, schema } = await import("../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("completed");
    const completed = row as { status: string; outputRefs: string[] };
    const outName = completed.outputRefs[0].split("/").pop() as string;

    const payload = await download(`/api/v1/download/${jobId}/${encodeURIComponent(outName)}`);
    // Valid PDF header
    expect(payload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(payload.length).toBeGreaterThan(0);
  }, 120_000);
});

// -----------------------------------------------------------------------
// PDF to image depth tests
// -----------------------------------------------------------------------
describe("Document depth: pdf-to-image multipage hero", () => {
  it("converts page 1 of 6-page PDF to PNG, output is a valid image", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "multipage-6.pdf",
        contentType: "application/pdf",
        content: PDF_MULTI,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-image",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].downloadUrl).toBeDefined();
    expect(data.pageCount).toBe(6);
    expect(data.selectedPages).toEqual([1]);

    // Download the page image and verify it decodes via Sharp
    const imgPayload = await download(data.pages[0].downloadUrl);
    const meta = await sharp(imgPayload).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("reports correct page count for 6-page PDF via /info", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "multipage-6.pdf",
        contentType: "application/pdf",
        content: PDF_MULTI,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pageCount).toBe(6);
  });
});
