import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeHeic, ensureSharpCompat } from "../../../apps/api/src/lib/heic-converter.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

function isPng(buf: Buffer): boolean {
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function makeHeicHeader(brand: string): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, 4, "ascii");
  buf.write(brand, 8, 4, "ascii");
  return buf;
}

function makeIspeBox(width: number, height: number): Buffer {
  const box = Buffer.alloc(20);
  box.writeUInt32BE(20, 0);
  box.write("ispe", 4, 4, "ascii");
  box.writeUInt32BE(width, 12);
  box.writeUInt32BE(height, 16);
  return box;
}

/**
 * Rewrite an AVIF fixture's ftyp major and compatible brands from `avif` to
 * `mif1` so format detection classifies it as generic HEIF while its payload
 * remains an AV1 bitstream (#1462).
 */
function makeMif1Av1Buffer(): Buffer {
  const buf = Buffer.from(readFixture(fixtures.image.formats("avif")));
  const ftypSize = buf.readUInt32BE(0);
  buf.write("mif1", 8, 4, "ascii");
  for (let offset = 16; offset + 4 <= ftypSize && offset + 4 <= buf.length; offset += 4) {
    if (buf.subarray(offset, offset + 4).toString("ascii") === "avif") {
      buf.write("mif1", offset, 4, "ascii");
    }
  }
  return buf;
}

