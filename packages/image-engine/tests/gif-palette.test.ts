import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { processImage } from "../src/engine.js";
import { colorBlindness } from "../src/operations/color-blindness.js";
import { colorChannels } from "../src/operations/color-channels.js";
import { compress, compressDetailed } from "../src/operations/compress.js";
import { convert } from "../src/operations/convert.js";
import { sepia } from "../src/operations/sepia.js";
import { sharpenAdvanced } from "../src/operations/sharpen.js";
import type { Sharp } from "../src/types.js";

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

  it("passes reuse: false and regenerates the palette in processImage when outputFormat is omitted (#3114)", async () => {
    const redGif = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 200, g: 40, b: 40, alpha: 1 },
      },
    })
      .gif()
      .toBuffer();

    const toFormatSpy = vi.spyOn(sharp.prototype, "toFormat");
    try {
      const result = await processImage(redGif, [
        { type: "color-channels", options: { red: 0, green: 200, blue: 100 } },
      ]);
      expect(toFormatSpy).toHaveBeenCalledWith("gif", { reuse: false });
      expect(result.info.format).toBe("gif");
      expect(await pixelAt(result.buffer, 5, 5)).toEqual([0, 80, 40, 255]);
    } finally {
      toFormatSpy.mockRestore();
    }

    const viaConvertOp = await processImage(redGif, [
      { type: "color-channels", options: { red: 0, green: 200, blue: 100 } },
      { type: "convert", options: { format: "gif" } },
    ]);
    expect(viaConvertOp.info.format).toBe("gif");
    expect(await pixelAt(viaConvertOp.buffer, 5, 5)).toEqual([0, 80, 40, 255]);

    const viaCompressOp = await processImage(redGif, [
      { type: "color-channels", options: { red: 0, green: 200, blue: 100 } },
      { type: "compress", options: { format: "gif", quality: 80 } },
    ]);
    expect(viaCompressOp.info.format).toBe("gif");
    expect(await pixelAt(viaCompressOp.buffer, 5, 5)).toEqual([0, 80, 40, 255]);

    const targetGifAfterColorOp = await compressDetailed(
      await colorChannels(sharp(redGif), { red: 0, green: 200, blue: 100 }),
      { targetSizeBytes: redGif.length * 4 },
    );
    expect(await pixelAt(targetGifAfterColorOp.buffer as Buffer, 5, 5)).toEqual([0, 80, 40, 255]);

    // Animated GIF with a float stage in targetSizeBytes mode keeps all frames.
    const frame0 = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 200, g: 40, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const frame1 = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 40, g: 40, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const animGif = await sharp([frame0, frame1], { join: { animated: true } })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer();
    const animTarget = await compressDetailed(await sepia(sharp(animGif, { animated: true })), {
      targetSizeBytes: animGif.length * 4,
      animated: true,
    });
    const animMeta = await sharp(animTarget.buffer as Buffer, { animated: true }).metadata();
    expect(animMeta.format).toBe("gif");
    expect(animMeta.pages).toBe(2);
    expect(animMeta.pageHeight).toBe(10);

    // Converting a GIF to PNG or JPEG via operations[] with outputFormat omitted
    // must not clobber the output back to GIF.
    const gifToPng = await processImage(redGif, [{ type: "convert", options: { format: "png" } }]);
    expect(gifToPng.info.format).toBe("png");
    const gifToJpeg = await processImage(redGif, [
      { type: "compress", options: { format: "jpeg" as "jpg", quality: 80 } },
    ]);
    expect(gifToJpeg.info.format).toBe("jpeg");
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
      const pngSpy = vi.spyOn(pngHandle, "png");
      await compressDetailed(pngHandle, { targetSizeBytes: png.length * 2, format: "png" });
      expect(tiffSpy).not.toHaveBeenCalled();
      expect(pngSpy).not.toHaveBeenCalled();
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

  it("preserves 4-channel alpha and 8-bit uchar depth when outputFormat is omitted or convert/compress is called after float ops (#3114)", async () => {
    const png = await rgbaCornerPng();
    const opaquePng = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();
    const rgbaTiff = await sharp(png).tiff({ compression: "lzw" }).toBuffer();
    const opaqueTiff = await sharp(opaquePng).tiff({ compression: "lzw" }).toBuffer();

    const resizedTiff = await processImage(rgbaTiff, [
      { type: "resize", options: { width: 10, height: 10 } },
    ]);
    expect(resizedTiff.info.format).toBe("tiff");
    expect(resizedTiff.info.channels).toBe(4);
    expect(resizedTiff.info.hasAlpha).toBe(true);
    expect((await pixelAt(resizedTiff.buffer, 0, 0))[3]).toBe(0);
    expect(await pixelAt(resizedTiff.buffer, 7, 7)).toEqual([200, 40, 40, 255]);

    const floatOps = [
      {
        type: "sepia",
        options: {},
        apply: (img: Sharp) => sepia(img),
      },
      {
        type: "color-channels",
        options: { red: 120, green: 80, blue: 100 },
        apply: (img: Sharp) => colorChannels(img, { red: 120, green: 80, blue: 100 }),
      },
      {
        type: "color-blindness",
        options: { type: "protanopia" },
        apply: (img: Sharp) => colorBlindness(img, { type: "protanopia" }),
      },
      {
        type: "sharpen-advanced",
        options: { method: "high-pass", strength: 50, kernelSize: 3 },
        apply: (img: Sharp) =>
          sharpenAdvanced(img, { method: "high-pass", strength: 50, kernelSize: 3 }),
      },
    ];

    for (const op of floatOps) {
      const [
        pngRef,
        opaquePngRef,
        tiffInputNoFormat,
        opaqueTiffInputNoFormat,
        viaConvertOp,
        viaCompressOp,
        directConvertRgba,
        directConvertOpaque,
        directCompressQuality,
        directCompressOpaqueQuality,
        directCompressTarget,
        directCompressOpaqueTarget,
      ] = await Promise.all([
        processImage(png, [{ type: op.type, options: op.options }], "png"),
        processImage(opaquePng, [{ type: op.type, options: op.options }], "png"),
        processImage(rgbaTiff, [{ type: op.type, options: op.options }]),
        processImage(opaqueTiff, [{ type: op.type, options: op.options }]),
        processImage(png, [
          { type: op.type, options: op.options },
          { type: "convert", options: { format: "tiff" } },
        ]),
        processImage(png, [
          { type: op.type, options: op.options },
          { type: "compress", options: { format: "tiff", quality: 80 } },
        ]),
        convert(await op.apply(sharp(png)), { format: "tiff" }).then((s) => s.toBuffer()),
        convert(await op.apply(sharp(opaquePng)), { format: "tiff" }).then((s) => s.toBuffer()),
        compress(await op.apply(sharp(png)), { format: "tiff", quality: 80 }).then((s) =>
          s.toBuffer(),
        ),
        compress(await op.apply(sharp(opaquePng)), { format: "tiff", quality: 80 }).then((s) =>
          s.toBuffer(),
        ),
        compressDetailed(await op.apply(sharp(rgbaTiff)), {
          targetSizeBytes: rgbaTiff.length * 4,
        }).then((r) => r.buffer as Buffer),
        compressDetailed(await op.apply(sharp(opaquePng)), {
          format: "tiff",
          targetSizeBytes: opaqueTiff.length * 4,
        }).then((r) => r.buffer as Buffer),
      ]);

      const expectedRgbaBody = await pixelAt(pngRef.buffer, 14, 14);
      const expectedOpaqueBody = await pixelAt(opaquePngRef.buffer, 14, 14);

      for (const [label, buf] of [
        ["tiffInputNoFormat", tiffInputNoFormat.buffer],
        ["viaConvertOp", viaConvertOp.buffer],
        ["viaCompressOp", viaCompressOp.buffer],
        ["directConvertRgba", directConvertRgba],
        ["directCompressQuality", directCompressQuality],
        ["directCompressTarget", directCompressTarget],
      ] as const) {
        const meta = await sharp(buf).metadata();
        expect(meta.format, `${op.type} ${label} format`).toBe("tiff");
        expect(meta.depth, `${op.type} ${label} depth`).toBe("uchar");
        expect(meta.channels, `${op.type} ${label} channels`).toBe(4);
        expect(meta.hasAlpha, `${op.type} ${label} hasAlpha`).toBe(true);
        expect((await pixelAt(buf, 2, 2))[3], `${op.type} ${label} corner alpha`).toBe(0);
        expect(await pixelAt(buf, 14, 14), `${op.type} ${label} body`).toEqual(expectedRgbaBody);
      }

      for (const [label, buf] of [
        ["opaqueTiffInputNoFormat", opaqueTiffInputNoFormat.buffer],
        ["directConvertOpaque", directConvertOpaque],
        ["directCompressOpaqueQuality", directCompressOpaqueQuality],
        ["directCompressOpaqueTarget", directCompressOpaqueTarget],
      ] as const) {
        const opaqueMeta = await sharp(buf).metadata();
        expect(opaqueMeta.format, `${op.type} ${label} format`).toBe("tiff");
        expect(opaqueMeta.depth, `${op.type} ${label} depth`).toBe("uchar");
        expect(await pixelAt(buf, 14, 14), `${op.type} ${label} opaque body`).toEqual(
          expectedOpaqueBody,
        );
      }
    }

    // Reverse scan in engine.ts picks the last convert/compress with a format
    // string and casts a trailing float operation (sepia after convert to tiff)
    // back to 8-bit uchar.
    const convertBeforeSepia = await processImage(png, [
      { type: "convert", options: { format: "jpg" } },
      { type: "convert", options: { format: "tiff" } },
      { type: "sepia", options: {} },
      { type: "resize", options: { width: 10, height: 10 } },
    ]);
    const convertBeforeSepiaMeta = await sharp(convertBeforeSepia.buffer).metadata();
    expect(convertBeforeSepiaMeta.format).toBe("tiff");
    expect(convertBeforeSepiaMeta.depth).toBe("uchar");
    expect(convertBeforeSepiaMeta.width).toBe(10);

    // Converting a TIFF to PNG via operations[] with outputFormat omitted
    // must not fall back to inputMeta.format ("tiff").
    const tiffToPng = await processImage(rgbaTiff, [
      { type: "convert", options: { format: "png" } },
    ]);
    expect(tiffToPng.info.format).toBe("png");

    // ICC profile survives convert/compress float-to-uchar cast via keepMetadata().
    const pngWithIcc = await sharp(png).withMetadata({ icc: "p3" }).png().toBuffer();
    const convertIccBuf = await (
      await convert((await sepia(sharp(pngWithIcc))).keepMetadata(), { format: "tiff" })
    ).toBuffer();
    expect((await sharp(convertIccBuf).metadata()).hasProfile).toBe(true);
    const compressIccBuf = await (
      await compress((await sepia(sharp(pngWithIcc))).keepMetadata(), {
        format: "tiff",
        quality: 80,
      })
    ).toBuffer();
    expect((await sharp(compressIccBuf).metadata()).hasProfile).toBe(true);
  });
});
