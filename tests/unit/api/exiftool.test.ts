import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { EditMetadataSettings } from "../../../apps/api/src/lib/exiftool.js";
import {
  buildTagArgs,
  inspectMetadata,
  writeMetadata,
} from "../../../apps/api/src/lib/exiftool.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe("buildTagArgs", () => {
  it("returns empty array for empty settings", () => {
    expect(buildTagArgs({})).toEqual([]);
  });

  it("uses artist field when provided", () => {
    const args = buildTagArgs({ artist: "Jane Doe" });
    expect(args).toContain("-Artist=Jane Doe");
  });

  it("uses author as fallback when artist is not provided", () => {
    const args = buildTagArgs({ author: "John Smith" });
    expect(args).toContain("-Artist=John Smith");
  });

  it("artist takes precedence over author", () => {
    const args = buildTagArgs({ artist: "Jane Doe", author: "John Smith" });
    expect(args).toContain("-Artist=Jane Doe");
    expect(args).not.toContain("-Artist=John Smith");
  });

  it("sets copyright field", () => {
    const args = buildTagArgs({ copyright: "2024 Acme Inc" });
    expect(args).toContain("-Copyright=2024 Acme Inc");
  });

  it("uses imageDescription when provided", () => {
    const args = buildTagArgs({ imageDescription: "A sunset photo" });
    expect(args).toContain("-ImageDescription=A sunset photo");
  });

  it("uses title as fallback for imageDescription", () => {
    const args = buildTagArgs({ title: "Sunset" });
    expect(args).toContain("-ImageDescription=Sunset");
    expect(args).toContain("-XMP:Title=Sunset");
  });

  it("imageDescription takes precedence over title for ImageDescription tag", () => {
    const args = buildTagArgs({ imageDescription: "A sunset", title: "Sunset Title" });
    expect(args).toContain("-ImageDescription=A sunset");
    expect(args).toContain("-XMP:Title=Sunset Title");
  });

  it("sets software field", () => {
    const args = buildTagArgs({ software: "SnapOtter v1.0" });
    expect(args).toContain("-Software=SnapOtter v1.0");
  });

  it("sets dateTime as ModifyDate", () => {
    const args = buildTagArgs({ dateTime: "2024:01:15 10:30:00" });
    expect(args).toContain("-ModifyDate=2024:01:15 10:30:00");
  });

  it("sets dateTimeOriginal", () => {
    const args = buildTagArgs({ dateTimeOriginal: "2024:01:15 08:00:00" });
    expect(args).toContain("-DateTimeOriginal=2024:01:15 08:00:00");
  });

  it("applies positive dateShift", () => {
    const args = buildTagArgs({ dateShift: "+5" });
    expect(args).toContain("-AllDates+=0:0:0 5:0");
  });

  it("applies negative dateShift", () => {
    const args = buildTagArgs({ dateShift: "-3" });
    expect(args).toContain("-AllDates-=0:0:0 3:0");
  });

  it("applies dateShift without explicit sign as positive", () => {
    const args = buildTagArgs({ dateShift: "2" });
    expect(args).toContain("-AllDates+=0:0:0 2:0");
  });

  it("sets all dates to a specific value", () => {
    const args = buildTagArgs({ setAllDates: "2024:06:01 12:00:00" });
    expect(args).toContain("-AllDates=2024:06:01 12:00:00");
  });

  it("sets positive GPS coordinates", () => {
    const args = buildTagArgs({ gpsLatitude: 40.7128, gpsLongitude: -74.006 });
    expect(args).toContain("-GPSLatitude=40.7128");
    expect(args).toContain("-GPSLatitudeRef=N");
    expect(args).toContain("-GPSLongitude=74.006");
    expect(args).toContain("-GPSLongitudeRef=W");
  });

  it("sets negative GPS latitude", () => {
    const args = buildTagArgs({ gpsLatitude: -33.8688, gpsLongitude: 151.2093 });
    expect(args).toContain("-GPSLatitude=33.8688");
    expect(args).toContain("-GPSLatitudeRef=S");
    expect(args).toContain("-GPSLongitude=151.2093");
    expect(args).toContain("-GPSLongitudeRef=E");
  });

  it("includes GPS altitude when provided", () => {
    const args = buildTagArgs({ gpsLatitude: 10, gpsLongitude: 20, gpsAltitude: 500 });
    expect(args).toContain("-GPSAltitude=500");
    expect(args).toContain("-GPSAltitudeRef=Above Sea Level");
  });

  it("handles negative GPS altitude (below sea level)", () => {
    const args = buildTagArgs({ gpsLatitude: 10, gpsLongitude: 20, gpsAltitude: -50 });
    expect(args).toContain("-GPSAltitude=50");
    expect(args).toContain("-GPSAltitudeRef=Below Sea Level");
  });

  it("does not set GPS when only latitude is provided", () => {
    const args = buildTagArgs({ gpsLatitude: 40 });
    const gpsArgs = args.filter((a) => a.startsWith("-GPS"));
    expect(gpsArgs).toEqual([]);
  });

  it("does not set GPS when only longitude is provided", () => {
    const args = buildTagArgs({ gpsLongitude: -74 });
    const gpsArgs = args.filter((a) => a.startsWith("-GPS"));
    expect(gpsArgs).toEqual([]);
  });

  it("clears GPS data with clearGps flag", () => {
    const args = buildTagArgs({ clearGps: true });
    expect(args).toContain("-gps:all=");
  });

  it("clearGps takes priority over GPS coordinates", () => {
    const args = buildTagArgs({ clearGps: true, gpsLatitude: 10, gpsLongitude: 20 });
    expect(args).toContain("-gps:all=");
    expect(args).not.toContain("-GPSLatitude=10");
  });

  it("adds keywords in add mode", () => {
    const args = buildTagArgs({ keywords: ["nature", "sunset"], keywordsMode: "add" });
    expect(args).toContain("-IPTC:Keywords+=nature");
    expect(args).toContain("-XMP:Subject+=nature");
    expect(args).toContain("-IPTC:Keywords+=sunset");
    expect(args).toContain("-XMP:Subject+=sunset");
    expect(args).not.toContain("-IPTC:Keywords=");
    expect(args).not.toContain("-XMP:Subject=");
  });

  it("clears existing keywords before setting in set mode", () => {
    const args = buildTagArgs({ keywords: ["travel"], keywordsMode: "set" });
    expect(args).toContain("-IPTC:Keywords=");
    expect(args).toContain("-XMP:Subject=");
    expect(args).toContain("-IPTC:Keywords+=travel");
    expect(args).toContain("-XMP:Subject+=travel");
  });

  it("filters out blank and whitespace-only keywords", () => {
    const args = buildTagArgs({ keywords: ["valid", "", "  ", "also-valid"], keywordsMode: "add" });
    expect(args).toContain("-IPTC:Keywords+=valid");
    expect(args).toContain("-IPTC:Keywords+=also-valid");
    const kwArgs = args.filter((a) => a.startsWith("-IPTC:Keywords+="));
    expect(kwArgs).toHaveLength(2);
  });

  it("does not add keywords args when keywords array is empty", () => {
    const args = buildTagArgs({ keywords: [], keywordsMode: "add" });
    const kwArgs = args.filter((a) => a.includes("Keywords") || a.includes("Subject"));
    expect(kwArgs).toEqual([]);
  });

  it("sets IPTC title (ObjectName)", () => {
    const args = buildTagArgs({ iptcTitle: "My Photo" });
    expect(args).toContain("-IPTC:ObjectName=My Photo");
  });

  it("sets IPTC headline", () => {
    const args = buildTagArgs({ iptcHeadline: "Breaking News" });
    expect(args).toContain("-IPTC:Headline=Breaking News");
  });

  it("sets IPTC city", () => {
    const args = buildTagArgs({ iptcCity: "New York" });
    expect(args).toContain("-IPTC:City=New York");
  });

  it("sets IPTC state", () => {
    const args = buildTagArgs({ iptcState: "California" });
    expect(args).toContain("-IPTC:Province-State=California");
  });

  it("sets IPTC country", () => {
    const args = buildTagArgs({ iptcCountry: "United States" });
    expect(args).toContain("-IPTC:Country-PrimaryLocationName=United States");
  });

  it("removes safe field names", () => {
    const args = buildTagArgs({ fieldsToRemove: ["Artist", "Copyright"] });
    expect(args).toContain("-Artist=");
    expect(args).toContain("-Copyright=");
  });

  it("rejects unsafe field names from removal", () => {
    expect(() => buildTagArgs({ fieldsToRemove: ["Artist", "rm -rf /", "../../etc"] })).toThrow(
      "Invalid tag name",
    );
  });

  it("allows field names with colons and hyphens", () => {
    const args = buildTagArgs({
      fieldsToRemove: ["IPTC:Keywords", "XMP:Subject", "Province-State"],
    });
    expect(args).toContain("-IPTC:Keywords=");
    expect(args).toContain("-XMP:Subject=");
    expect(args).toContain("-Province-State=");
  });

  it("allows field names with underscores", () => {
    const args = buildTagArgs({ fieldsToRemove: ["Custom_Field"] });
    expect(args).toContain("-Custom_Field=");
  });

  it("does nothing for empty fieldsToRemove array", () => {
    const args = buildTagArgs({ fieldsToRemove: [] });
    expect(args).toEqual([]);
  });

  it("handles complex settings with multiple fields combined", () => {
    const settings: EditMetadataSettings = {
      artist: "Jane Doe",
      copyright: "2024 Acme",
      title: "Landscape",
      software: "SnapOtter",
      dateTimeOriginal: "2024:03:15 14:00:00",
      gpsLatitude: 48.8566,
      gpsLongitude: 2.3522,
      gpsAltitude: 35,
      keywords: ["paris", "travel"],
      keywordsMode: "set",
      iptcCity: "Paris",
      iptcCountry: "France",
      fieldsToRemove: ["Rating"],
    };
    const args = buildTagArgs(settings);
    expect(args).toContain("-Artist=Jane Doe");
    expect(args).toContain("-Copyright=2024 Acme");
    expect(args).toContain("-ImageDescription=Landscape");
    expect(args).toContain("-XMP:Title=Landscape");
    expect(args).toContain("-Software=SnapOtter");
    expect(args).toContain("-DateTimeOriginal=2024:03:15 14:00:00");
    expect(args).toContain("-GPSLatitude=48.8566");
    expect(args).toContain("-GPSLatitudeRef=N");
    expect(args).toContain("-GPSLongitude=2.3522");
    expect(args).toContain("-GPSLongitudeRef=E");
    expect(args).toContain("-GPSAltitude=35");
    expect(args).toContain("-GPSAltitudeRef=Above Sea Level");
    expect(args).toContain("-IPTC:Keywords=");
    expect(args).toContain("-XMP:Subject=");
    expect(args).toContain("-IPTC:Keywords+=paris");
    expect(args).toContain("-XMP:Subject+=travel");
    expect(args).toContain("-IPTC:City=Paris");
    expect(args).toContain("-IPTC:Country-PrimaryLocationName=France");
    expect(args).toContain("-Rating=");
  });

  it("trims keyword whitespace", () => {
    const args = buildTagArgs({ keywords: ["  nature  ", " sunset "], keywordsMode: "add" });
    expect(args).toContain("-IPTC:Keywords+=nature");
    expect(args).toContain("-XMP:Subject+=sunset");
  });

  it("handles zero GPS coordinates", () => {
    const args = buildTagArgs({ gpsLatitude: 0, gpsLongitude: 0 });
    expect(args).toContain("-GPSLatitude=0");
    expect(args).toContain("-GPSLatitudeRef=N");
    expect(args).toContain("-GPSLongitude=0");
    expect(args).toContain("-GPSLongitudeRef=E");
  });

  it("handles zero GPS altitude", () => {
    const args = buildTagArgs({ gpsLatitude: 10, gpsLongitude: 20, gpsAltitude: 0 });
    expect(args).toContain("-GPSAltitude=0");
    expect(args).toContain("-GPSAltitudeRef=Above Sea Level");
  });
});

