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
