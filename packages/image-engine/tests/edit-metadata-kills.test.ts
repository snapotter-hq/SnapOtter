import exifReader from "exif-reader";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { editMetadata } from "../src/operations/edit-metadata.js";
import type { Sharp } from "../src/types.js";

// Mutation-killing suite for src/operations/edit-metadata.ts. Every case seeds a
// JPEG with known EXIF, runs editMetadata, then re-reads the encoded output via
// sharp().metadata() + exif-reader and asserts the EXACT tag values a surviving
// mutant would change. Sibling coverage lives in edit-strip-metadata.test.ts; this
// file targets the specific survivors the mutation report still flags.
//
// Platform note (verified via scratch runs before writing these assertions):
// Sharp's withExif rebuild path preserves existing IFD2/Photo tags FNumber (number)
// and LensModel (string), and existing IFD0 numeric tags (Orientation,
// ResolutionUnit) alongside string tags (Artist, Software). Existing IFD2 date/blob
// tags (DateTimeOriginal, UserComment, ExifVersion) do NOT survive the rebuild, so
// assertions deliberately avoid those as carriers.

// A JPEG carrying rich EXIF across BOTH IFDs, chosen so every tag below reads back
// through the rebuild path: IFD0 has string + numeric tags; IFD2 has a numeric tag
// (FNumber) and a string tag (LensModel) that both survive withExif reconstruction.
let seedBuffer: Buffer;
const seedImage = (): Sharp => sharp(seedBuffer);

interface ExifSections {
  hasExif: boolean;
  hasIcc: boolean;
  // exif-reader's typings are loose; index into the parsed sections directly.
  image: Record<string, unknown>;
  photo: Record<string, unknown>;
}

// Encode to JPEG and decode EXIF/ICC so assertions pin concrete field values.
async function readBack(image: Sharp): Promise<ExifSections> {
  const buf = await image.jpeg().toBuffer();
  const meta = await sharp(buf).metadata();
  const parsed = meta.exif ? exifReader(meta.exif) : { Image: {}, Photo: {} };
  return {
    hasExif: !!meta.exif,
    hasIcc: !!meta.icc,
    image: (parsed.Image ?? {}) as Record<string, unknown>,
    photo: (parsed.Photo ?? {}) as Record<string, unknown>,
  };
}

beforeAll(async () => {
  seedBuffer = await sharp({
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
        // Numeric IFD0 tags that Sharp does NOT auto-regenerate, so they survive the
        // rebuild only because the string||number guard admits the number branch.
        // (Orientation/ResolutionUnit are auto-added regardless, so they cannot pin
        // the number branch on their own.)
        ImageWidth: "1024",
        ImageLength: "768",
      },
      IFD2: {
        DateTimeOriginal: "2001:01:01 01:01:01",
        FNumber: "2",
        LensModel: "OtterLens",
      },
    })
    .withIccProfile("srgb")
    .jpeg()
    .toBuffer();
});

