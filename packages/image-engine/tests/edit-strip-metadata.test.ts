import exifReader from "exif-reader";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { editMetadata } from "../src/operations/edit-metadata.js";
import { stripMetadata } from "../src/operations/strip-metadata.js";
import type { Sharp } from "../src/types.js";

// A JPEG carrying rich, known metadata: EXIF (IFD0 strings + IFD2 date) plus an
// ICC profile. Every assertion below round-trips through sharp().metadata() and
// exif-reader so it pins the SPECIFIC value a mutation would change.
let richBuffer: Buffer;
const richImage = (): Sharp => sharp(richBuffer);

interface ExifSections {
  hasExif: boolean;
  hasIcc: boolean;
  hasXmp: boolean;
  image: NonNullable<ReturnType<typeof exifReader>["Image"]>;
  photo: NonNullable<ReturnType<typeof exifReader>["Photo"]>;
  gps: NonNullable<ReturnType<typeof exifReader>["GPSInfo"]>;
}

// Encode the pipeline to a JPEG buffer and decode its EXIF/ICC so we can assert
// against concrete field values.
async function readBack(image: Sharp): Promise<ExifSections> {
  const buf = await image.jpeg().toBuffer();
  const meta = await sharp(buf).metadata();
  const parsed = meta.exif ? exifReader(meta.exif) : {};
  return {
    hasExif: !!meta.exif,
    hasIcc: !!meta.icc,
    hasXmp: !!meta.xmp,
    image: parsed.Image ?? {},
    photo: parsed.Photo ?? {},
    gps: parsed.GPSInfo ?? {},
  };
}

