import { basename } from "node:path";

const SAFE_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".avif",
  ".svg",
  ".pdf",
]);

/**
 * Sanitize a filename to prevent path traversal and double-extension attacks.
 *
 * 1. Strips directory separators (basename only).
 * 2. Removes ".." sequences and null bytes.
 * 3. Truncates after the first recognised image extension so that
 *    "photo.png.php" becomes "photo.png".
 */
export function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "upload";
  }

  // Guard against double-extension attacks (e.g. "image.png.php").
  // Walk the dot-separated parts and truncate after the first safe image extension.
  const dotIndex = name.indexOf(".");
  if (dotIndex !== -1) {
    const parts = name.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ext = `.${parts[i].toLowerCase()}`;
      if (SAFE_IMAGE_EXTENSIONS.has(ext)) {
        // Keep everything up to and including this extension, drop the rest
        name = parts.slice(0, i + 1).join(".");
        break;
      }
    }
  }

  // Truncate to filesystem-safe length (255 byte NAME_MAX minus margin for _toolId suffix)
  const MAX_NAME_BYTES = 200;
  const enc = new TextEncoder();
  if (enc.encode(name).length > MAX_NAME_BYTES) {
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    while (enc.encode(base + ext).length > MAX_NAME_BYTES) {
      base = base.slice(0, -1);
    }
    name = base + ext;
  }

  return name;
}
