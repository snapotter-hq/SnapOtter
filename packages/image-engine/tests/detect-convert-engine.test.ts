import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { processImage } from "../src/engine.js";
import { detectFormat } from "../src/formats/detect.js";
import { colorBlindness } from "../src/operations/color-blindness.js";
import { convert } from "../src/operations/convert.js";
import type { ColorBlindnessType } from "../src/types.js";

/**
 * Build a fixed-length Buffer from an array of byte values, zero-padded to `len`.
 * Used to hand-craft magic-byte headers that Sharp cannot decode, forcing
 * detectFormat to fall through to its magic-byte detector.
 */
function bytes(values: number[], len?: number): Buffer {
  const buf = Buffer.alloc(len ?? values.length, 0);
  for (let i = 0; i < values.length; i++) {
    buf[i] = values[i];
  }
  return buf;
}

/** Mean value per channel (rounded) of a decoded buffer. */
async function channelMeans(buffer: Buffer): Promise<number[]> {
  const stats = await sharp(buffer).stats();
  return stats.channels.map((c) => Math.round(c.mean));
}

let redPng: Buffer;

beforeAll(async () => {
  redPng = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
});

describe("detectFormat via Sharp metadata", () => {
  // Real encodes: Sharp decodes these directly and returns metadata.format,
  // exercising the sharp-metadata branch (never reaching magic bytes).
  const realEncodeCases: Array<{ name: string; make: () => Promise<Buffer>; expected: string }> = [
    {
      name: "png",
      make: () => sharp({ create: base() }).png().toBuffer(),
      expected: "png",
    },
    {
      name: "jpeg",
      make: () => sharp({ create: base() }).jpeg().toBuffer(),
      expected: "jpeg",
    },
    {
      name: "webp",
      make: () => sharp({ create: base() }).webp().toBuffer(),
      expected: "webp",
    },
    {
      name: "gif",
      make: () => sharp({ create: base() }).gif().toBuffer(),
      expected: "gif",
    },
    {
      name: "tiff",
      make: () => sharp({ create: base() }).tiff().toBuffer(),
      expected: "tiff",
    },
  ];

  for (const { name, make, expected } of realEncodeCases) {
    it(`detects a real ${name} encode as ${expected}`, async () => {
      const buf = await make();
      expect(await detectFormat(buf)).toBe(expected);
    });
  }

  function base() {
    return {
      width: 8,
      height: 8,
      channels: 3 as const,
      background: { r: 10, g: 120, b: 200 },
    };
  }
});

