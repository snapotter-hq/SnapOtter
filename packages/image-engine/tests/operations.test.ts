import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { processImage } from "../src/engine.js";
import { detectFormat } from "../src/formats/detect.js";
import { brightness } from "../src/operations/brightness.js";
import { colorBlindness } from "../src/operations/color-blindness.js";
import { colorChannels } from "../src/operations/color-channels.js";
import { compress } from "../src/operations/compress.js";
import { contrast } from "../src/operations/contrast.js";
import { convert } from "../src/operations/convert.js";
import { crop } from "../src/operations/crop.js";
import { editMetadata } from "../src/operations/edit-metadata.js";
import { flip } from "../src/operations/flip.js";
import { grayscale } from "../src/operations/grayscale.js";
import { invert } from "../src/operations/invert.js";
import { resize } from "../src/operations/resize.js";
import { rotate } from "../src/operations/rotate.js";
import { saturation } from "../src/operations/saturation.js";
import { sepia } from "../src/operations/sepia.js";
import { stripMetadata } from "../src/operations/strip-metadata.js";
import type { OutputFormat, Sharp, SharpFormat } from "../src/types.js";
import { getImageInfo } from "../src/utils/metadata.js";
import { extToMime, formatToExt, formatToMime, mimeToExt } from "../src/utils/mime.js";
import {
  applyRecombMatrix,
  type Matrix3x3,
  multiplyMatrix3x3,
  readRecombMatrix,
} from "../src/utils/recomb.js";

// Generate a 100x100 red PNG buffer for testing
let testBuffer: Buffer;
let testImage: () => Sharp;

const SHARP_FORMAT_CASES = [
  { sharpFormat: "webp", operationFormat: "webp", expectedFormat: "webp" },
  { sharpFormat: "avif", operationFormat: "avif", expectedFormat: "avif" },
  { sharpFormat: "png", operationFormat: "png", expectedFormat: "png" },
  { sharpFormat: "jpeg", operationFormat: "jpg", expectedFormat: "jpeg" },
] as const satisfies ReadonlyArray<{
  sharpFormat: SharpFormat;
  operationFormat: OutputFormat;
  expectedFormat: string;
}>;

function tinyTestImage(): Sharp {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  });
}

async function expectOutputFormat(buffer: Buffer, expectedFormat: string): Promise<void> {
  const meta = await sharp(buffer).metadata();
  const format = meta.format === "heif" ? "avif" : meta.format;
  expect(format).toBe(expectedFormat);
}

beforeAll(async () => {
  testBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  testImage = () => sharp(testBuffer);
});

