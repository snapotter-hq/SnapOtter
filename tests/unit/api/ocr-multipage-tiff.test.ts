import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_PDF_OCR_PAGES, type OcrResult } from "@snapotter/ai";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/**
 * Issue #4364: OCR on a multi-page TIFF returned page 1's text with no
 * warning, because sharp decodes page 1 of a TIFF unless asked for another.
 *
 * extractText is mocked to report which page it was handed: every page of
 * the test TIFFs is a solid grey whose level encodes its index, so a route
 * that sends page 1 every time fails here just as one that stops after it.
 */

const mocks = vi.hoisted(() => ({ extractText: vi.fn() }));

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  extractText: mocks.extractText,
}));

await import("../../../apps/api/src/routes/tools/ocr.js");

const LEVEL_STEP = 4;

function result(text: string, extra: Partial<OcrResult> = {}): OcrResult {
  return {
    text,
    engine: "tesseract",
    requestedQuality: "fast",
    actualQuality: "fast",
    device: "cpu",
    degraded: false,
    warnings: [],
    provider: "native",
    ...extra,
  };
}

async function pageIndexOf(buffer: Buffer): Promise<number> {
  const { channels } = await sharp(buffer).stats();
  return Math.round(channels[0].mean / LEVEL_STEP);
}

/** A multi-page TIFF whose page i is a solid grey of level i * LEVEL_STEP. */
async function tiffOfPages(pages: number, size = 8): Promise<Buffer> {
  const frames = await Promise.all(
    Array.from({ length: pages }, (_, i) => {
      const level = i * LEVEL_STEP;
      return sharp({
        create: {
          width: size,
          height: size,
          channels: 3,
          background: { r: level, g: level, b: level },
        },
      })
        .png()
        .toBuffer();
    }),
  );
  return await sharp(frames, { join: { across: 1, animated: true } })
    .tiff()
    .toBuffer();
}

let scratchDir: string;

async function runOcr(buffer: Buffer, filename: string) {
  const config = getToolConfig("ocr");
  if (!config) throw new Error("ocr must be registered");
  const report = vi.fn();
  const output = await config.process(
    buffer,
    config.settingsSchema.parse({ quality: "fast", language: "en" }),
    filename,
    { scratchDir, signal: new AbortController().signal, report },
  );
  return { output, report, payload: output.resultPayload as OcrResult };
}

beforeAll(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "ocr-multipage-tiff-"));
});

afterAll(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.extractText.mockReset();
  mocks.extractText.mockImplementation(async (buffer: Buffer) =>
    result(`text of page ${(await pageIndexOf(buffer)) + 1}\n`),
  );
});

describe("OCR on a multi-page TIFF (#4364)", () => {
  it("reads every page of the 10-page fixture and frames each one", async () => {
    const tiff = readFixture(fixtures.image.multipageTiff);
    mocks.extractText.mockImplementation(async () => result("page text"));

    const { output, payload } = await runOcr(tiff, "scan.tiff");

    expect(mocks.extractText).toHaveBeenCalledTimes(10);
    expect(payload.text.match(/^--- Page \d+ ---$/gm)).toHaveLength(10);
    expect(payload.text).toContain("--- Page 10 ---");
    expect(payload.warnings).toEqual([]);
    expect(output.buffer.toString("utf8")).toBe(payload.text);
    expect(output.filename).toBe("scan_ocr.txt");
  });

  it("hands extractText each page in order, not page 1 again", async () => {
    const { payload } = await runOcr(await tiffOfPages(3), "three.tiff");

    expect(payload.text).toBe(
      [
        "--- Page 1 ---\n\ntext of page 1",
        "--- Page 2 ---\n\ntext of page 2",
        "--- Page 3 ---\n\ntext of page 3",
      ].join("\n\n"),
    );
  });

  it("reads pages of different sizes", async () => {
    const tiff = readFixture(fixtures.image.edge.multipageMixedSizesTiff);
    const pages = (await sharp(tiff).metadata()).pages ?? 1;
    expect(pages).toBeGreaterThan(1);
    mocks.extractText.mockImplementation(async () => result("page text"));

    const { payload } = await runOcr(tiff, "mixed.tiff");

    expect(mocks.extractText).toHaveBeenCalledTimes(pages);
    expect(payload.text).toContain(`--- Page ${pages} ---`);
  });

  it("warns when the page budget cuts the TIFF short", async () => {
    const pages = MAX_PDF_OCR_PAGES + 2;

    const { payload } = await runOcr(await tiffOfPages(pages, 2), "long.tiff");

    expect(mocks.extractText).toHaveBeenCalledTimes(MAX_PDF_OCR_PAGES);
    expect(payload.text).toContain(`--- Page ${MAX_PDF_OCR_PAGES} ---`);
    expect(payload.text).not.toContain(`--- Page ${MAX_PDF_OCR_PAGES + 1} ---`);
    expect(payload.warnings).toEqual([
      `Only the first ${MAX_PDF_OCR_PAGES} of ${pages} pages were read.`,
    ]);
  });

  it("merges per-page warnings and degraded flags", async () => {
    mocks.extractText
      .mockResolvedValueOnce(result("a", { warnings: ["low contrast"] }))
      .mockResolvedValueOnce(result("b", { warnings: ["low contrast"], degraded: true }));

    const { payload } = await runOcr(await tiffOfPages(2), "two.tiff");

    expect(payload.warnings).toEqual(["low contrast"]);
    expect(payload.degraded).toBe(true);
  });

  it("keeps progress inside the OCR band and moving forward across pages", async () => {
    mocks.extractText.mockImplementation(
      async (_buffer: Buffer, _dir: string, _options: unknown, onProgress) => {
        onProgress?.(0, "start");
        onProgress?.(100, "done");
        return result("x");
      },
    );

    const { report } = await runOcr(await tiffOfPages(4), "four.tiff");

    const percents = report.mock.calls.map(([percent]) => percent as number);
    expect(Math.min(...percents)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...percents)).toBeLessThanOrEqual(100);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents.at(-1)).toBe(100);
  });

  it("refuses output past the OCR byte cap instead of storing it", async () => {
    mocks.extractText.mockImplementation(async () => result("x".repeat(600_000)));

    await expect(runOcr(await tiffOfPages(2), "big.tiff")).rejects.toMatchObject({
      code: "OCR_OUTPUT_TOO_LARGE",
    });
  });

  it("leaves a single-page TIFF on the plain path", async () => {
    const tiff = readFixture(fixtures.image.formats("tiff"));
    expect((await sharp(tiff).metadata()).pages ?? 1).toBe(1);
    mocks.extractText.mockImplementation(async () => result("only page"));

    const { payload } = await runOcr(tiff, "one.tiff");

    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(payload.text).toBe("only page");
  });
});
