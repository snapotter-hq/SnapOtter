import { describe, expect, it } from "vitest";
import { canvasFor } from "../../../apps/api/src/routes/tools/aspect-pad.js";

describe("canvasFor", () => {
  it("wide source into tall ratio (landscape into 9:16)", () => {
    // 1920x1080 into 9:16
    const { cw, ch } = canvasFor(1920, 1080, 9, 16);
    // Source is wider than 9:16, so height expands: ch = round(1920*16/9) = 3414 (even: 3414)
    // cw stays 1920 (even)
    expect(cw % 2).toBe(0);
    expect(ch % 2).toBe(0);
    expect(cw).toBe(1920);
    expect(ch).toBe(Math.round((1920 * 16) / 9) + (Math.round((1920 * 16) / 9) % 2));
  });

  it("tall source into wide ratio (portrait into 16:9)", () => {
    // 1080x1920 into 16:9
    const { cw, ch } = canvasFor(1080, 1920, 16, 9);
    // Source is taller than 16:9, so width expands: cw = round(1920*16/9) = 3414 (even: 3414)
    // ch stays 1920 (even)
    expect(cw % 2).toBe(0);
    expect(ch % 2).toBe(0);
    expect(ch).toBe(1920);
    expect(cw).toBe(Math.round((1920 * 16) / 9) + (Math.round((1920 * 16) / 9) % 2));
  });

  it("already matching ratio returns same-ish dims (both even)", () => {
    const { cw, ch } = canvasFor(1920, 1080, 16, 9);
    expect(cw % 2).toBe(0);
    expect(ch % 2).toBe(0);
    expect(cw).toBe(1920);
    expect(ch).toBe(1080);
  });

  it("odd-dim source gets even output", () => {
    const { cw, ch } = canvasFor(101, 101, 1, 1);
    expect(cw % 2).toBe(0);
    expect(ch % 2).toBe(0);
    // 101 is odd, so cw should be 102
    expect(cw).toBe(102);
    expect(ch).toBe(102);
  });

  it("small source into 4:3", () => {
    const { cw, ch } = canvasFor(64, 48, 4, 3);
    expect(cw % 2).toBe(0);
    expect(ch % 2).toBe(0);
    expect(cw).toBe(64);
    expect(ch).toBe(48);
  });
});
