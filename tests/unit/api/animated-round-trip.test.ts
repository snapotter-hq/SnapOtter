import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerCircleCrop } from "../../../apps/api/src/routes/tools/circle-crop.js";
import { registerColorBlindness } from "../../../apps/api/src/routes/tools/color-blindness.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerRoundedCrop } from "../../../apps/api/src/routes/tools/rounded-crop.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";

/**
 * Issue #1083: every one of these routes built its pipeline with a bare
 * `sharp(inputBuffer)`, which decodes frame 1 and silently discards the rest.
 * An animated GIF went in and a still came out, at a smaller byte count that
 * looked like a successful compression.
 *
 * The geometry half matters as much as the frame count. Under `animated: true`
 * Sharp lays the frames out as one tall strip, so `height` becomes
 * `pageHeight * pages`. A route that sizes anything off `height` distorts every
 * frame instead of dropping them. Rather than hard-code expected dimensions per
 * tool, each case runs the same tool over a single-frame copy of the same GIF
 * and requires the animated run to produce frames of exactly that shape.
 */

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
  registerCircleCrop(app);
  registerColorBlindness(app);
  registerCompress(app);
  registerCrop(app);
  registerDuotone(app);
  registerImageEnhancement(app);
  registerImagePad(app);
  registerOptimizeForWeb(app);
  registerPixelate(app);
  registerReplaceColor(app);
  registerResize(app);
  registerRotate(app);
  registerRoundedCrop(app);
  registerSharpening(app);
  registerStripMetadata(app);
  registerTextOverlay(app);
  registerVignette(app);
  registerWatermarkText(app);
});

/** Tools expected to carry animation from input to output. */
const ROUND_TRIP_TOOLS = [
  "adjust-colors",
  "color-blindness",
  "compress",
  "crop",
  "duotone",
  "image-enhancement",
  "image-pad",
  "optimize-for-web",
  "pixelate",
  "replace-color",
  "resize",
  "rotate",
  "sharpening",
  "strip-metadata",
  "text-overlay",
  "vignette",
  "watermark-text",
] as const;

/**
 * Tools that always encode PNG, which has no animation Sharp can write. These
 * are expected to return a still, and the point of pinning it is that the
 * still must be one frame at its own size, not the frames stacked into one
 * image `pages` times too tall.
 */
const PNG_ONLY_TOOLS = ["circle-crop", "rounded-crop"] as const;

async function runTool(toolId: string, buffer: Buffer, filename: string): Promise<Buffer> {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const settings = config.settingsSchema.parse(defaultSettingsFor(toolId));
  const result = await config.process(buffer, settings, filename);
  return result.buffer;
}

interface FrameShape {
  pages: number;
  width: number;
  pageHeight: number;
}