beforeAll(async () => {
  richBuffer = await sharp({
    create: {
      width: 24,
      height: 16,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .withExif({
      IFD0: {
        Artist: "OrigArtist",
        Copyright: "OrigCopyright",
        ImageDescription: "OrigDesc",
        Software: "OrigSoft",
      },
      IFD2: {
        DateTimeOriginal: "2001:01:01 01:01:01",
      },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40 30 0",
        GPSLongitudeRef: "W",
        GPSLongitude: "74 0 0",
      },
    })
    .withIccProfile("srgb")
    .withXmp(
      '<?xpacket begin="﻿"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="SnapOtter XMP"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>',
    )
    .jpeg()
    .toBuffer();
});

describe("editMetadata", () => {
  it("sanity check: the rich fixture carries the seeded EXIF fields", async () => {
    const meta = await sharp(richBuffer).metadata();
    expect(meta.exif).toBeTruthy();
    const parsed = exifReader(meta.exif as Buffer);
    expect(parsed.Image?.Artist).toBe("OrigArtist");
    expect(parsed.Image?.Copyright).toBe("OrigCopyright");
    expect(parsed.Image?.Software).toBe("OrigSoft");
    expect(parsed.Image?.ImageDescription).toBe("OrigDesc");
  });

  it("writes each IFD0 string field to its exact tag with distinct values", async () => {
    const { image } = await readBack(
      await editMetadata(richImage(), {
        artist: "Ada Lovelace",
        copyright: "(c) 2026 Otter",
        imageDescription: "A river otter",
        software: "SnapOtter 2.0",
      }),
    );
    // Each option must land on its OWN tag. A swapped field-name mutant
    // (e.g. artist -> Copyright) makes one of these read the wrong value.
    expect(image.Artist).toBe("Ada Lovelace");
    expect(image.Copyright).toBe("(c) 2026 Otter");
    expect(image.ImageDescription).toBe("A river otter");
    expect(image.Software).toBe("SnapOtter 2.0");
  });

  it("routes dateTime to IFD0.DateTime and NOT to IFD2", async () => {
    const { image, photo } = await readBack(
      await editMetadata(richImage(), { dateTime: "2020:02:02 03:03:03" }),
    );
    // exif-reader returns DateTime fields as Date objects.
    expect(image.DateTime).toBeInstanceOf(Date);
    expect((image.DateTime as Date).toISOString()).toBe("2020-02-02T03:03:03.000Z");
    // Seeded IFD2 original date stays as-is; the edit did not leak into it.
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2001-01-01T01:01:01.000Z");
  });

  it("routes dateTimeOriginal to IFD2/Photo.DateTimeOriginal, not IFD0", async () => {
    const { image, photo } = await readBack(
      await editMetadata(richImage(), { dateTimeOriginal: "2019:09:09 09:09:09" }),
    );
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2019-09-09T09:09:09.000Z");
    // IFD0.DateTime was never touched, so it must be absent from Image.
    expect(image.DateTime).toBeUndefined();
  });

  it("merges edits onto the existing EXIF, leaving untouched fields intact", async () => {
    const { image } = await readBack(
      await editMetadata(richImage(), { artist: "NewArtist", software: "NewSoft" }),
    );
    // Edited fields change...
    expect(image.Artist).toBe("NewArtist");
    expect(image.Software).toBe("NewSoft");
    // ...omitted fields keep their original values (withExifMerge path).
    expect(image.Copyright).toBe("OrigCopyright");
    expect(image.ImageDescription).toBe("OrigDesc");
  });

  it("skips empty-string values (length 0), preserving the original field", async () => {
    // artist:"" must NOT be written. With no edits and no removals the function
    // takes the keepMetadata() branch, so the original Artist survives verbatim.
    const { image, hasExif, hasIcc } = await readBack(
      await editMetadata(richImage(), { artist: "" }),
    );
    expect(image.Artist).toBe("OrigArtist");
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
  });

  it("keeps all metadata (EXIF + ICC) when no options are given", async () => {
    const { hasExif, hasIcc, image } = await readBack(await editMetadata(richImage(), {}));
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
    // keepMetadata() copies the original EXIF through unchanged.
    expect(image.Artist).toBe("OrigArtist");
  });

  it("keeps all metadata when default (undefined) options are used", async () => {
    const { hasExif, hasIcc } = await readBack(await editMetadata(richImage()));
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
  });

  it("removes a requested field via fieldsToRemove while keeping the rest", async () => {
    const { gps, hasIcc, hasXmp, image } = await readBack(
      await editMetadata(richImage(), { fieldsToRemove: ["Software"] }),
    );
    // Removed field is gone...
    expect(image.Software).toBeUndefined();
    // ...but every other seeded field is rebuilt and preserved.
    expect(image.Artist).toBe("OrigArtist");
    expect(image.Copyright).toBe("OrigCopyright");
    expect(image.ImageDescription).toBe("OrigDesc");
    expect(gps.GPSLatitudeRef).toBe("N");
    expect(gps.GPSLatitude).toEqual([40, 30, 0]);
    expect(gps.GPSLongitudeRef).toBe("W");
    expect(gps.GPSLongitude).toEqual([74, 0, 0]);
    expect(hasIcc).toBe(true);
    expect(hasXmp).toBe(true);
  });

  it("removes a field AND applies an edit in the same call (withExif rebuild path)", async () => {
    const { image } = await readBack(
      await editMetadata(richImage(), {
        artist: "Combined",
        fieldsToRemove: ["Copyright"],
      }),
    );
    expect(image.Artist).toBe("Combined");
    expect(image.Copyright).toBeUndefined();
    // Untouched, non-removed field carries over from the source EXIF.
    expect(image.Software).toBe("OrigSoft");
  });

  it("ignores a fieldsToRemove entry that names an actively-edited tag", async () => {
    // Artist is both edited and listed for removal. The edit wins because the
    // written tag is filtered out of fieldsToRemove before removal happens.
    const { image } = await readBack(
      await editMetadata(richImage(), {
        artist: "WinsOverRemoval",
        fieldsToRemove: ["Artist"],
      }),
    );
    expect(image.Artist).toBe("WinsOverRemoval");
  });

  it("filters unsafe round-trip keys out of fieldsToRemove (no removal happens)", async () => {
    // MakerNote is in UNSAFE_ROUND_TRIP_KEYS, so after filtering there is nothing
    // to remove and no edit: the keepMetadata() branch runs and EXIF stays whole.
    const { hasExif, hasIcc, image } = await readBack(
      await editMetadata(richImage(), { fieldsToRemove: ["MakerNote"] }),
    );
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
    expect(image.Artist).toBe("OrigArtist");
    expect(image.Software).toBe("OrigSoft");
  });

  it("treats clearGps:true as a removal trigger, rebuilding EXIF while keeping fields", async () => {
    // clearGps flips hasRemovals true even with an empty fieldsToRemove, so the
    // function rebuilds EXIF from the source rather than taking keepMetadata().
    const { gps, hasExif, image } = await readBack(
      await editMetadata(richImage(), { clearGps: true }),
    );
    expect(hasExif).toBe(true);
    // Non-GPS IFD0 fields survive the rebuild verbatim.
    expect(image.Artist).toBe("OrigArtist");
    expect(image.Copyright).toBe("OrigCopyright");
    expect(gps).toEqual({});
  });

  it("removes a specifically requested GPS field while preserving sibling GPS fields", async () => {
    const { gps } = await readBack(
      await editMetadata(richImage(), { fieldsToRemove: ["GPSLatitude"] }),
    );
    expect(gps.GPSLatitude).toBeUndefined();
    expect(gps.GPSLongitudeRef).toBe("W");
    expect(gps.GPSLongitude).toEqual([74, 0, 0]);
  });

  it("fails safely when existing EXIF cannot be parsed during a removal", async () => {
    const withExif = vi.fn();
    const fake = {
      metadata: vi.fn().mockResolvedValue({ exif: Buffer.from("not-valid-exif") }),
      withExif,
    } as unknown as Sharp;

    await expect(editMetadata(fake, { fieldsToRemove: ["Software"] })).rejects.toThrow(
      "Cannot safely edit metadata because existing EXIF data is invalid",
    );
    expect(withExif).not.toHaveBeenCalled();
  });

  it("does not change image dimensions or format", async () => {
    const buf = await (await editMetadata(richImage(), { artist: "DimCheck" })).jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(24);
    expect(meta.height).toBe(16);
    expect(meta.format).toBe("jpeg");
  });
});

describe("stripMetadata", () => {
  it("sanity check: the rich fixture carries EXIF, ICC, and XMP", async () => {
    const meta = await sharp(richBuffer).metadata();
    expect(meta.exif).toBeTruthy();
    expect(meta.icc).toBeTruthy();
    expect(meta.xmp?.toString()).toContain("SnapOtter XMP");
  });

  it("strips both EXIF and ICC when stripAll is true", async () => {
    const { hasExif, hasIcc } = await readBack(
      await stripMetadata(richImage(), { stripAll: true }),
    );
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(false);
  });

  it("strips everything when no options are provided (all undefined)", async () => {
    const { hasExif, hasIcc } = await readBack(await stripMetadata(richImage(), {}));
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(false);
  });

  it("strips everything when called with default options", async () => {
    const { hasExif, hasIcc } = await readBack(await stripMetadata(richImage()));
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(false);
  });

  it("keeps EXIF and ICC when every strip flag is explicitly false", async () => {
    // strippingNothing branch: withMetadata() preserves all categories.
    const { hasExif, hasIcc, image } = await readBack(
      await stripMetadata(richImage(), {
        stripExif: false,
        stripGps: false,
        stripIcc: false,
        stripXmp: false,
      }),
    );
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
    expect(image.Artist).toBe("OrigArtist");
  });

  it("strips EXIF but keeps ICC when only stripExif is true", async () => {
    const { hasExif, hasIcc } = await readBack(
      await stripMetadata(richImage(), { stripExif: true }),
    );
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(true);
  });

  it("strips EXIF but keeps ICC when only stripGps is true", async () => {
    // stripGps gates the same keepExif() branch as stripExif: !stripExif is true
    // but !stripGps is false, so keepExif() is skipped and EXIF drops.
    const { hasExif, hasIcc } = await readBack(
      await stripMetadata(richImage(), { stripGps: true }),
    );
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(true);
  });

  it("keeps EXIF and XMP but strips ICC when only stripIcc is true", async () => {
    const { hasExif, hasIcc, hasXmp } = await readBack(
      await stripMetadata(richImage(), { stripIcc: true }),
    );
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(false);
    expect(hasXmp).toBe(true);
  });

  it("keeps both EXIF and ICC when only stripXmp is true (selective mode)", async () => {
    const { hasExif, hasIcc, hasXmp, image } = await readBack(
      await stripMetadata(richImage(), { stripXmp: true }),
    );
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(true);
    expect(hasXmp).toBe(false);
    expect(image.Artist).toBe("OrigArtist");
  });

  it("preserves XMP when selectively stripping EXIF", async () => {
    const { hasExif, hasIcc, hasXmp } = await readBack(
      await stripMetadata(richImage(), { stripExif: true, stripXmp: false }),
    );
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(true);
    expect(hasXmp).toBe(true);
  });

  it("strips both EXIF and ICC when stripExif and stripIcc are both true", async () => {
    const { hasExif, hasIcc } = await readBack(
      await stripMetadata(richImage(), { stripExif: true, stripIcc: true }),
    );
    expect(hasExif).toBe(false);
    expect(hasIcc).toBe(false);
  });

  it("keeps EXIF when stripIcc and stripXmp are true but EXIF flags are false", async () => {
    // Only ICC + XMP requested for removal, so keepExif() still fires.
    const { hasExif, hasIcc } = await readBack(
      await stripMetadata(richImage(), { stripIcc: true, stripXmp: true }),
    );
    expect(hasExif).toBe(true);
    expect(hasIcc).toBe(false);
  });

  it("does not change image dimensions or format", async () => {
    const buf = await (await stripMetadata(richImage(), { stripAll: true })).jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(24);
    expect(meta.height).toBe(16);
    expect(meta.format).toBe("jpeg");
  });
});
