import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";
import {
  animationFramePixels,
  gifBgWorkloadRejection,
  gifCanvasRejection,
  MAX_GIF_BG_TOTAL_PIXELS,
  MAX_GIF_CANVAS_PIXELS,
  readGifCanvasSize,
} from "../../../apps/api/src/lib/gif-limits.js";

// Pillow, which the animated background-removal sidecar decodes with, sizes a
// GIF by its logical screen (grown to fit any frame placed past it). libvips
// ignores a screen over 2048 on a side and clips frames to it, so a header can
// declare a canvas sharp never sees. These build the GIFs from sharp output and
// patch the header bytes, so there is no binary fixture.

/** A two-frame 2 x 2 animation. */
async function tinyGif(): Promise<Buffer> {
  const frame = (background: string) =>
    sharp({ create: { width: 2, height: 2, channels: 4, background } })
      .png()
      .toBuffer();
  return sharp([await frame("#ff0000"), await frame("#00ff00")], { join: { animated: true } })
    .gif({ loop: 0 })
    .toBuffer();
}

function withScreen(gif: Buffer, width: number, height: number): Buffer {
  const out = Buffer.from(gif);
  out.writeUInt16LE(width, 6);
  out.writeUInt16LE(height, 8);
  return out;
}

/** Move the last frame of the animation to (left, top). */
function withFrameAt(gif: Buffer, left: number, top: number): Buffer {
  const out = Buffer.from(gif);
  for (let i = out.length - 10; i >= 13; i--) {
    if (out[i] === 0x2c && out.readUInt16LE(i + 5) === 2 && out.readUInt16LE(i + 7) === 2) {
      out.writeUInt16LE(left, i + 1);
      out.writeUInt16LE(top, i + 3);
      return out;
    }
  }
  throw new Error("no 2 x 2 image descriptor in the test GIF");
}

const originalMaxMp = env.MAX_MEGAPIXELS;
afterEach(() => {
  env.MAX_MEGAPIXELS = originalMaxMp;
});

describe("readGifCanvasSize", () => {
  it("reads the logical screen of an ordinary GIF", async () => {
    expect(readGifCanvasSize(await tinyGif())).toEqual({ width: 2, height: 2 });
  });

  it("reports the declared screen, not the frame size", async () => {
    expect(readGifCanvasSize(withScreen(await tinyGif(), 13_000, 13_000))).toEqual({
      width: 13_000,
      height: 13_000,
    });
  });

  it("grows the canvas to fit a frame placed past the screen, like Pillow", async () => {
    expect(readGifCanvasSize(withFrameAt(await tinyGif(), 9_000, 40))).toEqual({
      width: 9_002,
      height: 42,
    });
  });

  it("returns null for a buffer that is not a GIF", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    expect(readGifCanvasSize(png)).toBeNull();
  });

  it("keeps what it has read when the block list is truncated", async () => {
    const gif = withScreen(await tinyGif(), 300, 200);
    expect(readGifCanvasSize(gif.subarray(0, 20))).toEqual({ width: 300, height: 200 });
  });
});

describe("gifCanvasRejection", () => {
  it("allows a canvas exactly at the pixel cap when sharp decodes the same size", () => {
    expect(gifCanvasRejection({ width: 8_192, height: 8_192 }, 8_192, 8_192)).toBeNull();
    expect(MAX_GIF_CANVAS_PIXELS).toBe(8_192 * 8_192);
  });

  it("rejects a canvas over the pixel cap even when MAX_MEGAPIXELS is unlimited", () => {
    expect(gifCanvasRejection({ width: 8_193, height: 8_192 }, 8_193, 8_192)).toMatch(
      /over the 67,108,864 pixel limit/,
    );
  });

  it("rejects a side over the dimension cap", () => {
    expect(gifCanvasRejection({ width: 16_384, height: 10 }, 16_384, 10)).toMatch(/pixel limit/);
  });

  it("lets a canvas run past the frames only inside 2048 x 2048", () => {
    expect(gifCanvasRejection({ width: 2_048, height: 2_048 }, 2, 2)).toBeNull();
    expect(gifCanvasRejection({ width: 2_049, height: 2_048 }, 2, 2)).toMatch(
      /larger than its 2 x 2 frames/,
    );
  });
});