describe("resize", () => {
  it("should resize to 50x50", async () => {
    const result = await resize(testImage(), { width: 50, height: 50 });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it("should resize by percentage", async () => {
    const result = await resize(testImage(), { percentage: 50 });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it("should throw on zero width", async () => {
    await expect(resize(testImage(), { width: 0 })).rejects.toThrow();
  });

  it("should throw when no dimensions provided", async () => {
    await expect(resize(testImage(), {})).rejects.toThrow();
  });
});

describe("crop", () => {
  it("should crop 25x25 at (10,10)", async () => {
    const result = await crop(testImage(), {
      left: 10,
      top: 10,
      width: 25,
      height: 25,
    });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(25);
    expect(meta.height).toBe(25);
  });

  it("should throw on out-of-bounds crop", async () => {
    await expect(crop(testImage(), { left: 90, top: 90, width: 20, height: 20 })).rejects.toThrow();
  });

  it("should throw on zero dimensions", async () => {
    await expect(crop(testImage(), { left: 0, top: 0, width: 0, height: 10 })).rejects.toThrow();
  });
});

describe("rotate", () => {
  it("should rotate 90 degrees and swap dimensions", async () => {
    // Create a non-square image to verify dimension swap
    const rectBuffer = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await rotate(sharp(rectBuffer), { angle: 90 });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(100);
  });

  it("should rotate non-90 angle with background", async () => {
    const result = await rotate(testImage(), {
      angle: 45,
      background: "#FF0000",
    });
    const meta = await result.metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });
});

describe("flip", () => {
  it("should flip horizontally without error", async () => {
    const result = await flip(testImage(), { horizontal: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should flip vertically without error", async () => {
    const result = await flip(testImage(), { vertical: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should flip both directions", async () => {
    const result = await flip(testImage(), { horizontal: true, vertical: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should throw when neither direction specified", async () => {
    await expect(flip(testImage(), {})).rejects.toThrow();
  });
});

describe("convert", () => {
  it("should convert to webp", async () => {
    const result = await convert(testImage(), { format: "webp" });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("webp");
  });

  it("should convert to jpg with quality", async () => {
    const result = await convert(testImage(), { format: "jpg", quality: 80 });
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("should throw on invalid quality", async () => {
    await expect(convert(testImage(), { format: "png", quality: 0 })).rejects.toThrow();
  });
});

describe("compress", () => {
  it("should compress at quality 50 and produce smaller output", async () => {
    // Use a larger image for better compression ratio visibility
    const largeBuffer = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 255, g: 128, b: 0 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const result = await compress(sharp(largeBuffer), {
      quality: 50,
      format: "jpg",
    });
    const buf = await result.toBuffer();
    expect(buf.length).toBeLessThan(largeBuffer.length);
  });

  it("should throw on invalid quality", async () => {
    await expect(compress(testImage(), { quality: 0 })).rejects.toThrow();
  });

  it("should compress to target size", async () => {
    const largeBuffer = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 255, g: 128, b: 0 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const targetSize = Math.round(largeBuffer.length * 0.5);
    const result = await compress(sharp(largeBuffer), {
      targetSizeBytes: targetSize,
      format: "jpg",
    });
    const buf = await result.toBuffer();
    // Should be reasonably close to target (within 50% tolerance for small images)
    expect(buf.length).toBeLessThan(largeBuffer.length);
  });
});

describe("sharp format compatibility", () => {
  it.each(SHARP_FORMAT_CASES)(
    "convert accepts $sharpFormat",
    async ({ operationFormat, expectedFormat }) => {
      const result = await convert(tinyTestImage(), { format: operationFormat });
      const buf = await result.toBuffer();
      await expectOutputFormat(buf, expectedFormat);
    },
  );

  it.each(SHARP_FORMAT_CASES)(
    "compress accepts $sharpFormat",
    async ({ operationFormat, expectedFormat }) => {
      const result = await compress(tinyTestImage(), { quality: 80, format: operationFormat });
      const buf = await result.toBuffer();
      await expectOutputFormat(buf, expectedFormat);
    },
  );
});

describe("grayscale", () => {
  it("should convert to grayscale", async () => {
    const result = await grayscale(testImage());
    const buf = await result.toBuffer();
    const meta = await sharp(buf).metadata();
    // Grayscale PNG may still report channels as 3 or 1 depending on output
    expect(buf.length).toBeGreaterThan(0);
    // The image should have no color variation
    expect(meta.width).toBe(100);
  });
});

describe("sepia", () => {
  it("should apply sepia tone without error", async () => {
    const result = await sepia(testImage());
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });
});

describe("invert", () => {
  it("should invert colors without error", async () => {
    const result = await invert(testImage());
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should preserve alpha on 4-channel RGBA input (#3132)", async () => {
    const rgbaBuf = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const result = await invert(sharp(rgbaBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([155, 205, 235, 255]);
  });
});

describe("brightness", () => {
  it("should adjust brightness +50 without error", async () => {
    const result = await brightness(testImage(), { value: 50 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should throw on out-of-range value", async () => {
    await expect(brightness(testImage(), { value: 150 })).rejects.toThrow();
  });
});

describe("contrast", () => {
  it("should adjust contrast +50 without error", async () => {
    const result = await contrast(testImage(), { value: 50 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should throw on out-of-range value", async () => {
    await expect(contrast(testImage(), { value: -150 })).rejects.toThrow();
  });
});

describe("saturation", () => {
  it("should adjust saturation -50 without error", async () => {
    const result = await saturation(testImage(), { value: -50 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should throw on out-of-range value", async () => {
    await expect(saturation(testImage(), { value: 200 })).rejects.toThrow();
  });
});

describe("colorChannels", () => {
  it("should adjust color channels without error", async () => {
    const result = await colorChannels(testImage(), {
      red: 150,
      green: 100,
      blue: 50,
    });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("should throw on out-of-range values", async () => {
    await expect(colorChannels(testImage(), { red: 250, green: 100, blue: 100 })).rejects.toThrow();
  });
});

describe("stripMetadata", () => {
  it("should strip metadata without error", async () => {
    const result = await stripMetadata(testImage());
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });
});

describe("processImage (engine)", () => {
  it("should apply multiple operations in sequence", async () => {
    const result = await processImage(
      testBuffer,
      [
        { type: "resize", options: { width: 50, height: 50 } },
        { type: "grayscale", options: {} },
      ],
      "png",
    );

    expect(result.info.width).toBe(50);
    expect(result.info.height).toBe(50);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("should throw on unknown operation", async () => {
    await expect(processImage(testBuffer, [{ type: "unknown-op", options: {} }])).rejects.toThrow(
      "Unknown operation",
    );
  });

  it("should convert output format", async () => {
    const result = await processImage(testBuffer, [], "webp");
    expect(result.info.format).toBe("webp");
  });

  it("should compose consecutive recomb matrices in processImage and direct calls (#3121)", async () => {
    const gray = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const viaEngine = await processImage(gray, [
      { type: "color-channels", options: { red: 0, green: 100, blue: 100 } },
      { type: "sepia", options: {} },
    ]);
    const engineRaw = await sharp(viaEngine.buffer).raw().toBuffer();
    expect([engineRaw[0], engineRaw[1], engineRaw[2]]).toEqual([122, 109, 85]);

    const directBuf = await (
      await sepia(await colorChannels(sharp(gray), { red: 0, green: 100, blue: 100 }))
    )
      .png()
      .toBuffer();
    const directRaw = await sharp(directBuf).raw().toBuffer();
    expect([directRaw[0], directRaw[1], directRaw[2]]).toEqual([122, 109, 85]);

    const directCbBuf = await (
      await colorBlindness(await colorChannels(sharp(gray), { red: 0, green: 150, blue: 100 }), {
        type: "deuteranopia",
      })
    )
      .png()
      .toBuffer();
    const directCbRaw = await sharp(directCbBuf).raw().toBuffer();
    expect([directCbRaw[0], directCbRaw[1], directCbRaw[2]]).toEqual([136, 135, 132]);

    // Consecutive recomb operations compose in float without intermediate 8-bit clamping:
    // 200 * 2.0 = 400 in float, then * 0.5 = 200 (whereas materializing would clamp 400 -> 255 -> 128).
    const warm = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();
    const unclampedFloatRecomb = await processImage(warm, [
      { type: "color-channels", options: { red: 200, green: 100, blue: 100 } },
      { type: "color-channels", options: { red: 50, green: 100, blue: 100 } },
    ]);
    const unclampedRaw = await sharp(unclampedFloatRecomb.buffer).raw().toBuffer();
    expect([unclampedRaw[0], unclampedRaw[1], unclampedRaw[2]]).toEqual([200, 100, 50]);
  });

  it("should materialize between conflicting pipeline stages in processImage (#3121)", async () => {
    const sample = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 100, g: 50, b: 20 } },
    })
      .png()
      .toBuffer();

    const invThenSepia = await processImage(sample, [
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
    ]);
    const invSepiaRaw = await sharp(invThenSepia.buffer).raw().toBuffer();
    expect([invSepiaRaw[0], invSepiaRaw[1], invSepiaRaw[2]]).toEqual([255, 234, 182]);

    const sepiaThenInv = await processImage(sample, [
      { type: "sepia", options: {} },
      { type: "invert", options: {} },
    ]);
    const sepiaInvRaw = await sharp(sepiaThenInv.buffer).raw().toBuffer();
    expect([sepiaInvRaw[0], sepiaInvRaw[1], sepiaInvRaw[2]]).toEqual([174, 183, 199]);

    // Double invert must cancel out instead of collapsing to a single negate slot
    const doubleInvert = await processImage(sample, [
      { type: "invert", options: {} },
      { type: "invert", options: {} },
    ]);
    const doubleInvRaw = await sharp(doubleInvert.buffer).raw().toBuffer();
    expect([doubleInvRaw[0], doubleInvRaw[1], doubleInvRaw[2]]).toEqual([100, 50, 20]);

    // Pre-recomb modulate/linear/sharpen stages materialize before recomb so sepia runs last
    const desatThenSepia = await processImage(sample, [
      { type: "saturation", options: { value: -100 } },
      { type: "sepia", options: {} },
    ]);
    const desatSepiaRaw = await sharp(desatThenSepia.buffer).raw().toBuffer();
    expect(desatSepiaRaw[0]).toBeGreaterThan(desatSepiaRaw[1]);
    expect(desatSepiaRaw[1]).toBeGreaterThan(desatSepiaRaw[2]);

    const flatContrastThenSepia = await processImage(sample, [
      { type: "contrast", options: { value: -100 } },
      { type: "sepia", options: {} },
    ]);
    const flatContrastSepiaRaw = await sharp(flatContrastThenSepia.buffer).raw().toBuffer();
    expect([flatContrastSepiaRaw[0], flatContrastSepiaRaw[1], flatContrastSepiaRaw[2]]).toEqual([
      172, 153, 119,
    ]);

    const brightSample = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();
    const brightThenSepia = await processImage(brightSample, [
      { type: "brightness", options: { value: 100 } },
      { type: "sepia", options: {} },
    ]);
    const brightSepiaRaw = await sharp(brightThenSepia.buffer).raw().toBuffer();
    expect([brightSepiaRaw[0], brightSepiaRaw[1], brightSepiaRaw[2]]).toEqual([255, 255, 226]);

    // Spatial sharpen / high-pass on an 8x8 image with a bright red 4x4 center square
    const edgeData = Buffer.alloc(8 * 8 * 3, 0);
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        edgeData[(y * 8 + x) * 3] = 200;
      }
    }
    const edgePng = await sharp(edgeData, { raw: { width: 8, height: 8, channels: 3 } })
      .png()
      .toBuffer();
    const cornerOffset = (2 * 8 + 2) * 3;

    const sharpenThenSepia = await processImage(edgePng, [
      { type: "sharpen", options: { value: 50 } },
      { type: "sepia", options: {} },
    ]);
    const sharpenSepiaRaw = await sharp(sharpenThenSepia.buffer).raw().toBuffer();
    expect([
      sharpenSepiaRaw[cornerOffset],
      sharpenSepiaRaw[cornerOffset + 1],
      sharpenSepiaRaw[cornerOffset + 2],
    ]).toEqual([136, 121, 94]);

    const recombThenHp = await processImage(edgePng, [
      { type: "color-channels", options: { red: 50, green: 100, blue: 100 } },
      { type: "sharpen-advanced", options: { method: "high-pass", strength: 50, kernelSize: 3 } },
    ]);
    const recombHpRaw = await sharp(recombThenHp.buffer).raw().toBuffer();
    expect(recombHpRaw[cornerOffset]).toBe(200);
  });

  it("should preserve selective metadata and format across stage materialization (#3121)", async () => {
    const jpgWithIccAndExif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 100, g: 50, b: 20 } },
    })
      .withExif({ IFD0: { Artist: "OrigArtist", Software: "OrigSoft" } })
      .withIccProfile("srgb")
      .jpeg({ quality: 100 })
      .toBuffer();

    const stripBeforeMaterialize = await processImage(jpgWithIccAndExif, [
      { type: "strip-metadata", options: { stripExif: true, stripIcc: false } },
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
    ]);
    expect(stripBeforeMaterialize.info.format).toBe("jpeg");
    const meta1 = await sharp(stripBeforeMaterialize.buffer).metadata();
    expect(meta1.exif).toBeUndefined();
    expect(meta1.icc).toBeDefined();

    const stripExifBeforeEdit = await processImage(jpgWithIccAndExif, [
      { type: "strip-metadata", options: { stripExif: true, stripIcc: false } },
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
      { type: "edit-metadata", options: { fieldsToRemove: ["Software"] } },
    ]);
    const metaStripExifEdit = await sharp(stripExifBeforeEdit.buffer).metadata();
    expect(metaStripExifEdit.exif?.toString("latin1") ?? "").not.toContain("OrigArtist");
    expect(metaStripExifEdit.icc).toBeDefined();

    const stripAllBeforeEdit = await processImage(jpgWithIccAndExif, [
      { type: "strip-metadata", options: { stripAll: true } },
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
      { type: "edit-metadata", options: { copyright: "2026 Otter" } },
    ]);
    const metaStripAll = await sharp(stripAllBeforeEdit.buffer).metadata();
    expect(metaStripAll.exif?.toString("latin1")).toContain("2026 Otter");
    expect(metaStripAll.exif?.toString("latin1")).not.toContain("OrigArtist");

    const editAfterMaterialize = await processImage(jpgWithIccAndExif, [
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
      { type: "edit-metadata", options: { copyright: "2026 Otter" } },
    ]);
    expect(editAfterMaterialize.info.format).toBe("jpeg");
    const meta2 = await sharp(editAfterMaterialize.buffer).metadata();
    expect(meta2.exif?.toString("latin1")).toContain("OrigArtist");
    expect(meta2.exif?.toString("latin1")).toContain("2026 Otter");

    const compressAfterMaterialize = await processImage(jpgWithIccAndExif, [
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
      { type: "compress", options: { quality: 40 } },
    ]);
    expect(compressAfterMaterialize.info.format).toBe("jpeg");

    const noisyPng = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();
    const [lowQBefore, highQBefore, lowQAfter, highQAfter] = await Promise.all([
      processImage(noisyPng, [
        { type: "convert", options: { format: "jpg", quality: 10 } },
        { type: "invert", options: {} },
        { type: "sepia", options: {} },
      ]),
      processImage(noisyPng, [
        { type: "convert", options: { format: "jpg", quality: 95 } },
        { type: "invert", options: {} },
        { type: "sepia", options: {} },
      ]),
      processImage(noisyPng, [
        { type: "invert", options: {} },
        { type: "sepia", options: {} },
        { type: "convert", options: { format: "jpg", quality: 10 } },
      ]),
      processImage(noisyPng, [
        { type: "invert", options: {} },
        { type: "sepia", options: {} },
        { type: "convert", options: { format: "jpg", quality: 95 } },
      ]),
    ]);
    expect(lowQBefore.buffer.length).toBeLessThan(highQBefore.buffer.length);
    expect(lowQAfter.buffer.length).toBeLessThan(highQAfter.buffer.length);
  });

  it("should isolate repeated non-recomb adjustments, out-of-order C++ stages, and geometry chains (#3151)", async () => {
    const sample = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 100, g: 50, b: 20 } },
    })
      .png()
      .toBuffer();

    // 1. Same-slot overwrites: saturation -> saturation, brightness -> brightness, contrast -> contrast
    const desatThenBoost = await processImage(sample, [
      { type: "saturation", options: { value: -100 } },
      { type: "saturation", options: { value: 100 } },
    ]);
    const desatBoostRaw = await sharp(desatThenBoost.buffer).raw().toBuffer();
    expect([desatBoostRaw[0], desatBoostRaw[1], desatBoostRaw[2]]).toEqual([64, 64, 64]);

    const satThenNoop = await processImage(sample, [
      { type: "saturation", options: { value: -100 } },
      { type: "saturation", options: { value: 0 } },
    ]);
    const satNoopRaw = await sharp(satThenNoop.buffer).raw().toBuffer();
    expect([satNoopRaw[0], satNoopRaw[1], satNoopRaw[2]]).toEqual([64, 64, 64]);

    const darkThenBright = await processImage(sample, [
      { type: "brightness", options: { value: -100 } },
      { type: "brightness", options: { value: 100 } },
    ]);
    const darkBrightRaw = await sharp(darkThenBright.buffer).raw().toBuffer();
    // L=0 in LCH on rgb(100, 50, 20) clamps to [44, 0, 0], then brightness +100 -> [54, 12, 16] (not overwritten [174, 114, 80])
    expect([darkBrightRaw[0], darkBrightRaw[1], darkBrightRaw[2]]).toEqual([54, 12, 16]);

    const brightThenNoop = await processImage(sample, [
      { type: "brightness", options: { value: 100 } },
      { type: "brightness", options: { value: 0 } },
    ]);
    const brightNoopRaw = await sharp(brightThenNoop.buffer).raw().toBuffer();
    expect([brightNoopRaw[0], brightNoopRaw[1], brightNoopRaw[2]]).toEqual([174, 114, 80]);

    const flatThenBoostContrast = await processImage(sample, [
      { type: "contrast", options: { value: -100 } },
      { type: "contrast", options: { value: 100 } },
    ]);
    const flatBoostRaw = await sharp(flatThenBoostContrast.buffer).raw().toBuffer();
    expect([flatBoostRaw[0], flatBoostRaw[1], flatBoostRaw[2]]).toEqual([128, 128, 128]);

    // 2. Out-of-order C++ stage execution: contrast -> brightness, contrast -> saturation,
    // brightness -> grayscale, saturation -> grayscale, brightness <-> saturation
    const contrastThenBright = await processImage(sample, [
      { type: "contrast", options: { value: -100 } },
      { type: "brightness", options: { value: 100 } },
    ]);
    const contrastBrightRaw = await sharp(contrastThenBright.buffer).raw().toBuffer();
    expect([contrastBrightRaw[0], contrastBrightRaw[1], contrastBrightRaw[2]]).toEqual([
      255, 255, 255,
    ]);

    const contrastThenSat = await processImage(sample, [
      { type: "contrast", options: { value: -100 } },
      { type: "saturation", options: { value: 100 } },
    ]);
    const contrastSatRaw = await sharp(contrastThenSat.buffer).raw().toBuffer();
    expect([contrastSatRaw[0], contrastSatRaw[1], contrastSatRaw[2]]).toEqual([128, 128, 128]);

    const warmSample = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 20 } },
    })
      .png()
      .toBuffer();

    const brightThenGray = await processImage(warmSample, [
      { type: "brightness", options: { value: 100 } },
      { type: "grayscale", options: {} },
    ]);
    const brightGrayRaw = await sharp(brightThenGray.buffer).raw().toBuffer();
    expect([brightGrayRaw[0], brightGrayRaw[1], brightGrayRaw[2]]).toEqual([196, 196, 196]);

    const satThenGray = await processImage(warmSample, [
      { type: "saturation", options: { value: 100 } },
      { type: "grayscale", options: {} },
    ]);
    const satGrayRaw = await sharp(satThenGray.buffer).raw().toBuffer();
    expect([satGrayRaw[0], satGrayRaw[1], satGrayRaw[2]]).toEqual([127, 127, 127]);

    const brightThenDesat = await processImage(warmSample, [
      { type: "brightness", options: { value: 100 } },
      { type: "saturation", options: { value: -100 } },
    ]);
    const desatThenBright = await processImage(warmSample, [
      { type: "saturation", options: { value: -100 } },
      { type: "brightness", options: { value: 100 } },
    ]);
    const brightDesatRaw = await sharp(brightThenDesat.buffer).raw().toBuffer();
    const desatBrightRaw = await sharp(desatThenBright.buffer).raw().toBuffer();
    expect([brightDesatRaw[0], brightDesatRaw[1], brightDesatRaw[2]]).toEqual([196, 196, 196]);
    expect([desatBrightRaw[0], desatBrightRaw[1], desatBrightRaw[2]]).toEqual([228, 228, 228]);

    // 3. Spatial sharpen & sharpen-advanced stage isolation
    const edgeData = Buffer.alloc(8 * 8 * 3, 0);
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        edgeData[(y * 8 + x) * 3] = 200;
      }
    }
    const edgePng = await sharp(edgeData, { raw: { width: 8, height: 8, channels: 3 } })
      .png()
      .toBuffer();

    const contrastFlatThenSharpen = await processImage(edgePng, [
      { type: "contrast", options: { value: -100 } },
      { type: "sharpen", options: { value: 80 } },
    ]);
    const flatSharpenRaw = await sharp(contrastFlatThenSharpen.buffer).raw().toBuffer();
    expect(Array.from(flatSharpenRaw.subarray(0, 12))).toEqual(new Array(12).fill(128));

    const contrastFlatThenDenoise = await processImage(edgePng, [
      { type: "contrast", options: { value: -100 } },
      {
        type: "sharpen-advanced",
        options: { method: "adaptive", denoise: "medium", sigma: 2 },
      },
    ]);
    const flatDenoiseRaw = await sharp(contrastFlatThenDenoise.buffer).raw().toBuffer();
    expect(Array.from(flatDenoiseRaw.subarray(0, 12))).toEqual(new Array(12).fill(128));

    // brightness (+100, STAGE_MODULATE = 5) before sharpen-advanced with denoise (STAGE_MEDIAN = 2)
    // clamps a [180, 180, 180] impulse surrounded by [255, 255, 255] to 255 before median/sharpen
    const impulseData = Buffer.alloc(8 * 8 * 3, 255);
    const centerIdx = (4 * 8 + 4) * 3;
    impulseData[centerIdx] = 180;
    impulseData[centerIdx + 1] = 180;
    impulseData[centerIdx + 2] = 180;
    const impulsePng = await sharp(impulseData, { raw: { width: 8, height: 8, channels: 3 } })
      .png()
      .toBuffer();
    const brightThenDenoise = await processImage(impulsePng, [
      { type: "brightness", options: { value: 100 } },
      {
        type: "sharpen-advanced",
        options: { method: "adaptive", denoise: "light", sigma: 1 },
      },
    ]);
    const brightDenoiseRaw = await sharp(brightThenDenoise.buffer).raw().toBuffer();
    expect([
      brightDenoiseRaw[centerIdx],
      brightDenoiseRaw[centerIdx + 1],
      brightDenoiseRaw[centerIdx + 2],
    ]).toEqual([255, 255, 255]);

    const hpThenSepia = await processImage(edgePng, [
      { type: "sharpen-advanced", options: { method: "high-pass", strength: 100, kernelSize: 3 } },
      { type: "sepia", options: {} },
    ]);
    const hpSepiaRaw = await sharp(hpThenSepia.buffer).raw().toBuffer();
    // Outside edge pixel clamped to 0 by high-pass before sepia stays [0, 0, 0]
    const outsideOffset = (1 * 8 + 2) * 3;
    expect([
      hpSepiaRaw[outsideOffset],
      hpSepiaRaw[outsideOffset + 1],
      hpSepiaRaw[outsideOffset + 2],
    ]).toEqual([0, 0, 0]);

    const [singleSharpen, doubleSharpen] = await Promise.all([
      processImage(edgePng, [{ type: "sharpen", options: { value: 50 } }]),
      processImage(edgePng, [
        { type: "sharpen", options: { value: 50 } },
        { type: "sharpen", options: { value: 50 } },
      ]),
    ]);
    const singleSharpenRaw = await sharp(singleSharpen.buffer).raw().toBuffer();
    const doubleSharpenRaw = await sharp(doubleSharpen.buffer).raw().toBuffer();
    const cornerOffset = (2 * 8 + 2) * 3;
    expect(doubleSharpenRaw[cornerOffset]).toBeGreaterThan(singleSharpenRaw[cornerOffset]);

    // 4. Geometry chains and pixel -> geometry ordering
    const rect200x150 = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .png()
      .toBuffer();

    const resizeThenRotate = await processImage(rect200x150, [
      { type: "resize", options: { width: 80, height: 60 } },
      { type: "rotate", options: { angle: 90 } },
    ]);
    expect(resizeThenRotate.info.width).toBe(60);
    expect(resizeThenRotate.info.height).toBe(80);

    const rotateThenResizePct = await processImage(rect200x150, [
      { type: "rotate", options: { angle: 90 } },
      { type: "resize", options: { percentage: 50 } },
    ]);
    expect(rotateThenResizePct.info.width).toBe(75);
    expect(rotateThenResizePct.info.height).toBe(100);

    const cropThenResizePct = await processImage(rect200x150, [
      { type: "crop", options: { left: 0, top: 0, width: 100, height: 100 } },
      { type: "resize", options: { percentage: 50 } },
    ]);
    expect(cropThenResizePct.info.width).toBe(50);
    expect(cropThenResizePct.info.height).toBe(50);

    const rotateThenCrop = await processImage(rect200x150, [
      { type: "rotate", options: { angle: 90 } },
      { type: "crop", options: { left: 0, top: 100, width: 150, height: 100 } },
    ]);
    expect(rotateThenCrop.info.width).toBe(150);
    expect(rotateThenCrop.info.height).toBe(100);

    const resizeHeightThenResizePct = await processImage(rect200x150, [
      { type: "resize", options: { height: 120 } },
      { type: "resize", options: { percentage: 50 } },
    ]);
    expect(resizeHeightThenResizePct.info.width).toBe(80);
    expect(resizeHeightThenResizePct.info.height).toBe(60);

    const rotate90ThenRotate0 = await processImage(rect200x150, [
      { type: "rotate", options: { angle: 90 } },
      { type: "rotate", options: { angle: 0 } },
    ]);
    expect(rotate90ThenRotate0.info.width).toBe(150);
    expect(rotate90ThenRotate0.info.height).toBe(200);

    // Double horizontal flip restores the original left-right pixel order
    const twoPxStrip = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png()
      .toBuffer();
    const doubleFlop = await processImage(twoPxStrip, [
      { type: "flip", options: { horizontal: true } },
      { type: "flip", options: { horizontal: true } },
    ]);
    const doubleFlopRaw = await sharp(doubleFlop.buffer).raw().toBuffer();
    expect(Array.from(doubleFlopRaw)).toEqual([255, 0, 0, 0, 255, 0]);

    const doubleFlip = await processImage(
      await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
        raw: { width: 1, height: 2, channels: 3 },
      })
        .png()
        .toBuffer(),
      [
        { type: "flip", options: { vertical: true } },
        { type: "flip", options: { vertical: true } },
      ],
    );
    const doubleFlipRaw = await sharp(doubleFlip.buffer).raw().toBuffer();
    expect(Array.from(doubleFlipRaw)).toEqual([255, 0, 0, 0, 255, 0]);

    const grayThenRotateRedBg = await processImage(sample, [
      { type: "grayscale", options: {} },
      { type: "rotate", options: { angle: 45, background: "#ff0000" } },
    ]);
    const grayRotateRaw = await sharp(grayThenRotateRedBg.buffer).raw().toBuffer();
    expect([grayRotateRaw[0], grayRotateRaw[1], grayRotateRaw[2]]).toEqual([255, 0, 0]);

    const rgbaSample = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 100, g: 100, b: 100, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const rotateRedBgThenGrayRgba = await processImage(rgbaSample, [
      { type: "rotate", options: { angle: 45, background: "#ff0000" } },
      { type: "grayscale", options: {} },
    ]);
    const rotateGrayRgbaRaw = await sharp(rotateRedBgThenGrayRgba.buffer).raw().toBuffer();
    expect([
      rotateGrayRgbaRaw[0],
      rotateGrayRgbaRaw[1],
      rotateGrayRgbaRaw[2],
      rotateGrayRgbaRaw[3],
    ]).toEqual([127, 127, 127, 255]);

    const rgbaQuarterAlpha = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 200, g: 100, b: 50, alpha: 0.25 },
      },
    })
      .png()
      .toBuffer();
    const resizeThenBrightRgba = await processImage(rgbaQuarterAlpha, [
      { type: "resize", options: { width: 4, height: 4 } },
      { type: "brightness", options: { value: 100 } },
    ]);
    const resizeBrightRgbaRaw = await sharp(resizeThenBrightRgba.buffer).raw().toBuffer();
    expect([
      resizeBrightRgbaRaw[0],
      resizeBrightRgbaRaw[1],
      resizeBrightRgbaRaw[2],
      resizeBrightRgbaRaw[3],
    ]).toEqual([255, 245, 184, 64]);

    // 5. strip-metadata -> edit-metadata without intervening pixel ops and direct stripMetadata after editMetadata
    const jpgWithExif = await sharp(sample)
      .withExif({ IFD0: { Artist: "OrigArtist" } })
      .withIccProfile("srgb")
      .jpeg({ quality: 100 })
      .toBuffer();

    const stripAllThenEditDirect = await processImage(jpgWithExif, [
      { type: "strip-metadata", options: { stripAll: true } },
      { type: "edit-metadata", options: { copyright: "2026 Otter" } },
    ]);
    const metaStripThenEdit = await sharp(stripAllThenEditDirect.buffer).metadata();
    expect(metaStripThenEdit.exif?.toString("latin1")).toContain("2026 Otter");
    expect(metaStripThenEdit.exif?.toString("latin1")).not.toContain("OrigArtist");

    const stripEachFlagThenMaterialize = await processImage(jpgWithExif, [
      {
        type: "strip-metadata",
        options: { stripExif: true, stripIcc: true, stripXmp: true },
      },
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
    ]);
    const metaStripEachFlag = await sharp(stripEachFlagThenMaterialize.buffer).metadata();
    expect(metaStripEachFlag.exif).toBeUndefined();
    expect(metaStripEachFlag.icc).toBeUndefined();

    const stripGpsEachFlagThenMaterialize = await processImage(jpgWithExif, [
      {
        type: "strip-metadata",
        options: { stripGps: true, stripIcc: true, stripXmp: true },
      },
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
    ]);
    const metaStripGpsEachFlag = await sharp(stripGpsEachFlagThenMaterialize.buffer).metadata();
    expect(metaStripGpsEachFlag.exif).toBeUndefined();
    expect(metaStripGpsEachFlag.icc).toBeUndefined();

    const stripExifSelectiveThenEdit = await processImage(jpgWithExif, [
      { type: "strip-metadata", options: { stripExif: true, stripIcc: false } },
      { type: "edit-metadata", options: { copyright: "2026 Otter" } },
    ]);
    const metaSelectiveThenEdit = await sharp(stripExifSelectiveThenEdit.buffer).metadata();
    expect(metaSelectiveThenEdit.exif?.toString("latin1")).toContain("2026 Otter");
    expect(metaSelectiveThenEdit.exif?.toString("latin1")).not.toContain("OrigArtist");
    expect(metaSelectiveThenEdit.icc).toBeDefined();

    const stripExifThenStripIcc = await processImage(jpgWithExif, [
      { type: "strip-metadata", options: { stripExif: true } },
      { type: "strip-metadata", options: { stripIcc: true } },
    ]);
    const metaStripExifThenIcc = await sharp(stripExifThenStripIcc.buffer).metadata();
    expect(metaStripExifThenIcc.exif).toBeUndefined();
    expect(metaStripExifThenIcc.icc).toBeUndefined();

    const editThenEditClearGps = await processImage(jpgWithExif, [
      { type: "edit-metadata", options: { artist: "Ada" } },
      { type: "edit-metadata", options: { clearGps: true } },
    ]);
    const metaEditThenClearGps = await sharp(editThenEditClearGps.buffer).metadata();
    expect(metaEditThenClearGps.exif?.toString("latin1")).toContain("Ada");
    expect(metaEditThenClearGps.icc).toBeDefined();

    const edited = await editMetadata(sharp(jpgWithExif), { artist: "Ada" });
    const strippedAfterEdit = await stripMetadata(edited, { stripAll: true });
    const strippedAfterEditMeta = await sharp(await strippedAfterEdit.toBuffer()).metadata();
    expect(strippedAfterEditMeta.exif).toBeUndefined();
    expect(strippedAfterEditMeta.icc).toBeUndefined();
  });
});

