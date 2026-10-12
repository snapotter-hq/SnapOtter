import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { processImage } from "../src/engine.js";
import { compress } from "../src/operations/compress.js";
import { convert } from "../src/operations/convert.js";

describe("GIF Palette Reuse", () => {
  it("passes reuse: false for convert", async () => {
    const img = sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    });

    const toFormatSpy = vi.spyOn(img, "toFormat");

    await convert(img, { format: "gif" });

    expect(toFormatSpy).toHaveBeenCalledWith("gif", expect.objectContaining({ reuse: false }));
  });

  it("passes reuse: false for compress", async () => {
    const img = sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    });

    const toFormatSpy = vi.spyOn(img, "toFormat");

    await compress(img, { format: "gif" });

    expect(toFormatSpy).toHaveBeenCalledWith("gif", expect.objectContaining({ reuse: false }));
  });

  it("passes reuse: false for processImage when outputFormat is gif", async () => {
    const buffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .jpeg()
      .toBuffer();

    // Since processImage creates a new sharp instance internally, we can spy on the prototype
    const toFormatSpy = vi.spyOn(sharp.prototype, "toFormat");

    try {
      await processImage(buffer, [], "gif");
      expect(toFormatSpy).toHaveBeenCalledWith("gif", expect.objectContaining({ reuse: false }));
    } finally {
      toFormatSpy.mockRestore();
    }
  });
});
