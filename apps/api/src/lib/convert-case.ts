/**
 * Text case conversion for the convert-case tool. Pure so the route stays a
 * thin shell and the tokenizing edge cases are unit-testable without a server.
 */

export const CASE_MODES = [
  "upper",
  "lower",
  "sentence",
  "title",
  "capitalized",
  "inverse",
  "alternating",
  "camel",
  "pascal",
  "snake",
  "kebab",
] as const;

export type CaseMode = (typeof CASE_MODES)[number];

// A word is letters, marks and digits, with inner apostrophes kept so "don't"
// stays one word.
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

// Identifier words also split on case changes: an acronym run that is not
// followed by a lowercase letter ("XML" in "XMLHttp"), a capitalized or
// lowercase run, or a run of digits. Marks ride along so decomposed (NFD)
// accents stay inside their word.
const IDENTIFIER_WORD =
  /(?:\p{Lu}\p{M}*)+(?![\p{Ll}\p{Lo}\p{M}])|[\p{Lu}\p{Lt}]?[\p{Ll}\p{Lo}\p{Lm}\p{M}]+|\p{N}+/gu;

const LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// English minor words kept lowercase inside a title (Chicago-style short list).
const TITLE_MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "per",
  "the",
  "to",
  "vs",
  "via",
]);

/**
 * Convert `text` to `mode`. `locale` (a BCP 47 tag) picks locale-specific
 * casing such as the Turkish dotted and dotless i; without it casing is
 * locale-independent, never the server's own locale.
 */
export function convertCase(text: string, mode: CaseMode, locale?: string): string {
  const upper = (s: string) => (locale ? s.toLocaleUpperCase(locale) : s.toUpperCase());
  const lower = (s: string) => (locale ? s.toLocaleLowerCase(locale) : s.toLowerCase());
  const capitalize = (word: string) => {
    const first = String.fromCodePoint(word.codePointAt(0) ?? 0);
    return upper(first) + word.slice(first.length);
  };

  switch (mode) {
    case "upper":
      return upper(text);
    case "lower":
      return lower(text);
    case "sentence":
      return sentenceCase(lower(text), upper);
    case "capitalized":
      return lower(text).replace(WORD, capitalize);
    case "title":
      return mapLines(lower(text), (line) => titleCaseLine(line, capitalize));
    case "inverse":
      return Array.from(text, (ch) => {
        const up = upper(ch);
        return up === ch ? lower(ch) : up;
      }).join("");
    case "alternating": {
      let letterIndex = 0;
      return Array.from(text, (ch) => {
        if (!LETTER.test(ch)) return ch;
        return letterIndex++ % 2 === 0 ? lower(ch) : upper(ch);
      }).join("");
    }
    case "camel":
    case "pascal":
    case "snake":
    case "kebab":
      return mapLines(text, (line) => {
        const words = (line.match(IDENTIFIER_WORD) ?? []).map(lower);
        if (mode === "snake") return words.join("_");
        if (mode === "kebab") return words.join("-");
        return words
          .map((word, i) => (i === 0 && mode === "camel" ? word : capitalize(word)))
          .join("");
      });
  }
}

function mapLines(text: string, fn: (line: string) => string): string {
  return text
    .split(/(\r\n|\r|\n)/)
    .map((part, i) => (i % 2 === 0 ? fn(part) : part))
    .join("");
}

/**
 * Upper-case the first letter or digit of each sentence in already-lowered
 * text. A sentence starts the text, follows a line break, or follows ., ! or ?
 * (or an ellipsis) plus whitespace, so the dot in "snapotter.com" or "3.5"
 * does not count.
 * Quotes and brackets in between are skipped over.
 */
function sentenceCase(text: string, upper: (s: string) => string): string {
  let out = "";
  let capNext = true;
  let afterTerminator = false;
  for (const ch of text) {
    if (LETTER_OR_DIGIT.test(ch)) {
      out += capNext && LETTER.test(ch) ? upper(ch) : ch;
      capNext = false;
      afterTerminator = false;
      continue;
    }
    if (ch === "\n" || ch === "\r") capNext = true;
    else if (/\s/u.test(ch)) {
      if (afterTerminator) capNext = true;
    } else if (ch === "." || ch === "!" || ch === "?" || ch === "\u2026") afterTerminator = true;
    out += ch;
  }
  return out;
}

function titleCaseLine(line: string, capitalize: (word: string) => string): string {
  const matches = [...line.matchAll(WORD)];
  if (matches.length === 0) return line;
  const last = matches.length - 1;
  let out = "";
  let cursor = 0;
  matches.forEach((m, i) => {
    const word = m[0];
    const index = m.index ?? 0;
    const keepLower = i !== 0 && i !== last && TITLE_MINOR_WORDS.has(word);
    out += line.slice(cursor, index) + (keepLower ? word : capitalize(word));
    cursor = index + word.length;
  });
  return out + line.slice(cursor);
}
