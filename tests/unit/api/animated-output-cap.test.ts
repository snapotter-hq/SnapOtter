/**
 * Per-frame animation work is capped on the output side too (#1183).
 *
 * assertGifWorkload bounds what comes in: frame count, per-side size, and
 * total pixels across frames. mapFrames then keeps every transformed frame
 * and hands them all to one animated join, so a tool that grows each frame
 * (image-pad, a border, a text overlay with padding) could retain several
 * times the input cap before anything checked.
 *
 * The real ceiling is 64 Mpx, far too big to build in a unit test, so the
 * image-engine pixel cap is lowered here and the same code paths run on tiny
 * frames.
 */

import { isToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@snapotter/image-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/image-engine")>()),
  // 10,000 pixels in total: three 8x8 frames (192 px) fit, three 64x64 (12,288) do not.
  MAX_RESIZE_OUTPUT_PIXELS: 10_000,
}));

import { runPerFrame } from "../../../apps/api/src/lib/animated-image.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";

async function threeFrameGif(size = 8): Promise<Buffer> {
  // Distinct luminance per frame, or the GIF encoder merges identical frames.
  const frames = await Promise.all(
    [40, 120, 200].map((v) =>
      sharp({
        create: { width: size, height: size, channels: 3, background: { r: v, g: v, b: v } },
      })
        .png()
        .toBuffer(),
    ),
  );
  return sharp(frames, { join: { animated: true } })
    .gif({ delay: [100, 100, 100], loop: 0 })
    .toBuffer();
}

function growTo(size: number) {
  return vi.fn(async (frame: Buffer) =>
    sharp(frame).resize(size, size, { kernel: "nearest" }).png().toBuffer(),
  );
}

describe("runPerFrame output cap (#1183)", () => {
  it("rejects a transform that grows the animation past the pixel cap", async () => {
    const grow = growTo(64);

    const error = await runPerFrame(await threeFrameGif(), "gif", grow).catch((e: unknown) => e);

    expect(isToolInputError(error)).toBe(true);
    expect((error as Error).message).toMatch(/too large \(3 frames at 64x64\)/);
  });

  it("stops after the first frame instead of transforming the rest", async () => {
    const grow = growTo(64);

    await runPerFrame(await threeFrameGif(), "gif", grow).catch(() => undefined);

    expect(grow).toHaveBeenCalledTimes(1);
  });

  it("still rebuilds an animation whose output stays under the cap", async () => {
    const grow = growTo(16); // 3 x 256 = 768 px

    const out = await runPerFrame(await threeFrameGif(), "gif", grow);

    expect(out).toBeDefined();
    const meta = await sharp(out as Buffer).metadata();
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(16);
    // A plain (non-animated) open reports the per-frame height as `height`.
    expect(meta.height).toBe(16);
    expect(grow).toHaveBeenCalledTimes(3);
  });
});

describe("a real per-frame tool hits the output cap as a 400 (#1183)", () => {
  beforeAll(() => {
    registerImagePad({ post: () => undefined } as unknown as FastifyInstance);
  });

  it("refuses image-pad padding that would outgrow the cap", async () => {
    // 3 x 40x40 = 4,800 px in; 50% padding doubles each side, 3 x 80x80 = 19,200 out.
    const pad = getToolConfig("image-pad");
    expect(pad).toBeDefined();
    const settings = pad?.settingsSchema.parse({ target: "1:1", padding: 50 });

    const error = await pad
      ?.process(await threeFrameGif(40), settings, "anim.gif")
      .catch((e: unknown) => e);

    expect(isToolInputError(error)).toBe(true);
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect((error as Error).message).toMatch(/too large/);
  });
});
