/**
 * Smart crop opened its input with a bare `sharp(inputBuffer)`, so a multi-page
 * TIFF came back as a one-page TIFF and an animated GIF as a still, both with a
 * 200 (#4878). Every mode now picks its crop once, from page 1, and applies that
 * same crop to every page, so the pages stay one size and a face run costs one
 * detection rather than one per page.
 */

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const mocks = vi.hoisted(() => ({ detectFaces: vi.fn() }));

vi.mock("@snapotter/ai", () => ({ detectFaces: mocks.detectFaces }));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isFeatureInstalled: () => true,
}));

let config: NonNullable<ReturnType<typeof getToolConfig>>;

beforeAll(() => {
  registerSmartCrop({ post: vi.fn() } as unknown as FastifyInstance);
  const registered = getToolConfig("smart-crop");
  if (!registered) throw new Error("smart-crop was not registered");
  config = registered;
});

beforeEach(() => {
  mocks.detectFaces.mockReset();
  mocks.detectFaces.mockResolvedValue({
    facesDetected: 1,
    faces: [{ x: 50, y: 30, w: 20, h: 20 }],
  });
});

const ctx = {} as ToolProcessCtx;

async function run(input: Buffer, settings: Record<string, unknown>, filename = "pages.tiff") {
  return await config.process(input, config.settingsSchema.parse(settings), filename, ctx);
}

async function pageShape(buffer: Buffer) {
  const meta = await sharp(buffer, { pages: -1 }).metadata();
  return {
    format: meta.format,
    pages: meta.pages ?? 1,
    width: meta.width,
    pageHeight: meta.pageHeight ?? meta.height,
  };
}

/**
 * A 160 x 120 page per entry: grey backdrop, a red block at a different spot on
 * each page. Each page would trim (or attention-crop) to a different place, so
 * the run has to carry page 1's choice to the rest.
 */
const BLOCKS = [
  { left: 20, top: 10 },
  { left: 90, top: 60 },
  { left: 50, top: 30 },
];

async function pages(): Promise<Buffer[]> {
  const red = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
  return await Promise.all(
    BLOCKS.map(({ left, top }) =>
      sharp({ create: { width: 160, height: 120, channels: 3, background: "#808080" } })
        .composite([{ input: red, left, top }])
        .png()
        .toBuffer(),
    ),
  );
}

async function threePageTiff(): Promise<Buffer> {
  return await sharp(await pages(), { join: { across: 1, animated: true } })
    .tiff({ compression: "lzw" })
    .toBuffer();
}

async function rawPage(buffer: Buffer, page: number) {
  return await sharp(buffer, { page, pages: 1 }).removeAlpha().raw().toBuffer();
}

const MODES: Array<Record<string, unknown>> = [
  { mode: "subject" },
  { mode: "subject", strategy: "entropy", width: 120, height: 60, padding: 20 },
  { mode: "face", width: 64, height: 64 },
  { mode: "trim" },
  { mode: "trim", padding: 30 },
  { mode: "trim", padToSquare: true, padColor: "#00ff00" },
  { mode: "trim", targetSize: 50 },
];

describe("smart crop over a multi-page TIFF (#4878)", () => {
  it("keeps all 10 pages of the multi-page fixture", async () => {
    const result = await run(readFixture(fixtures.image.multipageTiff), {});
    expect(result.contentType).toBe("image/tiff");
    expect(await pageShape(result.buffer)).toEqual({
      format: "tiff",
      pages: 10,
      width: 1080,
      pageHeight: 1080,
    });
  });

  it.each(MODES)("$mode %o keeps every page at page 1's crop", async (settings) => {
    const source = await threePageTiff();
    const firstPage = await sharp(source, { page: 0, pages: 1 })
      .tiff({ compression: "lzw" })
      .toBuffer();

    const multi = await run(source, settings);
    const single = await run(firstPage, settings);

    expect(multi.contentType).toBe("image/tiff");
    expect(await pageShape(multi.buffer)).toEqual({
      ...(await pageShape(single.buffer)),
      pages: 3,
    });
    // Page 1 of the stack is exactly what cropping page 1 alone gives.
    expect((await rawPage(multi.buffer, 0)).equals(await rawPage(single.buffer, 0))).toBe(true);
  });

  it("crops every page at the region trim found on page 1", async () => {
    const source = await threePageTiff();
    const result = await run(source, { mode: "trim" });
    const block = BLOCKS[0];
    for (const [page, raw] of (await pages()).entries()) {
      const expected = await sharp(raw)
        .extract({ left: block.left, top: block.top, width: 40, height: 30 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect((await rawPage(result.buffer, page)).equals(expected)).toBe(true);
    }
  });

  it("runs face detection once, not once per page", async () => {
    await run(await threePageTiff(), { mode: "face", width: 64, height: 64 });
    expect(mocks.detectFaces).toHaveBeenCalledTimes(1);
  });

  it("refuses a TIFF whose pages differ in size rather than keeping page 1", async () => {
    const source = readFixture(fixtures.image.edge.multipageMixedSizesTiff);
    await expect(run(source, { mode: "subject", width: 20, height: 20 })).rejects.toThrow(
      /2 pages of different sizes/,
    );
  });
});

describe("smart crop over an animated GIF (#4878)", () => {
  it("keeps every frame and its timing", async () => {
    const result = await run(
      readFixture(fixtures.image.animated.gif),
      { mode: "subject", width: 50, height: 40 },
      "anim.gif",
    );
    const meta = await sharp(result.buffer).metadata();
    expect(result.contentType).toBe("image/gif");
    expect(meta.pages).toBe(3);
    expect(meta.delay).toEqual([100, 100, 100]);
    expect(await pageShape(result.buffer)).toMatchObject({ width: 50, pageHeight: 40 });
  });
});

describe("smart crop on a still keeps sharp's own window (#4878)", () => {
  // planSubject replays the attention or entropy window instead of letting
  // sharp crop, so a still has to come out exactly as sharp's cover crop did.
  it.each([
    { strategy: "attention", width: 60, height: 100, padding: 0 },
    { strategy: "entropy", width: 140, height: 50, padding: 25 },
  ])("$strategy $width x $height at $padding% padding", async (settings) => {
    // Page 2 has its block off-centre, so the window sits away from 0, 0.
    const page = (await pages())[1];
    const scale = 1 + settings.padding / 100;
    const resizeW = Math.round(settings.width * scale);
    const resizeH = Math.round(settings.height * scale);
    const cover = await sharp(page)
      .resize(resizeW, resizeH, { fit: "cover", position: sharp.strategy[settings.strategy] })
      .png()
      .toBuffer();
    const expected = await sharp(cover)
      .extract({
        left: Math.round((resizeW - settings.width) / 2),
        top: Math.round((resizeH - settings.height) / 2),
        width: settings.width,
        height: settings.height,
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    const result = await run(page, { mode: "subject", ...settings }, "still.png");
    expect((await rawPage(result.buffer, 0)).equals(expected)).toBe(true);
  });
});