describe("detectFormat via magic bytes", () => {
  // Every format the magic-byte table recognizes, with hand-built headers that
  // Sharp cannot decode. Each asserts the EXACT format string, killing the
  // per-entry string-literal mutants.
  const magicCases: Array<{ name: string; buf: Buffer; expected: string }> = [
    { name: "png magic", buf: bytes([0x89, 0x50, 0x4e, 0x47], 16), expected: "png" },
    { name: "jpeg magic", buf: bytes([0xff, 0xd8, 0xff], 16), expected: "jpeg" },
    { name: "gif (GIF8)", buf: bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 16), expected: "gif" },
    { name: "tiff little-endian", buf: bytes([0x49, 0x49, 0x2a, 0x00], 16), expected: "tiff" },
    { name: "tiff big-endian", buf: bytes([0x4d, 0x4d, 0x00, 0x2a], 16), expected: "tiff" },
    { name: "bmp (BM)", buf: bytes([0x42, 0x4d], 16), expected: "bmp" },
    {
      name: "avif ftyp+avif brand",
      buf: bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 16),
      expected: "avif",
    },
    {
      name: "avif ftyp+avis brand",
      buf: bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73], 16),
      expected: "avif",
    },
    {
      name: "jxl ISOBMFF container",
      buf: bytes([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20], 16),
      expected: "jxl",
    },
    { name: "jxl raw codestream", buf: bytes([0xff, 0x0a], 16), expected: "jxl" },
    { name: "ico", buf: bytes([0x00, 0x00, 0x01, 0x00], 16), expected: "ico" },
    { name: "psd (8BPS)", buf: bytes([0x38, 0x42, 0x50, 0x53], 16), expected: "psd" },
    { name: "exr", buf: bytes([0x76, 0x2f, 0x31, 0x01], 16), expected: "exr" },
    {
      name: "cr3 ftyp+crx brand",
      buf: bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x63, 0x72, 0x78, 0x20], 16),
      expected: "cr3",
    },
    {
      name: "raf (FUJIFILMCCD-RAW)",
      buf: bytes(
        [0x46, 0x55, 0x4a, 0x49, 0x46, 0x49, 0x4c, 0x4d, 0x43, 0x43, 0x44, 0x2d, 0x52, 0x41, 0x57],
        24,
      ),
      expected: "raf",
    },
    { name: "x3f (FOVb)", buf: bytes([0x46, 0x4f, 0x56, 0x62], 16), expected: "x3f" },
    { name: "mrw (\\x00MRM)", buf: bytes([0x00, 0x4d, 0x52, 0x4d], 16), expected: "mrw" },
    {
      name: "jp2 box signature",
      buf: bytes([0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a], 16),
      expected: "jp2",
    },
    { name: "j2k raw codestream", buf: bytes([0xff, 0x4f, 0xff, 0x51], 16), expected: "jp2" },
    { name: "dds", buf: bytes([0x44, 0x44, 0x53, 0x20], 16), expected: "dds" },
    { name: "cur", buf: bytes([0x00, 0x00, 0x02, 0x00], 16), expected: "cur" },
    { name: "dpx forward (SDPX)", buf: bytes([0x53, 0x44, 0x50, 0x58], 16), expected: "dpx" },
    { name: "dpx reverse (XPDS)", buf: bytes([0x58, 0x50, 0x44, 0x53], 16), expected: "dpx" },
    { name: "cineon", buf: bytes([0x80, 0x2a, 0x5f, 0xd7], 16), expected: "cin" },
    {
      name: "fits (SIMPLE)",
      buf: bytes([0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45], 16),
      expected: "fits",
    },
    {
      name: "eps ASCII (%!PS-Adobe)",
      buf: bytes([0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65], 16),
      expected: "eps",
    },
    { name: "eps binary (DOS)", buf: bytes([0xc5, 0xd0, 0xd3, 0xc6], 16), expected: "eps" },
    { name: "ppm P3", buf: bytes([0x50, 0x33, 0x0a], 16), expected: "ppm" },
    { name: "ppm P6", buf: bytes([0x50, 0x36, 0x0a], 16), expected: "ppm" },
    { name: "qoi (qoif)", buf: bytes([0x71, 0x6f, 0x69, 0x66], 16), expected: "qoi" },
  ];

  for (const { name, buf, expected } of magicCases) {
    it(`detects ${name} as ${expected}`, async () => {
      expect(await detectFormat(buf)).toBe(expected);
    });
  }

  describe("webp RIFF secondary verification", () => {
    it("detects RIFF...WEBP as webp (length 12, correct signature)", async () => {
      const buf = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 12);
      expect(await detectFormat(buf)).toBe("webp");
    });

    it("returns unknown for RIFF with a non-WEBP signature at length 12", async () => {
      // RIFF matches, buffer >= 12, but bytes 8..12 are "AVI " not "WEBP".
      const buf = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20], 16);
      expect(await detectFormat(buf)).toBe("unknown");
    });

    it("returns unknown when WEBP signature is one byte off (WEBX)", async () => {
      const buf = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x58], 12);
      expect(await detectFormat(buf)).toBe("unknown");
    });

    it("returns unknown for a RIFF header too short to carry the WEBP signature", async () => {
      expect(await detectFormat(bytes([0x52, 0x49, 0x46, 0x46], 11))).toBe("unknown");
      expect(await detectFormat(bytes([0x52, 0x49, 0x46, 0x46], 4))).toBe("unknown");
    });
  });

  describe("avif ftyp brand verification", () => {
    it("returns unknown for ftyp box with a non-AVIF brand (mp42)", async () => {
      const buf = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32], 16);
      expect(await detectFormat(buf)).toBe("unknown");
    });

    it("returns unknown for ftyp box shorter than 12 bytes", async () => {
      // ftyp present at offset 4 but only 11 bytes: the `< 12` guard hits `continue`.
      const buf = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69], 11);
      expect(await detectFormat(buf)).toBe("unknown");
    });

    it("detects avif at exactly 12 bytes", async () => {
      const buf = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 12);
      expect(await detectFormat(buf)).toBe("avif");
    });
  });

  describe("cr3 ftyp brand verification", () => {
    it("returns unknown for ftyp box with a crx-like-but-wrong brand", async () => {
      // "crx!" instead of "crx " (trailing space): avif brand check fails, cr3
      // brand check also fails, so the ftyp entries fall through to unknown.
      const buf = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x63, 0x72, 0x78, 0x21], 16);
      expect(await detectFormat(buf)).toBe("unknown");
    });
  });

  describe("single-byte mismatches are not detected", () => {
    // Feed a header matching every byte but one; assert it is NOT the format.
    // Kills the per-byte `===`/`!==` comparison and the `offset + i` index mutants.
    const mismatchCases: Array<{ name: string; buf: Buffer }> = [
      { name: "png with wrong 4th byte", buf: bytes([0x89, 0x50, 0x4e, 0x48], 16) },
      { name: "jpeg with wrong 2nd byte", buf: bytes([0xff, 0xd7, 0xff], 16) },
      { name: "gif with wrong 4th byte", buf: bytes([0x47, 0x49, 0x46, 0x37], 16) },
      { name: "tiff LE with wrong 3rd byte", buf: bytes([0x49, 0x49, 0x2b, 0x00], 16) },
      { name: "qoi with wrong 1st byte", buf: bytes([0x70, 0x6f, 0x69, 0x66], 16) },
      { name: "bmp with wrong 2nd byte", buf: bytes([0x42, 0x4e], 16) },
      { name: "psd with wrong last byte", buf: bytes([0x38, 0x42, 0x50, 0x54], 16) },
    ];

    for (const { name, buf } of mismatchCases) {
      it(`returns unknown for ${name}`, async () => {
        expect(await detectFormat(buf)).toBe("unknown");
      });
    }
  });

  describe("length guard boundaries", () => {
    it("detects bmp at exactly 2 bytes (offset 0 + 2 magic bytes)", async () => {
      expect(await detectFormat(bytes([0x42, 0x4d], 2))).toBe("bmp");
    });

    it("returns unknown for a 1-byte buffer (one short of bmp's 2)", async () => {
      expect(await detectFormat(bytes([0x42], 1))).toBe("unknown");
    });

    it("detects gif at exactly 4 bytes (length == offset + magic length)", async () => {
      expect(await detectFormat(bytes([0x47, 0x49, 0x46, 0x38], 4))).toBe("gif");
    });

    it("returns unknown for a 3-byte GIF header (one short of 4)", async () => {
      expect(await detectFormat(bytes([0x47, 0x49, 0x46], 3))).toBe("unknown");
    });

    it("returns unknown for a 7-byte ftyp buffer (one short of offset 4 + 4)", async () => {
      expect(await detectFormat(bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79], 7))).toBe("unknown");
    });
  });

  describe("fallback / negative cases", () => {
    it("returns unknown for an empty buffer", async () => {
      expect(await detectFormat(Buffer.alloc(0))).toBe("unknown");
    });

    it("returns unknown for a 2-byte truncated PNG header", async () => {
      expect(await detectFormat(bytes([0x89, 0x50], 2))).toBe("unknown");
    });

    it("returns unknown for random unrecognized bytes", async () => {
      expect(await detectFormat(bytes([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88], 16))).toBe(
        "unknown",
      );
    });
  });
});

