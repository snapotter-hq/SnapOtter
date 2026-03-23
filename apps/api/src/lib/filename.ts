import { basename } from "node:path";

/**
 * Sanitize a filename to prevent path traversal attacks.
 * Strips directory separators and ".." sequences, keeps only the base name.
 */
export function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "upload";
  }
  return name;
}
