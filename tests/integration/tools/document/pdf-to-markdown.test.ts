// pdf-to-markdown integration suite (#1096). Needs PyMuPDF, so it skips on CI
// shards and runs on the fleet. The tool has executionHint "long", so a single
// file returns 202 and the result is read off the durable job row.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasFitz, pythonBin } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

function multipart(files: Array<{ filename: string; content: Buffer }>) {
  return createMultipartPayload([
    ...files.map((f) => ({
      name: "file",
      filename: f.filename,
      contentType: "application/pdf",
      content: f.content,
    })),
    { name: "settings", content: JSON.stringify({}) },
  ]);
}

async function runTool(content: Buffer, filename: string) {
  const { body, contentType } = multipart([{ filename, content }]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-markdown",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** Wait for the durable job row to reach a terminal status. */
async function settledJobRow(jobId: string) {
  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  return vi.waitFor(
    async () => {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (!row || !["completed", "failed", "canceled"].includes(row.status)) {
        throw new Error(`job ${jobId} not settled: ${row?.status ?? "missing"}`);
      }
      return row;
    },
    { timeout: 60_000, interval: 250 },
  );
}

/** Build a PDF with PyMuPDF from a script body that draws onto `page`. */
function makePdf(draw: string[]): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-md-"));
  try {
    const out = join(dir, "in.pdf");
    const script = [
      "import sys, fitz",
      "doc = fitz.open(); page = doc.new_page()",
      ...draw,
      "doc.save(sys.argv[-1]); doc.close()",
    ].join("\n");
    const res = spawnSync(pythonBin as string, ["-c", script, out], { encoding: "utf8" });
    if (res.status !== 0) throw new Error(`could not build PDF: ${res.stderr}`);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const STRUCTURED = [
  "page.insert_text((72, 72), 'Handbook', fontsize=24, fontname='hebo')",
  "page.insert_text((72, 110), 'Welcome to the team handbook, set in body text.', fontsize=11)",
  "page.insert_text((72, 140), 'Benefits', fontsize=16, fontname='hebo')",
  "page.insert_text((72, 170), '- Health cover', fontsize=11)",
  "page.insert_text((72, 190), '- Paid leave', fontsize=11)",
];

/** The shape of a scanned document: one page that is only a rendered image. */
const SCANNED = [
  "tmp = fitz.open(); tp = tmp.new_page(); tp.insert_text((50, 50), 'SCANNED PAGE')",
  "pix = tp.get_pixmap(dpi=100); tmp.close()",
  "page.insert_image(page.rect, pixmap=pix)",
];

describe.skipIf(!hasFitz)("pdf-to-markdown (requires PyMuPDF)", () => {
  it("converts a PDF to Markdown with headings and a list, served as UTF-8 text/markdown", async () => {
    const res = await runTool(makePdf(STRUCTURED), "handbook.pdf");
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await settledJobRow(jobId);
    expect(row.status).toBe("completed");

    const outName = (row.outputRefs as string[])[0].split("/").pop() as string;
    expect(outName).toBe("handbook.md");
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toContain("text/markdown");
    expect(dl.headers["content-type"]).toContain("charset=utf-8");
    const md = dl.rawPayload.toString("utf8");
    expect(md).toContain("# Handbook\n");
    expect(md).toContain("## Benefits\n");
    expect(md).toContain("- Health cover\n- Paid leave");
  }, 90_000);

  it("fails the job with NO_TEXT_LAYER instead of returning an empty file", async () => {
    const res = await runTool(makePdf(SCANNED), "scanned.pdf");
    expect(res.statusCode).toBe(202);
    const row = await settledJobRow(JSON.parse(res.body).jobId);
    expect(row.status).toBe("failed");
    const error = row.error as { message?: string; code?: string } | null;
    expect(error?.code).toBe("NO_TEXT_LAYER");
    expect(error?.message).toMatch(/text layer/i);
    expect(error?.message).toMatch(/OCR/);
  }, 90_000);

  it("flags a batch where every file is scanned so the UI can offer OCR", async () => {
    const scan = makePdf(SCANNED);
    const { body, contentType } = multipart([
      { filename: "a.pdf", content: scan },
      { filename: "b.pdf", content: scan },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-markdown/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).code).toBe("NO_TEXT_LAYER");
  }, 90_000);
});
