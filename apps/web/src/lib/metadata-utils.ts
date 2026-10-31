/** Human-friendly labels for common EXIF keys */
export const EXIF_LABELS: Record<string, string> = {
  Make: "Camera Make",
  Model: "Camera Model",
  Software: "Software",
  DateTime: "Date/Time",
  ModifyDate: "Date Modified",
  DateTimeOriginal: "Date Taken",
  CreateDate: "Date Created",
  DateTimeDigitized: "Date Digitized",
  ExposureTime: "Exposure Time",
  FNumber: "F-Number",
  ISO: "ISO",
  ISOSpeedRatings: "ISO",
  FocalLength: "Focal Length",
  FocalLengthIn35mmFormat: "Focal Length (35mm)",
  FocalLengthIn35mmFilm: "Focal Length (35mm)",
  ExposureCompensation: "Exposure Bias",
  ExposureBiasValue: "Exposure Bias",
  MeteringMode: "Metering Mode",
  Flash: "Flash",
  WhiteBalance: "White Balance",
  ExposureMode: "Exposure Mode",
  SceneCaptureType: "Scene Type",
  Contrast: "Contrast",
  Saturation: "Saturation",
  Sharpness: "Sharpness",
  DigitalZoomRatio: "Digital Zoom",
  ImageWidth: "Width",
  ImageHeight: "Height",
  ImageLength: "Height",
  Orientation: "Orientation",
  XResolution: "X Resolution",
  YResolution: "Y Resolution",
  ResolutionUnit: "Resolution Unit",
  ColorSpace: "Color Space",
  ExifImageWidth: "Pixel Width",
  ExifImageHeight: "Pixel Height",
  PixelXDimension: "Pixel Width",
  PixelYDimension: "Pixel Height",
  Artist: "Artist",
  Copyright: "Copyright",
  ImageDescription: "Description",
  LensMake: "Lens Make",
  LensModel: "Lens Model",
  LensInfo: "Lens Info",
  BodySerialNumber: "Body Serial",
  CameraOwnerName: "Camera Owner",
  // IPTC
  ObjectName: "Title",
  Headline: "Headline",
  Keywords: "Keywords",
  City: "City",
  "Province-State": "State/Province",
  "Country-PrimaryLocationName": "Country",
  CopyrightNotice: "Copyright Notice",
  "By-line": "Creator",
  Caption: "Caption",
  // XMP
  Subject: "Subject/Keywords",
  Title: "Title",
  Description: "Description",
  Creator: "Creator",
  Rights: "Rights",
};

/** Keys to skip in display (internal/binary/redundant) */
export const SKIP_KEYS = new Set([
  "ExifToolVersion",
  "FileName",
  "Directory",
  "FileSize",
  "FileModifyDate",
  "FileAccessDate",
  "FileInodeChangeDate",
  "FilePermissions",
  "FileType",
  "FileTypeExtension",
  "MIMEType",
  "SourceFile",
  "ExifByteOrder",
  "ThumbnailImage",
  "ThumbnailOffset",
  "ThumbnailLength",
  "PreviewImage",
  "MakerNote",
  "PrintImageMatching",
]);

export function isDisplayableMetadataEntry(key: string, value: unknown): boolean {
  return (
    !SKIP_KEYS.has(key) &&
    !key.startsWith("_") &&
    value !== undefined &&
    value !== null &&
    String(value) !== ""
  );
}

export function countDisplayableMetadata(data: Record<string, unknown> | null | undefined): number {
  if (!data) return 0;
  let count = 0;
  for (const [k, v] of Object.entries(data)) {
    if (isDisplayableMetadataEntry(k, v)) count++;
  }
  return count;
}

export function formatExifValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (key === "ExposureTime" && value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }
    if (key === "FNumber") return `f/${value}`;
    if (key === "FocalLength" || key === "FocalLengthIn35mmFormat") return `${value}mm`;
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length <= 6) {
      return value.map(String).join(", ");
    }
    return `[${value.length} values]`;
  }
  return String(value);
}

export function exifStr(exif: Record<string, unknown> | null | undefined, key: string): string {
  const v = exif?.[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
