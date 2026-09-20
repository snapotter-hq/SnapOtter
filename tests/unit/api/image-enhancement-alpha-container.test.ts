import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";

/**
 * Issue #1187: image-enhancement lost transparency on a still GIF while the
 * same pixels as a PNG kept it.
 *
 * Two compounding bugs, both pinned by this one test:
 *
 * 1. The tool split the alpha channel out with `extractChannel(3).toBuffer()`
 *    before running color corrections. That intermediate named no format, so
 *    Sharp re-encoded the one-band mask in whatever container the input
 *    arrived in. Through a GIF's 256-color palette a one-band mask isn't a
 *    mask any more by the time it comes back.
 * 2. Even with (1) fixed, the corrected color image was encoded straight to
 *    the final output format (GIF) before being reread for `joinChannel()`.
 *    Rereading a materialized GIF buffer always reports a phantom, always-
 *    opaque fourth channel regardless of the GIF's real transparency, so
 *    `joinChannel()` on that reread buffer produced a five-channel image and
 *    the final encoder silently kept the phantom band instead of the real
 *    mask. The fix routes the color pass through a named PNG intermediate
 *    before the join, so the reread sees exactly three channels.
 */

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerImageEnhancement(app);
});

/** 60x60 red square with a fully transparent 20x20 corner, in the given container. */
function swatch(container: "png" | "gif"): Promise<Buffer> {
  const width = 60;
  const height = 60;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = x < 20 && y < 20 ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    [container]()
    .toBuffer();
}

async function alphaAt(buffer: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + info.channels - 1];
}

/** RGB at a pixel, alpha ignored. */
async function rgbAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

async function runEnhancement(source: Buffer, name: string): Promise<Buffer> {
  const config = getToolConfig("image-enhancement");
  if (!config) throw new Error("image-enhancement must be registered");
  const result = await config.process(source, config.settingsSchema.parse({}), name);
  return result.buffer;
}

describe("image-enhancement keeps a transparent corner transparent through a GIF, like PNG (#1187)", () => {
  it("preserves alpha and corrected color through a GIF", async () => {
    const pngIn = await swatch("png");
    const gifIn = await swatch("gif");

    // Sanity: both inputs actually carry the transparency the test relies on.
    expect(await alphaAt(pngIn, 5, 5)).toBe(0);
    expect(await alphaAt(pngIn, 40, 40)).toBe(255);
    expect(await alphaAt(gifIn, 5, 5)).toBe(0);
    expect(await alphaAt(gifIn, 40, 40)).toBe(255);

    const pngOut = await runEnhancement(pngIn, "swatch.png");
    const gifOut = await runEnhancement(gifIn, "swatch.gif");

    expect(await alphaAt(pngOut, 5, 5)).toBe(0);
    expect(await alphaAt(pngOut, 40, 40)).toBe(255);

    expect(await alphaAt(gifOut, 5, 5)).toBe(0);
    expect(await alphaAt(gifOut, 40, 40)).toBe(255);

    // The GIF path's corrected color at the opaque pixel has to match the PNG
    // path's, within what a still-lossless-ish GIF re-encode can shift a
    // color by. A regression that rejoins alpha onto the pre-correction
    // buffer, or that reintroduces the stale-palette reuse this fix also
    // sidesteps, would show up here as either the uncorrected input color or
    // the 76,105,113 gray this bug class produces (issue #1180's fingerprint).
    const pngRgb = await rgbAt(pngOut, 40, 40);
    const gifRgb = await rgbAt(gifOut, 40, 40);
    for (let channel = 0; channel < 3; channel++) {
      expect(
        Math.abs(gifRgb[channel] - pngRgb[channel]),
        `channel ${channel}: gif gave ${gifRgb.join(",")}, png gave ${pngRgb.join(",")}`,
      ).toBeLessThanOrEqual(8);
    }
  });
});
