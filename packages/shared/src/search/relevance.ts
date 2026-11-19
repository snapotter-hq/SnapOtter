import { isFormatConverter, normalizeSearchQuery } from "./format-aliases.js";

/** The tool fields search reads. Both the app's Tool and the landing's search item fit. */
export interface SearchableTool {
  id: string;
  name: string;
  description: string;
  category: string;
  modality: string;
  acceptedInputs: readonly string[];
  keywords?: readonly string[];
}

/** Query words too common to require a match for ("fill and sign", "pdf for print"). */
const STOP_WORDS = new Set(["and", "or", "with", "for", "my", "of", "in", "on", "by", "at", "how"]);

const splitWords = (text: string) => text.split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Every word a tool can be found by, both as written ("spreadsheet") and as the
 * normalizer canonicalizes it ("excel"), so a query matches whichever form it
 * arrives in.
 */
const wordCache = new WeakMap<SearchableTool, string[]>();
function toolWords(tool: SearchableTool): string[] {
  let words = wordCache.get(tool);
  if (!words) {
    const fields = [
      tool.name,
      tool.id,
      tool.description,
      tool.category,
      tool.modality,
      ...(tool.keywords ?? []),
    ];
    words = [
      ...new Set(
        fields.flatMap((field) => [
          ...splitWords(field.toLowerCase()),
          ...splitWords(normalizeSearchQuery(field)),
        ]),
      ),
    ];
    wordCache.set(tool, words);
  }
  return words;
}

/** Query words that must each find a match in a tool for it to stay in the results. */
function requiredWords(query: string): string[] {
  return splitWords(normalizeSearchQuery(query)).filter(
    (word) => word !== "to" && word.length > 2 && !STOP_WORDS.has(word),
  );
}

/** Whether a and b are at most one insertion, deletion, substitution or adjacent swap apart. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const swapped =
    a.length === b.length &&
    a[i] === b[i + 1] &&
    a[i + 1] === b[i] &&
    a.slice(i + 2) === b.slice(i + 2);
  return (
    swapped ||
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i)
  );
}

/**
 * The word starts a word of the tool's, or is a plural of one. A plural is also
 * tried in canonical form, since the normalizer maps "photo" to "image" but
 * leaves "photos" alone.
 */
function exactMatch(word: string, words: string[]): boolean {
  if (words.some((w) => w.startsWith(word))) return true;
  if (!word.endsWith("s")) return false;
  const singular = word.slice(0, -1);
  const canonical = canonicalSingular(singular);
  return words.some((w) => w === singular || w === canonical);
}

const canonicalCache = new Map<string, string>();
function canonicalSingular(singular: string): string {
  let canonical = canonicalCache.get(singular);
  if (canonical === undefined) {
    canonical = normalizeSearchQuery(singular);
    if (canonicalCache.size > 500) canonicalCache.clear();
    canonicalCache.set(singular, canonical);
  }
  return canonical;
}

/**
 * One typo away. A three-letter word only matches a four-letter word missing
 * one of its letters ("crp" finds "crop", "wep" finds "webp"): any looser and
 * "nef" or "arw" would find whatever three-letter word sits nearby.
 */
function typoMatch(word: string, words: string[]): boolean {
  return words.some((w) => {
    if (word.length === 3) return w.length === 4 && withinOneEdit(word, w);
    if (withinOneEdit(word, w)) return true;
    return (
      word.length >= 5 && w.length > word.length && withinOneEdit(word, w.slice(0, word.length))
    );
  });
}

function matchesEveryWord(
  required: string[],
  tool: SearchableTool,
  match: (word: string, words: string[]) => boolean,
): boolean {
  const words = toolWords(tool);
  return required.every((word) => match(word, words));
}

/**
 * Drops fuzzy hits that don't share every word of the query with the tool (#4818).
 *
 * Fuse's threshold is loose enough that almost any query finds something: "font"
 * matched content-aware-resize, and "remove watermark" ranked the four tools that
 * add one. Requiring each query word to appear in the tool's name, id,
 * description, category or keywords sends those to the empty state instead, where
 * the feedback prompt can record the request. When some results contain every
 * word as typed, typo matches are dropped too, so "dng" shows the image converter
 * and not every "png" tool. `results` keeps its order.
 */
export function filterRelevantTools<T extends SearchableTool>(query: string, results: T[]): T[] {
  const required = requiredWords(query);
  if (required.length === 0) return results;
  const exact = results.filter((tool) => matchesEveryWord(required, tool, exactMatch));
  if (exact.length > 0) return exact;
  return results.filter((tool) =>
    matchesEveryWord(
      required,
      tool,
      (word, words) => exactMatch(word, words) || typoMatch(word, words),
    ),
  );
}

/**
 * Puts the modality's converter first for an "x to y" query that no dedicated
 * tool handles, such as "mp3 to ogg" (#4818). A converter qualifies when it
 * accepts both formats, which keeps "png to opus" from offering anything.
 */
export function withConverterFallback<T extends SearchableTool>(
  query: string,
  results: T[],
  allTools: readonly T[],
): T[] {
  const match = /^([a-z0-9]+) to ([a-z0-9]+)$/.exec(normalizeSearchQuery(query));
  if (!match) return results;
  const [, from, to] = match;
  if (from === to) return results;
  const pair = `${from} to ${to}`;
  const dedicated = allTools.some(
    (tool) => tool.id === `${from}-to-${to}` || tool.keywords?.includes(pair),
  );
  if (dedicated) return results;
  const converters = allTools.filter(
    (tool) =>
      isFormatConverter(tool) &&
      tool.acceptedInputs.includes(`.${from}`) &&
      tool.acceptedInputs.includes(`.${to}`),
  );
  if (converters.length === 0) return results;
  return [...converters, ...results.filter((tool) => !converters.includes(tool))];
}
