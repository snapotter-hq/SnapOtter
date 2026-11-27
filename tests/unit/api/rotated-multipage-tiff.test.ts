import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { ImageInputHandler } from "../../../apps/api/src/modality/image-input.js";
import { getToolConfig, orientOutputFormat } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerCircleCrop } from "../../../apps/api/src/routes/tools/circle-crop.js";
import { registerColorBlindness } from "../../../apps/api/src/routes/tools/color-blindness.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";

/**
 * Issue #5133: autoOrient keeps page 1 of a rotated multi-page TIFF it can't
 * turn as one stack (pages of different sizes, or over the workload cap). The
 * same file without its orientation tag is refused by every tool that keeps
 * TIFF pages (#4850), so the orientation tag alone decided between a clear 400
 * and a silent one-page TIFF.
 *
 * Each case takes the refusal a tool gives the unrotated file and requires the
 * orientation step to give the rotated copy that same refusal, using the
 * output format the tool declares.
 */

const app = {
  post: () => undefined,
  get: () => undefined,
  addContentTypeParser: () => undefined,
} as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
  registerCircleCrop(app);
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
  registerResize(app);
  registerRotate(app);
  registerSharpening(app);
  registerSplit(app);
  registerStripMetadata(app);
  registerTextOverlay(app);
  registerVignette(app);
  registerWatermarkText(app);
});

