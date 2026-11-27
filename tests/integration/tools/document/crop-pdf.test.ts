import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(settings: Record<string, unknown>, pdf: Buffer = PDF) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: pdf },
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

  // The fixture is 419.53 x 595.28 pt, so any margin of 209.765 pt or more
  // leaves no page area; pdfcpu would write an inverted CropBox (#4421).
  it("rejects a margin larger than half the page with 400", async () => {
    const res = await runTool({ margin: 250 });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_SETTINGS");
    expect(JSON.stringify(body)).toContain("Crop margin is too large for this PDF");
  }, 60_000);

  it("rejects a margin at the half-page boundary with 400", async () => {
    const res = await runTool({ margin: 210 });
    expect(res.statusCode).toBe(400);
  }, 60_000);

  it("crops with the largest margin that still leaves an area", async () => {
    const res = await runTool({ margin: 209 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    const output = pageBoxes(Buffer.from(dl.rawPayload));
    expect(output.crop.length).toBeGreaterThan(0);
    for (const b of output.crop) {
      // A correct CropBox has its lower-left corner below and left of its upper-right.
      expect(b[2]).toBeGreaterThan(b[0]);
      expect(b[3]).toBeGreaterThan(b[1]);
    }
  }, 60_000);

  async function croppedBoxes(settings: Record<string, unknown>, pdf?: Buffer) {
    const res = await runTool(settings, pdf);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    return pageBoxes(Buffer.from(dl.rawPayload));
  }

  // The fixture's pages are 419.53 x 595.28 pt with the MediaBox at the origin,
  // so a region y points from the top has its upper edge at 595.28 - y (#4988).
  it("crops every page to a region measured from the top-left corner", async () => {
    const output = await croppedBoxes({ mode: "region", x: 10, y: 20, width: 200, height: 300 });
    expect(output.crop.length).toBeGreaterThan(0);
    for (const [x0, y0, x1, y1] of output.crop) {
      expect(x0).toBeCloseTo(10, 1);
      expect(x1).toBeCloseTo(210, 1);
      expect(y1).toBeCloseTo(575.28, 1);
      expect(y0).toBeCloseTo(275.28, 1);
    }
  }, 60_000);

  it("crops each side by its own margin", async () => {
    const output = await croppedBoxes({ mode: "sides", top: 10, right: 20, bottom: 30, left: 40 });
    expect(output.crop.length).toBeGreaterThan(0);
    for (const [x0, y0, x1, y1] of output.crop) {
      expect(x0).toBeCloseTo(40, 1);
      expect(y0).toBeCloseTo(30, 1);
      expect(x1).toBeCloseTo(399.53, 1);
      expect(y1).toBeCloseTo(585.28, 1);
    }
  }, 60_000);

  // Page 1 displays rotated 90 degrees, so the region is measured on the
  // 595.28 x 419.53 page as shown: its top-left is the unrotated bottom-left
  // corner and the box swaps width and height. The other pages are untouched (#5134).
  it("measures a region on a rotated page as displayed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crop-pdf-rot-"));
    try {
      const inPath = join(dir, "in.pdf");
      const rotatedPath = join(dir, "rotated.pdf");
      writeFileSync(inPath, PDF);
      execFileSync("qpdf", ["--rotate=+90:1", inPath, rotatedPath]);
      const rotated = readFileSync(rotatedPath);
      const output = await croppedBoxes(
        { mode: "region", x: 10, y: 20, width: 200, height: 300 },
        rotated,
      );
      expect(output.crop.length).toBe(3);
      const boxes = output.crop.map((b) => b.map((n) => Math.round(n * 100) / 100));
      expect(boxes).toContainEqual([20, 10, 320, 210]);
      expect(boxes.filter((b) => b[0] === 10 && b[2] === 210)).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects a region that runs off the page with 400", async () => {
    const res = await runTool({ mode: "region", x: 300, y: 0, width: 288, height: 432 });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_SETTINGS");
    expect(JSON.stringify(body)).toContain("Crop region doesn't fit on every page");
  }, 60_000);

  it("rejects side margins that leave no width with 400", async () => {
    const res = await runTool({ mode: "sides", left: 210, right: 210 });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_SETTINGS");
    expect(JSON.stringify(body)).toContain("Crop margins are too large for this PDF");
  }, 60_000);
});

describe("crop-pdf validation (ungated)", () => {
  it("rejects margin 9999 with 400", async () => {
    const res = await runTool({ margin: 9999 });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects an unknown mode and a zero-size region with 400", async () => {
    expect((await runTool({ mode: "box" })).statusCode).toBe(400);
    expect((await runTool({ mode: "region", width: 0 })).statusCode).toBe(400);
  }, 30_000);
});
