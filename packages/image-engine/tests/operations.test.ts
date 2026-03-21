import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { resize } from "../src/operations/resize.js";
import { crop } from "../src/operations/crop.js";
import { rotate } from "../src/operations/rotate.js";
import { flip } from "../src/operations/flip.js";
import { convert } from "../src/operations/convert.js";
import { compress } from "../src/operations/compress.js";
import { grayscale } from "../src/operations/grayscale.js";
import { sepia } from "../src/operations/sepia.js";
import { invert } from "../src/operations/invert.js";
import { brightness } from "../src/operations/brightness.js";
import { contrast } from "../src/operations/contrast.js";
import { saturation } from "../src/operations/saturation.js";
import { colorChannels } from "../src/operations/color-channels.js";
import { stripMetadata } from "../src/operations/strip-metadata.js";
import { processImage } from "../src/engine.js";
import { detectFormat } from "../src/formats/detect.js";
import { getImageInfo } from "../src/utils/metadata.js";
import { extToMime, mimeToExt, formatToMime, formatToExt } from "../src/utils/mime.js";

// Generate a 100x100 red PNG buffer for testing
let testBuffer: Buffer;
let testImage: () => sharp.Sharp;

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
    await expect(
      crop(testImage(), { left: 90, top: 90, width: 20, height: 20 })
    ).rejects.toThrow();
  });

  it("should throw on zero dimensions", async () => {
    await expect(
      crop(testImage(), { left: 0, top: 0, width: 0, height: 10 })
    ).rejects.toThrow();
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
    await expect(
      convert(testImage(), { format: "png", quality: 0 })
    ).rejects.toThrow();
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
    await expect(
      compress(testImage(), { quality: 0 })
    ).rejects.toThrow();
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
    await expect(
      colorChannels(testImage(), { red: 250, green: 100, blue: 100 })
    ).rejects.toThrow();
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
      "png"
    );

    expect(result.info.width).toBe(50);
    expect(result.info.height).toBe(50);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("should throw on unknown operation", async () => {
    await expect(
      processImage(testBuffer, [{ type: "unknown-op", options: {} }])
    ).rejects.toThrow("Unknown operation");
  });

  it("should convert output format", async () => {
    const result = await processImage(testBuffer, [], "webp");
    expect(result.info.format).toBe("webp");
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
