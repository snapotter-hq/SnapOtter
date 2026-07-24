import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";

// Targets the LOGIC survivors of file-validation.ts (L200+): the megapixel
// limit arithmetic, the null-byte spot-check positions, the SVGZ gzip guard,
// the HDR text-header guard, and the extension extraction. (The L1-199
// survivors are static const data tables - MAGIC_BYTES etc. - which a
// switch-based mutator cannot kill; those are documented, not chased here.)

const originalMaxMp = env.MAX_MEGAPIXELS;
afterEach(() => {
  env.MAX_MEGAPIXELS = originalMaxMp;
});

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

describe("file-validation megapixel limit (L277/L279/L282)", () => {
  it("rejects an image over the limit with the exact MP and limit in the reason", async () => {
    const buf = await png(2000, 2000); // 4.0 MP
    env.MAX_MEGAPIXELS = 3;
    const res = await validateImageBuffer(buf, "big.png");
    expect(res.valid).toBe(false);
    expect((res as { reason: string }).reason).toBe(
      "Image exceeds maximum size: 4.0MP (limit: 3MP)",
    );
  });

  it("accepts the same image when the limit is above its size (kills the > comparison)", async () => {
    const buf = await png(2000, 2000); // 4.0 MP
    env.MAX_MEGAPIXELS = 5;
    const res = await validateImageBuffer(buf, "ok.png");
    expect(res).toMatchObject({ valid: true, format: "png", width: 2000, height: 2000 });
  });

  it("treats MAX_MEGAPIXELS = 0 as unlimited (kills the `> 0 &&` guard)", async () => {
    const buf = await png(2000, 2000);
    env.MAX_MEGAPIXELS = 0;
    const res = await validateImageBuffer(buf, "unlimited.png");
    expect(res).toMatchObject({ valid: true, width: 2000, height: 2000 });
  });
});

describe("file-validation null-byte spot positions (L304-L309)", () => {
  // A 256-byte buffer, all zero except one non-null byte at a spot-check
  // position. isNullByteBuffer must return false (so the verdict is
  // "Unrecognized image format", not "File contains no image data"). Each case
  // pins one of Math.floor(len/4), len/2, 3*len/4, len-1: a mutation of that
  // index checks the wrong slot, misses the lone non-null byte, and wrongly
  // reports the buffer as all-null.
  const LEN = 256;
  const cases: Array<[string, number]> = [
    ["len/4", LEN / 4], // 64
    ["len/2", LEN / 2], // 128
    ["3*len/4", (LEN * 3) / 4], // 192
    ["len-1", LEN - 1], // 255
  ];
  for (const [label, pos] of cases) {
    it(`a lone non-null byte at ${label} is detected as data, not all-null`, async () => {
      const buf = Buffer.alloc(LEN, 0);
      buf[pos] = 0x7f;
      const res = await validateImageBuffer(buf, "probe.bin");
      expect(res).toEqual({ valid: false, reason: "Unrecognized image format" });
    });
  }

  it("an all-null large buffer IS reported as containing no image data", async () => {
    const res = await validateImageBuffer(Buffer.alloc(LEN, 0), "empty.bin");
    expect(res).toEqual({ valid: false, reason: "File contains no image data" });
  });
});

describe("file-validation SVGZ gzip guard (L235-L236)", () => {
  it("accepts an .svgz file that starts with the gzip magic 1f 8b", async () => {
    const buf = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00]);
    const res = await validateImageBuffer(buf, "icon.svgz");
    expect(res).toEqual({ valid: true, format: "svg", width: 0, height: 0 });
  });

  it("rejects an .svgz whose first byte is not 0x1f (kills the byte[0] check)", async () => {
    const buf = Buffer.from([0x1e, 0x8b, 0x08, 0x00, 0x00]);
    const res = await validateImageBuffer(buf, "icon.svgz");
    expect(res.valid).toBe(false);
  });

  it("rejects an .svgz whose second byte is not 0x8b (kills the byte[1] check)", async () => {
    const buf = Buffer.from([0x1f, 0x8c, 0x08, 0x00, 0x00]);
    const res = await validateImageBuffer(buf, "icon.svgz");
    expect(res.valid).toBe(false);
  });

  it("rejects an .svgz shorter than 2 bytes (kills the length >= 2 guard)", async () => {
    const res = await validateImageBuffer(Buffer.from([0x1f]), "tiny.svgz");
    expect(res.valid).toBe(false);
  });
});

describe("file-validation extension extraction + TGA (L216, L228)", () => {
  it("uses the lowercased last dot-segment: an uppercase .TGA name resolves to tga", async () => {
    // 18 non-null bytes with no known magic; only the extension makes it TGA.
    const buf = Buffer.alloc(18, 0x11);
    const res = await validateImageBuffer(buf, "scan.final.TGA");
    expect(res).toMatchObject({ valid: true, format: "tga" });
  });

  it("without a filename there is no extension, so the same bytes are unrecognized", async () => {
    const buf = Buffer.alloc(18, 0x11);
    const res = await validateImageBuffer(buf);
    expect(res).toEqual({ valid: false, reason: "Unrecognized image format" });
  });
});
