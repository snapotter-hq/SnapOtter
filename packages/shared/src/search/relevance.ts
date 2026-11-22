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

/**
 * Query words too common to require a match for ("fill and sign", "pdf for
 * print"), plus the "to", "from" and "into" of our Latin-script locales, since
 * people type "png till ico" (sv) or "jpg naar png" (nl) into the English
 * catalog. Words of one or two letters are never required, so "zu", "en" or
 * "do" don't need listing. "file" and "files" pad a query ("merge pdf files")
 * without naming a task, and few tools spell them out (#5190).
 */
const STOP_WORDS = new Set([
  ...["and", "or", "with", "for", "my", "of", "in", "on", "by", "at", "how"],
  ...["file", "files"],
  ...[
    "nach",
    "von",
    "aus",
    "als",
    "para",
    "vers",
    "menjadi",
    "dari",
    "naar",
    "van",
    "till",
    "sang",
  ],
]);

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
  return requiredOf(splitWords(normalizeSearchQuery(query)));
}

function requiredOf(words: string[]): string[] {
  return words.filter((word) => word !== "to" && word.length > 2 && !STOP_WORDS.has(word));
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
 * The word starts a word of the tool's, or is a plural of one. A plural alias
 * ("photos") arrives already canonical, since the normalizer maps it (#4900).
 */
function exactMatch(word: string, words: string[]): boolean {
  if (words.some((w) => w.startsWith(word))) return true;
  if (!word.endsWith("s")) return false;
  const singular = word.slice(0, -1);
  return words.some((w) => w === singular);
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

/** Phrases that mean the same task, such as "merge", "combine" and "join". */
export type SearchAliasGroups = readonly (readonly string[])[];

/**
 * For each required query word that sits inside an alias phrase the query
 * contains, the other phrases of that alias group, each as its required words.
 * "combine pdf" maps "combine" to [["merge"], ["combine"], ["join"]].
 */
function aliasAlternatives(query: string, aliasGroups: SearchAliasGroups): Map<string, string[][]> {
  const alternatives = new Map<string, string[][]>();
  const queryText = ` ${splitWords(normalizeSearchQuery(query)).join(" ")} `;
  for (const group of aliasGroups) {
    const phrases = group.map((alias) => splitWords(normalizeSearchQuery(alias)));
    const others = phrases.map(requiredOf).filter((words) => words.length > 0);
    for (const phrase of phrases) {
      if (phrase.length === 0 || !queryText.includes(` ${phrase.join(" ")} `)) continue;
      for (const word of requiredOf(phrase)) {
        alternatives.set(word, [...(alternatives.get(word) ?? []), ...others]);
      }
    }
  }
  return alternatives;
}

function matchesEveryWord(
  required: string[],
  tool: SearchableTool,
  match: (word: string, words: string[]) => boolean,
  alternatives: Map<string, string[][]>,
): boolean {
  const words = toolWords(tool);
  return required.every(
    (word) =>
      match(word, words) ||
      (alternatives.get(word) ?? []).some((phrase) => phrase.every((w) => match(w, words))),
  );
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
 *
 * With `aliasGroups`, a query word inside one of the group's phrases also
 * matches a tool that has every word of another phrase in the group, so
 * "combine pdf" keeps merge-pdf (#4899).
 */
export function filterRelevantTools<T extends SearchableTool>(
  query: string,
  results: T[],
  aliasGroups: SearchAliasGroups = [],
): T[] {
  const required = requiredWords(query);
  if (required.length === 0) return results;
  const alternatives = aliasAlternatives(query, aliasGroups);
  const exact = results.filter((tool) =>
    matchesEveryWord(required, tool, exactMatch, alternatives),
  );
  if (exact.length > 0) return exact;
  return results.filter((tool) =>
    matchesEveryWord(
      required,
      tool,
      (word, words) => exactMatch(word, words) || typoMatch(word, words),
      alternatives,
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
