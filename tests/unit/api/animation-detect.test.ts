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
});
