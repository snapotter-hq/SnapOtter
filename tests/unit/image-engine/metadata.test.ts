import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// sharp is only installed in the image-engine package, so resolve it from there
const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;

import {
  getImageInfo,
  parseExif,
  parseGps,
  parseXmp,
  sanitizeValue,
} from "@snapotter/image-engine";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");

let png200x150: Buffer;
let jpg100x100: Buffer;
let webp50x50: Buffer;
let jpgWithExif: Buffer;

beforeAll(() => {
  png200x150 = readFileSync(path.join(FIXTURES_DIR, "test-200x150.png"));
  jpg100x100 = readFileSync(path.join(FIXTURES_DIR, "test-100x100.jpg"));
  webp50x50 = readFileSync(path.join(FIXTURES_DIR, "test-50x50.webp"));
  jpgWithExif = readFileSync(path.join(FIXTURES_DIR, "test-with-exif.jpg"));
});

// ---------------------------------------------------------------------------
// getImageInfo
// ---------------------------------------------------------------------------
describe("getImageInfo", () => {
  it("returns correct dimensions for PNG", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.width).toBe(200);
    expect(info.height).toBe(150);
  });

  it("returns correct format for PNG", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.format).toBe("png");
  });

  it("returns correct format for JPEG", async () => {
    const info = await getImageInfo(jpg100x100);
    expect(info.format).toBe("jpeg");
  });

  it("returns correct dimensions for JPEG", async () => {
    const info = await getImageInfo(jpg100x100);
    expect(info.width).toBe(100);
    expect(info.height).toBe(100);
  });

  it("returns correct format for WebP", async () => {
    const info = await getImageInfo(webp50x50);
    expect(info.format).toBe("webp");
  });

  it("returns correct dimensions for WebP", async () => {
    const info = await getImageInfo(webp50x50);
    expect(info.width).toBe(50);
    expect(info.height).toBe(50);
  });

  it("returns correct size matching buffer length", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.size).toBe(png200x150.length);
  });

  it("returns channel count", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.channels).toBeGreaterThanOrEqual(3);
  });

  it("returns hasAlpha boolean", async () => {
    const info = await getImageInfo(png200x150);
    expect(typeof info.hasAlpha).toBe("boolean");
  });

  it("returns metadata sub-object with expected keys", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.metadata).toBeDefined();
    expect("space" in info.metadata).toBe(true);
    expect("density" in info.metadata).toBe(true);
    expect("exif" in info.metadata).toBe(true);
    expect("icc" in info.metadata).toBe(true);
    expect("xmp" in info.metadata).toBe(true);
  });

  it("detects EXIF presence in JPEG with EXIF", async () => {
    const info = await getImageInfo(jpgWithExif);
    expect(info.metadata.exif).toBe(true);
  });

  it("reports no EXIF for plain PNG", async () => {
    const info = await getImageInfo(png200x150);
    expect(info.metadata.exif).toBe(false);
  });

  it("throws for invalid buffer", async () => {
    await expect(getImageInfo(Buffer.from("not an image"))).rejects.toThrow();
  });

  it("returns info for a dynamically created image", async () => {
    const buf = await sharp({
      create: { width: 30, height: 20, channels: 4, background: "#ff000080" },
    })
      .png()
      .toBuffer();
    const info = await getImageInfo(buf);
    expect(info.width).toBe(30);
    expect(info.height).toBe(20);
    expect(info.channels).toBe(4);
    expect(info.hasAlpha).toBe(true);
    expect(info.format).toBe("png");
  });
});

