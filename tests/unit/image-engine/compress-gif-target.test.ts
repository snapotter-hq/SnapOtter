import { createRequire } from "node:module";
import path from "node:path";
import { ToolInputError } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Target-size compression on GIF (#1183). Sharp's GIF encoder has no quality
 * setting, so the quality binary search re-encoded the same bytes up to seven
 * times per size step: 64 full animated encodes to give up on a 30-frame GIF.
 * GIF now gets one encode per size step, with the same results.
 */

// Counts toBuffer() calls made through the engine's own `import sharp`. The
// test's `require("sharp")` below resolves image-engine's own install, a
// different copy from the one the engine imports, so its calls don't count.
const encodes = vi.hoisted(() => ({ n: 0 }));
vi.mock("sharp", async (importOriginal) => {
  type Instance = { toBuffer: (...args: unknown[]) => unknown };
  const real = ((await importOriginal()) as { default: (...args: unknown[]) => Instance }).default;
  const counted = (...args: unknown[]) => {
    const instance = real(...args);
    const toBuffer = instance.toBuffer.bind(instance);
    instance.toBuffer = (...a: unknown[]) => {
      encodes.n++;
      return toBuffer(...a);
    };
    return instance;
  };
  Object.assign(counted, real);
  return { default: counted };
});

// sharp is only installed in the image-engine package, so resolve it from there
const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;

import { compressDetailed } from "@snapotter/image-engine";

/** Noise frames barely compress, so a small target forces the downscale path. */
async function noisyGif(size: number, frames: number): Promise<Buffer> {
  let seed = 1234567;
  const pages = await Promise.all(
    Array.from({ length: frames }, () => {
      const raw = Buffer.alloc(size * size * 3);
      for (let i = 0; i < raw.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed & 0xff;
      }
      return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toBuffer();
    }),
  );
  if (pages.length === 1) return sharp(pages[0]).gif().toBuffer();
  return sharp(pages, { join: { animated: true } })
    .gif({ delay: pages.map(() => 100), loop: 0 })
    .toBuffer();
}

beforeEach(() => {
  encodes.n = 0;
});

describe("GIF target-size compression (#1183)", () => {
  it("rests on Sharp's GIF encoder ignoring quality", async () => {
    // If Sharp ever grows a GIF quality knob, this fails and the search should come back.
    const gif = await noisyGif(24, 3);
    const low = await sharp(gif, { animated: true }).toFormat("gif", { quality: 1 }).toBuffer();
    const high = await sharp(gif, { animated: true }).toFormat("gif", { quality: 100 }).toBuffer();
    expect(low.equals(high)).toBe(true);
  });

  it("encodes once per size step instead of searching quality", async () => {
    const gif = await noisyGif(64, 3);

    await expect(
      compressDetailed(sharp(gif, { animated: true }), {
        targetSizeBytes: 64,
        format: "gif",
        animated: true,
      }),
    ).rejects.toBeInstanceOf(ToolInputError);

    // 1 full-size try plus at most 8 downscale steps.
    expect(encodes.n).toBeGreaterThan(0);
    expect(encodes.n).toBeLessThanOrEqual(9);
  });

  it("applies to a still GIF too", async () => {
    const still = await noisyGif(64, 1);

    await expect(
      compressDetailed(sharp(still), { targetSizeBytes: 64, format: "gif" }),
    ).rejects.toBeInstanceOf(ToolInputError);

    expect(encodes.n).toBeGreaterThan(0);
    expect(encodes.n).toBeLessThanOrEqual(9);
  });

  it("still reports no resize when the full-size GIF already fits", async () => {
    const gif = await noisyGif(32, 3);

    const result = await compressDetailed(sharp(gif, { animated: true }), {
      targetSizeBytes: gif.length * 2,
      format: "gif",
      animated: true,
    });

    expect(result.resizedTo).toBeUndefined();
    const out = await result.image.toBuffer();
    expect(out.length).toBeLessThanOrEqual(gif.length * 2);
    expect((await sharp(out).metadata()).pages).toBe(3);
  });

  it("still downscales a GIF that doesn't fit, keeping every frame", async () => {
    const gif = await noisyGif(64, 3);
    const target = Math.round(gif.length / 3);

    const result = await compressDetailed(sharp(gif, { animated: true }), {
      targetSizeBytes: target,
      format: "gif",
      animated: true,
    });

    expect(result.resizedTo).toBeDefined();
    const out = await result.image.toBuffer();
    expect(out.length).toBeLessThanOrEqual(target);
    const meta = await sharp(out).metadata();
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(result.resizedTo?.width);
  });

  it("keeps the quality search for animated WebP, where quality matters", async () => {
    const webp = await sharp(await noisyGif(64, 3), { animated: true })
      .webp({ quality: 90 })
      .toBuffer();

    await compressDetailed(sharp(webp, { animated: true }), {
      targetSizeBytes: Math.round(webp.length / 2),
      format: "webp",
      animated: true,
    }).catch(() => undefined);

    // A binary search over 1..100 takes several encodes before it settles.
    expect(encodes.n).toBeGreaterThan(3);
  });
});
