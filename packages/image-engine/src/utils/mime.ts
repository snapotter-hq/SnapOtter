const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  tif: "image/tiff",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  heif: "image/heif",
  heic: "image/heic",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/tiff": "tiff",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/heif": "heif",
  "image/heic": "heic",
};

/**
 * Get the MIME type for a file extension (without dot).
 */
export function extToMime(ext: string): string {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return EXT_TO_MIME[normalized] ?? "application/octet-stream";
}

/**
 * Get the file extension for a MIME type (without dot).
 */
export function mimeToExt(mime: string): string {
  const normalized = mime.toLowerCase();
  return MIME_TO_EXT[normalized] ?? "bin";
}

/**
 * Get the MIME type for a Sharp format string.
 */
export function formatToMime(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpeg") return "image/jpeg";
  return EXT_TO_MIME[normalized] ?? "application/octet-stream";
}

/**
 * Get the file extension for a Sharp format string.
 */
export function formatToExt(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpeg") return "jpg";
  return normalized;
}