// ---------------------------------------------------------------------------
// sanitizeValue — these tests complement the ones in operations.test.ts
// ---------------------------------------------------------------------------
describe("sanitizeValue", () => {
  it("converts Date to ISO string", () => {
    const d = new Date("2025-06-15T12:00:00Z");
    expect(sanitizeValue(d)).toBe("2025-06-15T12:00:00.000Z");
  });

  it("converts small Buffer to number array", () => {
    const buf = Buffer.from([10, 20, 30]);
    expect(sanitizeValue(buf)).toEqual([10, 20, 30]);
  });

  it("converts large Buffer (>256 bytes) to placeholder", () => {
    const buf = Buffer.alloc(512, 0xab);
    expect(sanitizeValue(buf)).toBe("<binary 512 bytes>");
  });

  it("handles Buffer at exactly 256 bytes boundary", () => {
    const buf = Buffer.alloc(256, 0xcd);
    // 256 is not > 256, so it should convert to array
    expect(Array.isArray(sanitizeValue(buf))).toBe(true);
  });

  it("handles Buffer at 257 bytes (just over boundary)", () => {
    const buf = Buffer.alloc(257, 0xef);
    expect(sanitizeValue(buf)).toBe("<binary 257 bytes>");
  });

  it("recursively sanitizes arrays", () => {
    const d = new Date("2025-01-01T00:00:00Z");
    expect(sanitizeValue([d, 42, "text"])).toEqual(["2025-01-01T00:00:00.000Z", 42, "text"]);
  });

  it("recursively sanitizes nested objects", () => {
    const result = sanitizeValue({
      a: new Date("2025-03-01T00:00:00Z"),
      b: { c: Buffer.from([1, 2]) },
    });
    expect(result).toEqual({
      a: "2025-03-01T00:00:00.000Z",
      b: { c: [1, 2] },
    });
  });

  it("passes through null", () => {
    expect(sanitizeValue(null)).toBe(null);
  });

  it("passes through undefined", () => {
    expect(sanitizeValue(undefined)).toBe(undefined);
  });

  it("passes through booleans", () => {
    expect(sanitizeValue(true)).toBe(true);
    expect(sanitizeValue(false)).toBe(false);
  });

  it("passes through numbers", () => {
    expect(sanitizeValue(0)).toBe(0);
    expect(sanitizeValue(3.14)).toBe(3.14);
    expect(sanitizeValue(-99)).toBe(-99);
  });
});

// ---------------------------------------------------------------------------
// parseExif
// ---------------------------------------------------------------------------
describe("parseExif", () => {
  it("parses EXIF from test fixture with metadata fields", async () => {
    const metadata = await sharp(jpgWithExif).metadata();
    expect(metadata.exif).toBeTruthy();
    const result = parseExif(metadata.exif!);
    expect(result.image).toBeDefined();
    expect(result.photo).toBeDefined();
    expect(result.iop).toBeDefined();
    expect(result.gps).toBeDefined();
    // Test fixture has known fields
    expect(result.image.Artist).toBe("Test Artist");
    expect(result.image.Copyright).toBe("2026 Test Copyright");
  });

  it("returns empty sections for empty buffer", () => {
    const result = parseExif(Buffer.alloc(0));
    expect(result.image).toEqual({});
    expect(result.photo).toEqual({});
    expect(result.iop).toEqual({});
    expect(result.gps).toEqual({});
  });

  it("returns empty sections for null-like buffer", () => {
    // Passing a minimal buffer that won't parse as valid EXIF
    const result = parseExif(Buffer.from([0x00, 0x00]));
    expect(result.image).toEqual({});
    expect(result.photo).toEqual({});
  });

  it("parses GPSInfo section when GPS data is present", async () => {
    // Create a JPEG with GPS EXIF data via withExif IFD3
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#808080" },
    })
      .withExif({
        IFD0: { Artist: "GPS Test" },
        IFD3: { GPSLatitudeRef: "N" },
      })
      .jpeg()
      .toBuffer();
    const metadata = await sharp(buf).metadata();
    expect(metadata.exif).toBeTruthy();
    const result = parseExif(metadata.exif!);
    // The GPSInfo section should be populated with sanitized values
    expect(typeof result.gps).toBe("object");
    expect(Object.keys(result.gps).length).toBeGreaterThan(0);
    expect(result.gps.GPSLatitudeRef).toBe("N");
  });
});

