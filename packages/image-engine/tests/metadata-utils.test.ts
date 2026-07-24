import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getImageInfo,
  parseExif,
  parseGps,
  parseXmp,
  sanitizeValue,
} from "../src/utils/metadata.js";
import { extToMime, formatToExt, formatToMime, mimeToExt } from "../src/utils/mime.js";

// ---------------------------------------------------------------------------
// Test image fixtures with KNOWN dimensions / channels / format / space so
// getImageInfo's exact numeric and string outputs can be asserted. Off-by-one
// and field-swap mutants die against these precise expectations.
// ---------------------------------------------------------------------------
let rgbPng: Buffer; // 20x10, 3 channels, no alpha, sRGB, no exif/icc/xmp
let rgbaPng: Buffer; // 5x7, 4 channels, alpha
let bwPng: Buffer; // 6x4, 1 channel, b-w colourspace
let webpBuf: Buffer; // 3x9 webp
let jpegDensity: Buffer; // 8x12 jpeg carrying density 300
let exifJpeg: Buffer; // jpeg carrying a real EXIF blob (Image + Photo sections)

beforeAll(async () => {
  rgbPng = await sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();

  rgbaPng = await sharp({
    create: { width: 5, height: 7, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } },
  })
    .png()
    .toBuffer();

  bwPng = await sharp({
    create: { width: 6, height: 4, channels: 3, background: { r: 100, g: 100, b: 100 } },
  })
    .toColourspace("b-w")
    .png()
    .toBuffer();

  webpBuf = await sharp({
    create: { width: 3, height: 9, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .webp()
    .toBuffer();

  jpegDensity = await sharp({
    create: { width: 8, height: 12, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .withMetadata({ density: 300 })
    .jpeg()
    .toBuffer();

  exifJpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .withExif({
      IFD0: { Make: "AcmeCam", Model: "X100", Software: "SnapOtterTest" },
      IFD2: { ExposureTime: "1/200" },
    })
    .jpeg()
    .toBuffer();
});

// ===========================================================================
// getImageInfo
// ===========================================================================
describe("getImageInfo", () => {
  it("returns exact width, height, format, channels, size for an RGB PNG", async () => {
    const info = await getImageInfo(rgbPng);
    expect(info.width).toBe(20);
    expect(info.height).toBe(10);
    expect(info.format).toBe("png");
    expect(info.channels).toBe(3);
    expect(info.hasAlpha).toBe(false);
    // size must equal the exact buffer byte length (not width/height/etc.)
    expect(info.size).toBe(rgbPng.length);
  });

  it("does not swap width and height (non-square image)", async () => {
    const info = await getImageInfo(rgbPng);
    // 20x10: if width/height were swapped this would read 10x20.
    expect(info.width).toBe(20);
    expect(info.height).toBe(10);
    expect(info.width).not.toBe(info.height);
  });

  it("reports hasAlpha true and 4 channels for an RGBA PNG", async () => {
    const info = await getImageInfo(rgbaPng);
    expect(info.width).toBe(5);
    expect(info.height).toBe(7);
    expect(info.channels).toBe(4);
    expect(info.hasAlpha).toBe(true);
  });

  it("reports 1 channel and b-w space for a grayscale PNG", async () => {
    const info = await getImageInfo(bwPng);
    expect(info.channels).toBe(1);
    expect(info.hasAlpha).toBe(false);
    expect(info.metadata.space).toBe("b-w");
  });

  it("reports sRGB space for a colour PNG", async () => {
    const info = await getImageInfo(rgbPng);
    expect(info.metadata.space).toBe("srgb");
  });

  it("returns the exact 'webp' format string", async () => {
    const info = await getImageInfo(webpBuf);
    expect(info.format).toBe("webp");
    expect(info.width).toBe(3);
    expect(info.height).toBe(9);
  });

  it("exposes the full metadata sub-object with correct falsy defaults for a plain PNG", async () => {
    const info = await getImageInfo(rgbPng);
    // No EXIF / ICC / XMP present -> the !! coercions must yield false.
    expect(info.metadata.exif).toBe(false);
    expect(info.metadata.icc).toBe(false);
    expect(info.metadata.xmp).toBe(false);
    expect(info.metadata.hasProfile).toBe(false);
    expect(info.metadata.isProgressive).toBe(false);
    // Absent optional fields pass through as undefined (not coerced).
    expect(info.metadata.orientation).toBeUndefined();
    expect(info.metadata.density).toBeUndefined();
  });

  it("passes through density when present", async () => {
    const info = await getImageInfo(jpegDensity);
    expect(info.metadata.density).toBe(300);
  });

  it("sets metadata.exif true when the image carries an EXIF blob", async () => {
    const info = await getImageInfo(exifJpeg);
    expect(info.metadata.exif).toBe(true);
    expect(info.format).toBe("jpeg");
  });

  it("rejects on an undecodable buffer", async () => {
    await expect(getImageInfo(Buffer.from("this is definitely not an image"))).rejects.toThrow();
  });
});

// ===========================================================================
// sanitizeValue
// ===========================================================================
describe("sanitizeValue", () => {
  it("converts a Date to an ISO string", () => {
    const d = new Date("2020-01-02T03:04:05.000Z");
    expect(sanitizeValue(d)).toBe("2020-01-02T03:04:05.000Z");
  });

  it("returns a small buffer as an array of byte values", () => {
    const buf = Buffer.from([1, 2, 3, 255]);
    expect(sanitizeValue(buf)).toEqual([1, 2, 3, 255]);
  });

  it("keeps a buffer of exactly 256 bytes as an array (boundary, not > 256)", () => {
    const buf = Buffer.alloc(256, 7);
    const out = sanitizeValue(buf);
    expect(Array.isArray(out)).toBe(true);
    expect((out as number[]).length).toBe(256);
    expect((out as number[])[0]).toBe(7);
  });

  it("replaces a buffer larger than 256 bytes with a placeholder string", () => {
    const buf = Buffer.alloc(257, 9);
    expect(sanitizeValue(buf)).toBe("<binary 257 bytes>");
  });

  it("recursively sanitizes arrays", () => {
    const d = new Date("2021-06-07T08:09:10.000Z");
    expect(sanitizeValue([d, 42, Buffer.from([0, 1])])).toEqual([
      "2021-06-07T08:09:10.000Z",
      42,
      [0, 1],
    ]);
  });

  it("recursively sanitizes nested object values", () => {
    const input = {
      when: new Date("2022-02-02T02:02:02.000Z"),
      raw: Buffer.from([5, 6]),
      count: 3,
    };
    expect(sanitizeValue(input)).toEqual({
      when: "2022-02-02T02:02:02.000Z",
      raw: [5, 6],
      count: 3,
    });
  });

  it("returns primitives unchanged", () => {
    expect(sanitizeValue("hello")).toBe("hello");
    expect(sanitizeValue(123)).toBe(123);
    expect(sanitizeValue(true)).toBe(true);
    expect(sanitizeValue(null)).toBe(null);
  });
});

// ===========================================================================
// parseExif
// ===========================================================================
describe("parseExif", () => {
  it("returns four empty sections for an empty buffer", () => {
    expect(parseExif(Buffer.alloc(0))).toEqual({ image: {}, photo: {}, iop: {}, gps: {} });
  });

  it("returns empty sections (does not throw) on a malformed buffer", () => {
    const result = parseExif(Buffer.from("garbage exif bytes that will not parse"));
    expect(result).toEqual({ image: {}, photo: {}, iop: {}, gps: {} });
  });

  it("populates the image section from a real EXIF blob", async () => {
    const meta = await sharp(exifJpeg).metadata();
    expect(meta.exif).toBeDefined();
    const result = parseExif(meta.exif as Buffer);
    expect(result.image.Make).toBe("AcmeCam");
    expect(result.image.Model).toBe("X100");
    expect(result.image.Software).toBe("SnapOtterTest");
  });

  it("populates the photo section from a real EXIF blob", async () => {
    const meta = await sharp(exifJpeg).metadata();
    const result = parseExif(meta.exif as Buffer);
    // The Photo IFD exists and is non-empty.
    expect(Object.keys(result.photo).length).toBeGreaterThan(0);
    expect(result.photo).toHaveProperty("ExifVersion");
  });
});

// ===========================================================================
// parseGps
// ===========================================================================
describe("parseGps", () => {
  it("converts DMS to decimal degrees for a northern latitude", () => {
    const { latitude } = parseGps({ GPSLatitude: [10, 30, 0], GPSLatitudeRef: "N" });
    expect(latitude).toBeCloseTo(10.5, 10);
  });

  it("negates latitude for a southern reference", () => {
    const { latitude } = parseGps({ GPSLatitude: [10, 30, 0], GPSLatitudeRef: "S" });
    expect(latitude).toBeCloseTo(-10.5, 10);
  });

  it("does not negate latitude for a non-S reference", () => {
    const { latitude } = parseGps({ GPSLatitude: [10, 30, 0], GPSLatitudeRef: "N" });
    expect(latitude).toBeGreaterThan(0);
  });

  it("converts DMS to decimal degrees for an eastern longitude", () => {
    const { longitude } = parseGps({ GPSLongitude: [122, 15, 30], GPSLongitudeRef: "E" });
    expect(longitude).toBeCloseTo(122.25833333333334, 10);
  });

  it("negates longitude for a western reference", () => {
    const { longitude } = parseGps({ GPSLongitude: [122, 15, 30], GPSLongitudeRef: "W" });
    expect(longitude).toBeCloseTo(-122.25833333333334, 10);
  });

  it("uses the minutes/60 and seconds/3600 divisors exactly", () => {
    // 0 deg 6 min 36 sec = 6/60 + 36/3600 = 0.1 + 0.01 = 0.11 exactly.
    const { latitude } = parseGps({ GPSLatitude: [0, 6, 36], GPSLatitudeRef: "N" });
    expect(latitude).toBeCloseTo(0.11, 10);
  });

  it("returns null latitude when the DMS array is not length 3", () => {
    expect(parseGps({ GPSLatitude: [10, 30], GPSLatitudeRef: "N" }).latitude).toBeNull();
    expect(parseGps({ GPSLatitude: [10, 30, 0, 5], GPSLatitudeRef: "N" }).latitude).toBeNull();
  });

  it("returns null latitude when a DMS component is NaN", () => {
    expect(parseGps({ GPSLatitude: [10, Number.NaN, 0], GPSLatitudeRef: "N" }).latitude).toBeNull();
  });

  it("returns null coordinates when GPS fields are absent", () => {
    expect(parseGps({})).toEqual({ latitude: null, longitude: null, altitude: null });
  });

  it("reads a positive altitude with no reference", () => {
    expect(parseGps({ GPSAltitude: 120.5 }).altitude).toBe(120.5);
  });

  it("negates altitude when GPSAltitudeRef is 1 (below sea level)", () => {
    expect(parseGps({ GPSAltitude: 120.5, GPSAltitudeRef: 1 }).altitude).toBe(-120.5);
  });

  it("does not negate altitude when GPSAltitudeRef is 0", () => {
    expect(parseGps({ GPSAltitude: 120.5, GPSAltitudeRef: 0 }).altitude).toBe(120.5);
  });

  it("returns null altitude when GPSAltitude is not a number", () => {
    expect(parseGps({ GPSAltitude: "120" }).altitude).toBeNull();
    expect(parseGps({ GPSAltitude: Number.NaN }).altitude).toBeNull();
  });

  it("parses latitude, longitude and altitude together", () => {
    const out = parseGps({
      GPSLatitude: [40, 30, 0],
      GPSLatitudeRef: "N",
      GPSLongitude: [74, 0, 0],
      GPSLongitudeRef: "W",
      GPSAltitude: 10,
      GPSAltitudeRef: 0,
    });
    expect(out.latitude).toBeCloseTo(40.5, 10);
    expect(out.longitude).toBeCloseTo(-74, 10);
    expect(out.altitude).toBe(10);
  });
});

// ===========================================================================
// parseXmp
// ===========================================================================
describe("parseXmp", () => {
  it("extracts namespaced key/value attribute pairs", () => {
    const xml = '<x:xmpmeta><rdf:Description dc:creator="Jane" tiff:Make="Nikon"/></x:xmpmeta>';
    const result = parseXmp(Buffer.from(xml, "utf-8"));
    expect(result["dc:creator"]).toBe("Jane");
    expect(result["tiff:Make"]).toBe("Nikon");
  });

  it("skips xmlns: declarations", () => {
    const xml = '<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="Sunset"/>';
    const result = parseXmp(Buffer.from(xml, "utf-8"));
    expect(result).not.toHaveProperty("xmlns:dc");
    expect(result["dc:title"]).toBe("Sunset");
  });

  it("skips rdf: attributes", () => {
    const xml = '<rdf:Description rdf:about="" dc:subject="Beach"/>';
    const result = parseXmp(Buffer.from(xml, "utf-8"));
    expect(result).not.toHaveProperty("rdf:about");
    expect(result["dc:subject"]).toBe("Beach");
  });

  it("returns an empty object when there are no namespaced attributes", () => {
    expect(parseXmp(Buffer.from("<plain>no attributes here</plain>", "utf-8"))).toEqual({});
  });
});

// ===========================================================================
// mime utilities - enumerate every mapping in both directions plus fallbacks.
// ===========================================================================
const EXT_MIME_PAIRS: ReadonlyArray<[string, string]> = [
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["tiff", "image/tiff"],
  ["tif", "image/tiff"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
  ["heif", "image/heif"],
  ["heic", "image/heic"],
  ["jxl", "image/jxl"],
  ["dng", "image/x-adobe-dng"],
  ["cr2", "image/x-canon-cr2"],
  ["nef", "image/x-nikon-nef"],
  ["arw", "image/x-sony-arw"],
  ["orf", "image/x-olympus-orf"],
  ["rw2", "image/x-panasonic-rw2"],
  ["cr3", "image/x-canon-cr3"],
  ["raf", "image/x-fuji-raf"],
  ["pef", "image/x-pentax-pef"],
  ["3fr", "image/x-hasselblad-3fr"],
  ["iiq", "image/x-phaseone-iiq"],
  ["srw", "image/x-samsung-srw"],
  ["x3f", "image/x-sigma-x3f"],
  ["rwl", "image/x-leica-rwl"],
  ["nrw", "image/x-nikon-nrw"],
  ["gpr", "image/x-gopro-gpr"],
  ["fff", "image/x-hasselblad-fff"],
  ["mrw", "image/x-minolta-mrw"],
  ["mef", "image/x-mamiya-mef"],
  ["kdc", "image/x-kodak-kdc"],
  ["dcr", "image/x-kodak-dcr"],
  ["erf", "image/x-epson-erf"],
  ["ptx", "image/x-pentax-ptx"],
  ["tga", "image/x-tga"],
  ["psd", "image/vnd.adobe.photoshop"],
  ["exr", "image/x-exr"],
  ["hdr", "image/vnd.radiance"],
  ["jp2", "image/jp2"],
  ["j2k", "image/jp2"],
  ["j2c", "image/jp2"],
  ["jpc", "image/jp2"],
  ["jpf", "image/jp2"],
  ["jpx", "image/jpx"],
  ["qoi", "image/qoi"],
  ["eps", "application/postscript"],
  ["epsf", "application/postscript"],
  ["dds", "image/vnd.ms-dds"],
  ["cur", "image/x-icon"],
  ["apng", "image/apng"],
  ["dpx", "image/x-dpx"],
  ["cin", "image/x-cineon"],
  ["fits", "image/fits"],
  ["fit", "image/fits"],
  ["fts", "image/fits"],
  ["ppm", "image/x-portable-pixmap"],
  ["pgm", "image/x-portable-graymap"],
  ["pbm", "image/x-portable-bitmap"],
  ["pnm", "image/x-portable-anymap"],
  ["pam", "image/x-portable-anymap"],
  ["pfm", "image/x-portable-floatmap"],
  ["svgz", "image/svg+xml"],
];

const MIME_EXT_PAIRS: ReadonlyArray<[string, string]> = [
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/tiff", "tiff"],
  ["image/gif", "gif"],
  ["image/bmp", "bmp"],
  ["image/svg+xml", "svg"],
  ["image/x-icon", "ico"],
  ["image/heif", "heif"],
  ["image/heic", "heic"],
  ["image/jxl", "jxl"],
  ["image/x-adobe-dng", "dng"],
  ["image/x-canon-cr2", "cr2"],
  ["image/x-nikon-nef", "nef"],
  ["image/x-sony-arw", "arw"],
  ["image/x-olympus-orf", "orf"],
  ["image/x-panasonic-rw2", "rw2"],
  ["image/x-canon-cr3", "cr3"],
  ["image/x-fuji-raf", "raf"],
  ["image/x-pentax-pef", "pef"],
  ["image/x-hasselblad-3fr", "3fr"],
  ["image/x-phaseone-iiq", "iiq"],
  ["image/x-samsung-srw", "srw"],
  ["image/x-sigma-x3f", "x3f"],
  ["image/x-leica-rwl", "rwl"],
  ["image/x-nikon-nrw", "nrw"],
  ["image/x-gopro-gpr", "gpr"],
  ["image/x-hasselblad-fff", "fff"],
  ["image/x-minolta-mrw", "mrw"],
  ["image/x-mamiya-mef", "mef"],
  ["image/x-kodak-kdc", "kdc"],
  ["image/x-kodak-dcr", "dcr"],
  ["image/x-epson-erf", "erf"],
  ["image/x-pentax-ptx", "ptx"],
  ["image/x-tga", "tga"],
  ["image/vnd.adobe.photoshop", "psd"],
  ["image/x-exr", "exr"],
  ["image/vnd.radiance", "hdr"],
  ["image/jp2", "jp2"],
  ["image/jpx", "jpx"],
  ["image/qoi", "qoi"],
  ["application/postscript", "eps"],
  ["image/vnd.ms-dds", "dds"],
  ["image/apng", "apng"],
  ["image/x-dpx", "dpx"],
  ["image/x-cineon", "cin"],
  ["image/fits", "fits"],
  ["image/x-portable-pixmap", "ppm"],
  ["image/x-portable-graymap", "pgm"],
  ["image/x-portable-bitmap", "pbm"],
  ["image/x-portable-anymap", "pnm"],
  ["image/x-portable-floatmap", "pfm"],
];

describe("extToMime", () => {
  it.each(EXT_MIME_PAIRS)("maps extension %s to %s", (ext, mime) => {
    expect(extToMime(ext)).toBe(mime);
  });

  it("strips a leading dot before lookup", () => {
    expect(extToMime(".png")).toBe("image/png");
    expect(extToMime(".jpg")).toBe("image/jpeg");
  });

  it("lowercases the extension before lookup", () => {
    expect(extToMime("PNG")).toBe("image/png");
    expect(extToMime("JpEg")).toBe("image/jpeg");
  });

  it("returns application/octet-stream for an unknown extension", () => {
    expect(extToMime("zzz")).toBe("application/octet-stream");
    expect(extToMime("")).toBe("application/octet-stream");
  });
});

describe("mimeToExt", () => {
  it.each(MIME_EXT_PAIRS)("maps MIME %s to extension %s", (mime, ext) => {
    expect(mimeToExt(mime)).toBe(ext);
  });

  it("lowercases the MIME type before lookup", () => {
    expect(mimeToExt("IMAGE/PNG")).toBe("png");
    expect(mimeToExt("Image/Jpeg")).toBe("jpg");
  });

  it("returns bin for an unknown MIME type", () => {
    expect(mimeToExt("application/x-nope")).toBe("bin");
    expect(mimeToExt("")).toBe("bin");
  });
});

describe("formatToMime", () => {
  it("special-cases jpeg to image/jpeg", () => {
    expect(formatToMime("jpeg")).toBe("image/jpeg");
  });

  it("lowercases the format before the jpeg special-case", () => {
    expect(formatToMime("JPEG")).toBe("image/jpeg");
  });

  it("falls through to the ext map for non-jpeg formats", () => {
    expect(formatToMime("png")).toBe("image/png");
    expect(formatToMime("webp")).toBe("image/webp");
    expect(formatToMime("avif")).toBe("image/avif");
    expect(formatToMime("gif")).toBe("image/gif");
  });

  it("returns application/octet-stream for an unknown format", () => {
    expect(formatToMime("madeup")).toBe("application/octet-stream");
  });
});

describe("formatToExt", () => {
  it("special-cases jpeg to jpg", () => {
    expect(formatToExt("jpeg")).toBe("jpg");
  });

  it("lowercases the format before the jpeg special-case", () => {
    expect(formatToExt("JPEG")).toBe("jpg");
  });

  it("returns the lowercased format unchanged for non-jpeg formats", () => {
    expect(formatToExt("png")).toBe("png");
    expect(formatToExt("WEBP")).toBe("webp");
    expect(formatToExt("AVIF")).toBe("avif");
    // Unknown formats are passed through lowercased (no fallback here).
    expect(formatToExt("Madeup")).toBe("madeup");
  });
});
