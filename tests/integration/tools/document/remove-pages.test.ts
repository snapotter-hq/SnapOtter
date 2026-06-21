import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfMerge, qpdfPageCount } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);
const PDF_PATH = fixtures.document.pdf3;

let testApp: TestApp;
let adminToken: string;
let bigPdfDir: string;
let bigPdfBuffer: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Build an 81-page PDF by merging the 3-page fixture with itself 27 times
  // (qpdfMerge needs >= 2 inputs, so we merge iteratively: 3 -> 6 -> 12 -> 24 -> 48 -> 96,
  // then split would be complex. Simpler: merge 27 copies in pairs.)
  if (qpdfAvailable()) {
    bigPdfDir = mkdtempSync(join(tmpdir(), "remove-pages-big-"));
    // Strategy: merge pairs iteratively to build up
    // 3 -> 6 -> 12 -> 24 -> 48 -> 96 pages, then we trim isn't needed.
    // Actually, simplest: chain merges. 3+3=6, 6+6=12, 12+12=24, 24+24=48, 48+48=96, then
    // we just use the 48-page + a 3-page = 51... too complex.
    // Simplest correct: merge PDF_PATH with itself 5 times: 3->6->12->24->48->96
    // Then we have a 96-page PDF, which is > 80. We can also just use 81 = 3*27.
    // Let's do iterative doubling to get to 96 pages (close enough, > 80).
    let current = PDF_PATH;
    const intermediates: string[] = [];
    // 3 -> 6 -> 12 -> 24 -> 48 -> 96
    for (let step = 0; step < 5; step++) {
      const next = join(bigPdfDir, `big-step${step}.pdf`);
      await qpdfMerge([current, current], next);
      intermediates.push(next);
      current = next;
    }
    // current is now 96 pages
    bigPdfBuffer = readFileSync(current);
  }
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
  if (bigPdfDir) {
    rmSync(bigPdfDir, { recursive: true, force: true });
  }
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/remove-pages",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("remove-pages (requires qpdf)", () => {
  it("removes page 2 from a 3-page pdf, leaving 2 pages", async () => {
    const res = await runTool({ pages: "2" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "remove-pages-test-"));
    try {
      const outPath = join(dir, "removed.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects removing every page (1-z) with 422", async () => {
    const res = await runTool({ pages: "1-z" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error || body.message).toMatch(/every page/i);
  }, 60_000);

  it("rejects out-of-range page with 422", async () => {
    const res = await runTool({ pages: "9" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error || body.message).toMatch(/out of range/i);
  }, 60_000);

  it("removes page 1 from a 96-page pdf (large keepSpec path)", async () => {
    // The keep-spec for 95 pages as a raw comma list would be ~280 chars,
    // exceeding the 200-char assertValidRange cap. compressPageRuns compresses
    // it to "2-96" and qpdfPagesSpecUnchecked handles the residual case.
    const { body: reqBody, contentType } = createMultipartPayload([
      { name: "file", filename: "big.pdf", contentType: "application/pdf", content: bigPdfBuffer },
      { name: "settings", content: JSON.stringify({ pages: "1" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/remove-pages",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body: reqBody,
    });
    expect(res.statusCode).toBe(200);

    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "remove-pages-big-verify-"));
    try {
      const outPath = join(dir, "removed.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(95);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
