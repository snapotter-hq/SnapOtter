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
  // Split alpha/digit boundaries so "jpg2png" -> "jpg 2 png", "mp4" stays intact only at word edges.
  s = s.replace(/([a-z])2([a-z])/g, "$1 to $2");
  // "jpgtopng" -> "jpg to png" (only when "to" sits between two known-ish letter runs)
  s = s.replace(/([a-z]{2,5})to([a-z]{2,5})/g, (_m, a, b) => `${a} to ${b}`);
  // Collapse separators to spaces.
  s = s.replace(/[-_.]+/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let tok of tokens) {
    if (tok === "2") tok = "to";
    if (MISSPELLINGS[tok]) tok = MISSPELLINGS[tok];
    if (ALIAS_TO_CANONICAL[tok]) tok = ALIAS_TO_CANONICAL[tok];
    if (tok === "to") {
      out.push("to");
      continue;
    }
    if (FILLER.has(tok)) continue;
    out.push(tok);
  }
  // Drop a leading/trailing dangling "to".
  while (out[0] === "to") out.shift();
  while (out[out.length - 1] === "to") out.pop();
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
