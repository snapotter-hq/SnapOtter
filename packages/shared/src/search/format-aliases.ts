/** Format synonyms: canonical -> equivalent spellings. Used both ways during normalization. */
export const FORMAT_ALIASES: Record<string, string[]> = {
  jpg: ["jpeg", "jpe"],
  tif: ["tiff"],
  heic: ["heif"],
  word: ["doc", "docx"],
  excel: ["xls", "xlsx", "spreadsheet"],
  powerpoint: ["ppt", "pptx"],
  markdown: ["md"],
  image: ["photo", "pic", "picture", "img"],
};

/** Reverse lookup: any alias -> its canonical form. */
const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(FORMAT_ALIASES)) {
    for (const a of aliases) map[a] = canonical;
  }
  return map;
})();

/** Common misspellings of tool verbs, mapped to the intended word. */
export const MISSPELLINGS: Record<string, string> = {
  compres: "compress",
  covert: "convert",
  conver: "convert",
  resise: "resize",
  resze: "resize",
};

/**
 * Tokens that can sit on either side of a joined "xtoy" query. Only these
 * split, so "jpgtopng" becomes "jpg to png" while "vectorize" and "photograph"
 * stay whole (#1327). tests/unit/shared/search-aliases.test.ts checks every
 * preset's joined keyword, every x-to-y tool id, and every extension in a
 * tool's acceptedInputs (#1408) against this list.
 */
const JOINABLE_FORMATS = [
  ...new Set([
    ...Object.keys(FORMAT_ALIASES),
    ...Object.values(FORMAT_ALIASES).flat(),
    // Image and raw formats.
    ...["apng", "avif", "bmp", "eps", "gif", "ico", "jfif", "jxl", "png", "psd", "svg", "svgz"],
    ...["tga", "webp", "cur", "dds", "dpx", "exr", "fits", "hdr", "jp2", "pbm", "pgm", "ppm"],
    ...["qoi", "arw", "cr2", "dng", "nef", "raw", "3fr", "cr3", "dcr", "erf", "fff", "gpr"],
    ...["iiq", "kdc", "mef", "mrw", "nrw", "orf", "pef", "ptx", "raf", "rw2", "rwl", "srw"],
    ...["x3f"],
    // Audio and video.
    ...["3gp", "aac", "aiff", "avi", "flac", "flv", "m4a", "mkv", "mov", "mp3", "mp4"],
    ...["ogg", "opus", "wav", "webm", "wma", "wmv", "ac3", "amr", "m2ts", "m4v", "mpeg"],
    ...["mpg", "mts", "ogv", "ts"],
    // Subtitles.
    ...["ass", "srt", "vtt"],
    // Documents and data.
    ...["csv", "epub", "htm", "html", "json", "odp", "ods", "odt", "pdf", "rtf", "text", "tsv"],
    ...["txt", "xml", "yaml", "yml", "zip"],
    // Words from the x-to-y tool ids (html-to-image, video-to-gif, ...).
    ...["base64", "frames", "images", "raster", "video"],
    // Speech-to-text phrasings ("speech2text", "voice2text").
    ...["speech", "voice"],
  ]),
].sort((a, b) => b.length - a.length);

const JOINABLE_FORMAT_SET = new Set(JOINABLE_FORMATS);

