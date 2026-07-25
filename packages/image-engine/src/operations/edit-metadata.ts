import { ToolInputError } from "@snapotter/shared";
import exifReader from "exif-reader";
import type { EditMetadataOptions, Sharp } from "../types.js";
import { sanitizeValue } from "../utils/metadata.js";

/**
 * Keys that are binary blobs or complex arrays - NOT safe for EXIF round-trip
 * through withExif(). Silently filtered from fieldsToRemove to prevent
 * data corruption when the API is called directly (bypassing UI guards).
 */
const UNSAFE_ROUND_TRIP_KEYS = new Set([
  "MakerNote",
  "PrintImageMatching",
  "ComponentsConfiguration",
  "FlashpixVersion",
  "ExifVersion",
  "FileSource",
  "SceneType",
  "UserComment",
  "InteroperabilityIndex",
  "InteroperabilityVersion",
  "ExifTag",
  "GPSTag",
  "InteroperabilityTag",
]);

const COMMON_FIELD_MAP: Array<{
  option: keyof EditMetadataOptions;
  ifd: "IFD0" | "IFD2";
  tag: string;
}> = [
  { option: "artist", ifd: "IFD0", tag: "Artist" },
  { option: "copyright", ifd: "IFD0", tag: "Copyright" },
  { option: "imageDescription", ifd: "IFD0", tag: "ImageDescription" },
  { option: "software", ifd: "IFD0", tag: "Software" },
  { option: "dateTime", ifd: "IFD0", tag: "DateTime" },
  { option: "dateTimeOriginal", ifd: "IFD2", tag: "DateTimeOriginal" },
];

function exifString(value: unknown): string | undefined {
  const sanitized = sanitizeValue(value);
  if (typeof sanitized === "string" || typeof sanitized === "number") {
    return String(sanitized);
  }
  if (
    Array.isArray(sanitized) &&
    sanitized.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return sanitized.join(" ");
  }
  return undefined;
}

export async function editMetadata(
  image: Sharp,
  options: EditMetadataOptions = {},
): Promise<Sharp> {
  const edits: { IFD0: Record<string, string>; IFD2: Record<string, string> } = {
    IFD0: {},
    IFD2: {},
  };

  for (const { option, ifd, tag } of COMMON_FIELD_MAP) {
    const value = options[option];
    if (typeof value === "string" && value.length > 0) {
      edits[ifd][tag] = value;
    }
  }

  const writtenTags = new Set([...Object.keys(edits.IFD0), ...Object.keys(edits.IFD2)]);
  const fieldsToRemove = (options.fieldsToRemove ?? []).filter(
    (f) => !writtenTags.has(f) && !UNSAFE_ROUND_TRIP_KEYS.has(f),
  );

  const hasEdits = Object.keys(edits.IFD0).length > 0 || Object.keys(edits.IFD2).length > 0;
  const hasRemovals = fieldsToRemove.length > 0 || options.clearGps === true;

  if (!hasEdits && !hasRemovals) {
    return image.keepMetadata();
  }

  if (hasRemovals) {
    const metadata = await image.metadata();

    const existingIFD0: Record<string, string> = {};
    const existingIFD2: Record<string, string> = {};
    const existingIFD3: Record<string, string> = {};

    if (metadata.exif) {
      try {
        const parsed = exifReader(metadata.exif);
        if (parsed.Image) {
          for (const [k, v] of Object.entries(parsed.Image)) {
            if (fieldsToRemove.includes(k) || UNSAFE_ROUND_TRIP_KEYS.has(k)) continue;
            const value = exifString(v);
            if (value !== undefined) existingIFD0[k] = value;
          }
        }
        if (parsed.Photo) {
          for (const [k, v] of Object.entries(parsed.Photo)) {
            if (fieldsToRemove.includes(k) || UNSAFE_ROUND_TRIP_KEYS.has(k)) continue;
            const value = exifString(v);
            if (value !== undefined) existingIFD2[k] = value;
          }
        }
        if (parsed.GPSInfo && options.clearGps !== true) {
          for (const [k, v] of Object.entries(parsed.GPSInfo)) {
            if (fieldsToRemove.includes(k) || UNSAFE_ROUND_TRIP_KEYS.has(k)) continue;
            const value = exifString(v);
            if (value !== undefined) existingIFD3[k] = value;
          }
        }
      } catch {
        throw new ToolInputError(
          "Cannot safely edit metadata because existing EXIF data is invalid",
        );
      }
    }

    const finalIFD0 = { ...existingIFD0, ...edits.IFD0 };
    const finalIFD2 = { ...existingIFD2, ...edits.IFD2 };

    const exif: Record<string, Record<string, string>> = {};
    if (Object.keys(finalIFD0).length > 0) exif.IFD0 = finalIFD0;
    if (Object.keys(finalIFD2).length > 0) exif.IFD2 = finalIFD2;
    if (Object.keys(existingIFD3).length > 0) exif.IFD3 = existingIFD3;

    return image.withExif(exif).keepIccProfile().keepXmp();
  }

  const exif: Record<string, Record<string, string>> = {};
  if (Object.keys(edits.IFD0).length > 0) exif.IFD0 = edits.IFD0;
  if (Object.keys(edits.IFD2).length > 0) exif.IFD2 = edits.IFD2;

  return image.withExifMerge(exif);
}