describe("inspectMetadata", () => {
  it("returns correct filename and fileSize for JPEG with EXIF", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const result = await inspectMetadata(buf, "test-with-exif.jpg");
    expect(result.filename).toBe("test-with-exif.jpg");
    expect(result.fileSize).toBe(buf.length);
  });

  it("returns non-null exif object for JPEG with EXIF data", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const result = await inspectMetadata(buf, "test-with-exif.jpg");
    expect(result.exif).not.toBeNull();
    expect(typeof result.exif).toBe("object");
  });

  it("returns keywords array (may be empty)", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const result = await inspectMetadata(buf, "test-with-exif.jpg");
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it("returns null for GPS when no GPS data present", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const result = await inspectMetadata(buf, "test-with-exif.jpg");
    expect(result.gps).toBeNull();
  });

  it("works with PNG which has no EXIF -- returns null for exif, iptc, xmp, gps", async () => {
    const buf = readFixture(fixtures.image.edge.px1);
    const result = await inspectMetadata(buf, "test-1x1.png");
    expect(result.filename).toBe("test-1x1.png");
    expect(result.fileSize).toBe(buf.length);
    expect(result.exif).toBeNull();
    expect(result.iptc).toBeNull();
    expect(result.xmp).toBeNull();
    expect(result.gps).toBeNull();
  });
});

describe("writeMetadata", () => {
  it("empty tags array returns buffer unchanged", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const result = await writeMetadata(buf, "test-with-exif.jpg", []);
    expect(Buffer.compare(result, buf)).toBe(0);
  });

  it("writing -Artist=TestArtist then inspecting shows the artist", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const written = await writeMetadata(buf, "test-with-exif.jpg", ["-Artist=TestArtist"]);
    const result = await inspectMetadata(written, "test-with-exif.jpg");
    expect(result.exif).not.toBeNull();
    expect(result.exif?.Artist).toBe("TestArtist");
  });

  it("writing multiple tags works", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const written = await writeMetadata(buf, "test-with-exif.jpg", [
      "-Artist=MultiTest",
      "-Copyright=2024 Test Corp",
    ]);
    const result = await inspectMetadata(written, "test-with-exif.jpg");
    expect(result.exif?.Artist).toBe("MultiTest");
    expect(result.exif?.Copyright).toBe("2024 Test Corp");
  });

  it("returns a valid image buffer that Sharp can read", async () => {
    const buf = readFixture(fixtures.image.exifGps);
    const written = await writeMetadata(buf, "test-with-exif.jpg", ["-Software=SnapOtter"]);
    const meta = await sharp(written).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });
});
