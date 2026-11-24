import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerColorBlindness } from "../../../apps/api/src/routes/tools/color-blindness.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";

/**
 * Issue #4850: the TIFF-out image tools other than resize and split (#4419)
 * opened a multi-page TIFF as a still, edited page 1 and wrote a one-page TIFF
 * back with a 200. Every page after the first was dropped without a word.
 *
 * Each case runs the tool over a 3-page TIFF and over page 1 alone, and
 * requires the multi-page run to keep all three pages at the shape the
 * single-page run gives one page. That way the expected geometry comes from the
 * tool itself rather than a number per tool.
 */

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
  registerBorder(app);
  registerColorBlindness(app);
  registerCompress(app);
  registerConvert(app);
  registerCrop(app);
  registerDuotone(app);
  registerImageEnhancement(app);
  registerImagePad(app);
  registerPixelate(app);
  registerReplaceColor(app);
  registerRotate(app);
  registerSharpening(app);
  registerStripMetadata(app);
  registerTextOverlay(app);
  registerVignette(app);
  registerWatermarkText(app);
});

/** Settings that make each tool do real work on the page, beyond its defaults. */
const TIFF_TOOLS: Array<{ toolId: string; settings?: Record<string, unknown> }> = [
  { toolId: "adjust-colors", settings: { brightness: 20 } },
  { toolId: "adjust-colors", settings: { sharpness: 40 } },
  { toolId: "border", settings: { borderWidth: 5 } },
  { toolId: "color-blindness" },
  { toolId: "compress" },
  { toolId: "compress", settings: { mode: "targetSize", targetSizeKb: 500 } },
  { toolId: "convert", settings: { format: "tiff" } },
  { toolId: "crop", settings: { left: 0, top: 0, width: 40, height: 30 } },
  { toolId: "duotone" },
  { toolId: "image-enhancement" },
  { toolId: "image-pad" },
  { toolId: "pixelate" },
  { toolId: "replace-color" },
  { toolId: "rotate", settings: { angle: 90 } },
  { toolId: "rotate", settings: { angle: 0 } },
  { toolId: "sharpening" },
  { toolId: "strip-metadata" },
  { toolId: "text-overlay" },
  { toolId: "vignette" },
  { toolId: "watermark-text" },
];

const PAGE_SIZE = 80;

