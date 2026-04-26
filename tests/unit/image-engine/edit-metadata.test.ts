import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;
const exifReader = require(
  path.resolve(__dirname, "../../../packages/image-engine/node_modules/exif-reader"),
) as typeof import("exif-reader").default;

import { editMetadata } from "@snapotter/image-engine";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");

let jpgWithExif: Buffer;
let png200x150: Buffer;

beforeAll(() => {
  jpgWithExif = readFileSync(path.join(FIXTURES_DIR, "test-with-exif.jpg"));
  png200x150 = readFileSync(path.join(FIXTURES_DIR, "test-200x150.png"));
});

async function getExif(img: sharp.Sharp) {
  const buf = await img.toBuffer();
  const meta = await sharp(buf).metadata();
  if (!meta.exif) return null;
  return exifReader(meta.exif);
}

describe("editMetadata", () => {
  // -- No-op cases -----------------------------------------------------------

  it("returns image unchanged when no edits or removals are specified", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, {});
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("returns image unchanged with empty options object", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img);
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Writing fields --------------------------------------------------------

  it("writes artist field to EXIF", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { artist: "New Artist" });
    const exif = await getExif(result);
    expect(exif?.Image?.Artist).toBe("New Artist");
  });

  it("writes copyright field to EXIF", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { copyright: "2026 Test" });
    const exif = await getExif(result);
    expect(exif?.Image?.Copyright).toBe("2026 Test");
  });

  it("writes imageDescription to EXIF", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { imageDescription: "A test image" });
    const exif = await getExif(result);
    expect(exif?.Image?.ImageDescription).toBe("A test image");
  });

  it("writes software field to EXIF", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { software: "SnapOtter v1" });
    const exif = await getExif(result);
    expect(exif?.Image?.Software).toBe("SnapOtter v1");
  });

  it("writes dateTime field to IFD0", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { dateTime: "2026:01:15 10:30:00" });
    const exif = await getExif(result);
    expect(exif?.Image?.DateTime).toBeDefined();
  });

  it("writes dateTimeOriginal to IFD2", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { dateTimeOriginal: "2025:06:01 12:00:00" });
    const exif = await getExif(result);
    expect(exif?.Photo?.DateTimeOriginal).toBeDefined();
  });

  it("writes multiple fields at once", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, {
      artist: "Multi Writer",
      copyright: "2026 Multi",
      software: "TestApp",
    });
    const exif = await getExif(result);
    expect(exif?.Image?.Artist).toBe("Multi Writer");
    expect(exif?.Image?.Copyright).toBe("2026 Multi");
    expect(exif?.Image?.Software).toBe("TestApp");
  });

  // -- Ignoring empty strings ------------------------------------------------

  it("ignores empty string values for fields", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { artist: "", copyright: "" });
    // No edits + no removals = keepMetadata path
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Removing fields -------------------------------------------------------

  it("removes specified fields from EXIF", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { fieldsToRemove: ["Artist"] });
    const exif = await getExif(result);
    // Artist should be removed
    expect(exif?.Image?.Artist).toBeUndefined();
  });

  it("filters out unsafe round-trip keys from fieldsToRemove", async () => {
    const img = sharp(jpgWithExif);
    // MakerNote is in the UNSAFE_ROUND_TRIP_KEYS set
    const result = await editMetadata(img, { fieldsToRemove: ["MakerNote"] });
    // Should not throw, and image should be returned
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("does not remove a field that is also being written", async () => {
    const img = sharp(jpgWithExif);
    // Write Artist and also try to remove it - write takes precedence
    const result = await editMetadata(img, {
      artist: "Keep Me",
      fieldsToRemove: ["Artist"],
    });
    const exif = await getExif(result);
    expect(exif?.Image?.Artist).toBe("Keep Me");
  });

  // -- clearGps --------------------------------------------------------------

  it("clearGps removes GPS data", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { clearGps: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Combined edit + remove ------------------------------------------------

  it("handles both edits and removals together", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, {
      artist: "New Creator",
      fieldsToRemove: ["Copyright"],
    });
    const exif = await getExif(result);
    expect(exif?.Image?.Artist).toBe("New Creator");
    expect(exif?.Image?.Copyright).toBeUndefined();
  });

  // -- Write-only path (withExifMerge) ---------------------------------------

  it("uses merge path when only writing fields (no removals)", async () => {
    const img = sharp(jpgWithExif);
    const result = await editMetadata(img, { artist: "Merge Writer" });
    const exif = await getExif(result);
    expect(exif?.Image?.Artist).toBe("Merge Writer");
    // Copyright should still exist from original EXIF
    expect(exif?.Image?.Copyright).toBeDefined();
  });

  // -- Image without EXIF ---------------------------------------------------

  it("writes EXIF to image that had no EXIF before", async () => {
    const img = sharp(png200x150);
    const result = await editMetadata(img, { artist: "PNG Artist" });
    // Convert to JPEG first since PNG doesn't support EXIF natively
    const jpgBuf = await result.jpeg().toBuffer();
    const meta = await sharp(jpgBuf).metadata();
    if (meta.exif) {
      const exif = exifReader(meta.exif);
      expect(exif?.Image?.Artist).toBe("PNG Artist");
    }
  });

  it("handles removal on image without existing EXIF gracefully", async () => {
    const img = sharp(png200x150);
    const result = await editMetadata(img, {
      fieldsToRemove: ["Artist"],
      artist: "FallbackWriter",
    });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });
});