describe("recomb utilities", () => {
  it("readRecombMatrix reads a 9-element recombMatrix or returns null when absent", () => {
    const img = sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    });
    expect(readRecombMatrix(img)).toBeNull();
    expect(readRecombMatrix({} as unknown as Sharp)).toBeNull();

    const m: Matrix3x3 = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    applyRecombMatrix(img, m);
    expect(readRecombMatrix(img)).toEqual(m);
  });

  it("readRecombMatrix throws on malformed recombMatrix state", () => {
    const nonArray = { options: { recombMatrix: "invalid" } } as unknown as Sharp;
    expect(() => readRecombMatrix(nonArray)).toThrow(
      "Expected Sharp options.recombMatrix to be a 9-number array",
    );

    const badLen = { options: { recombMatrix: [1, 2, 3] } } as unknown as Sharp;
    expect(() => readRecombMatrix(badLen)).toThrow(
      "Expected Sharp options.recombMatrix to be a 9-number array",
    );

    const badType = {
      options: { recombMatrix: [1, 2, 3, 4, 5, 6, 7, 8, "x"] },
    } as unknown as Sharp;
    expect(() => readRecombMatrix(badType)).toThrow(
      "Expected Sharp options.recombMatrix to be a 9-number array",
    );
  });

  it("multiplyMatrix3x3 multiplies full 3x3 matrices including off-diagonal cells", () => {
    const a: Matrix3x3 = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const b: Matrix3x3 = [
      [2, 3, 5],
      [7, 11, 13],
      [17, 19, 23],
    ];
    expect(multiplyMatrix3x3(a, b)).toEqual([
      [67, 82, 100],
      [145, 181, 223],
      [223, 280, 346],
    ]);
  });

  it("applyRecombMatrix delegates non-3x3 input to Sharp for standard validation error even when prev is set", () => {
    const img = sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    });
    expect(() => applyRecombMatrix(img, undefined as unknown as Matrix3x3)).toThrow(/matrix/i);

    applyRecombMatrix(img, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(() => applyRecombMatrix(img, undefined as unknown as Matrix3x3)).toThrow(/matrix/i);
    expect(() => applyRecombMatrix(img, [] as unknown as Matrix3x3)).toThrow(/matrix/i);
    expect(() =>
      applyRecombMatrix(img, [
        [1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ] as unknown as Matrix3x3),
    ).toThrow(/matrix/i);
  });
});