describe("editMetadata mutation kills", () => {
  it("sanity: the seed carries IFD0 strings and IFD2 FNumber + LensModel", async () => {
    const meta = await sharp(seedBuffer).metadata();
    expect(meta.exif).toBeTruthy();
    const parsed = exifReader(meta.exif as Buffer);
    expect(parsed.Image?.Artist).toBe("OrigArtist");
    expect(parsed.Image?.Software).toBe("OrigSoft");
    // exif-reader returns these Photo tags as a number and a string respectively.
    expect((parsed.Photo as Record<string, unknown>)?.FNumber).toBe(2);
    expect((parsed.Photo as Record<string, unknown>)?.LensModel).toBe("OtterLens");
  });

  // Behavior lock for the edit-wins-over-removal contract (writtenTags, L55). When a tag
  // is edited AND listed in fieldsToRemove, the edit must win and the non-written removal
  // target must still be dropped. NOTE: the L55 ArrayDeclaration "[]" mutant is EQUIVALENT
  // and not asserted here: even with writtenTags emptied, edits.IFD0 is merged into
  // finalIFD0 after the removal loop, so an edited tag always re-appears with its edited
  // value. writtenTags only skips a redundant loop-time write; it changes no output.
  it("lets an edit win over a same-named removal while dropping non-written targets", async () => {
    const { image, photo } = await readBack(
      await editMetadata(seedImage(), {
        artist: "EditedArtist",
        dateTimeOriginal: "2019:09:09 09:09:09",
        fieldsToRemove: ["Artist", "Copyright"],
      }),
    );
    expect(image.Artist).toBe("EditedArtist");
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2019-09-09T09:09:09.000Z");
    // The non-written removal target is actually gone.
    expect(image.Copyright).toBeUndefined();
    // An untouched existing tag carries through the rebuild.
    expect(image.Software).toBe("OrigSoft");
  });

  // L61 hasRemovals = fieldsToRemove.length > 0 || options.clearGps -> "false".
  // fieldsToRemove is non-empty with NO edits: hasRemovals true routes to the rebuild
  // path, so Copyright is removed. Forcing hasRemovals false would take keepMetadata()
  // and leave Copyright intact, so asserting Copyright is gone kills the mutant.
  it("takes the removal rebuild path when only fieldsToRemove is set (L61)", async () => {
    const { image } = await readBack(
      await editMetadata(seedImage(), { fieldsToRemove: ["Copyright"] }),
    );
    expect(image.Copyright).toBeUndefined();
    // Everything else is rebuilt from source EXIF and preserved.
    expect(image.Artist).toBe("OrigArtist");
    expect(image.Software).toBe("OrigSoft");
  });

  // Complement for L61 via the clearGps arm: clearGps true, empty fieldsToRemove, no
  // edits. hasRemovals must be true (rebuild) so EXIF is reconstructed; a false mutant
  // would keepMetadata(). Both branches keep the fields, but only the rebuild path is
  // reached here, and the sibling assertion above already pins the observable removal.
  it("treats clearGps as a removal trigger and rebuilds EXIF (L61 clearGps arm)", async () => {
    const { hasExif, image, photo } = await readBack(
      await editMetadata(seedImage(), { clearGps: true }),
    );
    expect(hasExif).toBe(true);
    // Non-GPS fields from BOTH IFDs survive the rebuild verbatim.
    expect(image.Artist).toBe("OrigArtist");
    expect(image.Copyright).toBe("OrigCopyright");
    expect(photo.FNumber).toBe(2);
    expect(photo.LensModel).toBe("OtterLens");
  });

  // L76 if(parsed.Image) block + L80 typeof guard (string || number).
  // Rebuild path over an input WITH existing IFD0. Both a STRING tag (Software) and a
  // NUMERIC tag (Orientation, ResolutionUnit) must survive. A broken typeof guard that
  // drops strings loses Software; one that drops numbers loses Orientation. Emptying the
  // parsed.Image walk loses all of them. The `!== "number"` equality mutant drops the
  // numeric tags specifically.
  it("preserves existing IFD0 string AND numeric tags through rebuild (L76, L80)", async () => {
    const { image } = await readBack(
      await editMetadata(seedImage(), { fieldsToRemove: ["Copyright"] }),
    );
    // String-typed IFD0 tags survive (kills the string-operand and false-guard mutants).
    expect(image.Software).toBe("OrigSoft");
    expect(image.Artist).toBe("OrigArtist");
    expect(image.ImageDescription).toBe("OrigDesc");
    // Numeric-typed IFD0 tags survive. ImageWidth/ImageLength are NOT auto-regenerated
    // by Sharp, so they carry through ONLY because the string||number guard admits the
    // number branch. A `!== "number"` or false-guard mutant drops them.
    expect(image.ImageWidth).toBe(1024);
    expect(image.ImageLength).toBe(768);
    // The removed tag is the only IFD0 casualty.
    expect(image.Copyright).toBeUndefined();
  });

  // L80 ConditionalExpression "false": if the IFD0 typeof guard is forced false, NO
  // existing IFD0 tag is copied into existingIFD0, so a non-edited tag like Software
  // vanishes from the rebuilt output. Editing an unrelated field (dateTimeOriginal in
  // IFD2) keeps us on the rebuild path without touching Software.
  it("copies existing IFD0 tags into the rebuild rather than dropping them (L80 false)", async () => {
    const { image, photo } = await readBack(
      await editMetadata(seedImage(), {
        dateTimeOriginal: "2020:02:02 02:02:02",
        fieldsToRemove: ["Copyright"],
      }),
    );
    // Software was neither edited nor removed; it survives only if the guard admits it.
    expect(image.Software).toBe("OrigSoft");
    expect(image.ImageDescription).toBe("OrigDesc");
    // The IFD2 edit landed on the rebuild path.
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2020-02-02T02:02:02.000Z");
  });

  // L85 if(parsed.Photo) block + L86 body + L89 typeof guard (string || number).
  // Rebuild path over an input WITH existing IFD2. Both a NUMERIC Photo tag (FNumber)
  // and a STRING Photo tag (LensModel) must survive. Emptying the parsed.Photo walk
  // (L85 false / L86 {}) loses both; the string-operand mutant loses LensModel; the
  // number-operand/`!== "number"` mutant loses FNumber.
  it("preserves existing IFD2 number AND string tags through rebuild (L85, L86, L89)", async () => {
    const { photo } = await readBack(
      await editMetadata(seedImage(), { fieldsToRemove: ["Copyright"] }),
    );
    // Numeric Photo tag survives (kills the number-operand and !== "number" mutants).
    expect(photo.FNumber).toBe(2);
    // String Photo tag survives (kills the string-operand and !== "string" mutants).
    expect(photo.LensModel).toBe("OtterLens");
  });

  // L87 if(fieldsToRemove.includes(k)) continue. Remove an existing IFD2 tag (FNumber)
  // and assert a sibling IFD2 tag (LensModel) survives. Forcing the includes() check
  // false lets FNumber through (removal never happens); forcing it true drops every
  // Photo tag including LensModel. Only the exact-removal behavior passes both asserts.
  it("removes a named IFD2 tag while a sibling IFD2 tag survives (L87)", async () => {
    const { photo } = await readBack(
      await editMetadata(seedImage(), { fieldsToRemove: ["FNumber"] }),
    );
    expect(photo.FNumber).toBeUndefined();
    expect(photo.LensModel).toBe("OtterLens");
  });

  // L100 finalIFD2 = { ...existingIFD2, ...edits.IFD2 } -> ObjectLiteral "{}".
  // On the rebuild path, edit dateTimeOriginal (an IFD2 edit) and keep the removal
  // trigger. If finalIFD2 collapses to {}, both the edited DateTimeOriginal and the
  // existing FNumber vanish from IFD2. Asserting both present kills the mutant.
  it("builds finalIFD2 from existing IFD2 plus edits, not an empty object (L100)", async () => {
    const { photo } = await readBack(
      await editMetadata(seedImage(), {
        dateTimeOriginal: "2023:03:03 03:03:03",
        fieldsToRemove: ["Copyright"],
      }),
    );
    // The IFD2 edit landed...
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2023-03-03T03:03:03.000Z");
    // ...and the existing IFD2 tag merged in alongside it.
    expect(photo.FNumber).toBe(2);
  });

  // L104 if(Object.keys(finalIFD2).length > 0) exif.IFD2 = finalIFD2. The "false"/
  // "<= 0" mutants skip assigning exif.IFD2 even though finalIFD2 is NON-empty, so the
  // IFD2 edit would never reach withExif. Asserting the edited DateTimeOriginal is
  // present on the rebuild path kills those directions. (The "true"/">= 0" direction is
  // an equivalent mutant: Sharp treats exif.IFD2 = {} identically to omitting it.)
  it("assigns the non-empty finalIFD2 so IFD2 edits reach the output (L104 false/<=0)", async () => {
    const { photo } = await readBack(
      await editMetadata(seedImage(), {
        dateTimeOriginal: "2024:04:04 04:04:04",
        fieldsToRemove: ["Copyright"],
      }),
    );
    expect((photo.DateTimeOriginal as Date).toISOString()).toBe("2024-04-04T04:04:04.000Z");
  });

  // L103 if(Object.keys(finalIFD0).length > 0) exif.IFD0 = finalIFD0. The block being
  // skipped when finalIFD0 is non-empty would drop every IFD0 tag from the rebuilt
  // output. Assert an edited IFD0 tag plus preserved existing IFD0 tags are present.
  it("assigns the non-empty finalIFD0 so IFD0 tags reach the output (L103)", async () => {
    const { image } = await readBack(
      await editMetadata(seedImage(), {
        artist: "RebuiltArtist",
        fieldsToRemove: ["Copyright"],
      }),
    );
    expect(image.Artist).toBe("RebuiltArtist");
    expect(image.Software).toBe("OrigSoft");
  });
});
