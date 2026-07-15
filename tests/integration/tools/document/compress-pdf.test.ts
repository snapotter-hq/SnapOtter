import { gsAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3); // text (test-3page.pdf)
const SCAN = readFixture(fixtures.document.pdfScanned); // image-heavy ~1MB scan

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
  function post(pdf: Buffer, filename: string, settings: Record<string, unknown>) {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename, contentType: "application/pdf", content: pdf },
      { name: "settings", content: JSON.stringify(settings) },
    ]);
    return testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/compress-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
  }

  // compress-pdf has executionHint "long": 202 + poll the durable job row. The
  // completion payload (including targetMet) lands in jobs.progress.result.
  async function runToCompletion(
    pdf: Buffer,
    filename: string,
    settings: Record<string, unknown>,
  ): Promise<{ size: number; result: Record<string, unknown> }> {
    const res = await post(pdf, filename, settings);
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown; progress: unknown } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("completed");
    const completed = row as { status: string; outputRefs: string[]; progress: unknown };
    const result = (completed.progress as { result?: Record<string, unknown> }).result ?? {};
    const outName = completed.outputRefs[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    return { size: dl.rawPayload.length, result };
  }

  it("quality mode: higher quality yields larger-or-equal output", async () => {
    const lo = await runToCompletion(SCAN, "ocr-scanned.pdf", { mode: "quality", quality: 30 });
    const hi = await runToCompletion(SCAN, "ocr-scanned.pdf", { mode: "quality", quality: 90 });
    expect(hi.size).toBeGreaterThanOrEqual(lo.size);
  }, 120_000);

  it("target-size: image PDF lands within [0.80x, 1.0x] of target", async () => {
    const targetKb = 300;
    const { size, result } = await runToCompletion(SCAN, "ocr-scanned.pdf", {
      mode: "targetSize",
      targetSizeKb: targetKb,
    });
    expect(size).toBeLessThanOrEqual(targetKb * 1024);
    expect(size).toBeGreaterThanOrEqual(targetKb * 1024 * 0.8);
    expect(result.targetMet).toBe(true);
  }, 120_000);

  it("target-size: text PDF with tiny target reports targetMet=false and never enlarges", async () => {
    const { size, result } = await runToCompletion(PDF, "test-3page.pdf", {
      mode: "targetSize",
      targetSizeKb: 1,
    });
    expect(result.targetMet).toBe(false);
    expect(size).toBeLessThanOrEqual(PDF.length);
  }, 120_000);
});
