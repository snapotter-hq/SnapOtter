import { describe, expect, it } from "vitest";
import { qoiDecode, qoiEncode } from "../src/formats/qoi.js";

// QOI chunk tags (top 2 bits for the range ops, full byte for RGB/RGBA).
const QOI_OP_INDEX = 0x00;
const QOI_OP_DIFF = 0x40;
const QOI_OP_LUMA = 0x80;
const QOI_OP_RUN = 0xc0;
const QOI_OP_RGB = 0xfe;
const QOI_OP_RGBA = 0xff;

const HEADER_SIZE = 14;
const END_MARKER = [0, 0, 0, 0, 0, 0, 0, 1];

// The reference index hash from the spec, replicated here so assertions pin the
// exact slot independently of the module (round-trip alone can't catch a
// symmetric mutation in a hash shared by encode+decode).
function refHash(r: number, g: number, b: number, a: number): number {
  return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

// Build a packed RGBA buffer from [r,g,b,a] tuples.
function rgba(...pixels: Array<[number, number, number, number]>): Uint8Array {
  const out = new Uint8Array(pixels.length * 4);
  pixels.forEach((p, i) => {
    out.set(p, i * 4);
  });
  return out;
}

// The data section is everything between the 14-byte header and the 8-byte end marker.
function dataBytes(encoded: Uint8Array): number[] {
  return Array.from(encoded.slice(HEADER_SIZE, encoded.length - END_MARKER.length));
}

function tailMarker(encoded: Uint8Array): number[] {
  return Array.from(encoded.slice(encoded.length - END_MARKER.length));
}

function qoiFile(width: number, height: number, data: number[], colorspace = 0): Uint8Array {
  const out = new Uint8Array(HEADER_SIZE + data.length + END_MARKER.length);
  out.set([0x71, 0x6f, 0x69, 0x66]);
  const view = new DataView(out.buffer);
  view.setUint32(4, width);
  view.setUint32(8, height);
  out[12] = 4;
  out[13] = colorspace;
  out.set(data, HEADER_SIZE);
  out.set(END_MARKER, HEADER_SIZE + data.length);
  return out;
}

describe("qoiEncode header", () => {
  it("writes the qoif magic as the first four bytes", () => {
    const out = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    // "qoif" == 0x71 0x6f 0x69 0x66
    expect(Array.from(out.slice(0, 4))).toEqual([0x71, 0x6f, 0x69, 0x66]);
  });

  it("writes width and height as big-endian uint32", () => {
    // 258 == 0x00000102, 513 == 0x00000201: catches byte-order and offset mutants.
    const w = 258;
    const h = 513;
    const out = qoiEncode(new Uint8Array(w * h * 4), w, h, 4);
    expect(Array.from(out.slice(4, 8))).toEqual([0x00, 0x00, 0x01, 0x02]);
    expect(Array.from(out.slice(8, 12))).toEqual([0x00, 0x00, 0x02, 0x01]);
  });

  it("writes the channels byte at offset 12 and colorspace 0 at offset 13", () => {
    const rgbaOut = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    expect(rgbaOut[12]).toBe(4);
    expect(rgbaOut[13]).toBe(0);

    const rgbOut = qoiEncode(new Uint8Array([1, 2, 3]), 1, 1, 3);
    expect(rgbOut[12]).toBe(3);
    expect(rgbOut[13]).toBe(0);
  });
});

describe("qoiEncode end marker", () => {
  it("ends with seven 0x00 bytes then a single 0x01", () => {
    const out = qoiEncode(rgba([9, 8, 7, 255]), 1, 1, 4);
    expect(tailMarker(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

describe("qoiEncode chunk selection (tag bits of the first data byte)", () => {
  // The encoder starts from prev = (0,0,0,255) and an all-zero index, so the
  // first pixel's delta from black-opaque decides which chunk is emitted.

  it("emits QOI_OP_DIFF for a small delta from the initial pixel", () => {
    // (1,1,1): dr=dg=db=1, all within DIFF range (-2..1).
    // byte = 0x40 | ((1+2)<<4) | ((1+2)<<2) | (1+2) = 0x7f.
    const out = qoiEncode(rgba([1, 1, 1, 255]), 1, 1, 4);
    const first = out[HEADER_SIZE];
    expect(first & 0xc0).toBe(QOI_OP_DIFF);
    expect(first).toBe(0x7f);
  });

  it("emits QOI_OP_LUMA for a delta outside DIFF but inside LUMA range", () => {
    // (16,20,24): dg=20, drDg=-4, dbDg=4 -> LUMA. byte1=0x80|(20+32)=0xb4,
    // byte2=((-4+8)<<4)|(4+8)=0x4c.
    const out = qoiEncode(rgba([16, 20, 24, 255]), 1, 1, 4);
    expect(out[HEADER_SIZE] & 0xc0).toBe(QOI_OP_LUMA);
    expect(out[HEADER_SIZE]).toBe(0xb4);
    expect(out[HEADER_SIZE + 1]).toBe(0x4c);
  });

  it("emits QOI_OP_RGB for a delta outside LUMA range with unchanged alpha", () => {
    // (200,100,50): dg=100 is outside LUMA (dg<32 fails). alpha stays 255 -> RGB.
    const out = qoiEncode(rgba([200, 100, 50, 255]), 1, 1, 4);
    expect(out[HEADER_SIZE]).toBe(QOI_OP_RGB);
    expect(Array.from(out.slice(HEADER_SIZE + 1, HEADER_SIZE + 4))).toEqual([200, 100, 50]);
  });

  it("emits QOI_OP_RGBA when alpha differs from the previous pixel", () => {
    // alpha 128 != prevA 255 -> RGBA, regardless of how small the color delta is.
    const out = qoiEncode(rgba([60, 70, 80, 128]), 1, 1, 4);
    expect(out[HEADER_SIZE]).toBe(QOI_OP_RGBA);
    expect(Array.from(out.slice(HEADER_SIZE + 1, HEADER_SIZE + 5))).toEqual([60, 70, 80, 128]);
  });

  it("emits QOI_OP_INDEX with the exact hashed slot when a color repeats", () => {
    // A=(10,20,30,255), B=(11,20,30,255), then A again.
    // pixel0 A -> RGB; pixel1 B -> DIFF (dr=1); pixel2 A hits the index at slot 9.
    const a: [number, number, number, number] = [10, 20, 30, 255];
    const b: [number, number, number, number] = [11, 20, 30, 255];
    const slot = refHash(...a);
    expect(slot).toBe(9);

    const out = qoiEncode(rgba(a, b, a), 3, 1, 4);
    const data = dataBytes(out);
    // Layout: [RGB 0xfe,10,20,30] [DIFF 0x7a] [INDEX 0x09].
    expect(data).toEqual([QOI_OP_RGB, 10, 20, 30, 0x7a, QOI_OP_INDEX | slot]);
    // The INDEX byte's tag is 0x00 and its low 6 bits are exactly the hash slot.
    const indexByte = data[data.length - 1];
    expect(indexByte & 0xc0).toBe(QOI_OP_INDEX);
    expect(indexByte & 0x3f).toBe(slot);
  });
});

describe("qoiEncode run-length encoding", () => {
  // Solid red RGBA: pixel0 differs from the initial black-opaque pixel (one RGB
  // chunk), then every following pixel repeats it as runs. Runs flush at length
  // 62 or at the final pixel. Asserting the exact total length pins the run
  // increment and the 62 cap, which round-trip decoding would not notice.
  function solidRed(count: number): Uint8Array {
    const buf = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      buf[i * 4] = 255;
      buf[i * 4 + 3] = 255;
    }
    return buf;
  }

  it("encodes a single run for a small solid block", () => {
    // 10 px: RGB pixel0 (4 bytes) + one RUN chunk for the other 9 px (1 byte).
    const out = qoiEncode(solidRed(10), 10, 1, 4);
    expect(out.length).toBe(HEADER_SIZE + 4 + 1 + END_MARKER.length);
    // RUN chunk encodes run-1 = 8 in the low 6 bits.
    expect(dataBytes(out)).toEqual([QOI_OP_RGB, 255, 0, 0, QOI_OP_RUN | 8]);
  });

  it("splits into two run chunks when the run exceeds the 62 cap", () => {
    // 100 px: RGB pixel0 + RUN(62 px, run-1=61) + RUN(37 px, run-1=36).
    const out = qoiEncode(solidRed(100), 100, 1, 4);
    expect(out.length).toBe(HEADER_SIZE + 4 + 2 + END_MARKER.length);
    expect(dataBytes(out)).toEqual([QOI_OP_RGB, 255, 0, 0, QOI_OP_RUN | 61, QOI_OP_RUN | 36]);
  });

  it("flushes a pending run before encoding the next distinct pixel", () => {
    const out = qoiEncode(rgba([255, 0, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255]), 3, 1, 4);
    expect(dataBytes(out)).toEqual([QOI_OP_RGB, 255, 0, 0, QOI_OP_RUN, QOI_OP_RGB, 0, 255, 0]);
  });

  it("encodes an all-black-opaque image as a single run (matches the initial pixel)", () => {
    // (0,0,0,255) equals the encoder's starting prev, so all 5 px are one run.
    const out = qoiEncode(
      new Uint8Array(5 * 4).map((_, i) => (i % 4 === 3 ? 255 : 0)),
      5,
      1,
      4,
    );
    // No color chunk at all: just a single RUN of 5 (run-1 = 4).
    expect(dataBytes(out)).toEqual([QOI_OP_RUN | 4]);
  });
});

describe("qoiDecode header parsing", () => {
  it("rejects a truncated header before reading through the buffer", () => {
    expect(() => qoiDecode(new Uint8Array(13))).toThrow("QOI file is too short");
  });

  it("reads width, height, channels and colorspace back from the header", () => {
    const out = qoiEncode(new Uint8Array(6 * 4), 3, 2, 4);
    const { header } = qoiDecode(out);
    expect(header).toEqual({ width: 3, height: 2, channels: 4, colorspace: 0 });
  });

  it("throws when the magic does not match", () => {
    const bad = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    bad[0] = 0x00;
    expect(() => qoiDecode(bad)).toThrow("Not a QOI file");
  });

  it("throws on zero width or height", () => {
    const zeroW = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    new DataView(zeroW.buffer).setUint32(4, 0);
    expect(() => qoiDecode(zeroW)).toThrow("Invalid QOI dimensions");

    const zeroH = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    new DataView(zeroH.buffer).setUint32(8, 0);
    expect(() => qoiDecode(zeroH)).toThrow("Invalid QOI dimensions");
  });

  it("throws on an invalid channel count", () => {
    const bad = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    bad[12] = 2;
    expect(() => qoiDecode(bad)).toThrow("Invalid QOI channels");
  });

  it("throws on an invalid colorspace", () => {
    const bad = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    bad[13] = 2;
    expect(() => qoiDecode(bad)).toThrow("Invalid QOI colorspace");
  });

  it("accepts linear colorspace 1", () => {
    const linear = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    linear[13] = 1;
    expect(qoiDecode(linear).header.colorspace).toBe(1);
  });

  it("rejects dimensions whose decoded allocation exceeds the safety limit", () => {
    const bad = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    const view = new DataView(bad.buffer, bad.byteOffset, bad.byteLength);
    view.setUint32(4, 8192);
    view.setUint32(8, 8193);
    expect(() => qoiDecode(bad)).toThrow("QOI image exceeds the pixel safety limit");
  });

  it("accepts the exact pixel safety limit before rejecting its missing payload", () => {
    const headerOnly = qoiFile(8192, 8192, []);
    expect(() => qoiDecode(headerOnly)).toThrow(
      "QOI pixel data is too short for declared dimensions",
    );
  });

  it("preflights short payloads near the maximum run-density boundary", () => {
    const headerOnly = qoiFile(62, 28, []);
    expect(() => qoiDecode(headerOnly)).toThrow(
      "QOI pixel data is too short for declared dimensions",
    );
  });
});

describe("qoiDecode corruption handling", () => {
  it("rejects a truncated RGB chunk instead of decoding missing bytes as zero", () => {
    const encoded = qoiEncode(rgba([255, 0, 0, 255]), 1, 1, 4);
    const truncated = new Uint8Array([
      ...encoded.slice(0, HEADER_SIZE + 2),
      ...encoded.slice(encoded.length - END_MARKER.length),
    ]);
    expect(() => qoiDecode(truncated)).toThrow("Truncated QOI pixel data");
  });

  it("rejects a truncated LUMA chunk", () => {
    const encoded = qoiEncode(rgba([16, 20, 24, 255]), 1, 1, 4);
    const truncated = new Uint8Array([
      ...encoded.slice(0, HEADER_SIZE + 1),
      ...encoded.slice(encoded.length - END_MARKER.length),
    ]);
    expect(() => qoiDecode(truncated)).toThrow("Truncated QOI pixel data");
  });

  it("rejects a corrupt end marker", () => {
    const bad = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    bad[bad.length - 1] = 0;
    expect(() => qoiDecode(bad)).toThrow("Invalid QOI end marker");
  });

  it("rejects a run that exceeds the declared pixel count", () => {
    const bad = qoiEncode(rgba([0, 0, 0, 255]), 1, 1, 4);
    bad[HEADER_SIZE] = QOI_OP_RUN | 1;
    expect(() => qoiDecode(bad)).toThrow("QOI run exceeds the declared pixel count");
  });

  it("rejects an oversized run after one or more pixels were already decoded", () => {
    const bad = qoiFile(2, 1, [QOI_OP_RGB, 255, 0, 0, QOI_OP_RUN | 1]);
    expect(() => qoiDecode(bad)).toThrow("QOI run exceeds the declared pixel count");
  });

  it("updates the color index after a run so a later INDEX chunk is lossless", () => {
    const blackHash = refHash(0, 0, 0, 255);
    const encoded = qoiFile(3, 1, [QOI_OP_RUN, QOI_OP_RGB, 255, 0, 0, QOI_OP_INDEX | blackHash]);
    expect(Array.from(qoiDecode(encoded).pixels)).toEqual([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });

  it("rejects unused pixel data before the end marker", () => {
    const encoded = qoiEncode(rgba([1, 2, 3, 255]), 1, 1, 4);
    const withTrailingChunk = new Uint8Array(encoded.length + 1);
    withTrailingChunk.set(encoded.slice(0, -END_MARKER.length));
    withTrailingChunk[encoded.length - END_MARKER.length] = QOI_OP_RUN;
    withTrailingChunk.set(END_MARKER, encoded.length - END_MARKER.length + 1);
    expect(() => qoiDecode(withTrailingChunk)).toThrow("Unexpected QOI pixel data");
  });
});

describe("qoiEncode input validation", () => {
  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])("rejects invalid dimensions %s x %s", (width, height) => {
    expect(() => qoiEncode(new Uint8Array(), width, height, 4)).toThrow("Invalid QOI dimensions");
  });

  it("rejects dimensions whose encoded allocation exceeds the safety limit", () => {
    expect(() => qoiEncode(new Uint8Array(), 8192, 8193, 4)).toThrow(
      "QOI image exceeds the pixel safety limit",
    );
  });

  it("accepts the exact pixel safety limit before checking buffer length", () => {
    expect(() => qoiEncode(new Uint8Array(), 8192, 8192, 4)).toThrow(
      "QOI pixel buffer length does not match dimensions and channels",
    );
  });

  it("rejects a runtime-invalid channel count", () => {
    expect(() => qoiEncode(new Uint8Array(4), 1, 1, 2 as 3 | 4)).toThrow("Invalid QOI channels");
  });

  it("requires the exact pixel-buffer length", () => {
    expect(() => qoiEncode(new Uint8Array(3), 1, 1, 4)).toThrow(
      "QOI pixel buffer length does not match dimensions and channels",
    );
    expect(() => qoiEncode(new Uint8Array(5), 1, 1, 4)).toThrow(
      "QOI pixel buffer length does not match dimensions and channels",
    );
  });
});

describe("qoiEncode chunk boundaries", () => {
  function secondChunkTag(
    first: [number, number, number, number],
    second: [number, number, number, number],
  ): number {
    const data = dataBytes(qoiEncode(rgba(first, second), 2, 1, 4));
    // The first color is deliberately outside DIFF/LUMA and therefore occupies
    // a four-byte RGB chunk. The next byte starts the boundary under test.
    expect(data[0]).toBe(QOI_OP_RGB);
    return data[4];
  }

  it.each([
    [
      [100, 100, 100, 255],
      [98, 100, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [101, 100, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 98, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 101, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 100, 98, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 100, 101, 255],
    ],
  ] as Array<[[number, number, number, number], [number, number, number, number]]>)(
    "uses DIFF at every inclusive boundary for %j -> %j",
    (first, second) => {
      expect(secondChunkTag(first, second) & 0xc0).toBe(QOI_OP_DIFF);
      const input = rgba(first, second);
      expect(Array.from(qoiDecode(qoiEncode(input, 2, 1, 4)).pixels)).toEqual(Array.from(input));
    },
  );

  it.each([
    [
      [100, 100, 100, 255],
      [97, 100, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [102, 100, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 97, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 102, 100, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 100, 97, 255],
    ],
    [
      [100, 100, 100, 255],
      [100, 100, 102, 255],
    ],
  ] as Array<[[number, number, number, number], [number, number, number, number]]>)(
    "does not use DIFF immediately outside its range for %j -> %j",
    (first, second) => {
      expect(secondChunkTag(first, second) & 0xc0).toBe(QOI_OP_LUMA);
      const input = rgba(first, second);
      expect(Array.from(qoiDecode(qoiEncode(input, 2, 1, 4)).pixels)).toEqual(Array.from(input));
    },
  );

  it.each([
    [
      [100, 100, 100, 255],
      [68, 68, 68, 255],
    ],
    [
      [100, 100, 100, 255],
      [131, 131, 131, 255],
    ],
    [
      [100, 100, 100, 255],
      [102, 110, 110, 255],
    ],
    [
      [100, 100, 100, 255],
      [117, 110, 110, 255],
    ],
    [
      [100, 100, 100, 255],
      [110, 110, 102, 255],
    ],
    [
      [100, 100, 100, 255],
      [110, 110, 117, 255],
    ],
  ] as Array<[[number, number, number, number], [number, number, number, number]]>)(
    "uses LUMA at every inclusive boundary for %j -> %j",
    (first, second) => {
      expect(secondChunkTag(first, second) & 0xc0).toBe(QOI_OP_LUMA);
      const input = rgba(first, second);
      expect(Array.from(qoiDecode(qoiEncode(input, 2, 1, 4)).pixels)).toEqual(Array.from(input));
    },
  );

  it.each([
    [
      [100, 100, 100, 255],
      [67, 67, 67, 255],
    ],
    [
      [100, 100, 100, 255],
      [132, 132, 132, 255],
    ],
    [
      [100, 100, 100, 255],
      [101, 110, 110, 255],
    ],
    [
      [100, 100, 100, 255],
      [118, 110, 110, 255],
    ],
    [
      [100, 100, 100, 255],
      [110, 110, 101, 255],
    ],
    [
      [100, 100, 100, 255],
      [110, 110, 118, 255],
    ],
  ] as Array<[[number, number, number, number], [number, number, number, number]]>)(
    "does not use LUMA immediately outside its range for %j -> %j",
    (first, second) => {
      expect(secondChunkTag(first, second)).toBe(QOI_OP_RGB);
    },
  );
});

describe("qoiEncode index collision safety", () => {
  it.each([
    [
      [10, 20, 30, 100],
      [10, 20, 30, 164],
    ],
    [
      [10, 20, 30, 100],
      [10, 20, 94, 100],
    ],
    [
      [10, 20, 30, 100],
      [10, 84, 30, 100],
    ],
    [
      [10, 20, 30, 100],
      [74, 20, 30, 100],
    ],
  ] as Array<[[number, number, number, number], [number, number, number, number]]>)(
    "does not emit an index hit when only part of a hash-colliding pixel matches",
    (first, colliding) => {
      expect(refHash(...first)).toBe(refHash(...colliding));
      const separator: [number, number, number, number] = [200, 201, 202, 203];
      const input = rgba(first, separator, colliding);
      expect(Array.from(qoiDecode(qoiEncode(input, 3, 1, 4)).pixels)).toEqual(Array.from(input));
    },
  );
});

describe("qoi round-trip (encode then decode restores the exact RGBA pixels)", () => {
  // Round-trip is the backbone: encode and decode are independent code paths, so
  // a mutant in either one breaks byte-exact restoration for the case that
  // exercises it. Decode always yields RGBA (4 channels).

  function roundTrip(pixels: Uint8Array, w: number, h: number, channels: 3 | 4): Uint8Array {
    const encoded = qoiEncode(pixels, w, h, channels);
    return qoiDecode(encoded).pixels;
  }

  it("restores a 1x1 RGBA pixel", () => {
    const px = rgba([123, 45, 67, 200]);
    expect(Array.from(roundTrip(px, 1, 1, 4))).toEqual([123, 45, 67, 200]);
  });

  it("restores a DIFF-range sequence", () => {
    // Each step moves channels by -2..1 relative to the previous pixel.
    const px = rgba(
      [100, 100, 100, 255],
      [101, 99, 100, 255],
      [99, 100, 101, 255],
      [100, 98, 99, 255],
    );
    expect(Array.from(roundTrip(px, 4, 1, 4))).toEqual([
      100, 100, 100, 255, 101, 99, 100, 255, 99, 100, 101, 255, 100, 98, 99, 255,
    ]);
  });

  it("restores a LUMA-range sequence", () => {
    // Green moves by ~20 with red/blue tracking within the +/-8 luma window.
    const px = rgba([50, 50, 50, 255], [66, 70, 74, 255], [80, 90, 98, 255]);
    expect(Array.from(roundTrip(px, 3, 1, 4))).toEqual([
      50, 50, 50, 255, 66, 70, 74, 255, 80, 90, 98, 255,
    ]);
  });

  it("restores an RGB-magnitude (out-of-luma) sequence", () => {
    const px = rgba([10, 20, 30, 255], [200, 130, 60, 255], [5, 250, 128, 255]);
    expect(Array.from(roundTrip(px, 3, 1, 4))).toEqual([
      10, 20, 30, 255, 200, 130, 60, 255, 5, 250, 128, 255,
    ]);
  });

  it("restores alpha changes via the RGBA path", () => {
    const px = rgba([40, 50, 60, 255], [40, 50, 60, 128], [40, 50, 60, 30]);
    expect(Array.from(roundTrip(px, 3, 1, 4))).toEqual([
      40, 50, 60, 255, 40, 50, 60, 128, 40, 50, 60, 30,
    ]);
  });

  it("restores INDEX hits from repeated colors", () => {
    // Alternating two colors: second occurrences resolve through the index.
    const c1: [number, number, number, number] = [200, 10, 20, 255];
    const c2: [number, number, number, number] = [20, 200, 10, 255];
    const px = rgba(c1, c2, c1, c2, c1);
    expect(Array.from(roundTrip(px, 5, 1, 4))).toEqual([
      200, 10, 20, 255, 20, 200, 10, 255, 200, 10, 20, 255, 20, 200, 10, 255, 200, 10, 20, 255,
    ]);
  });

  it("restores a solid-color run", () => {
    const buf = new Uint8Array(70 * 4);
    for (let i = 0; i < 70; i++) {
      buf[i * 4] = 12;
      buf[i * 4 + 1] = 34;
      buf[i * 4 + 2] = 56;
      buf[i * 4 + 3] = 255;
    }
    const decoded = roundTrip(buf, 70, 1, 4);
    expect(decoded.length).toBe(70 * 4);
    for (let i = 0; i < 70; i++) {
      expect(Array.from(decoded.slice(i * 4, i * 4 + 4))).toEqual([12, 34, 56, 255]);
    }
  });

  it("restores a 3-channel RGB image, filling alpha as 255", () => {
    // RGB input (no alpha bytes); decode should reconstruct full opaque RGBA.
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128]);
    expect(Array.from(roundTrip(rgb, 4, 1, 3))).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 128, 255,
    ]);
  });

  it("restores a small 2D gradient exercising several chunk types", () => {
    const w = 4;
    const h = 3;
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const off = (y * w + x) * 4;
        buf[off] = x * 40 + y * 5;
        buf[off + 1] = y * 60 + x;
        buf[off + 2] = 128 - x * 10;
        buf[off + 3] = 255 - y * 20;
      }
    }
    const decoded = roundTrip(buf, w, h, 4);
    expect(Array.from(decoded)).toEqual(Array.from(buf));
  });
});
