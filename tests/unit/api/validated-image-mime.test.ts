import { CAMERA_RAW_INPUTS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_INPUT_FORMATS,
  validatedImageMime,
} from "../../../apps/api/src/lib/file-validation.js";

// The library offers a file to image tools only when its stored type starts
// with image/ (#1550), so every format the validator accepts has to map to one.
describe("validatedImageMime", () => {
  it.each([...SUPPORTED_INPUT_FORMATS])(
    "maps the validator's %s format to an image/* type",
    (format) => {
      expect(validatedImageMime(format, `file.${format}`)).toMatch(/^image\//);
    },
  );

  it.each([...CAMERA_RAW_INPUTS])("has a specific camera RAW type for %s", (ext) => {
    const mime = validatedImageMime("raw", `shot${ext}`);
    expect(mime).toMatch(/^image\//);
    expect(mime).not.toBe("image/x-dcraw");
  });

  it("names the camera RAW type from a RAW extension", () => {
    expect(validatedImageMime("raw", "IMG_0001.DNG")).toBe("image/x-adobe-dng");
    expect(validatedImageMime("raw", "shot.cr3")).toBe("image/x-canon-cr3");
    expect(validatedImageMime("raw", "shot.nef")).toBe("image/x-nikon-nef");
  });

  it("falls back to a generic RAW type when the name isn't a RAW extension", () => {
    expect(validatedImageMime("raw", "shot.png")).toBe("image/x-dcraw");
    expect(validatedImageMime("raw", "shot")).toBe("image/x-dcraw");
    expect(validatedImageMime("raw")).toBe("image/x-dcraw");
  });

  it("tells HEIC from HEIF by extension, and nothing else", () => {
    expect(validatedImageMime("heif", "photo.HEIC")).toBe("image/heic");
    expect(validatedImageMime("heif", "photo.heif")).toBe("image/heif");
    expect(validatedImageMime("heif", "photo.png")).toBe("image/heif");
    expect(validatedImageMime("heif")).toBe("image/heif");
  });

  it("ignores the extension for formats the bytes name exactly", () => {
    expect(validatedImageMime("png", "photo.jpg")).toBe("image/png");
    expect(validatedImageMime("jpeg", "photo.png")).toBe("image/jpeg");
    expect(validatedImageMime("svg", "drawing.svgz")).toBe("image/svg+xml");
  });

  it("keeps EPS under image/", () => {
    expect(validatedImageMime("eps", "art.eps")).toBe("image/x-eps");
  });
});
