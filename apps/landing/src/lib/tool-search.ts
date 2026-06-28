import { normalizeSearchQuery } from "@snapotter/shared/search/format-aliases.js";

/** Bounded Levenshtein: returns edit distance, short-circuiting above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

/** True if every normalized query token appears in the haystack (substring), or matches a haystack word within a small edit distance. */
export function matchTool(rawQuery: string, haystack: string): boolean {
  const q = normalizeSearchQuery(rawQuery);
  if (!q) return true;
  const hay = haystack.toLowerCase();
  const hayWords = hay.split(/\s+/);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((tok) => {
    if (tok === "to") return true;
    if (hay.indexOf(tok) !== -1) return true;
    const max = tok.length <= 4 ? 1 : 2;
    return hayWords.some((w) => editDistance(tok, w, max) <= max);
  });
}
