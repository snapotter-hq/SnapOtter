import sharp, { type Sharp } from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

import { isToolInputError, toolInputErrorCode } from "@snapotter/shared";
import { readTiffPagesFor } from "../../../apps/api/src/lib/animated-image.js";
import { autoOrient } from "../../../apps/api/src/lib/auto-orient.js";
import { DecoderOutOfMemoryError } from "../../../apps/api/src/lib/format-decoders.js";
import { MAX_GIF_FRAMES } from "../../../apps/api/src/lib/gif-limits.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

beforeEach(() => {
  loggerMock.warn.mockReset();
});

async function createImageWithOrientation(orientation: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 50,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

/**
 * A JPEG carrying an EXIF orientation, filled with deterministic high-frequency
 * noise so the encoder's quality setting actually moves the file size. A flat
 * fill compresses to the same handful of bytes at any quality, which would hide
 * the very difference this test is about.
 */
async function createDetailedJpegWithOrientation(orientation: number): Promise<Buffer> {
  const width = 128;
  const height = 128;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 12345;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (seed >> 16) & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

const PAGE_COLORS: [number, number, number][] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
];

/**
 * A 3-page TIFF of 32x24 pages tagged with `orientation`. Each page has its
 * left half (x < 16) in its page color and its right half black, so a turn
 * shows up in where the color lands and a reordered stack in which color.
 */
async function createOrientedMultipageTiff(orientation: number): Promise<Buffer> {
  const pages = await Promise.all(
    PAGE_COLORS.map(async ([r, g, b]) => {
      const raw = Buffer.alloc(32 * 24 * 3, 0);
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 16; x++) {
          const idx = (y * 32 + x) * 3;
          raw[idx] = r;
          raw[idx + 1] = g;
          raw[idx + 2] = b;
        }
      }
      return sharp(raw, { raw: { width: 32, height: 24, channels: 3 } })
        .png()
        .toBuffer();
    }),
  );
  return sharp(pages, { join: { across: 1, animated: true } })
    .withMetadata({ orientation })
    .tiff({ compression: "lzw" })
    .toBuffer();
}

