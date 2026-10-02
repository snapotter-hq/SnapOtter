import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  validatedImageMime,
  validateImageBuffer,
} from "../../../apps/api/src/lib/file-validation.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

// TGA, Olympus ORF, Panasonic RW2 and SVGZ used to be accepted on their name
// alone (`nameOnly`), so the library stored real ones untyped (#1782). Each
// now has byte evidence the validator checks, and a name with no evidence
// behind it still earns no type (#1349).

type Result = Awaited<ReturnType<typeof validateImageBuffer>>;

function byBytes(result: Result, format: string): void {
  expect(result).toEqual({ valid: true, format, width: 0, height: 0 });
}

function byNameOnly(result: Result, format: string): void {
  expect(result).toEqual({ valid: true, format, width: 0, height: 0, nameOnly: true });
}

async function mimeFor(bytes: Buffer, filename: string): Promise<string | null> {
  const validation = await validateImageBuffer(bytes, filename);
  if (!validation.valid) throw new Error(`expected ${filename} to validate: ${validation.reason}`);
  return validatedImageMime(validation, filename);
}

/** A TIFF-style header: four signature bytes, then IFD offset 8, then padding. */
function rawHeader(signature: number[]): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from(signature).copy(buf, 0);
  buf.writeUInt32LE(8, 4);
  return buf;
}

// The first megabyte is all the validator reads for these (RAW isn't decoded
// at validation), and it keeps the integration copies under the upload cap.
const ORF = readFixture(fixtures.image.formats("orf")).subarray(0, 1024 * 1024);
const RW2 = readFixture(fixtures.image.formats("rw2")).subarray(0, 1024 * 1024);
const TGA = readFixture(fixtures.image.formats("tga"));
const SVGZ = readFixture(fixtures.image.formats("svgz"));
const TEXT = Buffer.from("plain text, not a picture\n");

describe("camera RAW signatures (#1782)", () => {
  // raw.pixls.us samples: IIRO on the E-1 through the E-M5 Mark II, IIRS on
  // the C-5060, MMOR on the big-endian E-10 and E-20.
  it.each([
    ["IIRO", [0x49, 0x49, 0x52, 0x4f]],
    ["IIRS", [0x49, 0x49, 0x52, 0x53]],
    ["MMOR", [0x4d, 0x4d, 0x4f, 0x52]],
  ])("finds an Olympus ORF by its %s signature", async (_label, signature) => {
    byBytes(await validateImageBuffer(rawHeader(signature), "P1010001.ORF"), "raw");
    expect(await mimeFor(rawHeader(signature), "P1010001.ORF")).toBe("image/x-olympus-orf");
  });

  it("finds a Panasonic RW2 or Leica RWL by its IIU signature", async () => {
    const header = rawHeader([0x49, 0x49, 0x55, 0x00]);
    expect(await mimeFor(header, "P1000001.RW2")).toBe("image/x-panasonic-rw2");
    expect(await mimeFor(header, "L1000001.RWL")).toBe("image/x-leica-rwl");
  });

  it("types the real ORF and RW2 fixtures from their bytes", async () => {
    byBytes(await validateImageBuffer(ORF, "sample.orf"), "raw");
    byBytes(await validateImageBuffer(RW2, "sample.rw2"), "raw");
    expect(await mimeFor(ORF, "sample.orf")).toBe("image/x-olympus-orf");
    expect(await mimeFor(RW2, "sample.rw2")).toBe("image/x-panasonic-rw2");
  });

  // The signature is the evidence, so the name can't undo it. It only picks
  // the specific RAW type when it is a RAW extension.
  it("finds ORF and RW2 bytes under a name that isn't a RAW extension", async () => {
    byBytes(await validateImageBuffer(ORF, "upload.bin"), "raw");
    expect(await mimeFor(RW2, "upload.bin")).toBe("image/x-dcraw");
  });

  // PEF is a plain TIFF (K10D files open MM\0*, K-3 files II*\0), so it was
  // never name-only: the TIFF signature plus the .pef name already types it.
  it.each([
    ["big-endian", [0x4d, 0x4d, 0x00, 0x2a]],
    ["little-endian", [0x49, 0x49, 0x2a, 0x00]],
  ])("types a %s TIFF named .pef as Pentax PEF", async (_label, signature) => {
    expect(await mimeFor(rawHeader(signature), "IMGP0001.PEF")).toBe("image/x-pentax-pef");
  });

  it.each([
    ["one byte off IIRO", [0x49, 0x49, 0x52, 0x50]],
    ["one byte off IIU", [0x49, 0x49, 0x55, 0x01]],
    ["IIU with the case flipped", [0x69, 0x69, 0x75, 0x00]],
  ])("leaves %s to the name", async (_label, signature) => {
    byNameOnly(await validateImageBuffer(rawHeader(signature), "photo.orf"), "raw");
    expect(await validateImageBuffer(rawHeader(signature), "photo.bin")).toEqual({
      valid: false,
      reason: "Unrecognized image format",
    });
  });
});

