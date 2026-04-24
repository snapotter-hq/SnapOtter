import { extToMime, formatToExt, formatToMime, mimeToExt } from "@snapotter/image-engine";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// extToMime — file extension to MIME type
// ---------------------------------------------------------------------------
describe("extToMime", () => {
  const cases: Array<[string, string]> = [
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
    ["tga", "image/x-tga"],
    ["psd", "image/vnd.adobe.photoshop"],
    ["exr", "image/x-exr"],
    ["hdr", "image/vnd.radiance"],
  ];

  for (const [ext, mime] of cases) {
    it(`maps "${ext}" to "${mime}"`, () => {
      expect(extToMime(ext)).toBe(mime);
    });
  }

  it("normalizes uppercase extensions", () => {
    expect(extToMime("PNG")).toBe("image/png");
    expect(extToMime("JPG")).toBe("image/jpeg");
  });

  it("strips leading dot from extension", () => {
    expect(extToMime(".png")).toBe("image/png");
    expect(extToMime(".jpg")).toBe("image/jpeg");
  });

  it("returns application/octet-stream for unknown extension", () => {
    expect(extToMime("xyz")).toBe("application/octet-stream");
    expect(extToMime("")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// mimeToExt — MIME type to file extension
// ---------------------------------------------------------------------------
describe("mimeToExt", () => {
  const cases: Array<[string, string]> = [
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
    ["image/x-tga", "tga"],
    ["image/vnd.adobe.photoshop", "psd"],
    ["image/x-exr", "exr"],
    ["image/vnd.radiance", "hdr"],
  ];

  for (const [mime, ext] of cases) {
    it(`maps "${mime}" to "${ext}"`, () => {
      expect(mimeToExt(mime)).toBe(ext);
    });
  }

  it("normalizes uppercase MIME types", () => {
    expect(mimeToExt("IMAGE/JPEG")).toBe("jpg");
    expect(mimeToExt("Image/PNG")).toBe("png");
  });

  it("returns 'bin' for unknown MIME type", () => {
    expect(mimeToExt("application/pdf")).toBe("bin");
    expect(mimeToExt("text/plain")).toBe("bin");
    expect(mimeToExt("")).toBe("bin");
  });
});

// ---------------------------------------------------------------------------
// formatToMime — Sharp format string to MIME type
// ---------------------------------------------------------------------------
describe("formatToMime", () => {
  it("maps 'jpeg' (Sharp format) to 'image/jpeg'", () => {
    expect(formatToMime("jpeg")).toBe("image/jpeg");
  });

  it("maps 'png' to 'image/png'", () => {
    expect(formatToMime("png")).toBe("image/png");
  });

  it("maps 'webp' to 'image/webp'", () => {
    expect(formatToMime("webp")).toBe("image/webp");
  });

  it("maps 'gif' to 'image/gif'", () => {
    expect(formatToMime("gif")).toBe("image/gif");
  });

  it("maps 'tiff' to 'image/tiff'", () => {
    expect(formatToMime("tiff")).toBe("image/tiff");
  });

  it("maps 'avif' to 'image/avif'", () => {
    expect(formatToMime("avif")).toBe("image/avif");
  });

  it("maps 'svg' to 'image/svg+xml'", () => {
    expect(formatToMime("svg")).toBe("image/svg+xml");
  });

  it("returns application/octet-stream for unknown format", () => {
    expect(formatToMime("unknown")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// formatToExt — Sharp format string to file extension
// ---------------------------------------------------------------------------
describe("formatToExt", () => {
  it("maps 'jpeg' to 'jpg'", () => {
    expect(formatToExt("jpeg")).toBe("jpg");
  });

  it("maps 'png' to 'png' (identity)", () => {
    expect(formatToExt("png")).toBe("png");
  });

  it("maps 'webp' to 'webp' (identity)", () => {
    expect(formatToExt("webp")).toBe("webp");
  });

  it("maps 'gif' to 'gif' (identity)", () => {
    expect(formatToExt("gif")).toBe("gif");
  });

  it("maps 'tiff' to 'tiff' (identity)", () => {
    expect(formatToExt("tiff")).toBe("tiff");
  });

  it("normalizes case", () => {
    expect(formatToExt("JPEG")).toBe("jpg");
    expect(formatToExt("PNG")).toBe("png");
  });

  it("returns the format itself for unknown formats", () => {
    expect(formatToExt("bmp")).toBe("bmp");
    expect(formatToExt("xyz")).toBe("xyz");
  });
});