/** Whether a token can sit on either side of a joined "xtoy" or "x2y" query. */
export function isJoinableFormat(token: string): boolean {
  return JOINABLE_FORMAT_SET.has(token);
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A capture group rather than a lookbehind, so the landing hero search still
// parses on Safari before 16.4.
const JOINED_FORMAT = `(${JOINABLE_FORMATS.map(escapeRegExp).join("|")})`;
const JOINED_CONVERSION = new RegExp(
  `(^|[^a-z0-9])${JOINED_FORMAT}to${JOINED_FORMAT}(?![a-z0-9])`,
  "g",
);
const JOINED_CONVERSION_DIGIT = new RegExp(
  `(^|[^a-z0-9])${JOINED_FORMAT}2${JOINED_FORMAT}(?![a-z0-9])`,
  "g",
);

/** Words that name a whole modality, too broad to search on their own. */
const BARE_MODALITY_WORDS = new Set([
  "image",
  "images",
  "video",
  "videos",
  "audio",
  "document",
  "documents",
]);

/** Filler words stripped from queries so "convert mp4 to mp3 file" reduces to "mp4 to mp3". */
const FILLER = new Set([
  "convert",
  "to",
  "into",
  "file",
  "online",
  "free",
  "a",
  "an",
  "the",
  "from",
]);

/**
 * Normalize a search query to a canonical token string. Lowercases, collapses
 * separators, splits joined forms (jpg2png, jpgtopng), maps the standalone
 * digit 2 to "to", expands synonyms and fixes misspellings, drops filler.
 * Returns a space-joined token string (filler-stripped except the connective).
 */
export function normalizeSearchQuery(raw: string): string {
  let s = raw.toLowerCase().trim();
  // "jpg2png", "mp42mp3" -> "jpg to png", "mp4 to mp3", only between known formats (#1366).
  s = s.replace(JOINED_CONVERSION_DIGIT, "$1$2 to $3");
  // "jpgtopng" -> "jpg to png", only between known formats.
  s = s.replace(JOINED_CONVERSION, "$1$2 to $3");
  // Collapse separators to spaces.
  s = s.replace(/[-_.]+/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let droppedConvert = false;
  for (let tok of tokens) {
    if (tok === "2") tok = "to";
    // Own-property checks: "constructor" must not resolve to Object's.
    if (Object.hasOwn(MISSPELLINGS, tok)) tok = MISSPELLINGS[tok];
    if (Object.hasOwn(ALIAS_TO_CANONICAL, tok)) tok = ALIAS_TO_CANONICAL[tok];
    if (tok === "to") {
      out.push("to");
      continue;
    }
    if (tok === "convert") {
      droppedConvert = true;
      continue;
    }
    if (FILLER.has(tok)) continue;
    out.push(tok);
  }
  // Drop a leading/trailing dangling "to".
  while (out[0] === "to") out.shift();
  while (out[out.length - 1] === "to") out.pop();
  // "convert" is filler in "convert jpg to png", but in "convert image" it's
  // half the tool's name: dropping it leaves "image", which ranks the
  // compress-image presets first (#1327). Keep it when nothing but a bare
  // modality word would be left.
  if (droppedConvert && out.length === 1 && BARE_MODALITY_WORDS.has(out[0])) out.unshift("convert");
  return out.join(" ");
}

/** Lowercased aliases for a format token (the token plus its known equivalents). */
function aliasesFor(fmt: string): string[] {
  const f = fmt.toLowerCase();
  const canonical = ALIAS_TO_CANONICAL[f] ?? f;
  const set = new Set<string>([f, canonical, ...(FORMAT_ALIASES[canonical] ?? [])]);
  return [...set];
}

/**
 * Generate search keywords for an "X to Y" conversion from display labels.
 * Returns deduped lowercase variants: formats + aliases, natural phrasings,
 * compact forms, reverse phrasing, and "<x> converter".
 */
export function generateConversionKeywords({ from, to }: { from: string; to: string }): string[] {
  const fromVariants = aliasesFor(from);
  const toVariants = aliasesFor(to);
  const out = new Set<string>();
  for (const f of fromVariants) out.add(f);
  for (const t of toVariants) out.add(t);
  for (const f of fromVariants) {
    for (const t of toVariants) {
      out.add(`${f} to ${t}`);
      out.add(`${f} ${t}`);
      out.add(`${f}2${t}`);
      out.add(`${f}to${t}`);
      out.add(`${t} from ${f}`);
    }
    out.add(`${f} converter`);
  }
  for (const t of toVariants) out.add(`${t} converter`);
  return [...out];
}
