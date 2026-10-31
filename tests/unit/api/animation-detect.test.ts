import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { detectAnimation } from "../../../apps/api/src/lib/animation-detect.js";
import { DecoderOutOfMemoryError } from "../../../apps/api/src/lib/format-decoders.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe("detectAnimation", () => {
  it("counts GIF frames via Sharp", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.animated.gif), "animated.gif");
    expect(r.animated).toBe(true);
    expect(r.frames).toBeGreaterThan(1);
  });

  it("counts animated WebP frames via Sharp", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.animated.webp), "animated.webp");
    expect(r.animated).toBe(true);
    expect(r.frames).toBeGreaterThan(1);
  });

  it("counts APNG frames via the acTL chunk", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.animated.apng), "animated.apng");
    expect(r.animated).toBe(true);
    expect(r.frames).toBe(4);
  });

  it("treats a still PNG as not animated", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.base.png200), "still.png");
    expect(r.animated).toBe(false);
    expect(r.frames).toBe(1);
  });

  it("detects animated GIF and WebP buffers even when the filename extension is .png (#3047)", async () => {
    const gif = await detectAnimation(readFixture(fixtures.image.animated.gif), "upload.png");
    expect(gif.animated).toBe(true);
    expect(gif.frames).toBeGreaterThan(1);

    const webp = await detectAnimation(readFixture(fixtures.image.animated.webp), "upload.png");
    expect(webp.animated).toBe(true);
    expect(webp.frames).toBeGreaterThan(1);
  });

  it("detects APNG frames from magic bytes even when the filename extension is .gif (#3047)", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.animated.apng), "upload.gif");
    expect(r.animated).toBe(true);
    expect(r.frames).toBe(4);
  });

  it("treats a multi-page TIFF as not animated (#3047)", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.multipageTiff), "multipage.tiff");
    expect(r.animated).toBe(false);
    expect(r.frames).toBe(1);
  });

  it("treats a still WebP as not animated and does not require a filename (#3047)", async () => {
    const r = await detectAnimation(readFixture(fixtures.image.formats("webp")));
    expect(r.animated).toBe(false);
    expect(r.frames).toBe(1);
  });

  it("rethrows DecoderOutOfMemoryError when sharp metadata hits V8 OOM and leaves non-OOM errors untouched (#3812)", async () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    const corruptErr = new Error("Input buffer has corrupt header: gifload");
    const metaSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(v8Oom)
      .mockRejectedValueOnce(corruptErr);
    try {
      const err = await detectAnimation(
        readFixture(fixtures.image.animated.gif),
        "animated.gif",
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DecoderOutOfMemoryError);
      expect(err).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });

      const nonOom = await detectAnimation(
        readFixture(fixtures.image.animated.gif),
        "animated.gif",
      ).catch((e: unknown) => e);
      expect(nonOom).toBe(corruptErr);
    } finally {
      metaSpy.mockRestore();
    }
  });
});