// ---------------------------------------------------------------------------
// parseGps
// ---------------------------------------------------------------------------
describe("parseGps", () => {
  it("parses north-east coordinates", () => {
    const result = parseGps({
      GPSLatitude: [40, 44, 54],
      GPSLatitudeRef: "N",
      GPSLongitude: [73, 59, 8.4],
      GPSLongitudeRef: "W",
    });
    expect(result.latitude).toBeCloseTo(40.7483, 3);
    expect(result.longitude).toBeCloseTo(-73.9857, 3);
    expect(result.altitude).toBeNull();
  });

  it("parses southern hemisphere with altitude", () => {
    const result = parseGps({
      GPSLatitude: [33, 51, 54],
      GPSLatitudeRef: "S",
      GPSLongitude: [151, 12, 36],
      GPSLongitudeRef: "E",
      GPSAltitude: 25,
      GPSAltitudeRef: 0,
    });
    expect(result.latitude).toBeCloseTo(-33.865, 2);
    expect(result.longitude).toBeCloseTo(151.21, 2);
    expect(result.altitude).toBe(25);
  });

  it("returns negative altitude for below sea level", () => {
    const result = parseGps({
      GPSLatitude: [31, 30, 0],
      GPSLatitudeRef: "N",
      GPSLongitude: [35, 28, 0],
      GPSLongitudeRef: "E",
      GPSAltitude: 400,
      GPSAltitudeRef: 1, // below sea level
    });
    expect(result.altitude).toBe(-400);
  });

  it("returns nulls for empty GPS data", () => {
    const result = parseGps({});
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.altitude).toBeNull();
  });

  it("handles missing longitude", () => {
    const result = parseGps({
      GPSLatitude: [51, 30, 0],
      GPSLatitudeRef: "N",
    });
    expect(result.latitude).toBeCloseTo(51.5, 1);
    expect(result.longitude).toBeNull();
  });

  it("handles missing latitude", () => {
    const result = parseGps({
      GPSLongitude: [0, 7, 39.6],
      GPSLongitudeRef: "W",
    });
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeCloseTo(-0.1277, 3);
  });

  it("ignores invalid (NaN) GPS values", () => {
    const result = parseGps({
      GPSLatitude: [NaN, 30, 0],
      GPSLatitudeRef: "N",
      GPSLongitude: [0, NaN, 39.6],
      GPSLongitudeRef: "W",
    });
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("ignores wrong-length GPS arrays", () => {
    const result = parseGps({
      GPSLatitude: [51, 30],
      GPSLatitudeRef: "N",
    });
    expect(result.latitude).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseXmp
// ---------------------------------------------------------------------------
describe("parseXmp", () => {
  it("extracts key-value pairs from XMP XML", () => {
    const xml = Buffer.from(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
        '<rdf:Description dc:creator="Bob" dc:title="Sunset" />' +
        "</rdf:RDF></x:xmpmeta>",
    );
    const result = parseXmp(xml);
    expect(result["dc:creator"]).toBe("Bob");
    expect(result["dc:title"]).toBe("Sunset");
  });

  it("filters out xmlns: namespace declarations", () => {
    const xml = Buffer.from(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<rdf:Description dc:format="image/png" />' +
        "</x:xmpmeta>",
    );
    const result = parseXmp(xml);
    expect(result["xmlns:x"]).toBeUndefined();
    expect(result["xmlns:dc"]).toBeUndefined();
    expect(result["dc:format"]).toBe("image/png");
  });

  it("filters out rdf: prefixed attributes", () => {
    const xml = Buffer.from('<rdf:Description rdf:about="" dc:subject="test" />');
    const result = parseXmp(xml);
    expect(result["rdf:about"]).toBeUndefined();
    expect(result["dc:subject"]).toBe("test");
  });

  it("returns empty object for empty buffer", () => {
    expect(parseXmp(Buffer.alloc(0))).toEqual({});
  });

  it("returns empty object for non-XML content", () => {
    expect(parseXmp(Buffer.from("hello world"))).toEqual({});
  });

  it("extracts multiple namespaced attributes", () => {
    const xml = Buffer.from(
      "<rdf:Description " +
        'xmp:CreateDate="2025-01-01" ' +
        'xmp:ModifyDate="2025-06-01" ' +
        'photoshop:ColorMode="3" />',
    );
    const result = parseXmp(xml);
    expect(result["xmp:CreateDate"]).toBe("2025-01-01");
    expect(result["xmp:ModifyDate"]).toBe("2025-06-01");
    expect(result["photoshop:ColorMode"]).toBe("3");
  });
});