let scratchDir: string;
beforeAll(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "rotated-tiff-"));
});
afterAll(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

const TIFF_TOOLS: Array<{ toolId: string; settings?: Record<string, unknown> }> = [
  { toolId: "adjust-colors", settings: { brightness: 20 } },
  { toolId: "border", settings: { borderWidth: 5 } },
  { toolId: "color-blindness" },
  { toolId: "compress" },
  { toolId: "convert", settings: { format: "tiff" } },
  { toolId: "crop", settings: { left: 0, top: 0, width: 10, height: 10 } },
  { toolId: "duotone" },
  { toolId: "image-enhancement" },
  { toolId: "image-pad" },
  { toolId: "pixelate" },
  { toolId: "replace-color" },
  { toolId: "resize", settings: { width: 10 } },
  { toolId: "rotate", settings: { angle: 90 } },
  { toolId: "sharpening" },
  { toolId: "strip-metadata" },
  { toolId: "text-overlay" },
  { toolId: "vignette" },
  { toolId: "watermark-text" },
];

function settingsFor(toolId: string, overrides: Record<string, unknown> = {}) {
  return { ...(defaultSettingsFor(toolId) as Record<string, unknown>), ...overrides };
}

async function toolRefusal(toolId: string, buffer: Buffer, settings: Record<string, unknown>) {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const err = await config
    .process(buffer, config.settingsSchema.parse(settings), "pages.tiff")
    .then(
      () => undefined,
      (e: unknown) => e,
    );
  expect(err, `${toolId} must refuse the unrotated file`).toBeInstanceOf(Error);
  return (err as Error).message;
}

async function prepare(buffer: Buffer, toolId: string, settings: unknown) {
  return await new ImageInputHandler().prepare(buffer, "pages.tiff", {
    scratchDir,
    outputFormat: orientOutputFormat(toolId, () => settings, "pages.tiff"),
  });
}

const rotatedMixed = () => readFixture(fixtures.image.edge.multipageMixedSizesOrientedTiff);
const unrotatedMixed = () => readFixture(fixtures.image.edge.multipageMixedSizesTiff);

describe("a rotated multi-page TIFF autoOrient can't stack (#5133)", () => {
  it.each(TIFF_TOOLS)(
    "$toolId $settings refuses it as it refuses the unrotated file",
    async ({ toolId, settings }) => {
      const s = settingsFor(toolId, settings);
      const expected = await toolRefusal(toolId, unrotatedMixed(), s);

      const err = await prepare(rotatedMixed(), toolId, s).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(InputValidationError);
      expect((err as InputValidationError).statusCode).toBe(400);
      expect((err as InputValidationError).code).toBe("IMAGE_UNDECODABLE");
      expect((err as Error).message).toBe(expected);
    },
  );

  it("refuses it for split tiles kept as TIFF, as split refuses the unrotated file", async () => {
    const config = getToolConfig("split");
    if (!config?.outputFormat) throw new Error("split must declare its output format");
    const settings = config.settingsSchema.parse({ outputFormat: "original" });
    expect(await config.outputFormat(unrotatedMixed(), settings, "pages.tiff")).toBe("tiff");

    await expect(prepare(rotatedMixed(), "split", { outputFormat: "original" })).rejects.toThrow(
      /2 pages of different sizes/,
    );
  });

  it("keeps rotated page 1 when the tool writes a still format", async () => {
    const prepared = await prepare(
      rotatedMixed(),
      "convert",
      settingsFor("convert", { format: "png" }),
    );
    const meta = await sharp(prepared.buffer).metadata();
    expect(meta.pages ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("keeps rotated page 1 for split tiles in a still format", async () => {
    const prepared = await prepare(rotatedMixed(), "split", { outputFormat: "png" });
    expect((await sharp(prepared.buffer).metadata()).pages ?? 1).toBe(1);
  });

  it("keeps rotated page 1 for a tool that never keeps TIFF pages", async () => {
    expect(getToolConfig("circle-crop")?.outputFormat).toBeUndefined();
    expect(orientOutputFormat("circle-crop", () => ({}), "pages.tiff")).toBeUndefined();

    const prepared = await prepare(rotatedMixed(), "circle-crop", {});
    expect((await sharp(prepared.buffer).metadata()).pages ?? 1).toBe(1);
  });

  it("keeps rotated page 1 when the settings don't parse, leaving their 400 to the route", async () => {
    const invalid = orientOutputFormat("convert", () => ({ format: "not-a-format" }), "x.tiff");
    const badJson = orientOutputFormat("convert", () => JSON.parse("{"), "x.tiff");
    expect(await invalid?.(unrotatedMixed())).toBeUndefined();
    expect(await badJson?.(unrotatedMixed())).toBeUndefined();
  });

  it.each(TIFF_TOOLS)(
    "$toolId $settings declares the format its process writes",
    async ({ toolId, settings }) => {
      const page = await sharp({
        create: { width: 16, height: 16, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .png()
        .toBuffer();
      const stack = await sharp([page, page], { join: { across: 1, animated: true } })
        .tiff({ compression: "lzw" })
        .toBuffer();
      const config = getToolConfig(toolId);
      const parsed = config?.settingsSchema.parse(settingsFor(toolId, settings));

      const declared = await config?.outputFormat?.(stack, parsed, "pages.tiff");
      const result = await config?.process(stack, parsed, "pages.tiff");

      expect(declared).toBe("tiff");
      expect(result?.contentType).toBe("image/tiff");
    },
  );
});

/**
 * A tool that keeps TIFF pages (it calls one of the page-aware helpers) has to
 * tell the orientation step what it writes, or a rotated page stack it can't
 * turn is cut to page 1 again. gif-webp and optimize-for-web can't write TIFF.
 */
describe("every page-keeping tool declares its output format (#5133)", () => {
  const dir = join(import.meta.dirname, "../../../apps/api/src/routes/tools");
  const NEVER_TIFF = new Set(["gif-webp.ts", "optimize-for-web.ts"]);
  const pageAware = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !NEVER_TIFF.has(f))
    .filter((f) =>
      /\b(readTiffPagesFor|runPerFrame|readAnimationFor|isMultiPageTiff)\(/.test(
        readFileSync(join(dir, f), "utf8"),
      ),
    );

  it("finds the page-aware tools", () => {
    expect(pageAware.length).toBeGreaterThan(15);
  });

  it.each(pageAware)("%s declares outputFormat", (file) => {
    expect(readFileSync(join(dir, file), "utf8")).toMatch(
      /\boutputFormat: (inputOutputFormat|async \(|\()/,
    );
  });
});
