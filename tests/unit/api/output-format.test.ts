import { describe, expect, it } from "vitest";
import { outputFormatFor, resolveOutputFormat } from "../../../apps/api/src/lib/output-format.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const JPG = readFixture(fixtures.image.base.jpg100);
const PNG = readFixture(fixtures.image.base.png200);
const WEBP = readFixture(fixtures.image.base.webp50);
const GIF = readFixture(fixtures.image.animated.gif);

describe("resolveOutputFormat", () => {
  it("detects JPEG input and returns jpeg config", async () => {
    const result = await resolveOutputFormat(JPG, "photo.jpg");
    expect(result.format).toBe("jpeg");
    expect(result.extension).toBe("jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.quality).toBe(95);
  });

  it("detects PNG input and returns png config with no quality", async () => {
    const result = await resolveOutputFormat(PNG, "image.png");
    expect(result.format).toBe("png");
    expect(result.extension).toBe("png");
    expect(result.contentType).toBe("image/png");
    // Sharp reads `quality` on PNG as "quantise to a palette", so a default
    // quality silently dithered every PNG that passed through (issue #710).
    // Only an explicit override may request that.
    expect(result.quality).toBeUndefined();
  });

  it("detects WebP input and returns webp config", async () => {
    const result = await resolveOutputFormat(WEBP, "image.webp");
    expect(result.format).toBe("webp");
    expect(result.extension).toBe("webp");
    expect(result.contentType).toBe("image/webp");
    expect(result.quality).toBe(95);
  });

  it("falls back to PNG for unknown format", async () => {
    const garbage = Buffer.from("not an image at all");
    const result = await resolveOutputFormat(garbage, "mystery.bin");
    expect(result.format).toBe("png");
    expect(result.extension).toBe("png");
    expect(result.contentType).toBe("image/png");
    // The fallback produces PNG too, so it gets the same lossless treatment.
    expect(result.quality).toBeUndefined();
  });

  it("respects quality override for lossy formats", async () => {
    const result = await resolveOutputFormat(JPG, "photo.jpg", 50);
    expect(result.quality).toBe(50);
  });

  it("accepts quality override for PNG without error", async () => {
    const result = await resolveOutputFormat(PNG, "image.png", 50);
    expect(result.format).toBe("png");
    expect(result.quality).toBe(50);
  });
});

/**
 * Issue #1190: Sharp's GIF writer reuses the palette it read the input with, so
 * a tool that introduces a colour the source never held cannot express it. The
 * whole fix rests on the bag below carrying `reuse: false` for GIF and nothing
 * extra for anything else, and until this existed that contract was observable
 * only by running two dozen tools end to end.
 */
describe("encoderOptions", () => {
  it("asks for a fresh palette when the output is a GIF", async () => {
    const result = await resolveOutputFormat(GIF, "animation.gif");
    expect(result.format).toBe("gif");
    expect(result.encoderOptions).toEqual({ quality: 95, reuse: false });
  });

  it("passes no reuse key to any other encoder", async () => {
    for (const [label, buffer] of [
      ["jpeg", JPG],
      ["png", PNG],
      ["webp", WEBP],
    ] as const) {
      const result = await resolveOutputFormat(buffer, `image.${label}`);
      // Absent, not merely false. The GIF rule leans on every other encoder
      // ignoring keys it does not know, and the narrower the bag stays the less
      // that assumption has to carry.
      expect(Object.keys(result.encoderOptions), label).toEqual(["quality"]);
    }
  });

  it("keeps quality and encoderOptions.quality saying the same thing", async () => {
    for (const buffer of [JPG, PNG, WEBP, GIF]) {
      const result = await resolveOutputFormat(buffer, "image");
      expect(result.encoderOptions.quality).toBe(result.quality);
    }
    const override = await resolveOutputFormat(JPG, "photo.jpg", 50);
    expect(override.encoderOptions.quality).toBe(50);
  });

  it("applies the same rule when a route picks the format itself", () => {
    // The forced-PNG and forced-WebP branches in replace-color and image-pad go
    // through here rather than writing the bag out by hand, which is how the
    // two copies of the quality could drift apart.
    expect(outputFormatFor("gif", 80).encoderOptions).toEqual({ quality: 80, reuse: false });
    expect(outputFormatFor("png")).toMatchObject({
      format: "png",
      extension: "png",
      contentType: "image/png",
      quality: undefined,
      encoderOptions: { quality: undefined },
    });
  });
});
