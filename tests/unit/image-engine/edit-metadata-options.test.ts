import type { EditMetadataOptions } from "@snapotter/image-engine";
import { describe, expect, it } from "vitest";

// #4312: the engine's editMetadata only reads the common fields, fieldsToRemove and
// clearGps. The options type must not promise anything else; the ExifTool route owns
// GPS, keywords, date shifting and IPTC. The @ts-expect-error lines fail
// typecheck:tests if one of those fields is declared again.
describe("EditMetadataOptions contract", () => {
  it("accepts only the fields the engine reads", () => {
    const supported: EditMetadataOptions = {
      artist: "a",
      copyright: "c",
      imageDescription: "d",
      software: "s",
      dateTime: "2020:01:01 00:00:00",
      dateTimeOriginal: "2020:01:01 00:00:00",
      clearGps: true,
      fieldsToRemove: ["Artist"],
    };
    // @ts-expect-error gps coordinates are handled by the ExifTool route
    const gps: EditMetadataOptions = { gpsLatitude: 1 };
    // @ts-expect-error keywords are handled by the ExifTool route
    const kw: EditMetadataOptions = { keywords: ["x"] };
    // @ts-expect-error date shifting is handled by the ExifTool route
    const shift: EditMetadataOptions = { dateShift: "+1:0:0 0:0:0" };
    // @ts-expect-error IPTC fields are handled by the ExifTool route
    const iptc: EditMetadataOptions = { iptcTitle: "t" };
    expect(Object.keys(supported)).toHaveLength(8);
    expect([gps, kw, shift, iptc]).toHaveLength(4);
  });
});
