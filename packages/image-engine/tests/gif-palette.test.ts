import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { processImage } from "../src/engine.js";
import { compress, compressDetailed } from "../src/operations/compress.js";
import { convert } from "../src/operations/convert.js";

async function rgbaCornerPng(size = 20): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[i] = 200;
      raw[i + 1] = 40;
      raw[i + 2] = 40;
      raw[i + 3] = x < 8 && y < 8 ? 0 : 255;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
}

async function pixelAt(
  buffer: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

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

    expect(toFormatSpy).toHaveBeenCalledWith("gif", { quality: 80, reuse: false });

    const gifBuf = await img.gif().toBuffer();
    const targetFormatSpy = vi.spyOn(sharp.prototype, "toFormat");
    try {
      const targetGif = await compressDetailed(sharp(gifBuf), {
        targetSizeBytes: gifBuf.length * 2,
        format: "gif",
      });
      expect(targetFormatSpy).toHaveBeenCalledTimes(2);
      expect(targetGif.buffer).toBeInstanceOf(Buffer);
    } finally {
      targetFormatSpy.mockRestore();
    }
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
      expect(toFormatSpy).toHaveBeenCalledWith("gif", { reuse: false });
    } finally {
      toFormatSpy.mockRestore();
    }
  });
});

describe("TIFF LZW alpha preservation (#2607)", () => {
  it("passes compression: lzw for convert to tiff and preserves 4-channel RGBA alpha", async () => {
    const png = await rgbaCornerPng();
    const webp = await sharp(png).webp({ lossless: true }).toBuffer();

    for (const src of [png, webp]) {
      const img = sharp(src);
      const toFormatSpy = vi.spyOn(img, "toFormat");

      const result = await convert(img, { format: "tiff" });
      expect(toFormatSpy).toHaveBeenCalledWith("tiff", { compression: "lzw" });

      const out = await result.toBuffer();
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("tiff");
      expect(meta.channels).toBe(4);
      expect(meta.hasAlpha).toBe(true);
      expect((await pixelAt(out, 2, 2))[3]).toBe(0);
      expect(await pixelAt(out, 14, 14)).toEqual([200, 40, 40, 255]);
    }

    const nonTiff = sharp(png);
    const nonTiffSpy = vi.spyOn(nonTiff, "toFormat");
    await convert(nonTiff, { format: "png" });
    expect(nonTiffSpy).toHaveBeenCalledWith("png", {});
  });

  it.each(["lzw", "deflate"] as const)(
    "preserves 4-channel alpha when compressing a transparent %s TIFF in quality and targetSize modes",
    async (compression) => {
      const png = await rgbaCornerPng();
      const tiff = await sharp(png).tiff({ compression }).toBuffer();

      const img = sharp(tiff);
      const toFormatSpy = vi.spyOn(img, "toFormat");
      let qualityBuf: Buffer;
      try {
        const qualityResult = await compressDetailed(img, { quality: 80 });
        expect(toFormatSpy).toHaveBeenCalledWith("tiff", { quality: 80, compression: "lzw" });
        qualityBuf = await qualityResult.image.toBuffer();
      } finally {
        toFormatSpy.mockRestore();
      }

      const qualityMeta = await sharp(qualityBuf).metadata();
      expect(qualityMeta.format).toBe("tiff");
      expect(qualityMeta.channels).toBe(4);
      expect(qualityMeta.hasAlpha).toBe(true);
      expect((await pixelAt(qualityBuf, 2, 2))[3]).toBe(0);
      expect(await pixelAt(qualityBuf, 14, 14)).toEqual([200, 40, 40, 255]);

      const targetToFormatSpy = vi.spyOn(sharp.prototype, "toFormat");
      try {
        const targetResult = await compressDetailed(sharp(tiff), {
          targetSizeBytes: qualityBuf.length * 2,
        });
        // 1 toFormat("tiff", ...) in findBestQuality + 1 in compressToTargetSize return (no 7-step binary search)
        expect(targetToFormatSpy).toHaveBeenCalledTimes(2);
        expect(targetResult.buffer).toBeInstanceOf(Buffer);
        const targetBuf = targetResult.buffer as Buffer;
        const targetMeta = await sharp(targetBuf).metadata();
        expect(targetMeta.format).toBe("tiff");
        expect(targetMeta.channels).toBe(4);
        expect(targetMeta.hasAlpha).toBe(true);
        expect((await pixelAt(targetBuf, 2, 2))[3]).toBe(0);
        expect(await pixelAt(targetBuf, 14, 14)).toEqual([200, 40, 40, 255]);
      } finally {
        targetToFormatSpy.mockRestore();
      }

      const exactResult = await compressDetailed(sharp(tiff), {
        targetSizeBytes: qualityBuf.length,
      });
      expect(exactResult.resizedTo).toBeUndefined();
      expect((await sharp(await exactResult.image.toBuffer()).metadata()).hasAlpha).toBe(true);

      const noisyRaw = Buffer.alloc(32 * 32 * 4);
      let seed = 13579;
      for (let i = 0; i < noisyRaw.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        noisyRaw[i] = seed & 0xff;
        noisyRaw[i + 1] = (seed >> 8) & 0xff;
        noisyRaw[i + 2] = (seed >> 16) & 0xff;
        noisyRaw[i + 3] = i < 32 * 4 * 4 ? 0 : 255;
      }
      const noisyTiff = await sharp(noisyRaw, { raw: { width: 32, height: 32, channels: 4 } })
        .tiff({ compression: "lzw" })
        .toBuffer();
      const scaledResult = await compressDetailed(sharp(noisyTiff), {
        targetSizeBytes: noisyTiff.length - 1,
      });
      expect(scaledResult.resizedTo).toEqual({ width: 24, height: 24 });
      expect(scaledResult.buffer).toBeInstanceOf(Buffer);
      const scaledBuf = scaledResult.buffer as Buffer;
      expect(scaledBuf.length).toBeLessThanOrEqual(noisyTiff.length - 1);
      const scaledMeta = await sharp(scaledBuf).metadata();
      expect(scaledMeta.width).toBe(24);
      expect(scaledMeta.height).toBe(24);
      expect(scaledMeta.channels).toBe(4);
      expect(scaledMeta.hasAlpha).toBe(true);
      expect((await pixelAt(scaledBuf, 2, 1))[3]).toBe(0);
      expect((await sharp(await scaledResult.image.toBuffer()).metadata()).hasAlpha).toBe(true);

      const pngToTiffTarget = await compressDetailed(sharp(png), {
        targetSizeBytes: qualityBuf.length * 2,
        format: "tiff",
      });
      const pngToTiffMeta = await sharp(pngToTiffTarget.buffer as Buffer).metadata();
      expect(pngToTiffMeta.format).toBe("tiff");
      expect(pngToTiffMeta.channels).toBe(4);
      expect(pngToTiffMeta.hasAlpha).toBe(true);

      const pngHandle = sharp(png);
      const tiffSpy = vi.spyOn(pngHandle, "tiff");
      await compressDetailed(pngHandle, { targetSizeBytes: png.length * 2, format: "png" });
      expect(tiffSpy).not.toHaveBeenCalled();
    },
  );

  it("preserves 4-channel alpha and 8-bit uchar depth in processImage when outputFormat is tiff", async () => {
    const png = await rgbaCornerPng();
    const opaquePng = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();

    const direct = await processImage(png, [], "tiff");
    expect(direct.info.format).toBe("tiff");
    expect(direct.info.channels).toBe(4);
    expect(direct.info.hasAlpha).toBe(true);
    expect((await pixelAt(direct.buffer, 2, 2))[3]).toBe(0);
    expect(await pixelAt(direct.buffer, 14, 14)).toEqual([200, 40, 40, 255]);

    const floatOps = [
      { type: "sepia", options: {} },
      { type: "color-channels", options: { red: 120, green: 80, blue: 100 } },
      { type: "color-blindness", options: { type: "protanopia" } },
      { type: "sharpen-advanced", options: { method: "high-pass", strength: 50, kernelSize: 3 } },
    ];

    for (const op of floatOps) {
      const [rgbaTiff, rgbaPngRef, opaqueTiff, opaquePngRef] = await Promise.all([
        processImage(png, [op], "tiff"),
        processImage(png, [op], "png"),
        processImage(opaquePng, [op], "tiff"),
        processImage(opaquePng, [op], "png"),
      ]);

      const rgbaMeta = await sharp(rgbaTiff.buffer).metadata();
      expect(rgbaMeta.format, `${op.type} 4ch format`).toBe("tiff");
      expect(rgbaMeta.depth, `${op.type} 4ch depth`).toBe("uchar");
      expect(rgbaMeta.channels, `${op.type} 4ch channels`).toBe(4);
      expect(rgbaMeta.hasAlpha, `${op.type} 4ch hasAlpha`).toBe(true);
      expect((await pixelAt(rgbaTiff.buffer, 2, 2))[3], `${op.type} 4ch corner alpha`).toBe(0);
      expect(await pixelAt(rgbaTiff.buffer, 14, 14), `${op.type} 4ch body matches PNG`).toEqual(
        await pixelAt(rgbaPngRef.buffer, 14, 14),
      );

      const opaqueMeta = await sharp(opaqueTiff.buffer).metadata();
      expect(opaqueMeta.format, `${op.type} 3ch format`).toBe("tiff");
      expect(opaqueMeta.depth, `${op.type} 3ch depth`).toBe("uchar");
      expect(await pixelAt(opaqueTiff.buffer, 14, 14), `${op.type} 3ch body matches PNG`).toEqual(
        await pixelAt(opaquePngRef.buffer, 14, 14),
      );
    }

    const pngWithIcc = await sharp(png).withMetadata({ icc: "p3" }).png().toBuffer();
    const keptIccTiff = await processImage(
      pngWithIcc,
      [{ type: "strip-metadata", options: { stripAll: false } }],
      "tiff",
    );
    expect(keptIccTiff.info.metadata.hasProfile).toBe(true);

    const toFormatSpy = vi.spyOn(sharp.prototype, "toFormat");
    try {
      await processImage(png, [], "webp");
      expect(toFormatSpy).toHaveBeenCalledWith("webp", {});
    } finally {
      toFormatSpy.mockRestore();
    }
  });
});
