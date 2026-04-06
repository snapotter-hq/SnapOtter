/** Human-friendly labels for common EXIF keys */
export const EXIF_LABELS: Record<string, string> = {
  Make: "Camera Make",
  Model: "Camera Model",
  Software: "Software",
  DateTime: "Date/Time",
  DateTimeOriginal: "Date Taken",
  DateTimeDigitized: "Date Digitized",
  ExposureTime: "Exposure Time",
  FNumber: "F-Number",
  ISOSpeedRatings: "ISO",
  FocalLength: "Focal Length",
  FocalLengthIn35mmFilm: "Focal Length (35mm)",
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
  ImageLength: "Height",
  Orientation: "Orientation",
  XResolution: "X Resolution",
  YResolution: "Y Resolution",
  ResolutionUnit: "Resolution Unit",
  ColorSpace: "Color Space",
  PixelXDimension: "Pixel Width",
  PixelYDimension: "Pixel Height",
  Artist: "Artist",
  Copyright: "Copyright",
  ImageDescription: "Description",
  LensMake: "Lens Make",
  LensModel: "Lens Model",
  BodySerialNumber: "Body Serial",
  CameraOwnerName: "Camera Owner",
};

/** Keys to skip in display (internal/binary/redundant) */
export const SKIP_KEYS = new Set([
  "ExifTag",
  "GPSTag",
  "InteroperabilityTag",
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
]);

/** Keys that are binary/complex and NOT safe for EXIF round-trip via withExif() */
export const UNSAFE_ROUND_TRIP_KEYS = new Set([
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
]);

export function formatExifValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (key === "ExposureTime" && value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }
    if (key === "FNumber") return `f/${value}`;
    if (key === "FocalLength") return `${value}mm`;
    if (key === "FocalLengthIn35mmFilm") return `${value}mm`;
    return String(value);
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === "number" && value.length <= 4) {
      return value.join(", ");
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