describe("detectFormat", () => {
  it("should detect PNG format", async () => {
    const format = await detectFormat(testBuffer);
    expect(format).toBe("png");
  });

  it("should detect JPEG format", async () => {
    const jpegBuffer = await sharp(testBuffer).jpeg().toBuffer();
    const format = await detectFormat(jpegBuffer);
    expect(format).toBe("jpeg");
  });
});

describe("getImageInfo", () => {
  it("should return correct image info", async () => {
    const info = await getImageInfo(testBuffer);
    expect(info.width).toBe(100);
    expect(info.height).toBe(100);
    expect(info.format).toBe("png");
    expect(info.channels).toBe(3);
    expect(info.size).toBeGreaterThan(0);
    expect(info.hasAlpha).toBe(false);
  });
});

describe("mime utilities", () => {
  it("should map extension to MIME type", () => {
    expect(extToMime("jpg")).toBe("image/jpeg");
    expect(extToMime("png")).toBe("image/png");
    expect(extToMime("webp")).toBe("image/webp");
    expect(extToMime(".jpg")).toBe("image/jpeg");
    expect(extToMime("unknown")).toBe("application/octet-stream");
  });

  it("should map MIME type to extension", () => {
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("image/png")).toBe("png");
    expect(mimeToExt("application/unknown")).toBe("bin");
  });

  it("should map format to MIME type", () => {
    expect(formatToMime("jpeg")).toBe("image/jpeg");
    expect(formatToMime("png")).toBe("image/png");
  });

  it("should map format to extension", () => {
    expect(formatToExt("jpeg")).toBe("jpg");
    expect(formatToExt("png")).toBe("png");
  });
});
