import { basename } from "node:path";

// Recognised, safe file extensions across all five modalities (image, video,
// audio, document, data). Used to truncate double-extension attacks after the
// first known-good extension, e.g. "report.csv.php" becomes "report.csv".
const SAFE_EXTENSIONS = new Set([
  // Image
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
  ".heic",
  ".heif",
  ".jxl",
  ".ico",
  ".jp2",
  ".qoi",
  ".psd",
  ".dng",
  // Video
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".m4v",
  ".mpg",
  ".mpeg",
  ".wmv",
  ".flv",
  ".ogv",
  // Audio
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".aac",
  ".m4a",
  ".opus",
  ".wma",
  ".aiff",
  ".aif",
  // Document
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".epub",
  ".ppt",
  ".pptx",
  ".odp",
  ".xls",
  ".xlsx",
  ".ods",
  // Data
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".zip",
  ".srt",
]);

/**
 * Sanitize a filename to prevent path traversal and double-extension attacks.
 *
 * 1. Strips directory separators (basename only).
 * 2. Removes ".." sequences and null bytes.
 * 3. Truncates after the first recognised file extension so that
 *    "report.csv.php" becomes "report.csv".
 */
export function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "upload";
  }

  // Guard against double-extension attacks (e.g. "report.csv.php").
  // Walk the dot-separated parts and truncate after the first safe extension.
  const dotIndex = name.indexOf(".");
  if (dotIndex !== -1) {
    const parts = name.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ext = `.${parts[i].toLowerCase()}`;
      if (SAFE_EXTENSIONS.has(ext)) {
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

/**
 * Give each output a name unique within one batch response.
 *
 * Two uploads may share a filename, and clients key results by name
 * (the X-File-Results map), so a collision would drop a result rather than
 * show it. Collisions get a `_1`, `_2`, ... suffix before the extension.
 */
export function createUniqueNamer(): (name: string) => string {
  const used = new Set<string>();
  return (name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let counter = 1;
    while (used.has(`${base}_${counter}${ext}`)) counter++;
    const candidate = `${base}_${counter}${ext}`;
    used.add(candidate);
    return candidate;
  };
}
