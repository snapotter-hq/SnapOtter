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
 * Guard against double-extension attacks (e.g. "report.csv.php"): keep the
 * name up to the first safe extension, or up to its last repeat. A stem that
 * repeats the file's own extension ("my.png.photo.png") is a name, not an
 * attack (#3380); a different extension after it ("render.jxl.html") still is.
 */
function truncateDoubleExtension(name: string): string {
  const dotIndex = name.indexOf(".");
  if (dotIndex === -1) return name;
  const parts = name.split(".");
  const lower = parts.map((part) => part.toLowerCase());
  const first = lower.findIndex((part, i) => i > 0 && SAFE_EXTENSIONS.has(`.${part}`));
  if (first === -1) return name;
  return parts.slice(0, lower.lastIndexOf(lower[first]) + 1).join(".");
}

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
  const hadLeadingDoubleDot = name.startsWith("..");
  name = name.replace(/\.{2,}$/, "");
  name = truncateDoubleExtension(name);

  const searchEnd = name.endsWith(".") ? name.length - 2 : name.length - 1;
  const dotIdx = searchEnd > 0 ? name.lastIndexOf(".", searchEnd) : -1;
  if (dotIdx > 0) {
    const ext = name.slice(dotIdx);
    const stem = name.slice(0, dotIdx).replace(/\.\./g, "").replace(/\.+$/, "");
    name = `${stem || "upload"}${ext}`;
  } else {
    name = name.replace(/\.\./g, "");
  }
  name = truncateDoubleExtension(name);
  if (hadLeadingDoubleDot && name.startsWith(".") && name.indexOf(".", 1) === -1) {
    name = `upload${name}`;
  }
  if (!name || name === "." || name === ".." || RESERVED_STAGING_NAME.test(name)) {
    name = "upload";
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
const APFS_CASE_FOLDS: Record<string, string> = {
  "\u{00b5}": "\u{03bc}",
  "\u{00df}": "ss",
  "\u{0149}": "\u{02bc}n",
  "\u{017f}": "s",
  "\u{0345}": "\u{03b9}",
  "\u{03c2}": "\u{03c3}",
  "\u{03d0}": "\u{03b2}",
  "\u{03d1}": "\u{03b8}",
  "\u{03d5}": "\u{03c6}",
  "\u{03d6}": "\u{03c0}",
  "\u{03f0}": "\u{03ba}",
  "\u{03f1}": "\u{03c1}",
  "\u{03f5}": "\u{03b5}",
  "\u{0587}": "\u{0565}\u{0582}",
  "\u{1c80}": "\u{0432}",
  "\u{1c81}": "\u{0434}",
  "\u{1c82}": "\u{043e}",
  "\u{1c83}": "\u{0441}",
  "\u{1c84}": "\u{0442}",
  "\u{1c85}": "\u{0442}",
  "\u{1c86}": "\u{044a}",
  "\u{1c87}": "\u{0463}",
  "\u{1c88}": "\u{a64b}",
  "\u{1e9a}": "a\u{02be}",
  "\u{fb00}": "ff",
  "\u{fb01}": "fi",
  "\u{fb02}": "fl",
  "\u{fb03}": "ffi",
  "\u{fb04}": "ffl",
  "\u{fb05}": "st",
  "\u{fb06}": "st",
  "\u{fb13}": "\u{0574}\u{0576}",
  "\u{fb14}": "\u{0574}\u{0565}",
  "\u{fb15}": "\u{0574}\u{056b}",
  "\u{fb16}": "\u{057e}\u{0576}",
  "\u{fb17}": "\u{0574}\u{056d}",
};
const APFS_CASE_FOLD_RE =
  /(?:[\u{00b5}\u{00df}\u{0149}\u{017f}\u{03c2}\u{03d0}\u{03d1}\u{03d5}\u{03d6}\u{03f0}\u{03f1}\u{03f5}\u{0587}\u{1c80}-\u{1c88}\u{1e9a}\u{fb00}-\u{fb06}\u{fb13}-\u{fb17}]|\u{0345})/gu;

export function createUniqueNamer(): (name: string) => string {
  const used = new Set<string>();
  const key = (name: string) =>
    name
      .normalize("NFD")
      .toLowerCase()
      .replace(APFS_CASE_FOLD_RE, (ch) => APFS_CASE_FOLDS[ch]);
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
