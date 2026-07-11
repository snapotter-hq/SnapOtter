import { describe, expect, it } from "vitest";
import { apngFrameCount } from "../../../apps/api/src/lib/apng.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe("apngFrameCount", () => {
  it("returns null for a non-PNG buffer", () => {
    expect(apngFrameCount(Buffer.from("GIF89a-not-a-png-file"))).toBeNull();
  });

  it("returns 1 for a still PNG (no acTL)", () => {
    expect(apngFrameCount(readFixture(fixtures.image.base.png200))).toBe(1);
  });

  it("returns the frame count for a multi-frame APNG", () => {
    expect(apngFrameCount(readFixture(fixtures.image.animated.apng))).toBe(4);
  });
});
