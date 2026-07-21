import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { hasFitz, pythonBin } from "../../../helpers/python-gate.js";
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

async function runTool(content: Buffer = PDF, filename = "test-3page.pdf") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/pdf", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-text",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** Build a one-page PDF whose only content is a rendered image, so it has no
 *  text layer (the shape of a scanned document). Uses the same PyMuPDF that
 *  gates this suite. */
function makeImageOnlyPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-scan-"));
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

describe.skipIf(!hasFitz)("pdf-to-text (requires PyMuPDF)", () => {
  it("extracts text and serves the .txt as UTF-8", async () => {
    const res = await runTool();
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // The 3-page fixture has a text layer, so the output has content.
    expect(dl.rawPayload.length).toBeGreaterThan(0);
    // Charset must be explicit so non-Latin scripts don't mojibake inline (#589).
    expect(dl.headers["content-type"]).toContain("charset=utf-8");
  }, 60_000);

  it("tells the user to run OCR when the PDF has no text layer", async () => {
    const res = await runTool(makeImageOnlyPdf(), "scanned.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);
});
