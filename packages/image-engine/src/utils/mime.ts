import { IMAGE_EXT_TO_MIME, IMAGE_MIME_TO_EXT } from "@snapotter/shared";

/**
 * Get the MIME type for a file extension (without dot).
 */
export function extToMime(ext: string): string {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return IMAGE_EXT_TO_MIME[normalized] ?? "application/octet-stream";
}

/**
 * Get the file extension for a MIME type (without dot).
 */
export function mimeToExt(mime: string): string {
  const normalized = mime.toLowerCase();
  return IMAGE_MIME_TO_EXT[normalized] ?? "bin";
}

/**
 * Get the MIME type for a Sharp format string.
 */
export function formatToMime(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpeg") return "image/jpeg";
  return IMAGE_EXT_TO_MIME[normalized] ?? "application/octet-stream";
}

/**
 * Get the file extension for a Sharp format string.
 */
export function formatToExt(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpeg") return "jpg";
  return normalized;
}