async function pixelAt(buffer: Buffer, page: number, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(buffer, { page, pages: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

describe("autoOrient", () => {
  it("returns original buffer unchanged when orientation is 1", async () => {
    const buf = await createImageWithOrientation(1);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("returns original buffer unchanged when no EXIF orientation is present", async () => {
    const buf = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });

  it("rotates image when orientation is 6 (90 CW)", async () => {
    const buf = await createImageWithOrientation(6);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(6);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(50);
    expect(resultMeta.height).toBe(100);
  });

  it("rotates image when orientation is 8 (270 CW)", async () => {
    const buf = await createImageWithOrientation(8);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(8);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(50);
    expect(resultMeta.height).toBe(100);
  });

  it("rotates image when orientation is 3 (180)", async () => {
    const buf = await createImageWithOrientation(3);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(3);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(100);
    expect(resultMeta.height).toBe(50);
  });

  it("handles orientation 2 (horizontal flip)", async () => {
    const buf = await createImageWithOrientation(2);
    const origMeta = await sharp(buf).metadata();
    expect(origMeta.orientation).toBe(2);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("strips orientation tag after rotation", async () => {
    const buf = await createImageWithOrientation(6);
    const beforeMeta = await sharp(buf).metadata();
    expect(beforeMeta.orientation).toBe(6);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("re-encodes a rotated JPEG in its own format at quality 95, not Sharp's default", async () => {
    const buf = await createDetailedJpegWithOrientation(6);
    const result = await autoOrient(buf);

    // Format is preserved: a rotated JPEG stays a JPEG rather than being
    // promoted to PNG.
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("jpeg");

    // The intended encode names quality 95, the same quality the rest of the
    // pipeline uses. A bare toBuffer() re-encodes at Sharp's JPEG default
    // (~80), which on this noisy image is a markedly smaller file. Comparing
    // against both reference encodes computed with the same Sharp keeps this
    // deterministic across platforms.
    const atQuality95 = await sharp(buf).rotate().toFormat("jpeg", { quality: 95 }).toBuffer();
    const atSharpDefault = await sharp(buf).rotate().toBuffer();

    expect(atSharpDefault.length).toBeLessThan(atQuality95.length);
    expect(result.length).toBe(atQuality95.length);
    expect(result.equals(atQuality95)).toBe(true);
  });

  it("preserves lossless encoding for WebP", async () => {
    const buf = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .withMetadata({ orientation: 6 })
      .webp({ lossless: true })
      .toBuffer();

    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("webp");
    expect(result.toString("ascii", 12, 16)).toBe("VP8L");
  });

  it("preserves alpha channel for TIFF by passing compression", async () => {
    const buf = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 0.5 },
      },
    })
      .withMetadata({ orientation: 6 })
      .tiff({ compression: "lzw" })
      .toBuffer();

    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("tiff");
    expect(meta.channels).toBe(4);
    expect(meta.hasAlpha).toBe(true);
  });

  it("preserves 16-bit depth for PNG", async () => {
    const rawData = Buffer.alloc(32 * 24 * 3 * 2, 0);
    const buf = await sharp(rawData, {
      raw: { width: 32, height: 24, channels: 3 },
    })
      .toColorspace("rgb16")
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();

    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("png");
    expect(meta.depth).toBe("ushort");
  });

  it("returns original buffer for corrupted/invalid input", async () => {
    const invalid = Buffer.from("this is not an image at all");
    const result = await autoOrient(invalid);
    expect(result.equals(invalid)).toBe(true);
  });

  it("returns original buffer for empty buffer", async () => {
    const empty = Buffer.alloc(0);
    const result = await autoOrient(empty);
    expect(result.equals(empty)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({ err: expect.any(Error), bytes: 0 });
  });

  it("routes its warn lines through the logger it is given (#1417)", async () => {
    const full = await createDetailedJpegWithOrientation(6);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    const requestLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

    const result = await autoOrient(truncated, requestLog);

    expect(result.equals(truncated)).toBe(true);
    expect(requestLog.warn).toHaveBeenCalledOnce();
    expect(requestLog.warn.mock.calls[0][0]).toMatchObject({ orientation: 6, format: "jpeg" });

    // the metadata-failure warn takes the same route
    await autoOrient(Buffer.alloc(0), requestLog);
    expect(requestLog.warn).toHaveBeenCalledTimes(2);
    expect(requestLog.warn.mock.calls[1][0]).toMatchObject({ bytes: 0 });
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("logs and passes the image through when the rotation fails", async () => {
    const full = await createDetailedJpegWithOrientation(6);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    expect((await sharp(truncated).metadata()).orientation).toBe(6);

    const result = await autoOrient(truncated);

    expect(result.equals(truncated)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({
      err: expect.any(Error),
      orientation: 6,
      format: "jpeg",
      bytes: truncated.length,
    });
  });

  it("rotates every frame of an animated WebP and preserves frame timing (#1260)", async () => {
    const colors: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ];
    // Each 32x24 frame has its left half (x < 16) filled with its frame color
    // and its right half (x >= 16) filled with black. After a 90 CW rotation
    // (orientation 6), each 24x32 frame has its top half (y < 16) colored and
    // its bottom half (y >= 16) black.
    const frames = await Promise.all(
      colors.map(async ([r, g, b]) => {
        const raw = Buffer.alloc(32 * 24 * 3, 0);
        for (let y = 0; y < 24; y++) {
          for (let x = 0; x < 16; x++) {
            const idx = (y * 32 + x) * 3;
            raw[idx] = r;
            raw[idx + 1] = g;
            raw[idx + 2] = b;
          }
        }
        return sharp(raw, { raw: { width: 32, height: 24, channels: 3 } })
          .png()
          .toBuffer();
      }),
    );

    const animated = await sharp(frames, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [80, 120, 200], loop: 3, lossless: true })
      .toBuffer();

    const beforeMeta = await sharp(animated, { animated: true }).metadata();
    expect(beforeMeta.pages).toBe(3);
    expect(beforeMeta.orientation).toBe(6);

    const result = await autoOrient(animated);
    const meta = await sharp(result, { animated: true }).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(24);
    expect(meta.pageHeight).toBe(32);
    expect(meta.height).toBe(96);
    expect(meta.delay).toEqual([80, 120, 200]);
    expect(meta.loop).toBe(3);
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    expect(result.includes(Buffer.from("VP8L", "ascii"))).toBe(true);

    for (let page = 0; page < 3; page++) {
      const { data, info } = await sharp(result, { page, pages: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(24);
      expect(info.height).toBe(32);
      const topIdx = (4 * info.width + 12) * info.channels;
      const bottomIdx = (28 * info.width + 12) * info.channels;
      expect([data[topIdx], data[topIdx + 1], data[topIdx + 2]]).toEqual(colors[page]);
      expect([data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]]).toEqual([0, 0, 0]);
    }
  });

  it("keeps frame order when rotating an animated WebP 180 degrees (orientation 3) (#1260)", async () => {
    const colors: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ];
    // Top half colored, bottom half black in each 32x24 frame. After 180 rotation
    // (orientation 3), each frame has its top half black and bottom half colored,
    // while frame 0 stays red and frame 2 stays blue (rotating a stacked strip in
    // one pass would reverse the frame order).
    const frames = await Promise.all(
      colors.map(async ([r, g, b]) => {
        const raw = Buffer.alloc(32 * 24 * 3, 0);
        for (let y = 0; y < 12; y++) {
          for (let x = 0; x < 32; x++) {
            const idx = (y * 32 + x) * 3;
            raw[idx] = r;
            raw[idx + 1] = g;
            raw[idx + 2] = b;
          }
        }
        return sharp(raw, { raw: { width: 32, height: 24, channels: 3 } })
          .png()
          .toBuffer();
      }),
    );

    const animated = await sharp(frames, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 3 })
      .webp({ delay: [90, 140, 190], loop: 2, lossless: true })
      .toBuffer();

    const result = await autoOrient(animated);
    const meta = await sharp(result, { animated: true }).metadata();

    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(32);
    expect(meta.pageHeight).toBe(24);
    expect(meta.delay).toEqual([90, 140, 190]);
    expect(meta.loop).toBe(2);

    for (let page = 0; page < 3; page++) {
      const { data, info } = await sharp(result, { page, pages: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const topIdx = (4 * info.width + 16) * info.channels;
      const bottomIdx = (20 * info.width + 16) * info.channels;
      expect([data[topIdx], data[topIdx + 1], data[topIdx + 2]]).toEqual([0, 0, 0]);
      expect([data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]]).toEqual(colors[page]);
    }
  });

  it("keeps lossy encoding when rotating a lossy animated WebP with alpha (#1260)", async () => {
    const frames = await Promise.all(
      [60, 140, 220].map((v) =>
        sharp({
          create: {
            width: 32,
            height: 24,
            channels: 4,
            background: { r: v, g: v, b: v, alpha: 0.5 },
          },
        })
          .png()
          .toBuffer(),
      ),
    );
    const animated = await sharp(frames, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [80, 120, 200], loop: 1, lossless: false, quality: 85 })
      .toBuffer();

    expect(animated.includes(Buffer.from("ALPH", "ascii"))).toBe(true);

    const result = await autoOrient(animated);
    const meta = await sharp(result, { animated: true }).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(24);
    expect(meta.pageHeight).toBe(32);
    expect(meta.hasAlpha).toBe(true);
    expect(result.includes(Buffer.from("VP8 ", "ascii"))).toBe(true);
    expect(result.includes(Buffer.from("VP8L", "ascii"))).toBe(false);
  });

  it("treats a mixed animated WebP (VP8L frame followed by ALPH + VP8 frame) as lossy (#1260)", async () => {
    const framePngs = await Promise.all(
      [60, 180].map((v) =>
        sharp({
          create: {
            width: 32,
            height: 24,
            channels: 4,
            background: { r: v, g: v, b: v, alpha: 0.5 },
          },
        })
          .png()
          .toBuffer(),
      ),
    );
    const lossless = await sharp(framePngs, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [100, 100], loop: 1, lossless: true })
      .toBuffer();
    const lossyAlpha = await sharp(framePngs, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [100, 100], loop: 1, lossless: false, quality: 85 })
      .toBuffer();

    // Splice frame 0 (VP8L) from lossless with frame 1 (ALPH + VP8 ) from lossyAlpha
    const losslessAnmf0 = lossless.indexOf(Buffer.from("ANMF", "ascii"), 12);
    const losslessAnmf1 = lossless.indexOf(Buffer.from("ANMF", "ascii"), losslessAnmf0 + 4);
    const lossyAnmf0 = lossyAlpha.indexOf(Buffer.from("ANMF", "ascii"), 12);
    const lossyAnmf1 = lossyAlpha.indexOf(Buffer.from("ANMF", "ascii"), lossyAnmf0 + 4);

    const mixed = Buffer.concat([
      lossless.subarray(0, losslessAnmf1),
      lossyAlpha.subarray(lossyAnmf1),
    ]);
    mixed.writeUInt32LE(mixed.length - 8, 4);

    expect(mixed.includes(Buffer.from("VP8L", "ascii"))).toBe(true);
    expect(mixed.includes(Buffer.from("ALPH", "ascii"))).toBe(true);
    expect(mixed.includes(Buffer.from("VP8 ", "ascii"))).toBe(true);

    const result = await autoOrient(mixed);
    const meta = await sharp(result, { animated: true }).metadata();

    expect(meta.pages).toBe(2);
    expect(meta.width).toBe(24);
    expect(meta.pageHeight).toBe(32);
    expect(result.includes(Buffer.from("VP8 ", "ascii"))).toBe(true);
    expect(result.includes(Buffer.from("VP8L", "ascii"))).toBe(false);
  });

  it("logs and passes through an animated WebP that exceeds the workload pixel cap (#1260)", async () => {
    const frames = await Promise.all(
      [60, 140, 220].map((v) =>
        sharp({
          create: { width: 32, height: 24, channels: 3, background: { r: v, g: v, b: v } },
        })
          .png()
          .toBuffer(),
      ),
    );
    const animated = await sharp(frames, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [80, 120, 200], loop: 1, lossless: true })
      .toBuffer();

    // Patch the VP8X canvas width-1 (bytes 24..26) and height-1 (bytes 27..29)
    // to 6000x6000 (36 MP per frame, 108 MP across 3 frames > 64 Mpx cap).
    const oversized = Buffer.from(animated);
    expect(oversized.toString("ascii", 12, 16)).toBe("VP8X");
    oversized.writeUIntLE(6000 - 1, 24, 3);
    oversized.writeUIntLE(6000 - 1, 27, 3);

    const meta = await sharp(oversized).metadata();
    expect(meta.width).toBe(6000);
    expect(meta.height).toBe(6000);
    expect(meta.pages).toBe(3);
    expect(meta.orientation).toBe(6);

    const result = await autoOrient(oversized);

    expect(result.equals(oversized)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({
      err: expect.objectContaining({
        message: expect.stringMatching(/total pixels across all frames/),
      }),
      orientation: 6,
      format: "webp",
      pages: 3,
      bytes: oversized.length,
    });
  });

  it("logs and passes through an animated WebP when a later frame is truncated (#1260)", async () => {
    const frames = await Promise.all(
      [60, 140, 220].map((v) =>
        sharp({
          create: { width: 64, height: 48, channels: 3, background: { r: v, g: v, b: v } },
        })
          .png()
          .toBuffer(),
      ),
    );
    // Put EXIF before ANMF by truncating inside the last ANMF payload while
    // keeping enough of the header for metadata() to report orientation: 6.
    const full = await sharp(frames, { join: { across: 1, animated: true } })
      .withMetadata({ orientation: 6 })
      .webp({ delay: [80, 120, 200], loop: 1, lossless: true })
      .toBuffer();

    // Corrupt the second ANMF bitstream payload past the 8-byte VP8L chunk
    // header and 5-byte VP8L signature/dimensions header (offset +24 +8 +5 = +37)
    // so WebPDemux still parses all 3 frame headers while decoding page 1 fails.
    const corrupted = Buffer.from(full);
    const firstAnmf = corrupted.indexOf(Buffer.from("ANMF", "ascii"), 12);
    const secondAnmf = corrupted.indexOf(Buffer.from("ANMF", "ascii"), firstAnmf + 4);
    expect(secondAnmf).toBeGreaterThan(firstAnmf);
    corrupted.fill(0xff, secondAnmf + 38, secondAnmf + 48);

    const meta = await sharp(corrupted).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.pages).toBe(3);

    const result = await autoOrient(corrupted);

    expect(result.equals(corrupted)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({
      err: expect.any(Error),
      orientation: 6,
      format: "webp",
      pages: 3,
      bytes: corrupted.length,
    });
  });

  it("rethrows DecoderOutOfMemoryError without logging warn when metadata() or rotation hits OOM (#3804, #3837)", async () => {
    const buf = await createImageWithOrientation(6);
    for (const oomErr of [
      new RangeError("Array buffer allocation failed"),
      new Error("heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed"),
    ]) {
      const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(oomErr);
      try {
        const thrown = await autoOrient(buf).catch((e: unknown) => e);
        expect(thrown).toBeInstanceOf(DecoderOutOfMemoryError);
        expect(thrown).toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: oomErr,
        });
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        metaSpy.mockRestore();
      }

      const toBufferSpy = vi.spyOn(sharp.prototype, "toBuffer").mockRejectedValueOnce(oomErr);
      try {
        const thrown = await autoOrient(buf).catch((e: unknown) => e);
        expect(thrown).toBeInstanceOf(DecoderOutOfMemoryError);
        expect(thrown).toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: oomErr,
        });
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        toBufferSpy.mockRestore();
      }

      const realMetadata = sharp.prototype.metadata;
      const secondMetaSpy = vi
        .spyOn(sharp.prototype, "metadata")
        .mockImplementationOnce(function (this: Sharp) {
          return realMetadata.call(this);
        })
        .mockRejectedValueOnce(oomErr);
      try {
        const thrown = await autoOrient(buf).catch((e: unknown) => e);
        expect(thrown).toBeInstanceOf(DecoderOutOfMemoryError);
        expect(thrown).toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: oomErr,
        });
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        secondMetaSpy.mockRestore();
      }
    }
  });

  it("rotates every page of a multi-page TIFF and keeps them all (#4849)", async () => {
    const tiff = await createOrientedMultipageTiff(6);
    const before = await sharp(tiff).metadata();
    expect(before.pages).toBe(3);
    expect(before.orientation).toBe(6);

    const result = await autoOrient(tiff);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("tiff");
    expect(meta.pages).toBe(3);
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    for (let page = 0; page < 3; page++) {
      const pageMeta = await sharp(result, { page, pages: 1 }).metadata();
      expect([pageMeta.width, pageMeta.height]).toEqual([24, 32]);
      // 90 CW moves the colored left half to the top.
      expect(await pixelAt(result, page, 12, 4)).toEqual(PAGE_COLORS[page]);
      expect(await pixelAt(result, page, 12, 28)).toEqual([0, 0, 0]);
    }
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("keeps page order when rotating a multi-page TIFF 180 degrees (#4849)", async () => {
    const result = await autoOrient(await createOrientedMultipageTiff(3));

    expect((await sharp(result).metadata()).pages).toBe(3);
    for (let page = 0; page < 3; page++) {
      // 180 moves the colored left half to the right.
      expect(await pixelAt(result, page, 28, 12)).toEqual(PAGE_COLORS[page]);
      expect(await pixelAt(result, page, 4, 12)).toEqual([0, 0, 0]);
    }
  });

  it("rotates page 1 and says so when a multi-page TIFF's pages differ in size (#4849)", async () => {
    const tiff = readFixture(fixtures.image.edge.multipageMixedSizesOrientedTiff);
    const before = await sharp(tiff).metadata();
    expect(before.pages).toBe(2);
    expect(before.orientation).toBe(6);

    const result = await autoOrient(tiff);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("tiff");
    expect(meta.pages ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: 2, orientation: 6 }),
      expect.stringContaining("different sizes"),
    );
  });

  it("rotates page 1 and says so when a multi-page TIFF is over the workload cap (#4849)", async () => {
    // One page more than MAX_GIF_FRAMES; tiny pages keep the fixture cheap.
    const page = await sharp({
      create: { width: 4, height: 2, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const tiff = await sharp(Array(MAX_GIF_FRAMES + 1).fill(page), {
      join: { across: 1, animated: true },
    })
      .withMetadata({ orientation: 6 })
      .tiff({ compression: "lzw" })
      .toBuffer();

    const result = await autoOrient(tiff);
    const meta = await sharp(result).metadata();

    expect(meta.pages ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([2, 4]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: MAX_GIF_FRAMES + 1, orientation: 6 }),
      expect.stringContaining("workload cap"),
    );
  });

  /** The refusal readTiffPagesFor gives the same file with no orientation tag. */
  async function unrotatedRefusal(tiff: Buffer): Promise<{ message: string; code?: string }> {
    const err = await readTiffPagesFor(tiff, "tiff").then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    return { message: (err as Error).message, code: toolInputErrorCode(err) };
  }

  async function overCapTiff(orientation?: number): Promise<Buffer> {
    const page = await sharp({
      create: { width: 4, height: 2, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const stack = sharp(Array(MAX_GIF_FRAMES + 1).fill(page), {
      join: { across: 1, animated: true },
    });
    return await (orientation ? stack.withMetadata({ orientation }) : stack)
      .tiff({ compression: "lzw" })
      .toBuffer();
  }

  it("refuses a rotated TIFF with mixed page sizes going out as TIFF, as it does unrotated (#5133)", async () => {
    const expected = await unrotatedRefusal(
      readFixture(fixtures.image.edge.multipageMixedSizesTiff),
    );
    const tiff = readFixture(fixtures.image.edge.multipageMixedSizesOrientedTiff);

    const err = await autoOrient(tiff, undefined, { outputFormat: async () => "tiff" }).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(isToolInputError(err)).toBe(true);
    expect({ message: (err as Error).message, code: toolInputErrorCode(err) }).toEqual(expected);
    expect(expected.message).toContain("2 pages of different sizes");
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("refuses a rotated TIFF over the page cap going out as TIFF, as it does unrotated (#5133)", async () => {
    const expected = await unrotatedRefusal(await overCapTiff());

    const err = await autoOrient(await overCapTiff(6), undefined, {
      outputFormat: async () => "tiff",
    }).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(isToolInputError(err)).toBe(true);
    expect({ message: (err as Error).message, code: toolInputErrorCode(err) }).toEqual(expected);
    expect(expected.code).toBe("TOO_MANY_FRAMES");
  });

  it("still keeps rotated page 1 of an unstackable TIFF when the output is not TIFF (#5133)", async () => {
    const tiff = readFixture(fixtures.image.edge.multipageMixedSizesOrientedTiff);

    const result = await autoOrient(tiff, undefined, { outputFormat: async () => "png" });
    const meta = await sharp(result).metadata();

    expect(meta.pages ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: 2, orientation: 6 }),
      expect.stringContaining("different sizes"),
    );
  });

  it("only asks for the output format when a TIFF stack can't be rotated (#5133)", async () => {
    const outputFormat = vi.fn(async () => "tiff");

    const result = await autoOrient(await createOrientedMultipageTiff(6), undefined, {
      outputFormat,
    });
    await autoOrient(await createImageWithOrientation(6), undefined, { outputFormat });

    expect((await sharp(result).metadata()).pages).toBe(3);
    expect(outputFormat).not.toHaveBeenCalled();
  });

  it("keeps 16-bit samples when rotating a multi-page TIFF (#4849)", async () => {
    // A Uint16Array input is read as 16-bit; 40000 isn't n * 257, so an 8-bit
    // round trip anywhere would change it.
    const samples = new Uint16Array(32 * 24 * 3).fill(40000);
    const page = await sharp(samples, { raw: { width: 32, height: 24, channels: 3 } })
      .toColorspace("rgb16")
      .png()
      .toBuffer();
    const tiff = await sharp([page, page], { join: { across: 1, animated: true } })
      .toColorspace("rgb16")
      .withMetadata({ orientation: 6 })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const firstSample16 = async (buffer: Buffer, page: number) => {
      const { data, info } = await sharp(buffer, { page, pages: 1 })
        .toColorspace("rgb16")
        .raw({ depth: "ushort" })
        .toBuffer({ resolveWithObject: true });
      return { info, rgb: Array.from(new Uint16Array(data.buffer, data.byteOffset, 3)) };
    };
    expect((await sharp(tiff).metadata()).depth).toBe("ushort");
    expect((await firstSample16(tiff, 0)).rgb).toEqual([40000, 40000, 40000]);

    const result = await autoOrient(tiff);
    const meta = await sharp(result).metadata();

    expect(meta.pages).toBe(2);
    expect(meta.depth).toBe("ushort");
    for (let page = 0; page < 2; page++) {
      const after = await firstSample16(result, page);
      expect([after.info.width, after.info.height]).toEqual([24, 32]);
      expect(after.rgb).toEqual([40000, 40000, 40000]);
    }
  });
});
