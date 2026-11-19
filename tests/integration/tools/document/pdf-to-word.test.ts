// pdf-to-word integration suite.
// Requires pdf2docx (Python). Skips locally (pdf2docx absent on dev Macs);
// the Task 13 Docker compose smoke is the real proof. Uses the 202+poll
// pattern because pdf-to-word has executionHint "long". The scanned-PDF
// refusal only needs PyMuPDF, since the text probe runs before pdf2docx.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { hasFitz, pythonBin, pythonWith } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);
const COLORED_BLOCK_PDF = readFixture(fixtures.document.coloredBlock);
const hasPdf2docx = pythonWith("pdf2docx");

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(pdf: Buffer, filename: string, settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/pdf", content: pdf },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-word",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** Poll the durable job row until it settles. The long hint skips the sync window. */
async function settledJobRow(jobId: string) {
  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown; error: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!row) throw new Error("job row not found after polling");
  return row;
}

/** A one-page PDF whose only content is a rendered image, so it has no text
 *  layer: the shape of a scanned document. */
function makeImageOnlyPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-word-scan-"));
  const out = join(dir, "scanned.pdf");
  const script = [
    "import sys, fitz",
    "d = fitz.open(); p = d.new_page()",
    "tmp = fitz.open(); tp = tmp.new_page(); tp.insert_text((50, 50), 'SCANNED PAGE')",
    "pix = tp.get_pixmap(dpi=100); tmp.close()",
    "p.insert_image(p.rect, pixmap=pix)",
    "d.save(sys.argv[-1]); d.close()",
  ].join("\n");
  const res = spawnSync(pythonBin as string, ["-c", script, out], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`could not build image-only PDF: ${res.stderr}`);
  return readFileSync(out);
}

async function downloadCompletedDocx(
  pdf: Buffer,
  filename: string,
  settings: Record<string, unknown> = {},
): Promise<Buffer> {
  const res = await runTool(pdf, filename, settings);
  expect(res.statusCode).toBe(202);
  const { jobId } = JSON.parse(res.body);
  const row = await settledJobRow(jobId);
  expect(row.status).toBe("completed");
  const outName = (row.outputRefs as string[])[0].split("/").pop() as string;
  const download = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
  });
  expect(download.statusCode).toBe(200);
  return download.rawPayload;
}

function ancestorByTagName(element: Element, tagName: string): Element | null {
  let current: Element | null = element;
  while (current) {
    if (current.tagName === tagName) return current;
    current = current.parentElement;
  }
  return null;
}

describe.skipIf(!hasFitz)("pdf-to-word on a PDF with no text layer (requires PyMuPDF)", () => {
  // pdf2docx used to copy each scanned page into the .docx as a picture and
  // report success. The route now refuses with pdf-to-text's code so the web
  // app can offer OCR (#4838).
  it("fails the job with NO_TEXT_LAYER instead of returning page images", async () => {
    const res = await runTool(makeImageOnlyPdf(), "scanned.pdf");
    expect(res.statusCode).toBe(202);
    const row = await settledJobRow(JSON.parse(res.body).jobId);
    expect(row.status).toBe("failed");
    const error = row.error as { message?: string; code?: string } | null;
    expect(error?.code).toBe("NO_TEXT_LAYER");
    expect(error?.message).toMatch(/text layer/i);
    expect(error?.message).toMatch(/OCR/);
  }, 90_000);

  it("flags a batch where every file is scanned so the UI can offer OCR", async () => {
    const scan = makeImageOnlyPdf();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.pdf", contentType: "application/pdf", content: scan },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: scan },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-word/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).code).toBe("NO_TEXT_LAYER");
  }, 90_000);
});

describe.skipIf(!hasPdf2docx)("pdf-to-word (requires pdf2docx)", () => {
  it("returns 202 (long hint) and the job completes with a docx", async () => {
    const docx = await downloadCompletedDocx(PDF, "test-3page.pdf");
    // DOCX files are ZIP archives; PK magic bytes.
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);

  it("preserves a multi-line colored block as one table with flexible row height", async () => {
    const docx = await downloadCompletedDocx(COLORED_BLOCK_PDF, "colored-block.pdf");
    const zip = new AdmZip(docx);
    const documentEntry = zip.getEntry("word/document.xml");
    if (!documentEntry) throw new Error("DOCX is missing word/document.xml");

    const document = new JSDOM(documentEntry.getData().toString("utf8"), {
      contentType: "text/xml",
      // Keep failed DOM equality diagnostics away from opaque-origin storage.
      url: "http://localhost/",
    }).window.document;
    const textNodes = Array.from(document.getElementsByTagName("w:t"));
    const lineOneText = textNodes.find((node) => node.textContent?.trim() === "BLOCK LINE ONE");
    const lineTwoText = textNodes.find((node) => node.textContent?.trim() === "BLOCK LINE TWO");
    expect(lineOneText).toBeDefined();
    expect(lineTwoText).toBeDefined();
    if (!lineOneText || !lineTwoText) throw new Error("DOCX is missing colored-block text");

    const lineOneCell = ancestorByTagName(lineOneText, "w:tc");
    const lineTwoCell = ancestorByTagName(lineTwoText, "w:tc");
    const lineOneRow = ancestorByTagName(lineOneText, "w:tr");
    const lineTwoRow = ancestorByTagName(lineTwoText, "w:tr");
    const lineOneTable = ancestorByTagName(lineOneText, "w:tbl");
    const lineTwoTable = ancestorByTagName(lineTwoText, "w:tbl");
    expect(lineOneCell).not.toBeNull();
    expect(lineTwoCell).not.toBeNull();
    expect(lineOneRow).not.toBeNull();
    expect(lineTwoRow).not.toBeNull();
    expect(lineOneTable).not.toBeNull();
    expect(lineTwoTable).not.toBeNull();

    expect(lineOneTable).toBe(lineTwoTable);
    expect(lineOneTable?.getElementsByTagName("w:tblpPr")).toHaveLength(0);
    const gridColumns = Array.from(lineOneTable?.getElementsByTagName("w:gridCol") ?? []);
    expect(gridColumns).toHaveLength(1);
    const gridColumn = gridColumns[0];
    expect(Number(gridColumn?.getAttribute("w:w"))).toBeCloseTo(4_800, -1);

    const targetCells = new Set(
      [lineOneCell, lineTwoCell].filter((cell): cell is Element => cell !== null),
    );
    for (const cell of targetCells) {
      const shading = cell.getElementsByTagName("w:shd")[0];
      const width = cell.getElementsByTagName("w:tcW")[0];
      expect(shading?.getAttribute("w:fill")?.toLowerCase()).toBe("1e84b7");
      expect(Number(width?.getAttribute("w:w"))).toBeCloseTo(4_800, -1);
    }

    const targetRows = new Set(
      [lineOneRow, lineTwoRow].filter((row): row is Element => row !== null),
    );
    let totalRowHeight = 0;
    for (const row of targetRows) {
      const height = row.getElementsByTagName("w:trHeight")[0];
      const heightRule = height?.getAttribute("w:hRule");
      expect(heightRule).not.toBe("exact");
      if (heightRule) expect(heightRule).toBe("atLeast");
      totalRowHeight += Number(height?.getAttribute("w:val"));
    }
    expect(Math.abs(totalRowHeight - 1_300)).toBeLessThanOrEqual(40);
  }, 90_000);
});