describe("convert output format and quality", () => {
  it("maps the jpg alias to a jpeg encode", async () => {
    const out = await (await convert(sharp(redPng), { format: "jpg" })).toBuffer();
    expect((await sharp(out).metadata()).format).toBe("jpeg");
  });

  it("encodes png without quality changes", async () => {
    const out = await (await convert(sharp(redPng), { format: "png" })).toBuffer();
    expect((await sharp(out).metadata()).format).toBe("png");
  });

  it("encodes webp, avif, tiff, and gif to their exact formats", async () => {
    const webp = await (await convert(sharp(redPng), { format: "webp" })).toBuffer();
    expect((await sharp(webp).metadata()).format).toBe("webp");

    const avif = await (await convert(sharp(redPng), { format: "avif" })).toBuffer();
    // Sharp reports avif-encoded data as "heif".
    expect((await sharp(avif).metadata()).format).toBe("heif");

    const tiff = await (await convert(sharp(redPng), { format: "tiff" })).toBuffer();
    expect((await sharp(tiff).metadata()).format).toBe("tiff");

    const gif = await (await convert(sharp(redPng), { format: "gif" })).toBuffer();
    expect((await sharp(gif).metadata()).format).toBe("gif");
  });

  it("applies quality: lower quality yields a smaller (or equal) jpeg than higher", async () => {
    const q10 = await (await convert(sharp(redPng), { format: "jpg", quality: 10 })).toBuffer();
    const q95 = await (await convert(sharp(redPng), { format: "jpg", quality: 95 })).toBuffer();
    expect(q10.length).toBeLessThan(q95.length);
  });

  it("omitting quality does not throw and still produces the target format", async () => {
    const out = await (await convert(sharp(redPng), { format: "jpg" })).toBuffer();
    expect((await sharp(out).metadata()).format).toBe("jpeg");
  });

  it("accepts the inclusive quality bounds 1 and 100", async () => {
    await expect(
      (await convert(sharp(redPng), { format: "jpg", quality: 1 })).toBuffer(),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      (await convert(sharp(redPng), { format: "jpg", quality: 100 })).toBuffer(),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it("rejects quality below 1", async () => {
    await expect(convert(sharp(redPng), { format: "jpg", quality: 0 })).rejects.toThrow(
      "Quality must be between 1 and 100",
    );
  });

  it("rejects quality above 100", async () => {
    await expect(convert(sharp(redPng), { format: "jpg", quality: 101 })).rejects.toThrow(
      "Quality must be between 1 and 100",
    );
  });

  it("throws on an unsupported output format", async () => {
    await expect(convert(sharp(redPng), { format: "bmp" as unknown as "png" })).rejects.toThrow(
      "Unsupported output format: bmp",
    );
  });
});

describe("colorBlindness simulation matrix", () => {
  it("applies achromatopsia (grayscale) so red drops and green/blue rise to equal luminance", async () => {
    const out = await (await colorBlindness(sharp(redPng), { type: "achromatopsia" }))
      .png()
      .toBuffer();
    const [r, g, b] = await channelMeans(out);

    // Input is pure red (255, 0, 0). Luminance of red = 0.2126 * 255 ~= 54.
    expect(r).toBeLessThan(255);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    // All three channels collapse to the same luminance value.
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThanOrEqual(50);
    expect(r).toBeLessThanOrEqual(58);
  });

  it("selects the matrix by type: protanopia differs from achromatopsia", async () => {
    const achroma = await channelMeans(
      await (await colorBlindness(sharp(redPng), { type: "achromatopsia" })).png().toBuffer(),
    );
    const protan = await channelMeans(
      await (await colorBlindness(sharp(redPng), { type: "protanopia" })).png().toBuffer(),
    );
    // Distinct matrices must yield distinct channel means for the same input.
    expect(protan).not.toEqual(achroma);
    // Protanopia on pure red keeps R > G > B (0.152/0.114/-0.003 * 255).
    expect(protan[0]).toBeGreaterThan(protan[1]);
    expect(protan[1]).toBeGreaterThanOrEqual(protan[2]);
  });

  it("runs every color-blindness type without error", async () => {
    const types: ColorBlindnessType[] = [
      "protanopia",
      "deuteranopia",
      "tritanopia",
      "protanomaly",
      "deuteranomaly",
      "tritanomaly",
      "achromatopsia",
      "blueConeMonochromacy",
    ];
    for (const type of types) {
      const out = await (await colorBlindness(sharp(redPng), { type })).png().toBuffer();
      expect(out).toBeInstanceOf(Buffer);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});

describe("processImage pipeline dispatch", () => {
  it("throws with the operation name on an unknown operation type", async () => {
    await expect(processImage(redPng, [{ type: "nonexistent-op", options: {} }])).rejects.toThrow(
      "Unknown operation: nonexistent-op",
    );
  });

  it("passes the input format through when no operations and no outputFormat are given", async () => {
    const result = await processImage(redPng, []);
    expect(result.info.format).toBe("png");
  });

  it("converts to the requested outputFormat", async () => {
    const result = await processImage(redPng, [], "webp");
    expect(result.info.format).toBe("webp");
  });

  it("maps the heif outputFormat alias through FORMAT_MAP to an avif encode", async () => {
    const result = await processImage(redPng, [], "heif");
    // FORMAT_MAP.heif -> "avif"; Sharp reports avif data as "heif".
    expect(result.info.format).toBe("heif");
  });

  it("throws on an unsupported outputFormat", async () => {
    await expect(processImage(redPng, [], "notaformat" as unknown as "png")).rejects.toThrow(
      "Unsupported output format: notaformat",
    );
  });

  it("applies a registered operation in sequence", async () => {
    // grayscale collapses pure red to a single mid-gray value across channels.
    const result = await processImage(redPng, [{ type: "grayscale", options: {} }]);
    const [r, g, b] = await channelMeans(result.buffer);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(255);
  });
});
