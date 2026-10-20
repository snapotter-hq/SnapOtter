import { describe, expect, it } from "vitest";
import { detectAnimation } from "../../../apps/api/src/lib/animation-detect.js";
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
});