describe("decodeHeic", () => {
  it("rejects source dimensions over a caller-supplied pixel cap", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));

    await expect(decodeHeic(heicBuf, { maxPixels: 1 })).rejects.toThrow(/pixel safety limit/i);
  });

  it("checks every image extent instead of trusting a small first thumbnail", async () => {
    const multiImage = Buffer.concat([
      makeHeicHeader("heic"),
      makeIspeBox(1, 1),
      makeIspeBox(10_000, 10_000),
    ]);

    await expect(decodeHeic(multiImage, { maxPixels: 40_000_000 })).rejects.toThrow(
      /pixel safety limit/i,
    );
  });

  it("rejects an extreme image side from encoded metadata before starting a decoder", async () => {
    const extremeImage = Buffer.concat([
      makeHeicHeader("heic"),
      makeIspeBox(1_000, 1_000),
      makeIspeBox(40_001, 1),
    ]);

    await expect(
      decodeHeic(extremeImage, { maxDimension: 40_000, maxPixels: 40_000_000 }),
    ).rejects.toThrow(/dimension safety limit.*40,001x1/i);
  });

  it("does not let a 0x0 or zero-side ispe box bypass the dimension preflight when safety limits are set (#2896)", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      for (const [width, height] of [
        [0, 0],
        [0, 100],
        [100, 0],
      ] as const) {
        const zeroIspe = Buffer.concat([makeHeicHeader("heic"), makeIspeBox(width, height)]);
        await expect(decodeHeic(zeroIspe, { maxPixels: 1_000_000 })).rejects.toThrow(
          /encoded dimensions are unavailable/i,
        );
        await expect(decodeHeic(zeroIspe, { maxDimension: 1_000 })).rejects.toThrow(
          /encoded dimensions are unavailable/i,
        );
      }
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("does not trust a small valid ispe box when another ispe box has zero dimensions (#2896)", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      for (const boxes of [
        [makeIspeBox(100, 100), makeIspeBox(0, 0)],
        [makeIspeBox(0, 0), makeIspeBox(100, 100)],
        [makeIspeBox(100, 100), makeIspeBox(100, 0)],
        [makeIspeBox(100, 100), makeIspeBox(0, 100)],
      ]) {
        const mixedIspe = Buffer.concat([makeHeicHeader("heic"), ...boxes]);
        await expect(decodeHeic(mixedIspe, { maxPixels: 1_000_000 })).rejects.toThrow(
          /encoded dimensions are unavailable/i,
        );
        await expect(decodeHeic(mixedIspe, { maxDimension: 1_000 })).rejects.toThrow(
          /encoded dimensions are unavailable/i,
        );
      }
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("still rejects an oversized ispe box before metadata preflight when paired with a 0x0 ispe box (#2896)", async () => {
    const mixedOversized = Buffer.concat([
      makeHeicHeader("heic"),
      makeIspeBox(0, 0),
      makeIspeBox(10_000, 10_000),
    ]);
    await expect(decodeHeic(mixedOversized, { maxPixels: 1_000_000 })).rejects.toThrow(
      /pixel safety limit.*10000x10000/i,
    );
  });

  it("recovers via Sharp metadata preflight when a valid mif1 AV1 container has a trailing 0x0 ispe box (#2896)", async () => {
    const mif1WithTrailingZeroIspe = Buffer.concat([makeMif1Av1Buffer(), makeIspeBox(0, 0)]);
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const result = await decodeHeic(mif1WithTrailingZeroIspe, {
        maxPixels: 1_000_000,
        maxDimension: 1_000,
      });
      expect(isPng(result)).toBe(true);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("honors an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      decodeHeic(readFixture(fixtures.image.formats("heic")), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("decodes sample.heic to a valid PNG buffer", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const result = await decodeHeic(heicBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("decodes sample.heif to a valid PNG buffer", { timeout: 60_000 }, async () => {
    const heifBuf = readFixture(fixtures.image.formats("heif"));
    const result = await decodeHeic(heifBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("preserves image dimensions after decoding", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const result = await decodeHeic(heicBuf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.format).toBe("png");
  });

  it("rejects invalid/corrupt data", async () => {
    const garbage = Buffer.from("this is not a heic file at all");
    await expect(decodeHeic(garbage)).rejects.toThrow();
  });

  it("rejects an empty buffer", async () => {
    await expect(decodeHeic(Buffer.alloc(0))).rejects.toThrow();
  });

  it("cleans up temp files after success", { timeout: 60_000 }, async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const { tmpdir } = await import("node:os");
    const { readdirSync } = await import("node:fs");
    // decodeHeic stamps its temp files with this process's PID. Scope the check
    // to those so temp files created by other concurrent test-worker processes
    // (different PID) in the shared tmpdir cannot make this flaky.
    const mine = (f: string) =>
      f.startsWith(`heic-in-${process.pid}-`) || f.startsWith(`heic-out-${process.pid}-`);
    const beforeSet = new Set(readdirSync(tmpdir()).filter(mine));
    await decodeHeic(heicBuf);
    const leftover = readdirSync(tmpdir())
      .filter(mine)
      .filter((f) => !beforeSet.has(f));
    expect(leftover).toHaveLength(0);
  });

  it("decodes an AV1 image in a mif1 HEIF container via Sharp without shelling out (#1462)", async () => {
    const mif1Av1 = makeMif1Av1Buffer();
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const result = await decodeHeic(mif1Av1);
      expect(isPng(result)).toBe(true);
      const meta = await sharp(result).metadata();
      expect(meta.width).toBe(740);
      expect(meta.height).toBe(493);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("preserves EXIF metadata when decoding a mif1 AV1 container via Sharp (#1462)", async () => {
    const avifWithExif = await sharp({
      create: { width: 32, height: 16, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .withMetadata({ orientation: 6 })
      .avif()
      .toBuffer();
    const mif1WithExif = Buffer.from(avifWithExif);
    const ftypSize = mif1WithExif.readUInt32BE(0);
    mif1WithExif.write("mif1", 8, 4, "ascii");
    for (
      let offset = 16;
      offset + 4 <= ftypSize && offset + 4 <= mif1WithExif.length;
      offset += 4
    ) {
      if (mif1WithExif.subarray(offset, offset + 4).toString("ascii") === "avif") {
        mif1WithExif.write("mif1", offset, 4, "ascii");
      }
    }

    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const result = await decodeHeic(mif1WithExif);
      const meta = await sharp(result).metadata();
      expect(meta.format).toBe("png");
      expect(meta.exif).toBeDefined();
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("enforces maxDimension and maxPixels on a mif1 AV1 buffer without a CLI decoder (#1462)", async () => {
    const mif1Av1 = makeMif1Av1Buffer();
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      await expect(
        decodeHeic(mif1Av1, { maxDimension: 500, maxPixels: 40_000_000 }),
      ).rejects.toThrow(/dimension safety limit.*740x493/i);
      await expect(decodeHeic(mif1Av1, { maxPixels: 100 })).rejects.toThrow(
        /pixel safety limit.*740x493/i,
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("ensureSharpCompat", () => {
  it("decodes a HEIC buffer to PNG", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const result = await ensureSharpCompat(heicBuf);
    expect(isPng(result)).toBe(true);
  });

  it("decodes a mif1 AV1 HEIF buffer to PNG via Sharp without a CLI decoder (#1462)", async () => {
    const mif1Av1 = makeMif1Av1Buffer();
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const result = await ensureSharpCompat(mif1Av1);
      expect(isPng(result)).toBe(true);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("passes through a PNG buffer unchanged", async () => {
    const pngBuf = readFixture(fixtures.image.formats("png"));
    const result = await ensureSharpCompat(pngBuf);
    expect(result).toBe(pngBuf);
  });

  it("passes through a JPEG buffer unchanged", async () => {
    const jpgBuf = readFixture(fixtures.image.formats("jpg"));
    const result = await ensureSharpCompat(jpgBuf);
    expect(result).toBe(jpgBuf);
  });

  it("passes through a WebP buffer unchanged", async () => {
    const webpBuf = readFixture(fixtures.image.formats("webp"));
    const result = await ensureSharpCompat(webpBuf);
    expect(result).toBe(webpBuf);
  });

  it("detects heic brand in ftyp box", async () => {
    const fakeBuf = makeHeicHeader("heic");
    await expect(ensureSharpCompat(fakeBuf)).rejects.toThrow();
  });

  it("detects mif1 brand in ftyp box", async () => {
    const fakeBuf = makeHeicHeader("mif1");
    await expect(ensureSharpCompat(fakeBuf)).rejects.toThrow();
  });

  it("does not treat a short buffer as HEIF", async () => {
    const shortBuf = Buffer.from("tiny");
    const result = await ensureSharpCompat(shortBuf);
    expect(result).toBe(shortBuf);
  });
});