describe("validateImageBuffer GIF canvas checks", () => {
  it("accepts an ordinary GIF", async () => {
    await expect(validateImageBuffer(await tinyGif(), "ok.gif")).resolves.toEqual({
      valid: true,
      format: "gif",
      width: 2,
      height: 2,
    });
  });

  it("rejects a 13000 x 13000 logical screen over 2 x 2 frames", async () => {
    const res = await validateImageBuffer(withScreen(await tinyGif(), 13_000, 13_000), "big.gif");
    expect(res).toEqual({
      valid: false,
      reason: "GIF canvas 13000 x 13000 is over the 67,108,864 pixel limit",
    });
  });

  it("rejects a screen under the cap that is far larger than its frames", async () => {
    const res = await validateImageBuffer(withScreen(await tinyGif(), 8_000, 8_000), "big.gif");
    expect(res).toEqual({
      valid: false,
      reason: "GIF canvas 8000 x 8000 is larger than its 2 x 2 frames",
    });
  });

  it("rejects a later frame placed far past a small screen", async () => {
    const res = await validateImageBuffer(withFrameAt(await tinyGif(), 5_000, 5_000), "off.gif");
    expect(res).toEqual({
      valid: false,
      reason: "GIF canvas 5002 x 5002 is larger than its 2 x 2 frames",
    });
  });

  it("applies MAX_MEGAPIXELS to the canvas when it is larger than what sharp decodes", async () => {
    const gif = withFrameAt(await tinyGif(), 1_500, 1_500);
    await expect(validateImageBuffer(gif, "off.gif")).resolves.toMatchObject({
      valid: true,
      width: 2,
      height: 2,
    });
    env.MAX_MEGAPIXELS = 2;
    await expect(validateImageBuffer(gif, "off.gif")).resolves.toEqual({
      valid: false,
      reason: "Image exceeds maximum size: 2.3MP (limit: 2MP)",
    });
  });
});

describe("gifBgWorkloadRejection", () => {
  it("is 16383 squared, sharp's default input pixel limit", () => {
    expect(MAX_GIF_BG_TOTAL_PIXELS).toBe(268_402_689);
  });

  it("allows a workload exactly at the budget and refuses one pixel more", () => {
    expect(gifBgWorkloadRejection(16_383, 16_383)).toBeNull();
    expect(gifBgWorkloadRejection(16_383 * 16_383 + 1, 1)).toMatch(/pixel limit/);
  });

  it("allows 720p at 150 frames and 1080p at 129", () => {
    expect(gifBgWorkloadRejection(1280 * 720, 150)).toBeNull();
    expect(gifBgWorkloadRejection(1920 * 1080, 129)).toBeNull();
  });

  it("refuses 1080p at 130 frames", () => {
    expect(gifBgWorkloadRejection(1920 * 1080, 130)).toMatch(/over the 268,402,689 pixel limit/);
  });

  it("refuses an 8000 x 8000 animation of 150 frames", () => {
    expect(gifBgWorkloadRejection(8000 * 8000, 150)).toBe(
      "Animation is 9,600,000,000 pixels across 150 frames, over the 268,402,689 pixel limit. Use fewer frames or a smaller size.",
    );
  });

  it("counts a still as one frame", () => {
    expect(gifBgWorkloadRejection(8192 * 8192, 0)).toBeNull();
  });
});

describe("animationFramePixels", () => {
  it("uses the GIF canvas when it is larger than what sharp decodes", async () => {
    expect(animationFramePixels(withScreen(await tinyGif(), 300, 200), 2, 2)).toBe(60_000);
  });

  it("uses the decoded size for a non-GIF", () => {
    expect(animationFramePixels(Buffer.from("RIFF0000WEBP"), 640, 480)).toBe(307_200);
  });
});
