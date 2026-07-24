import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/** Build a one-page PDF containing the given text lines, using the same PyMuPDF
 *  that gates this suite. Only called from fitz-gated tests, so pythonBin is set. */
function makeTextPdf(lines: string[]): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-redact-in-"));
  const out = join(dir, "doc.pdf");
  const script = [
    "import sys, fitz",
    "d = fitz.open(); p = d.new_page()",
    "y = 72",
    "for line in sys.argv[1:-1]:",
    "    p.insert_text((72, y), line); y += 24",
    "d.save(sys.argv[-1]); d.close()",
  ].join("\n");
  const res = spawnSync(pythonBin as string, ["-c", script, ...lines, out], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`could not build text PDF: ${res.stderr}`);
  return readFileSync(out);
}

/** Extract the concatenated text layer of a PDF buffer via PyMuPDF, so the test
 *  can prove what a redacted document does or does not still contain. */
function extractText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "pdf-redact-out-"));
  const inp = join(dir, "in.pdf");
  writeFileSync(inp, pdf);
  const script = [
    "import sys, fitz",
    "d = fitz.open(sys.argv[-1])",
    "sys.stdout.write(''.join(page.get_text() for page in d))",
    "d.close()",
  ].join("\n");
  const res = spawnSync(pythonBin as string, ["-c", script, inp], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`could not extract text: ${res.stderr}`);
  return res.stdout;
}

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(
  settings: Record<string, unknown>,
  content: Buffer = PDF,
  filename = "test-3page.pdf",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/pdf", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/redact-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!hasFitz)("redact-pdf (requires PyMuPDF)", () => {
  it("redacts terms and reports found count", async () => {
    const res = await runTool({ terms: ["Page"], caseSensitive: false });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    // resultPayload is spread flat into the sync envelope (tool-factory.ts), so
    // the count lands at envelope.found, not envelope.resultPayload.found.
    expect(typeof envelope.found).toBe("number");
    expect(envelope.found).toBeGreaterThanOrEqual(0);

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("removes redacted text from the content layer instead of only masking it", async () => {
    // Two distinct tokens with no shared substring: one to redact, one to keep.
    const SECRET = "CLASSIFIED7F3XSECRET";
    const KEEPER = "PUBLICHEADERLINE";
    const input = makeTextPdf([KEEPER, SECRET]);

    // Precondition: the input genuinely carries both tokens in its text layer.
    const before = extractText(input);
    expect(before).toContain(SECRET);
    expect(before).toContain(KEEPER);

    const res = await runTool({ terms: [SECRET], caseSensitive: false }, input, "secret.pdf");
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    // The term was actually located, not merely a no-op that reports success.
    // resultPayload spreads flat into the envelope, so the count is envelope.found.
    expect(envelope.found).toBeGreaterThanOrEqual(1);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");

    // The redacted token is gone from the extractable text (true content removal,
    // not a black box drawn over still-selectable text); untargeted text survives,
    // proving the redaction is scoped rather than wiping the whole page.
    const after = extractText(dl.rawPayload);
    expect(after).not.toContain(SECRET);
    expect(after).toContain(KEEPER);
  }, 60_000);
});

describe("redact-pdf validation (ungated)", () => {
  it("rejects empty terms array with 400", async () => {
    const res = await runTool({ terms: [] });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects terms with empty string with 400", async () => {
    const res = await runTool({ terms: [""] });
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