describe("TGA header and pixel data (#1782)", () => {
  it.each([
    ["uncompressed true-colour, no footer", TGA],
    ["uncompressed colour-mapped", readFixture(fixtures.image.edge.tgaColormap)],
    ["RLE colour-mapped", readFixture(fixtures.image.edge.tgaColormapRle)],
    ["RLE grayscale", readFixture(fixtures.image.edge.tgaGrayRle)],
    ["RLE 32-bit with alpha", readFixture(fixtures.image.edge.tgaRgbaRle)],
    ["RLE with a TGA 2.0 footer", readFixture(fixtures.image.edge.tga2RleFooter)],
  ])("types a real %s TGA", async (_label, bytes) => {
    byBytes(await validateImageBuffer(bytes, "art.tga"), "tga");
    expect(await mimeFor(bytes, "art.tga")).toBe("image/x-tga");
  });

  it("keeps a .tga with no structure behind it name-only", async () => {
    byNameOnly(await validateImageBuffer(TEXT, "notes.tga"), "tga");
    byNameOnly(await validateImageBuffer(Buffer.alloc(18, 0x11), "notes.tga"), "tga");
  });

  // The footer is an 18-byte string anyone can append; on its own it says
  // nothing about the bytes in front of it.
  it("doesn't take a TGA 2.0 footer on its own as evidence", async () => {
    const footer = Buffer.concat([Buffer.alloc(8), Buffer.from("TRUEVISION-XFILE.\0", "ascii")]);
    const fake = Buffer.concat([TEXT, footer]);
    byNameOnly(await validateImageBuffer(fake, "notes.tga"), "tga");
  });

  it("keeps a TGA cut short of its pixel data name-only", async () => {
    byNameOnly(await validateImageBuffer(TGA.subarray(0, TGA.length - 1), "cut.tga"), "tga");
    const rle = readFixture(fixtures.image.edge.tgaGrayRle);
    byNameOnly(await validateImageBuffer(rle.subarray(0, rle.length - 1), "cut.tga"), "tga");
    byNameOnly(await validateImageBuffer(TGA.subarray(0, 17), "cut.tga"), "tga");
  });

  // Each header field outside what the format allows, on an otherwise valid
  // file. A failure keeps the old name-only result: the decoder still gets
  // the last word in a tool, the library just won't vouch for it.
  it.each([
    ["colour map type 2", 1, 2],
    ["image type 0 (no image data)", 2, 0],
    ["image type 4", 2, 4],
    ["image type 32 (Huffman, unsupported)", 2, 32],
    ["pixel depth 12", 16, 12],
    ["reserved descriptor bits", 17, 0xc0],
  ])("keeps a header with %s name-only", async (_label, offset, value) => {
    const bytes = Buffer.from(TGA);
    bytes[offset] = value;
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  it.each([
    ["zero width", 12],
    ["zero height", 14],
  ])("keeps a header with %s name-only", async (_label, offset) => {
    const bytes = Buffer.from(TGA);
    bytes.writeUInt16LE(0, offset);
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  it("keeps a colour-mapped header without a colour map name-only", async () => {
    const bytes = Buffer.from(readFixture(fixtures.image.edge.tgaColormap));
    bytes[1] = 0;
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  it("keeps a colour map with an impossible entry size name-only", async () => {
    const bytes = Buffer.from(readFixture(fixtures.image.edge.tgaColormap));
    bytes[7] = 7;
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  // The CUR signature (00 00 02 00) is also how an uncompressed true-colour
  // TGA starts, so the .tga name decides which reading is tried. Without it
  // the same bytes are still a cursor, as before.
  it("still reads a real TGA's bytes as CUR when the name isn't .tga", async () => {
    expect(await validateImageBuffer(TGA, "art.cur")).toMatchObject({ valid: true, format: "cur" });
  });
});

describe("SVGZ contents (#1782)", () => {
  it("types the real SVGZ fixture from its inflated contents", async () => {
    byBytes(await validateImageBuffer(SVGZ, "sample.svgz"), "svg");
    expect(await mimeFor(SVGZ, "sample.svgz")).toBe("image/svg+xml");
  });

  it("types a gzip stream cut short once its head proves an SVG", async () => {
    byBytes(await validateImageBuffer(SVGZ.subarray(0, 512), "cut.svgz"), "svg");
  });

  it.each([
    ["plain text", gzipSync(TEXT)],
    ["an HTML page that embeds an <svg>", gzipSync('<html><body><svg width="1"/></body></html>')],
    ["a PNG", gzipSync(readFixture(fixtures.image.base.png200))],
    ["a gzip header with no deflate data", Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00])],
    ["a corrupt deflate stream", Buffer.concat([SVGZ.subarray(0, 10), Buffer.alloc(64, 0xff)])],
  ])("keeps gzipped %s named .svgz name-only", async (_label, bytes) => {
    byNameOnly(await validateImageBuffer(bytes, "drawing.svgz"), "svg");
  });

  // Only the 4KB isSvgBuffer reads is inflated, so a bomb costs no more than
  // a small file. 64MB of padding before the root is past that window.
  it("inflates only the head of a decompression bomb", async () => {
    const bomb = gzipSync(
      Buffer.concat([Buffer.alloc(64 * 1024 * 1024, 0x20), Buffer.from("<svg/>")]),
    );
    const before = process.memoryUsage().arrayBuffers;
    byNameOnly(await validateImageBuffer(bomb, "bomb.svgz"), "svg");
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(16 * 1024 * 1024);
  });

  it("needs the .svgz name before it looks inside a gzip stream", async () => {
    expect(await validateImageBuffer(SVGZ, "drawing.gz")).toEqual({
      valid: false,
      reason: "Unrecognized image format",
    });
  });
});
