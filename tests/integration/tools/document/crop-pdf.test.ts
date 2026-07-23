import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfcpuAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";

import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

// Read every page /MediaBox and /CropBox from a PDF buffer via qpdf --json.
// pdfcpu crop sets a shrunk /CropBox (the visible region) and leaves /MediaBox
// at the full page size, so the crop oracle compares output CropBox to input
// MediaBox.
function pageBoxes(pdfBytes: Buffer): { media: number[][]; crop: number[][] } {
  const dir = mkdtempSync(join(tmpdir(), "crop-pdf-box-"));
  try {
    const p = join(dir, "x.pdf");
    writeFileSync(p, pdfBytes);
    const json = execFileSync("qpdf", ["--json", p], { encoding: "utf8", maxBuffer: 1 << 24 });
    const media: number[][] = [];
    const crop: number[][] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "/MediaBox" && Array.isArray(v) && v.length === 4) {
            media.push(v.map(Number));
          } else if (k === "/CropBox" && Array.isArray(v) && v.length === 4) {
            crop.push(v.map(Number));
          } else {
            walk(v);
          }
        }
      }
    };
    walk(JSON.parse(json));
    return { media, crop };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/crop-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pdfcpuAvailable())("crop-pdf (requires pdfcpu)", () => {
  it("crops a PDF and produces a valid output", async () => {
    const res = await runTool({ margin: 20 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");

    // Semantic oracle: cropping with margin 20 must shrink each page's MediaBox.
    // A no-op passthrough would leave the box unchanged and still pass %PDF-.
    const input = pageBoxes(PDF);
    const output = pageBoxes(Buffer.from(dl.rawPayload));
    expect(input.media.length).toBeGreaterThan(0);
    // pdfcpu crop adds a shrunk /CropBox to every page.
    expect(output.crop.length).toBe(input.media.length);
    const inW = input.media[0][2] - input.media[0][0];
    const inH = input.media[0][3] - input.media[0][1];
    for (const b of output.crop) {
      expect(b[2] - b[0]).toBeLessThan(inW);
      expect(b[3] - b[1]).toBeLessThan(inH);
    }
  }, 60_000);
});

describe("crop-pdf validation (ungated)", () => {
  it("rejects margin 9999 with 400", async () => {
    const res = await runTool({ margin: 9999 });
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
