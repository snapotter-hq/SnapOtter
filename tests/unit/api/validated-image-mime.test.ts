import { CAMERA_RAW_INPUTS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_INPUT_FORMATS,
  type ValidationResult,
  validatedImageMime,
  validateImageBuffer,
} from "../../../apps/api/src/lib/file-validation.js";

function found(format: string): ValidationResult {
  return { valid: true, format, width: 0, height: 0 };
}

async function mimeFor(bytes: Buffer, filename: string): Promise<string | null> {
  const validation = await validateImageBuffer(bytes, filename);
  if (!validation.valid) throw new Error(`expected ${filename} to validate: ${validation.reason}`);
  return validatedImageMime(validation, filename);
}

const NOT_AN_IMAGE = Buffer.from("plain text, not a picture\n");

// The library offers a file to image tools only when its stored type starts
// with image/ (#1550), so every format the validator finds in the bytes has to
// map to one, whatever the file is called.
describe("validatedImageMime", () => {
  it.each([...SUPPORTED_INPUT_FORMATS])(
    "maps the validator's %s format to an image/* type",
    (format) => {
      expect(validatedImageMime(found(format), `file.${format}`)).toMatch(/^image\//);
      expect(validatedImageMime(found(format), "file.bin")).toMatch(/^image\//);
      expect(validatedImageMime(found(format))).toMatch(/^image\//);
    },
  );

  it.each([...CAMERA_RAW_INPUTS])("has a specific camera RAW type for %s", (ext) => {
    const mime = validatedImageMime(found("raw"), `shot${ext}`);
    expect(mime).toMatch(/^image\//);
    expect(mime).not.toBe("image/x-dcraw");
  });

  it("names the camera RAW type from a RAW extension", () => {
    expect(validatedImageMime(found("raw"), "IMG_0001.DNG")).toBe("image/x-adobe-dng");
    expect(validatedImageMime(found("raw"), "shot.cr3")).toBe("image/x-canon-cr3");
    expect(validatedImageMime(found("raw"), "shot.nef")).toBe("image/x-nikon-nef");
  });

  it("falls back to a generic RAW type when the name isn't a RAW extension", () => {
    expect(validatedImageMime(found("raw"), "shot.png")).toBe("image/x-dcraw");
    expect(validatedImageMime(found("raw"), "shot")).toBe("image/x-dcraw");
    expect(validatedImageMime(found("raw"))).toBe("image/x-dcraw");
  });

  it("tells HEIC from HEIF by extension, and only by a .heic one", () => {
    expect(validatedImageMime(found("heif"), "photo.HEIC")).toBe("image/heic");
    expect(validatedImageMime(found("heif"), "photo.heif")).toBe("image/heif");
    expect(validatedImageMime(found("heif"), "photo.png")).toBe("image/heif");
    expect(validatedImageMime(found("heif"))).toBe("image/heif");
  });

  it("ignores the extension for formats the bytes name exactly", () => {
    expect(validatedImageMime(found("png"), "photo.jpg")).toBe("image/png");
    expect(validatedImageMime(found("jpeg"), "photo.png")).toBe("image/jpeg");
    expect(validatedImageMime(found("pfm"))).toBe("image/x-portable-floatmap");
  });

  it("keeps EPS under image/", () => {
    expect(validatedImageMime(found("eps"), "art.eps")).toBe("image/x-eps");
  });

  it("gives no type to a result whose format came from the name alone", () => {
    expect(
      validatedImageMime({ valid: true, format: "tga", width: 0, height: 0, nameOnly: true }),
    ).toBeNull();
  });
});

// The validator accepts these on their name, with nothing in the bytes behind
// it, so the name must not buy them an image type (#1349).
describe("validatedImageMime on what validateImageBuffer() found by name", () => {
  it.each(["notes.tga", "notes.rw2", "notes.orf", "notes.pef", "notes.cr2"])(
    "gives text named %s no type",
    async (name) => {
      expect(await mimeFor(NOT_AN_IMAGE, name)).toBeNull();
    },
  );

  it("gives a gzip stream named .svgz no type, since nothing has looked inside it", async () => {
    const gzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
    expect(await mimeFor(gzip, "drawing.svgz")).toBeNull();
  });

  it("still types RAW whose TIFF signature the bytes carry", async () => {
    const tiffHeader = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    expect(await mimeFor(tiffHeader, "IMG_0001.dng")).toBe("image/x-adobe-dng");
  });
});