/** A 3-page TIFF whose pages differ in brightness, so no tool can merge them. */
async function threePageTiff(): Promise<Buffer> {
  const pages = await Promise.all(
    [60, 130, 210].map((base) =>
      sharp({
        create: {
          width: PAGE_SIZE,
          height: PAGE_SIZE,
          channels: 3,
          background: { r: base, g: base, b: base },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  return await sharp(pages, { join: { across: 1, animated: true } })
    .tiff({ compression: "lzw" })
    .toBuffer();
}

async function run(toolId: string, buffer: Buffer, overrides: Record<string, unknown> = {}) {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const settings = config.settingsSchema.parse({
    ...(defaultSettingsFor(toolId) as Record<string, unknown>),
    ...overrides,
  });
  return await config.process(buffer, settings, "pages.tiff");
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

describe("multi-page TIFF through the TIFF-out image tools (#4850)", () => {
  it.each(TIFF_TOOLS)("$toolId $settings keeps every page", async ({ toolId, settings }) => {
    const source = await threePageTiff();
    const firstPage = await sharp(source, { page: 0, pages: 1 })
      .tiff({ compression: "lzw" })
      .toBuffer();

    const multi = await run(toolId, source, settings);
    const single = await run(toolId, firstPage, settings);
    const one = await pageShape(single.buffer);

    expect(multi.contentType).toBe("image/tiff");
    expect(await pageShape(multi.buffer)).toEqual({ ...one, pages: 3 });
  });

  it("rotates each page, not the stacked strip", async () => {
    const source = readFixture(fixtures.image.multipageTiff);
    const result = await run("rotate", source, { angle: 90 });
    expect(await pageShape(result.buffer)).toEqual({
      format: "tiff",
      pages: 10,
      width: 600,
      pageHeight: 800,
    });
  });

  it("refuses a TIFF whose pages differ in size rather than keeping page 1", async () => {
    const source = readFixture(fixtures.image.edge.multipageMixedSizesTiff);
    await expect(run("rotate", source, { angle: 90 })).rejects.toThrow(
      /2 pages of different sizes/,
    );
    await expect(run("crop", source, { left: 0, top: 0, width: 10, height: 10 })).rejects.toThrow(
      /2 pages of different sizes/,
    );
  });

  it("still takes page 1 alone when the output is not TIFF", async () => {
    const result = await run("convert", await threePageTiff(), { format: "png" });
    expect(await pageShape(result.buffer)).toEqual({
      format: "png",
      pages: 1,
      width: PAGE_SIZE,
      pageHeight: PAGE_SIZE,
    });
  });
});

/**
 * Issue #4877: rounded corners, shadows and transparency need full alpha, and
 * these tools used to leave TIFF for PNG to get it, which kept page 1 of a
 * multi-page TIFF and dropped the rest. TIFF holds alpha, so a page stack now
 * stays a TIFF with an alpha channel on every page.
 */
const ALPHA_TOOLS: Array<{ toolId: string; settings: Record<string, unknown>; filename: string }> =
  [
    { toolId: "border", settings: { cornerRadius: 10 }, filename: "pages.tiff" },
    { toolId: "border", settings: { shadow: true }, filename: "pages.tiff" },
    { toolId: "replace-color", settings: { makeTransparent: true }, filename: "pages.tiff" },
    { toolId: "image-pad", settings: { background: "transparent" }, filename: "pages_padded.tiff" },
  ];

describe("multi-page TIFF through the tools that need alpha (#4877)", () => {
  it.each(ALPHA_TOOLS)(
    "$toolId $settings keeps every page as a TIFF with alpha",
    async ({ toolId, settings, filename }) => {
      const source = await threePageTiff();
      const firstPage = await sharp(source, { page: 0, pages: 1 })
        .tiff({ compression: "lzw" })
        .toBuffer();

      const multi = await run(toolId, source, settings);
      const one = await pageShape((await run(toolId, firstPage, settings)).buffer);

      expect(multi.contentType).toBe("image/tiff");
      expect(multi.filename).toBe(filename);
      expect(await pageShape(multi.buffer)).toEqual({ ...one, format: "tiff", pages: 3 });
      for (let page = 0; page < 3; page++) {
        expect((await sharp(multi.buffer, { page }).metadata()).hasAlpha).toBe(true);
      }
    },
  );

  it("knocks the colour out on the page that holds it", async () => {
    const result = await run("replace-color", await threePageTiff(), {
      makeTransparent: true,
      sourceColor: "#828282",
      tolerance: 5,
    });
    const alphaAt = async (page: number) =>
      (await sharp(result.buffer, { page }).extractChannel(3).raw().toBuffer())[0];
    expect(await alphaAt(0)).toBe(255);
    expect(await alphaAt(1)).toBe(0);
    expect(await alphaAt(2)).toBe(255);
  });

  // These three took page 1 of multipage.tiff to PNG under #2549.
  it.each([
    {
      toolId: "replace-color",
      settings: { makeTransparent: true },
      filename: "multipage.tiff",
      pageHeight: 600,
      width: 800,
    },
    {
      toolId: "image-pad",
      settings: { background: "transparent" },
      filename: "multipage_padded.tiff",
      pageHeight: 800,
      width: 800,
    },
    {
      toolId: "border",
      settings: { borderWidth: 10, cornerRadius: 10 },
      filename: "multipage.tiff",
      pageHeight: 620,
      width: 820,
    },
  ])(
    "$toolId keeps all 10 pages of multipage.tiff",
    async ({ toolId, settings, filename, pageHeight, width }) => {
      const config = getToolConfig(toolId);
      if (!config) throw new Error(`${toolId} must be registered`);
      const result = await config.process(
        readFixture(fixtures.image.multipageTiff),
        config.settingsSchema.parse(settings),
        "multipage.tiff",
      );
      expect(result.contentType).toBe("image/tiff");
      expect(result.filename).toBe(filename);
      expect(await pageShape(result.buffer)).toEqual({
        format: "tiff",
        pages: 10,
        width,
        pageHeight,
      });
    },
  );

  it("refuses a TIFF whose pages differ in size rather than keeping page 1 as PNG", async () => {
    const source = readFixture(fixtures.image.edge.multipageMixedSizesTiff);
    await expect(run("border", source, { cornerRadius: 10 })).rejects.toThrow(
      /2 pages of different sizes/,
    );
  });

  it("still sends a one-page TIFF to PNG", async () => {
    const firstPage = await sharp(await threePageTiff(), { page: 0, pages: 1 })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const result = await run("border", firstPage, { cornerRadius: 10 });
    expect(result.contentType).toBe("image/png");
    expect(result.filename).toBe("pages.png");
  });
});
