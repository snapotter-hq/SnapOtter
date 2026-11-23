/**
 * Animated per-frame output pays one lossy generation per frame, like a still
 * (#5125).
 *
 * runPerFrame hands each frame to the route's own still-image logic, then
 * joins the results and encodes the animation once. When that logic ended in
 * the route's lossy encode, every frame was encoded twice: once by the route
 * and again by the join. So each route here runs over a noisy animation and
 * over the same frames as a TIFF page stack, which it edits losslessly, and
 * the animation has to come out exactly as that lossless result encoded once.
 * adjust-colors already encoded its frames as PNG and stays as the control.
 */

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { runPerFrame } from "../../../apps/api/src/lib/animated-image.js";
import { outputFormatFor } from "../../../apps/api/src/lib/output-format.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
  registerBorder(app);
  registerDuotone(app);
  registerImageEnhancement(app);
  registerImagePad(app);
  registerPixelate(app);
  registerReplaceColor(app);
  registerRotate(app);
  registerSharpening(app);
  registerTextOverlay(app);
  registerVignette(app);
  registerWatermarkText(app);
});

/**
 * Settings that put each route on its per-frame path. The rest go per frame
 * whatever the settings, so their defaults are enough.
 */
const PER_FRAME_SETTINGS: Record<string, Record<string, unknown>> = {
  "adjust-colors": { sharpness: 50 },
  // A pixel block of 1 leaves the frame alone, so there is nothing for the
  // comparison to measure but the encodes.
  pixelate: { blockSize: 4 },
  rotate: { angle: 90 },
};

const PER_FRAME_TOOLS = [
  "adjust-colors",
  "border",
  "duotone",
  "image-enhancement",
  "image-pad",
  "pixelate",
  "replace-color",
  "rotate",
  "sharpening",
  "text-overlay",
  "vignette",
  "watermark-text",
] as const;

const SIZE = 64;
const DELAY = [100, 120, 140];

// Noise, so a lossy encode has something to throw away. Flat frames survive
// any number of generations almost untouched and would hide the second one.
async function noisyFrames(): Promise<Buffer[]> {
  return await Promise.all(
    DELAY.map((_, seed) => {
      const data = Buffer.alloc(SIZE * SIZE * 3);
      let state = seed + 1;
      for (let i = 0; i < data.length; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        data[i] = state & 0xff;
      }
      return sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .png()
        .toBuffer();
    }),
  );
}

async function noisyAnimation(format: "gif" | "webp"): Promise<Buffer> {
  const joined = sharp(await noisyFrames(), { join: { across: 1, animated: true } });
  return format === "gif"
    ? await joined.gif({ delay: DELAY, loop: 0 }).toBuffer()
    : await joined.webp({ lossless: true, delay: DELAY, loop: 0 }).toBuffer();
}

async function framesOf(buffer: Buffer): Promise<Buffer[]> {
  return await Promise.all(
    DELAY.map((_, page) => sharp(buffer, { page, pages: 1 }).png().toBuffer()),
  );
}

/**
 * The animation's own decoded frames as a TIFF page stack. TIFF goes through
 * runPerFrame too, losslessly, so the route's result for it is the edit with
 * no encode loss at all.
 */
async function pageStackOf(animation: Buffer): Promise<Buffer> {
  // GIF decodes with an alpha band even when every pixel is opaque, and
  // duotone sends an alpha TIFF to PNG, which is a still.
  const opaque = await Promise.all(
    (await framesOf(animation)).map((frame) => sharp(frame).removeAlpha().png().toBuffer()),
  );
  return await sharp(opaque, { join: { across: 1, animated: true } })
    .tiff({ compression: "lzw" })
    .toBuffer();
}

/** The route's lossless result, encoded once the way the join encodes it. */
async function encodedOnce(pages: Buffer, format: "gif" | "webp"): Promise<Buffer> {
  const joined = sharp(await framesOf(pages), { join: { across: 1, animated: true } });
  const { encoderOptions } = outputFormatFor(format, 95);
  const timing = { delay: DELAY, loop: 0 };
  return format === "gif"
    ? await joined.gif({ ...encoderOptions, ...timing }).toBuffer()
    : await joined.webp({ ...encoderOptions, ...timing }).toBuffer();
}

async function rgbOfFrame(buffer: Buffer, page: number): Promise<Buffer> {
  return await sharp(buffer, { page, pages: 1 }).removeAlpha().raw().toBuffer();
}

function meanAbsoluteError(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function runTool(toolId: string, buffer: Buffer, filename: string): Promise<Buffer> {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const settings = config.settingsSchema.parse({
    ...(defaultSettingsFor(toolId) as Record<string, unknown>),
    ...PER_FRAME_SETTINGS[toolId],
  });
  const result = await config.process(buffer, settings, filename);
  return result.buffer;
}

describe("runPerFrame frame format (#5125)", () => {
  it("asks each frame for PNG whatever the output format", async () => {
    const seen: string[] = [];
    const out = await runPerFrame(
      await noisyAnimation("webp"),
      outputFormatFor("webp", 95),
      async (frame, frameFormat) => {
        seen.push(frameFormat.format);
        return frame;
      },
    );
    expect(out).toBeDefined();
    expect(seen).toEqual(["png", "png", "png"]);
  });
});

describe.each(["webp", "gif"] as const)(
  "animated %s per-frame output is encoded once (#5125)",
  (format) => {
    it.each(PER_FRAME_TOOLS)("%s", async (toolId) => {
      const input = await noisyAnimation(format);
      const animated = await runTool(toolId, input, `noisy.${format}`);
      const lossless = await runTool(toolId, await pageStackOf(input), "noisy.tiff");

      const meta = await sharp(animated).metadata();
      expect(meta.pages).toBe(DELAY.length);
      // Routes that need alpha switch a GIF to WebP, so the reference follows
      // whatever container the route chose.
      const reference = await encodedOnce(lossless, meta.format as "gif" | "webp");
      for (let page = 0; page < DELAY.length; page++) {
        const drift = meanAbsoluteError(
          await rgbOfFrame(animated, page),
          await rgbOfFrame(reference, page),
        );
        expect(drift, `frame ${page}`).toBe(0);
      }
    });
  },
);
