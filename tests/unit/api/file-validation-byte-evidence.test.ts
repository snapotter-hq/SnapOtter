import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TGA_MAX_RLE_PACKETS,
  validatedImageMime,
  validateImageBuffer,
} from "../../../apps/api/src/lib/file-validation.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

// Counts what every gunzip stream the validator opens hands back, so the bomb
// test can assert how much was inflated rather than guess from heap numbers.
const inflated = vi.hoisted(() => ({ bytes: 0 }));
vi.mock("node:zlib", async (importOriginal) => {
  const zlib = await importOriginal<typeof import("node:zlib")>();
  return {
    ...zlib,
    createGunzip: (...args: Parameters<typeof zlib.createGunzip>) => {
      const gunzip = zlib.createGunzip(...args);
      gunzip.on("data", (chunk: Buffer) => {
        inflated.bytes += chunk.length;
      });
      return gunzip;
    },
  };
});

beforeEach(() => {
  inflated.bytes = 0;
});

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

/**
 * A TIFF-style header: four signature bytes, the first IFD's offset (8 unless
 * given) in the byte order the signature names, and a one-entry IFD there.
 */
function rawHeader(signature: number[], ifd = 8, entries = 1): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from(signature).copy(buf, 0);
  const littleEndian = signature[0] === 0x49;
  if (littleEndian) buf.writeUInt32LE(ifd, 4);
  else buf.writeUInt32BE(ifd, 4);
  if (ifd + 2 <= buf.length) {
    if (littleEndian) buf.writeUInt16LE(entries, ifd);
    else buf.writeUInt16BE(entries, ifd);
  }
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

  // IIRO, IIRS and MMOR are printable ASCII, so text can open with them. The
  // IFD they point at is what tells a TIFF from a note about an MMORPG.
  it.each(["MMORPG notes, nothing to see\n", "IIROC filing rules\n", "IIRS: a line of text\n"])(
    "doesn't take text opening %j for an ORF",
    async (text) => {
      const bytes = Buffer.from(text);
      expect(await validateImageBuffer(bytes, "notes.txt")).toEqual({
        valid: false,
        reason: "Unrecognized image format",
      });
      byNameOnly(await validateImageBuffer(bytes, "notes.orf"), "raw");
    },
  );

  it.each([
    ["an IFD offset inside the header", 4, 1],
    ["an IFD offset past the end", 64, 1],
    ["an IFD with no entries", 8, 0],
    ["an IFD claiming more entries than fit", 8, 5],
    ["an IFD claiming over 1000 entries", 8, 1001],
  ])("leaves an ORF signature with %s to the name", async (_label, ifd, entries) => {
    const header = rawHeader([0x49, 0x49, 0x52, 0x4f], ifd, entries);
    byNameOnly(await validateImageBuffer(header, "photo.orf"), "raw");
  });

  it("reads a big-endian ORF's IFD in big-endian order", async () => {
    // Little-endian, offset 8 reads as 0x08000000: past the end.
    const header = rawHeader([0x4d, 0x4d, 0x4f, 0x52]);
    byBytes(await validateImageBuffer(header, "P7198607.ORF"), "raw");
    header.writeUInt32LE(8, 4);
    byNameOnly(await validateImageBuffer(header, "P7198607.ORF"), "raw");
  });

  it("checks an RW2's IFD too", async () => {
    byBytes(await validateImageBuffer(rawHeader([0x49, 0x49, 0x55, 0x00], 24), "a.rw2"), "raw");
    byNameOnly(
      await validateImageBuffer(rawHeader([0x49, 0x49, 0x55, 0x00], 24, 0), "a.rw2"),
      "raw",
    );
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

  // Each layout cut one byte short of the end of its pixel data, which is the
  // end of the file except for the footer one (a 26-byte footer follows it).
  // These are what pin the size arithmetic: the colour map's length, each
  // packet's width, the per-pixel byte count.
  it.each([
    ["uncompressed true-colour", TGA, 0],
    ["uncompressed colour-mapped", readFixture(fixtures.image.edge.tgaColormap), 0],
    ["RLE colour-mapped", readFixture(fixtures.image.edge.tgaColormapRle), 0],
    ["RLE grayscale", readFixture(fixtures.image.edge.tgaGrayRle), 0],
    ["RLE 32-bit", readFixture(fixtures.image.edge.tgaRgbaRle), 0],
    ["RLE with runs and a footer", readFixture(fixtures.image.edge.tga2RleFooter), 26],
  ])("keeps a %s TGA cut short of its pixel data name-only", async (_label, bytes, footer) => {
    const dataEnd = bytes.length - footer;
    byBytes(await validateImageBuffer(bytes.subarray(0, dataEnd), "cut.tga"), "tga");
    byNameOnly(await validateImageBuffer(bytes.subarray(0, dataEnd - 1), "cut.tga"), "tga");
  });

  it("keeps a TGA shorter than its header name-only", async () => {
    byNameOnly(await validateImageBuffer(TGA.subarray(0, 17), "cut.tga"), "tga");
  });

  it("skips the image ID field before the pixel data", async () => {
    const withId = Buffer.concat([TGA.subarray(0, 18), Buffer.from("hello"), TGA.subarray(18)]);
    withId[0] = 5;
    byBytes(await validateImageBuffer(withId, "art.tga"), "tga");
    byNameOnly(await validateImageBuffer(withId.subarray(0, withId.length - 1), "art.tga"), "tga");
  });

  // A true-colour image may carry a colour map it doesn't use; it still sits
  // between the header and the pixels.
  it("skips a colour map on a true-colour image", async () => {
    const withMap = Buffer.concat([TGA.subarray(0, 18), Buffer.alloc(6, 0x7f), TGA.subarray(18)]);
    withMap[1] = 1;
    withMap.writeUInt16LE(2, 5);
    withMap[7] = 24;
    byBytes(await validateImageBuffer(withMap, "art.tga"), "tga");
    // The same header with the map's bytes missing comes up six bytes short.
    const header = Buffer.from(withMap.subarray(0, 18));
    byNameOnly(
      await validateImageBuffer(Buffer.concat([header, TGA.subarray(18)]), "a.tga"),
      "tga",
    );
  });

  // 15-bit entries and 16-bit indices both take two bytes each: rounding the
  // bit depth down instead of up would undercount both.
  it("sizes a 15-bit colour map and 16-bit indices in whole bytes", async () => {
    const header = Buffer.alloc(18);
    header[1] = 1; // colour map present
    header[2] = 1; // colour-mapped
    header.writeUInt16LE(3, 5); // three entries
    header[7] = 15;
    header.writeUInt16LE(2, 12);
    header.writeUInt16LE(2, 14);
    header[16] = 16;
    const image = Buffer.concat([header, Buffer.alloc(3 * 2, 0x55), Buffer.alloc(4 * 2, 0x01)]);
    byBytes(await validateImageBuffer(image, "map.tga"), "tga");
    byNameOnly(await validateImageBuffer(image.subarray(0, image.length - 1), "map.tga"), "tga");
  });

  // The walk is capped so a crafted file of one-pixel packets can't hold the
  // event loop for its whole length. 2048 x 2048 one-pixel packets is exactly
  // the cap; one more row is past it, and stays name-only.
  it("stops walking RLE packets at the cap", async () => {
    const onePixelPackets = (width: number, height: number) => {
      const header = Buffer.alloc(18);
      header[2] = 11; // RLE grayscale
      header.writeUInt16LE(width, 12);
      header.writeUInt16LE(height, 14);
      header[16] = 8;
      // Raw packets of one pixel each: header byte 0x00, then the pixel.
      return Buffer.concat([header, Buffer.alloc(width * height * 2, 0)]);
    };
    expect(2048 * 2048).toBe(TGA_MAX_RLE_PACKETS);
    byBytes(await validateImageBuffer(onePixelPackets(2048, 2048), "big.tga"), "tga");
    byNameOnly(await validateImageBuffer(onePixelPackets(2048, 2049), "big.tga"), "tga");
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
    ["reserved descriptor bit 6", 17, 0x40],
    ["reserved descriptor bit 7", 17, 0x80],
  ])("keeps a header with %s name-only", async (_label, offset, value) => {
    const bytes = Buffer.from(TGA);
    bytes[offset] = value;
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  // Pixel depths are per image type: 24 bits is a true-colour depth only.
  it.each([
    ["colour-mapped", fixtures.image.edge.tgaColormap],
    ["grayscale", fixtures.image.edge.tgaGrayRle],
  ])("keeps a %s header with 24-bit pixels name-only", async (_label, path) => {
    const bytes = Buffer.from(readFixture(path));
    bytes[16] = 24;
    byNameOnly(await validateImageBuffer(bytes, "art.tga"), "tga");
  });

  it("keeps a colour map of no entries name-only", async () => {
    const bytes = Buffer.from(readFixture(fixtures.image.edge.tgaColormap));
    bytes.writeUInt16LE(0, 5);
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
    // It inflates to about 117KB; only the head is read.
    expect(inflated.bytes).toBeGreaterThan(0);
    expect(inflated.bytes).toBeLessThan(2 * 64 * 1024);
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
    byNameOnly(await validateImageBuffer(bomb, "bomb.svgz"), "svg");
    // The limit plus at most one zlib output chunk (16KB by default), not 64MB.
    expect(inflated.bytes).toBeGreaterThanOrEqual(4096);
    expect(inflated.bytes).toBeLessThan(4096 + 64 * 1024);
  });

  it("needs the .svgz name before it looks inside a gzip stream", async () => {
    expect(await validateImageBuffer(SVGZ, "drawing.gz")).toEqual({
      valid: false,
      reason: "Unrecognized image format",
    });
  });
});

// Each of these signatures is printable ASCII, so text can open with it, and
// used to be typed as that image on the signature alone (#1859). Every one
// now needs a header behind it that text can't spell.
describe("ASCII signatures need a header behind them (#1859)", () => {
  const unrecognized = { valid: false, reason: "Unrecognized image format" };

  it.each([
    "BMW service notes\nOil change due in May.\n",
    "P1 priority list\n",
    "P2 plan\n",
    "P3 meeting agenda\n",
    "P4 notes\n",
    "P5 report\n",
    "P6 is the sixth item\n",
    "P7 notes, not a PAM\n",
    "P3 3 items to buy\n",
    "FOVbar is a word\n",
    "SIMPLE question: why?\n",
    "SIMPLE  = maybe\n",
    "SIMPLE  = The plan for Q3\n",
    "SDPX draft, version two\n",
    "XPDS draft, version two\n",
    "DDS notes for the handover\n",
    "qoif is not a word\n",
    "8BPS notes\n",
  ])("doesn't take text opening %j for an image", async (text) => {
    expect(await validateImageBuffer(Buffer.from(text), "notes.txt")).toEqual(unrecognized);
  });

  it.each([
    ["bmp", "bmp", "image/bmp"],
    ["pbm", "pbm", "image/x-portable-bitmap"],
    ["pgm", "pgm", "image/x-portable-graymap"],
    ["ppm", "ppm", "image/x-portable-pixmap"],
    ["fits", "fits", "image/fits"],
    ["dpx", "dpx", "image/x-dpx"],
    ["dds", "dds", "image/vnd.ms-dds"],
    ["qoi", "qoi", "image/qoi"],
    ["psd", "psd", "image/vnd.adobe.photoshop"],
  ])("still types the real .%s fixture from its bytes", async (ext, format, mime) => {
    const bytes = readFixture(fixtures.image.formats(ext));
    byBytes(await validateImageBuffer(bytes, `sample.${ext}`), format);
    expect(await mimeFor(bytes, `sample.${ext}`)).toBe(mime);
  });

  describe("BMP", () => {
    const bmp = (dibSize: number) => {
      const buf = Buffer.alloc(64);
      buf.write("BM", 0, "latin1");
      buf.writeUInt32LE(64, 2);
      buf.writeUInt32LE(14 + dibSize, 10);
      buf.writeUInt32LE(dibSize, 14);
      return buf;
    };

    // OS/2 1.x (12), OS/2 2.x (16 to 64, cut short anywhere in that range),
    // Windows v3 to v5 (40, 52, 56, 108, 124).
    it.each([12, 16, 17, 40, 41, 52, 56, 64, 108, 124])(
      "takes a DIB header of %i bytes",
      async (size) => {
        byBytes(await validateImageBuffer(bmp(size), "a.bmp"), "bmp");
      },
    );

    it.each([0, 11, 13, 15, 125, 0x20202020])("rejects a DIB header size of %i", async (size) => {
      expect(await validateImageBuffer(bmp(size), "a.bmp")).toEqual(unrecognized);
    });

    it("rejects a BM too short to hold the DIB header size", async () => {
      expect(await validateImageBuffer(bmp(40).subarray(0, 17), "a.bmp")).toEqual(unrecognized);
    });
  });

  describe("Netpbm", () => {
    it.each([
      ["P1\n32 21\n0 1 1 0\n", "pbm"],
      ["P2\n32 21\n255\n127 103\n", "pgm"],
      ["P3\n32 21\n255\n164 116 137\n", "ppm"],
      ["P4\n640 426\n\x00\x0f", "pbm"],
      ["P5 2 2 255 abcd", "pgm"],
      ["P6\n# Created by GIMP version 2.10.38 PNM plug-in\n2 1\n255\nabcdef", "ppm"],
      ["P6\r\n2\t1\r\n255\r\nabcdef", "ppm"],
      ["P6 # width\n2 # height\n1\n255\nabcdef", "ppm"],
      ["P6#comment right after the magic\n2 1\n255\nabcdef", "ppm"],
      ["P6 # ended by a CR\r2 1\n255\nabcdef", "ppm"],
      ["P6\n9 9\n255\n", "ppm"],
      ["P6\u000b2\u000c1\n255\n", "ppm"],
    ])("takes the header of %j", async (text, format) => {
      byBytes(await validateImageBuffer(Buffer.from(text, "latin1"), "a.pnm"), format);
    });

    it.each([
      ["P6", "only the magic"],
      ["P6\n", "no width"],
      ["P6\n2", "no height"],
      ["P6\n2 ", "nothing after the width"],
      ["P62 1\n255\n", "no separator after the magic"],
      ["P6\n2x1\n255\n", "no separator between the dimensions"],
      ["P6\n# a comment that never ends", "an unterminated comment"],
      ["P6\n-2 1\n255\n", "a signed width"],
    ])("rejects %j (%s)", async (text) => {
      expect(await validateImageBuffer(Buffer.from(text, "latin1"), "a.ppm")).toEqual(unrecognized);
    });

    // A header padded with comments past the scan window isn't read to its end.
    it("stops looking for the dimensions after the header window", async () => {
      const padded = `P6\n${"# padding\n".repeat(7000)}2 1\n255\nabcdef`;
      expect(await validateImageBuffer(Buffer.from(padded), "a.ppm")).toEqual(unrecognized);
      const short = `P6\n${"# padding\n".repeat(100)}2 1\n255\nabcdef`;
      byBytes(await validateImageBuffer(Buffer.from(short), "a.ppm"), "ppm");
    });

    it("takes a PAM by its WIDTH line", async () => {
      const pam = "P7\nWIDTH 32\nHEIGHT 21\nDEPTH 3\nMAXVAL 255\nTUPLTYPE RGB\nENDHDR\nabc";
      byBytes(await validateImageBuffer(Buffer.from(pam), "a.pam"), "ppm");
      const commented = "P7\n# written by hand\nHEIGHT 21\nWIDTH 32\nENDHDR\n";
      byBytes(await validateImageBuffer(Buffer.from(commented), "a.pam"), "ppm");
      byBytes(await validateImageBuffer(Buffer.from("P7\nWIDTH\t32\n"), "a.pam"), "ppm");
      byBytes(await validateImageBuffer(Buffer.from("P7\n  WIDTH 32\n"), "a.pam"), "ppm");
    });

    it("stops looking for a PAM's WIDTH line after the header window", async () => {
      const padded = `P7\n${"# padding\n".repeat(7000)}WIDTH 1\nENDHDR\n`;
      expect(await validateImageBuffer(Buffer.from(padded), "a.pam")).toEqual(unrecognized);
      const short = `P7\n${"# padding\n".repeat(100)}WIDTH 1\nENDHDR\n`;
      byBytes(await validateImageBuffer(Buffer.from(short), "a.pam"), "ppm");
    });

    it.each([
      ["P7\nHEIGHT 21\nENDHDR\nWIDTH 32\n", "a WIDTH line only after ENDHDR"],
      ["P7\nWIDTH\nHEIGHT 21\n", "a WIDTH line with no number"],
      ["P7\nWIDTH32\n", "no space after WIDTH"],
      ["P7 WIDTH 32\n", "WIDTH on the magic's line"],
    ])("rejects a PAM with %s", async (text) => {
      expect(await validateImageBuffer(Buffer.from(text), "a.pam")).toEqual(unrecognized);
    });
  });

  describe("FITS", () => {
    const card = (value: string) => Buffer.from(`SIMPLE  = ${value}`.padEnd(2880, " "), "latin1");

    it("takes a fixed-format SIMPLE = T card", async () => {
      byBytes(await validateImageBuffer(card(`${" ".repeat(19)}T`), "a.fits"), "fits");
    });

    it("takes a free-format SIMPLE = T card", async () => {
      byBytes(await validateImageBuffer(card("T / conforms"), "a.fits"), "fits");
      byBytes(await validateImageBuffer(card("T/conforms"), "a.fits"), "fits");
    });

    it("takes a T that ends the buffer", async () => {
      byBytes(await validateImageBuffer(Buffer.from("SIMPLE  = T"), "a.fits"), "fits");
    });

    it.each([
      ["SIMPLE = F", card(`${" ".repeat(19)}F`)],
      ["no value", card("")],
      ["a word starting with T", card("True story")],
      ["no space before the =", Buffer.from("SIMPLE= T".padEnd(80, " "))],
      ["a T past the first card", Buffer.from(`SIMPLE  = ${" ".repeat(70)}T`)],
    ])("rejects %s", async (_label, bytes) => {
      expect(await validateImageBuffer(bytes, "a.fits")).toEqual(unrecognized);
    });
  });

  describe("DPX", () => {
    // The image data offset at byte 4, big-endian after SDPX, little-endian
    // after XPDS. ImageMagick writes 8192, ffmpeg 1664.
    const dpx = (magic: string, offset: number, length = 8192, order = magic) => {
      const buf = Buffer.alloc(length);
      buf.write(magic, 0, "latin1");
      if (order === "SDPX") buf.writeUInt32BE(offset, 4);
      else buf.writeUInt32LE(offset, 4);
      return buf;
    };

    it.each([
      ["SDPX", 8192],
      ["XPDS", 1664],
      ["SDPX", 768],
      ["XPDS", 2048],
    ])("takes %s with its image data at %i", async (magic, offset) => {
      byBytes(await validateImageBuffer(dpx(magic, offset), "a.dpx"), "dpx");
    });

    it("doesn't care what the version string says", async () => {
      for (const version of ["V3.0", "V1.0    ", "\0\0\0\0\0\0\0\0"]) {
        const bytes = dpx("SDPX", 2048);
        bytes.write(version, 8, "latin1");
        byBytes(await validateImageBuffer(bytes, "a.dpx"), "dpx");
      }
    });

    it.each([
      ["data inside the generic header", dpx("SDPX", 767)],
      ["data past the end of the file", dpx("SDPX", 8193)],
      ["an offset in the wrong byte order", dpx("SDPX", 2048, 8192, "XPDS")],
      ["a header cut at 7 bytes", dpx("XPDS", 2048).subarray(0, 7)],
    ])("rejects %s", async (_label, bytes) => {
      expect(await validateImageBuffer(bytes, "a.dpx")).toEqual(unrecognized);
    });

    it("takes data that starts exactly at the end of the buffer", async () => {
      byBytes(await validateImageBuffer(dpx("XPDS", 1024, 1024), "a.dpx"), "dpx");
    });

    it("still takes a Cineon file by its binary signature", async () => {
      const cineon = Buffer.alloc(64);
      Buffer.from([0x80, 0x2a, 0x5f, 0xd7]).copy(cineon);
      byBytes(await validateImageBuffer(cineon, "a.cin"), "dpx");
    });
  });

  describe("DDS", () => {
    const dds = (headerSize: number) => {
      const buf = Buffer.alloc(128);
      buf.write("DDS ", 0, "latin1");
      buf.writeUInt32LE(headerSize, 4);
      return buf;
    };

    it("takes a 124-byte header", async () => {
      byBytes(await validateImageBuffer(dds(124), "a.dds"), "dds");
    });

    it.each([0, 123, 125, 0x65746f6e])("rejects a header size of %i", async (size) => {
      expect(await validateImageBuffer(dds(size), "a.dds")).toEqual(unrecognized);
    });

    it("rejects a header cut at 7 bytes", async () => {
      expect(await validateImageBuffer(dds(124).subarray(0, 7), "a.dds")).toEqual(unrecognized);
    });
  });

  describe("QOI", () => {
    const qoi = (width: number, height: number, channels: number, colorspace: number) => {
      const buf = Buffer.alloc(22);
      buf.write("qoif", 0, "latin1");
      buf.writeUInt32BE(width, 4);
      buf.writeUInt32BE(height, 8);
      buf[12] = channels;
      buf[13] = colorspace;
      return buf;
    };

    it.each([
      [3, 0],
      [4, 0],
      [3, 1],
      [4, 1],
    ])("takes %i channels in colourspace %i", async (channels, colorspace) => {
      byBytes(await validateImageBuffer(qoi(32, 21, channels, colorspace), "a.qoi"), "qoi");
    });

    it.each([
      ["zero width", qoi(0, 21, 3, 0)],
      ["zero height", qoi(32, 0, 3, 0)],
      ["two channels", qoi(32, 21, 2, 0)],
      ["five channels", qoi(32, 21, 5, 0)],
      ["colourspace 2", qoi(32, 21, 3, 2)],
      ["a header cut at 13 bytes", qoi(32, 21, 3, 0).subarray(0, 13)],
      ["a header cut at 12 bytes", qoi(32, 21, 3, 0).subarray(0, 12)],
    ])("rejects %s", async (_label, bytes) => {
      expect(await validateImageBuffer(bytes, "a.qoi")).toEqual(unrecognized);
    });
  });

  describe("PSD", () => {
    const psd = (version: number) => {
      const buf = Buffer.alloc(64);
      buf.write("8BPS", 0, "latin1");
      buf.writeUInt16BE(version, 4);
      return buf;
    };

    it.each([
      [1, "PSD"],
      [2, "PSB"],
    ])("takes version %i (%s)", async (version) => {
      byBytes(await validateImageBuffer(psd(version), "a.psd"), "psd");
    });

    // The reserved bytes after the version should be zero, but a decoder
    // doesn't need them to be and the version's NUL already rules text out.
    it("takes a header with junk in its reserved bytes", async () => {
      byBytes(await validateImageBuffer(Buffer.from(psd(1)).fill(7, 6, 12), "a.psd"), "psd");
    });

    it.each([
      ["version 0", psd(0)],
      ["version 3", psd(3)],
      ["a header cut at 5 bytes", psd(1).subarray(0, 5)],
    ])("rejects %s", async (_label, bytes) => {
      expect(await validateImageBuffer(bytes, "a.psd")).toEqual(unrecognized);
    });
  });

  describe("Sigma X3F", () => {
    const x3f = (major: number, minor: number) => {
      const buf = Buffer.alloc(64);
      buf.write("FOVb", 0, "latin1");
      buf.writeUInt16LE(minor, 4);
      buf.writeUInt16LE(major, 6);
      return buf;
    };

    it.each([
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 3],
      [2, 255],
      [3, 0],
      [4, 1],
      [15, 0],
    ])("takes version %i.%i", async (major, minor) => {
      byBytes(await validateImageBuffer(x3f(major, minor), "a.x3f"), "raw");
      byBytes(await validateImageBuffer(x3f(major, minor), "upload.bin"), "raw");
    });

    it.each([
      ["major version 0", x3f(0, 0)],
      ["major version 16", x3f(16, 0)],
      ["minor version 256", x3f(2, 256)],
      ["a header cut at 7 bytes", x3f(2, 0).subarray(0, 7)],
    ])("leaves a header with %s to the name", async (_label, bytes) => {
      byNameOnly(await validateImageBuffer(bytes, "a.x3f"), "raw");
      expect(await validateImageBuffer(bytes, "upload.bin")).toEqual(unrecognized);
    });
  });
});
