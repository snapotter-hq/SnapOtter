/**
 * Per-frame animated output keeps the route's encoder options (#5103).
 *
 * runPerFrame rebuilds the animation from PNG frames and encodes the join
 * itself, so whatever quality the route resolved has to reach that join.
 * Before this, the join used Sharp's WebP default of 80 whatever the route
 * asked for: a still came out at the route's quality and the same image
 * animated did not.
 */

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { runPerFrame } from "../../../apps/api/src/lib/animated-image.js";
import { outputFormatFor } from "../../../apps/api/src/lib/output-format.js";

const SIZE = 64;
const DELAY = [100, 120, 140];

// Noise, so lossy quality has something to throw away. Flat frames compress
// to almost nothing at any quality and would hide the difference.
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

async function noisyWebp(): Promise<Buffer> {
  return await sharp(await noisyFrames(), { join: { across: 1, animated: true } })
    .webp({ lossless: true, delay: DELAY, loop: 0 })
    .toBuffer();
}

const identity = async (frame: Buffer) => frame;

describe("runPerFrame encoder options (#5103)", () => {
  it("encodes animated WebP at the quality the route resolved", async () => {
    const input = await noisyWebp();

    const low = await runPerFrame(input, outputFormatFor("webp", 5), identity);
    const high = await runPerFrame(input, outputFormatFor("webp", 100), identity);

    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect((low as Buffer).length).toBeLessThan((high as Buffer).length);
  });

  it("matches a direct animated encode at that quality, timing included", async () => {
    const input = await noisyWebp();

    const out = await runPerFrame(input, outputFormatFor("webp", 95), identity);
    const expected = await sharp(await noisyFrames(), { join: { across: 1, animated: true } })
      .webp({ quality: 95, delay: DELAY, loop: 0 })
      .toBuffer();

    expect(out?.equals(expected)).toBe(true);
    const meta = await sharp(out as Buffer).metadata();
    expect(meta.pages).toBe(DELAY.length);
    expect(meta.delay).toEqual(DELAY);
  });
});
