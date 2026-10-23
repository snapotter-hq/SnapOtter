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
  ".svgz",
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

const RESERVED_STAGING_NAME = /^\.snapotter-(?:st|[\u{fb05}\u{fb06}])aging$/iu;

/**
 * Sanitize a filename to prevent path traversal and double-extension attacks.
 *
 * 1. Strips directory separators (basename only).
 * 2. Removes ".." sequences and null bytes.
 * 3. Truncates after the first recognised file extension so that
 *    "report.csv.php" becomes "report.csv", or after its last repeat, so that
 *    "my.png.photo.png" stays whole.
 */
export function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\0/g, "");
  name = name.replace(/\.\./g, "");
  if (!name || name === "." || name === ".." || RESERVED_STAGING_NAME.test(name)) {
    name = "upload";
  }

  // Guard against double-extension attacks (e.g. "report.csv.php"): keep the
  // name up to the first safe extension, or up to its last repeat. A stem that
  // repeats the file's own extension ("my.png.photo.png") is a name, not an
  // attack (#3380); a different extension after it ("render.jxl.html") still is.
  const dotIndex = name.indexOf(".");
  if (dotIndex !== -1) {
    const parts = name.split(".");
    const lower = parts.map((part) => part.toLowerCase());
    const first = lower.findIndex((part, i) => i > 0 && SAFE_EXTENSIONS.has(`.${part}`));
    if (first !== -1) {
      name = parts.slice(0, lower.lastIndexOf(lower[first]) + 1).join(".");
    }
  }

  // Truncate to filesystem-safe length (255 byte NAME_MAX minus margin for _toolId suffix)
  const MAX_NAME_BYTES = 200;
  const enc = new TextEncoder();
  if (enc.encode(name).length > MAX_NAME_BYTES) {
    const dotIdx = name.lastIndexOf(".");
    const candidateExt = dotIdx > 0 ? name.slice(dotIdx) : "";
    const keepExt = candidateExt !== "" && enc.encode(candidateExt).length < MAX_NAME_BYTES;
    const ext = keepExt ? candidateExt : "";
    const baseChars = Array.from(keepExt ? name.slice(0, dotIdx) : name);
    while (baseChars.length > 0 && enc.encode(baseChars.join("") + ext).length > MAX_NAME_BYTES) {
      baseChars.pop();
    }
    const base = baseChars.join("").replace(/\.+$/, "");
    name = base + ext;
    if (!name || name === "." || name === ".." || RESERVED_STAGING_NAME.test(name)) {
      name = "upload";
    }
  }

  return name;
}

/**
 * Give each output a name unique within one batch response.
 *
 * Two uploads may share a filename, and clients key results by name
 * (the X-File-Results map), so a collision would drop a result rather than
 * show it. Collisions get a `_1`, `_2`, ... suffix before the extension.
 *
 * Names are compared ignoring case and Unicode normalization form: local
 * storage on macOS (APFS) and Docker Desktop bind mounts treats Report.pdf and
 * report.pdf, or a composed and a decomposed é, as one file.
 */
export function createUniqueNamer(): (name: string) => string {
  const used = new Set<string>();
  const key = (name: string) => name.normalize("NFC").toLowerCase();
  return (name) => {
    if (!used.has(key(name))) {
      used.add(key(name));
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let counter = 1;
    while (used.has(key(`${base}_${counter}${ext}`))) counter++;
    const candidate = `${base}_${counter}${ext}`;
    used.add(key(candidate));
    return candidate;
  };
}
