// scripts/i18n/lib/mask.mjs

// Ordered so multi-char structures are matched before their sub-parts.
// Each pattern captures the exact substring to hide from the translator.
const FENCE = /(^|\n)(```|~~~)[\s\S]*?\n\2/g; // fenced code blocks
const INLINE = /`[^`\n]+`/g; // inline code spans
// Link/image URL: mask the URL, keep the [text]. The URL may itself contain a
// single level of balanced parentheses (e.g. wikipedia .../Foo_(bar)); match
// runs of non-paren chars and optional (balanced) groups, then the closing paren.
const LINK_URL = /(!?\[[^\]]*\]\()((?:[^()]|\([^()]*\))*)(\))/g;
// {{double}} first so it is captured whole, then {single} interpolation.
const PLACEHOLDER = /\{\{[^{}\n]+\}\}|\{[^{}\n]+\}/g;

const TOKEN = (i) => `⸤I18N${i}⸥`; // uncommon delimiters, restored 1:1
const TOKEN_RE = /⸤I18N\d+⸥/g;

/**
 * Replace protected substrings with opaque tokens.
 * @param {string} text
 * @returns {{ masked: string, tokens: string[] }}
 */
export function mask(text) {
  const tokens = [];
  const push = (value) => {
    tokens.push(value);
    return TOKEN(tokens.length - 1);
  };
  let out = String(text);
  out = out.replace(FENCE, (m) => push(m));
  out = out.replace(INLINE, (m) => push(m));
  out = out.replace(LINK_URL, (_m, open, url, close) => `${open}${push(url)}${close}`);
  out = out.replace(PLACEHOLDER, (m) => push(m));
  return { masked: out, tokens };
}

/**
 * Reinsert masked substrings by token index.
 * @param {string} masked
 * @param {string[]} tokens
 * @returns {string}
 */
export function restore(masked, tokens) {
  return String(masked).replace(TOKEN_RE, (t) => {
    const m = t.match(/I18N(\d+)/);
    const i = m ? Number(m[1]) : Number.NaN;
    return tokens[i] ?? t;
  });
}

/**
 * Count structural elements, used by the validator to prove nothing was lost.
 * @param {string} text
 * @returns {{ fences: number, inlineCode: number, links: number, placeholders: number }}
 */
export function countStructures(text) {
  const s = String(text);
  const count = (re) => (s.match(re) || []).length;
  return {
    fences: count(FENCE),
    inlineCode: count(INLINE),
    links: count(LINK_URL),
    placeholders: count(PLACEHOLDER),
  };
}

export { TOKEN_RE };