async function frameShape(buffer: Buffer): Promise<FrameShape> {
  const meta = await sharp(buffer, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  return {
    pages,
    width: meta.width ?? 0,
    // Sharp only reports pageHeight for multi-page images; a still's frame
    // height is just its height.
    pageHeight: meta.pageHeight ?? meta.height ?? 0,
  };
}

async function frameTiming(buffer: Buffer): Promise<{ delay?: number[]; loop?: number }> {
  const meta = await sharp(buffer, { animated: true }).metadata();
  return { delay: meta.delay, loop: meta.loop };
}

/** Collapse an animation to its first frame, keeping the container format. */
async function firstFrameOnly(buffer: Buffer, format: "gif" | "webp"): Promise<Buffer> {
  const still = sharp(buffer, { pages: 1 });
  return format === "gif" ? await still.gif().toBuffer() : await still.webp().toBuffer();
}

/** Timing deliberately unlike Sharp's defaults, so a dropped delay shows up. */
const FRAME_DELAYS = [80, 120, 200];
const FRAME_LOOP = 5;
const FRAME_SIZE = 80;

/**
 * A 3-frame GIF whose frames differ in brightness, built rather than read.
 *
 * `animated.gif` is three flat colour fields, which is the wrong input for a
 * frame-count assertion: several tools map two of those fields onto the same
 * colour, and the GIF encoder then merges the duplicate frames and adds their
 * delays together, which is correct behaviour rather than a lost frame.
 * Photographic frames avoid that but make the assertion depend on a 190KB
 * binary staying distinct through every tool's transform.
 *
 * Luminance is the property that survives this whole catalogue: duotone goes
 * through greyscale, pixelate averages blocks, and everything downscales, all
 * of which collapse a hue difference and keep a brightness one.
 */
const gifSource = (() => {
  let cached: Promise<Buffer> | undefined;
  const build = async (): Promise<Buffer> => {
    const frames = await Promise.all(
      [60, 130, 210].map((base) =>
        sharp({
          create: {
            width: FRAME_SIZE,
            height: FRAME_SIZE,
            channels: 3,
            background: { r: base, g: base, b: base },
          },
        })
          // A gradient rather than a flat field, so block-averaging tools have
          // something to average.
          .composite([
            {
              input: Buffer.from(
                `<svg width="${FRAME_SIZE}" height="${FRAME_SIZE}"><defs><linearGradient id="g"><stop offset="0%" stop-color="#000" stop-opacity="0.5"/><stop offset="100%" stop-color="#fff" stop-opacity="0.5"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
              ),
            },
          ])
          .png()
          .toBuffer(),
      ),
    );
    return await sharp(frames, { join: { across: 1, animated: true } })
      .gif({ delay: FRAME_DELAYS, loop: FRAME_LOOP })
      .toBuffer();
  };
  return (): Promise<Buffer> => {
    cached ??= build();
    return cached;
  };
})();

describe.each([
  { label: "a 3-frame GIF", load: gifSource, filename: "frames.gif", format: "gif" as const },
  {
    label: "animated.webp",
    load: async () => readFixture(fixtures.image.animated.webp),
    filename: "animated.webp",
    format: "webp" as const,
  },
])("$label round-trips through image tools (#1083)", ({ load, filename, format }) => {
  it.each(ROUND_TRIP_TOOLS)("%s keeps every frame, at frame size", async (toolId) => {
    const source = await load();
    const stillIn = await firstFrameOnly(source, format);

    const animated = await frameShape(await runTool(toolId, source, filename));
    // The same tool over one still frame says what shape a frame should be,
    // which beats hard-coding a number per tool. Asserting it together with the
    // page count matters: on its own the shape check passes for a flattened
    // result, because then both runs are the same single frame.
    const still = await frameShape(await runTool(toolId, stillIn, filename));

    expect(animated).toEqual({
      pages: 3,
      width: still.width,
      pageHeight: still.pageHeight,
    });
  });
});

describe("neighbourhood operators do not read across the frame seam (#1083)", () => {
  /**
   * Two flat frames, one dark and one bright, stacked.
   *
   * Sharp's `sharpen`, `blur`, `median` and `convolve` are not page-aware: run
   * over the stacked strip they sample rows belonging to the next frame, so
   * each frame picks up a halo along the edge where it meets its neighbour.
   * A flat frame makes that unmissable, because any variation within a frame
   * can only have come from outside it.
   */
  async function twoFlatFrames(): Promise<Buffer> {
    const frames = await Promise.all(
      [60, 220].map((v) =>
        sharp({
          create: { width: 40, height: 40, channels: 3, background: { r: v, g: v, b: v } },
        })
          .png()
          .toBuffer(),
      ),
    );
    return await sharp(frames, { join: { across: 1, animated: true } })
      .gif()
      .toBuffer();
  }

  /** Every distinct luminance found in one frame of the result. */
  async function frameTones(buffer: Buffer, page: number): Promise<number[]> {
    const { data, info } = await sharp(buffer, { animated: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const meta = await sharp(buffer, { animated: true }).metadata();
    const pageHeight = meta.pageHeight ?? info.height;
    const tones = new Set<number>();
    for (let y = 0; y < pageHeight; y++) {
      for (let x = 0; x < info.width; x++) {
        tones.add(data[((page * pageHeight + y) * info.width + x) * info.channels]);
      }
    }
    return [...tones].sort((a, b) => a - b);
  }

  it.each([
    { toolId: "sharpening", settings: {} },
    { toolId: "adjust-colors", settings: { sharpness: 80 } },
  ])("$toolId leaves a flat frame flat", async ({ toolId, settings }) => {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);

    const result = await config.process(
      await twoFlatFrames(),
      config.settingsSchema.parse(settings),
      "flat.gif",
    );

    // GIF quantisation can shift a tone, so this asks for one tone per frame
    // rather than an exact value.
    expect(await frameTones(result.buffer, 0)).toHaveLength(1);
    expect(await frameTones(result.buffer, 1)).toHaveLength(1);
  });
});

describe("rebuilding an animation keeps its timing (#1083)", () => {
  // Every per-frame tool rebuilds the animation from scratch. Drop the delay
  // and loop arguments on that rebuild and the frame count still checks out,
  // while the result plays at full speed and stops after one pass.
  it.each(ROUND_TRIP_TOOLS)("%s keeps frame delays and loop count", async (toolId) => {
    const out = await runTool(toolId, await gifSource(), "frames.gif");

    expect(await frameTiming(out)).toEqual({ delay: FRAME_DELAYS, loop: FRAME_LOOP });
  });
});

describe("compress keeps animation across both modes (#1083)", () => {
  it("preserves all 30 frames of a longer GIF", async () => {
    const source = readFixture(fixtures.image.animated.real);
    const out = await runTool("compress", source, "animated-simpsons.gif");

    expect((await frameShape(out)).pages).toBe(30);
  });

  it("preserves frames when the target size forces the engine to downscale", async () => {
    // The binary search gives up on quality alone and falls into the resize
    // fallback, the one place the engine's new animated flag meets .resize().
    // Sized off the strip, that would stretch every frame by the frame count.
    const source = readFixture(fixtures.image.animated.real);
    const config = getToolConfig("compress");
    if (!config) throw new Error("compress must be registered");

    const result = await config.process(
      source,
      config.settingsSchema.parse({ mode: "targetSize", targetSizeKb: 40 }),
      "animated-simpsons.gif",
    );
    const shape = await frameShape(result.buffer);

    expect(shape.pages).toBe(30);
    // The source frames are square, so a strip-sized downscale shows up here.
    expect(shape.pageHeight).toBe(shape.width);
  });

  it("preserves frames in targetSize mode, which re-encodes through the engine", async () => {
    const source = readFixture(fixtures.image.animated.gif);
    const config = getToolConfig("compress");
    if (!config) throw new Error("compress must be registered");
    const settings = config.settingsSchema.parse({
      mode: "targetSize",
      targetSizeKb: Math.ceil(source.length / 1024),
    });

    const result = await config.process(source, settings, "animated.gif");

    expect((await frameShape(result.buffer)).pages).toBe(3);
  });
});

describe("geometry read off the frame, not the strip (#1083)", () => {
  // Under `animated: true` Sharp stacks the frames, so `metadata.height` is
  // pages x frame height. Sizing anything off that and handing it back to a
  // page-aware operation stretches every frame by the frame count.
  // `defaultSettingsFor` happens to pick the two settings that dodge this, so
  // these cases name the dangerous ones explicitly.
  async function runWith(toolId: string, settings: Record<string, unknown>): Promise<Buffer> {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);
    const result = await config.process(
      await gifSource(),
      config.settingsSchema.parse(settings),
      "frames.gif",
    );
    return result.buffer;
  }

  it.each([
    { label: "percentage", settings: { percentage: 50 }, width: 40, pageHeight: 40 },
    {
      label: "withoutEnlargement past the frame size",
      settings: { width: 500, height: 500, withoutEnlargement: true },
      width: 80,
      pageHeight: 80,
    },
  ])(
    "resize by $label sizes each frame, not the strip",
    async ({ settings, width, pageHeight }) => {
      const shape = await frameShape(await runWith("resize", settings));

      expect(shape).toEqual({ pages: 3, width, pageHeight });
    },
  );

  it("crops by percent against the frame", async () => {
    const shape = await frameShape(
      await runWith("crop", { left: 0, top: 0, width: 50, height: 50, unit: "percent" }),
    );

    expect(shape).toEqual({ pages: 3, width: 40, pageHeight: 40 });
  });

  it("rejects a crop taller than one frame with a readable error", async () => {
    // Measured against the strip this fits, so the bounds guard waves it
    // through and libvips dies with "extract_area: bad extract area".
    await expect(runWith("crop", { left: 0, top: 0, width: 80, height: 200 })).rejects.toThrow(
      /exceeds image height/,
    );
  });
});

describe("a setting that needs alpha does not cost the animation (#1083)", () => {
  // GIF carries one bit of alpha, so these settings have to change container.
  // PNG is the natural choice and cannot hold frames, which flattens the
  // animation as silently as the original bug did. WebP has both.
  it.each([
    { toolId: "replace-color", settings: { makeTransparent: true } },
    { toolId: "image-pad", settings: { background: "transparent" } },
  ])("$toolId falls back to WebP rather than PNG", async ({ toolId, settings }) => {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);

    const result = await config.process(
      await gifSource(),
      config.settingsSchema.parse(settings),
      "frames.gif",
    );

    expect(result.contentType).toBe("image/webp");
    expect((await frameShape(result.buffer)).pages).toBe(3);
  });

  it.each([
    { toolId: "replace-color", settings: { makeTransparent: true } },
    { toolId: "image-pad", settings: { background: "transparent" } },
  ])("$toolId still returns PNG for a still", async ({ toolId, settings }) => {
    const config = getToolConfig(toolId);
    if (!config) throw new Error(`${toolId} must be registered`);

    const result = await config.process(
      readFixture(fixtures.image.base.png200),
      config.settingsSchema.parse(settings),
      "test-200x150.png",
    );

    expect(result.contentType).toBe("image/png");
  });
});

describe("converting an animation to a still format does not stack frames (#1083)", () => {
  // Encoding a multi-frame pipeline as JPEG, PNG or AVIF does not drop the
  // extra frames, it writes them as one image `pages` times taller. Opening the
  // input as an animation has to be gated on the output format, not the input.
  it.each(["jpeg", "png", "avif"] as const)(
    "optimize-for-web to %s returns one frame at frame size",
    async (format) => {
      const config = getToolConfig("optimize-for-web");
      if (!config) throw new Error("optimize-for-web must be registered");
      const source = await gifSource();
      const frameHeight = (await frameShape(source)).pageHeight;

      const result = await config.process(
        source,
        config.settingsSchema.parse({ format }),
        "frames.gif",
      );
      const shape = await frameShape(result.buffer);

      expect(shape.pages).toBe(1);
      expect(shape.pageHeight).toBe(frameHeight);
    },
  );
});

describe("PNG-only tools flatten instead of stacking frames (#1083)", () => {
  it.each(PNG_ONLY_TOOLS)("%s returns a single frame at frame size", async (toolId) => {
    const out = await runTool(toolId, await gifSource(), "frames.gif");
    const shape = await frameShape(out);

    // A stacked strip would be three times as tall.
    expect(shape).toEqual({ pages: 1, width: FRAME_SIZE, pageHeight: FRAME_SIZE });
  });
});

describe("rotate handles animation Sharp cannot rotate in one pass (#1083)", () => {
  /** Centre pixel of each frame, as "r,g,b". */
  async function frameCentres(buffer: Buffer): Promise<string[]> {
    const { data, info } = await sharp(buffer, { animated: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const meta = await sharp(buffer, { animated: true }).metadata();
    const pages = meta.pages ?? 1;
    const pageHeight = meta.pageHeight ?? info.height;
    const width = info.width;

    return Array.from({ length: pages }, (_, page) => {
      const y = page * pageHeight + Math.floor(pageHeight / 2);
      const offset = (y * width + Math.floor(width / 2)) * info.channels;
      return `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    });
  }

  async function runRotate(settings: Record<string, unknown>): Promise<Buffer> {
    const config = getToolConfig("rotate");
    if (!config) throw new Error("rotate must be registered");
    const source = readFixture(fixtures.image.animated.gif);
    const result = await config.process(
      source,
      config.settingsSchema.parse(settings),
      "animated.gif",
    );
    return result.buffer;
  }

  it("rotates a non-square animation without flattening it", async () => {
    // A 100x50 frame makes a 90 degree turn visible in the dimensions.
    const source = readFixture(fixtures.image.animated.gif);
    const oblong = await sharp(source, { animated: true }).resize(100, 50).gif().toBuffer();

    const config = getToolConfig("rotate");
    if (!config) throw new Error("rotate must be registered");
    const result = await config.process(
      oblong,
      config.settingsSchema.parse({ angle: 90 }),
      "oblong.gif",
    );

    const shape = await frameShape(result.buffer);
    expect(shape).toEqual({ pages: 3, width: 50, pageHeight: 100 });
  });

  it("keeps frame order when flipping vertically", async () => {
    // Flipping the strip in one pass mirrors it end to end, which plays the
    // animation backwards on top of flipping each frame.
    const before = await frameCentres(readFixture(fixtures.image.animated.gif));
    const after = await frameCentres(await runRotate({ vertical: true }));

    expect(after).toEqual(before);
  });
});

describe("still images are untouched by the animated path (#1083)", () => {
  it("leaves a single-frame PNG as a single frame", async () => {
    const source = readFixture(fixtures.image.base.png200);
    const out = await runTool("compress", source, "test-200x150.png");
    const shape = await frameShape(out);

    expect(shape).toEqual({ pages: 1, width: 200, pageHeight: 150 });
  });
});
