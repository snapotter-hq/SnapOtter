import { isToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { crop } from "../../../packages/image-engine/src/operations/crop.js";

let png: Buffer;
beforeAll(async () => {
  png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
});

describe("crop validation", () => {
  it("rejects an out-of-bounds crop as a ToolInputError (expected input, not a bug)", async () => {
    let caught: unknown;
    try {
      await crop(sharp(png), { left: 0, top: 0, width: 100, height: 100, unit: "px" });
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(true);
    expect((caught as Error).message).toContain("exceeds image width");
  });

  it("rejects a non-positive crop size as a ToolInputError", async () => {
    let caught: unknown;
    try {
      await crop(sharp(png), { left: 0, top: 0, width: 0, height: 4, unit: "px" });
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(true);
  });

  it("crops a valid region without error", async () => {
    const result = await crop(sharp(png), { left: 0, top: 0, width: 2, height: 2, unit: "px" });
    const meta = await sharp(await result.png().toBuffer()).metadata();
    expect(meta.width).toBe(2);
    expect(meta.height).toBe(2);
  });
});
