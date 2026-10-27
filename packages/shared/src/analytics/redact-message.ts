/**
 * The single redactor for error text sent to Sentry. Denylist-shaped, so it is
 * only trusted for messages we already gate (SafeError, our own throws, known
 * libraries) and for the redacted fallback in rebuildErrorValue. It keeps the
 * published never-collect promise (no file names / paths / contents) true while
 * still surfacing the human-readable message.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strip ASCII C0 controls + DEL from error text.
const CTRL_RE = /[\x00-\x1f\x7f]/g;
const BLOB_RE = /blob:[^\s"')]+/g;
const DATA_RE = /data:[^\s"')]+/g;
const URL_RE = /https?:\/\/[^\s"')]+/g;
const UNIX_ROOTS =
  "Users|home|root|data|tmp|var|app|opt|mnt|srv|Volumes|private|media|run|storage|scratch|workspace|volume\\d+";
const PATH_RE = new RegExp(`(?:\\/(?:${UNIX_ROOTS})|[A-Za-z]:\\\\)[^\\s"')]*`, "g");
// Relative object-storage keys (uploads/<jobId>/…, outputs/…, previews/…) carry a
// user-supplied filename tail, so mask them like absolute paths. Runs after
// PATH_RE, which already swallows the absolute /data/uploads/… form.
const RELKEY_RE = /\b(?:uploads|outputs|previews)\/[^\s"')]+/g;
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
// IPv6: a full 8-group form, or any ::-compressed form (::1, fe80::…, …::). The
// negative lookbehind/lookahead ((?<![\w:]) … (?![\w:])) require the address to
// stand alone, so C++/Rust scope resolution (std::bad_alloc, core::result) is left
// intact. A plain decimal version like 2.2.0 has no colons, and a bare HH:MM needs
// no ::, so both survive too.
const IPV6_RE =
  /(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?)(?![\w:])/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// A user file is a name plus one of the formats SnapOtter processes. Restricting
// to this set avoids eating version strings ("2.2.0") and code filenames
// ("rounded-crop.ts"), which carry no user data and aid triage. Unicode-aware
// (\p{L} + the u flag) so a non-ASCII user filename (CJK, Arabic) is masked too.
// Matches up to 5 preceding words to redact unquoted filenames with spaces.
const USER_FILE_EXT =
  "jpe?g|png|gif|webp|avif|hei[cf]|tiff?|bmp|svg|raw|psd|jxl|mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp|3g2|vob|m2ts|ogv|rmvb|asf|f4v|mxf|wtv|mp3|wav|flac|aac|ogg|m4a|opus|wma|amr|ape|ac3|aiff|aif|wv|tta|dsf|dff|mka|caf|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|epub|zip";
const USER_FILE_EXT_RE = new RegExp(`\\.(?:${USER_FILE_EXT})$`, "i");
// A letter-leading suffix catches non-media files (report.json, dump.bin) while
// leaving version shapes such as v2.1 alone.
const GENERIC_EXT_RE = /\.[A-Za-z][A-Za-z0-9]{1,7}$/;
// Public routes stay readable in Sentry; they are paths, not user files.
const ROUTE_PREFIXES = ["/api/", "/assets/", "/static/", "/docs/"];
const ROUTE_EXACT = ["/health", "/metrics", "/openapi"];
const REL_KEY_PREFIX_RE = /^(?:uploads|outputs|previews)\//;
const QUOTED_PATH_RE =
  /(^|[\s([{=:,])(['"`])((?:\/|\\\\|[A-Za-z]:[\\/]|\.{1,2}\/|(?:uploads|outputs|previews)\/)[^'"`]{0,240})\2/g;
const LEAD_PUNCT_RE = /^(?:[A-Za-z_][A-Za-z0-9_]*=)?[([{=:,]*/;
const TRAILING_CHARS = ".,;:!?)]}";
const PATH_DELIM_RE = /["<>]/;
const MAX_PATH_TOKENS = 16;
const MAX_PATH_CHARS = 1024;

function stripTrailingPunctuation(s: string): string {
  let end = s.length;
  while (end > 0 && TRAILING_CHARS.includes(s[end - 1])) end--;
  return s.slice(0, end);
}

/** Strips punctuation and a :line / :line:col suffix from a path span. */
function stripTrailingPathSuffix(s: string): string {
  let end = stripTrailingPunctuation(s).length;
  for (let pass = 0; pass < 2; pass++) {
    let i = end;
    while (i > 0 && s[i - 1] >= "0" && s[i - 1] <= "9") i--;
    if (i === end || i === 0 || s[i - 1] !== ":") break;
    end = i - 1;
  }
  return s.slice(0, end);
}

function isPublicRoute(path: string): boolean {
  return (
    ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    ROUTE_EXACT.some(
      (exact) => path === exact || path.startsWith(`${exact}/`) || path.startsWith(`${exact}.`),
    )
  );
}

function isAbsolutePathStart(token: string): boolean {
  return token.startsWith("/") || token.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(token);
}

function hasFileExtension(token: string): boolean {
  return USER_FILE_EXT_RE.test(token) || GENERIC_EXT_RE.test(token);
}

function isPathLike(clean: string): boolean {
  if (clean.startsWith("\\\\")) return /^\\\\[^\\/]+[\\/]/.test(clean);
  if (/^[A-Za-z]:[\\/]/.test(clean)) return true;
  if (REL_KEY_PREFIX_RE.test(clean)) {
    return clean.split("/").filter(Boolean).length >= 2;
  }
  if (!clean.startsWith("/")) return false;
  if (isPublicRoute(clean)) return false;
  return clean.split("/").filter(Boolean).length >= 2;
}

function isPathBoundary(token: string): boolean {
  const word = stripTrailingPunctuation(token.replace(LEAD_PUNCT_RE, "")).toLowerCase();
  return PATH_BOUNDARY_WORDS.has(word);
}

function isSoftPathWord(token: string): boolean {
  const word = stripTrailingPunctuation(token.replace(LEAD_PUNCT_RE, "")).toLowerCase();
  return SOFT_PATH_WORDS.has(word);
}

function isPathContinuation(token: string): boolean {
  const t = token.replace(LEAD_PUNCT_RE, "");
  if (t.length === 0) return false;
  // A single letter/digit after a complete path is prose; symbols such as &
  // and + can be directory names. Flags are never path segments.
  if (t.length === 1) return !/[A-Za-z0-9]/.test(t) && t !== "-";
  return !t.startsWith("-");
}

/**
 * Masks absolute paths, UNC shares, and relative storage keys, including paths
 * whose directory or filename contains spaces. Works on whitespace-separated
 * tokens and tries bounded spans so a spaced path is not split at the first
 * space. Returns the input unchanged when no path is found.
 */
function redactAbsolutePaths(s: string): string {
  const tokens = Array.from(s.matchAll(/\S+/g));
  let out = "";
  let cursor = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tokenStart = tokens[i].index ?? 0;
    if (tokenStart < cursor) continue;

    const lead = tokens[i][0].match(LEAD_PUNCT_RE);
    const leadLen = lead ? lead[0].length : 0;
    const start = tokenStart + leadLen;
    const first = tokens[i][0].slice(leadLen);
    if (!isAbsolutePathStart(first) && !REL_KEY_PREFIX_RE.test(first)) continue;

    let chosenEnd = -1;
    for (let n = i; n < Math.min(tokens.length, i + MAX_PATH_TOKENS); n++) {
      if (n > i) {
        // Never merge two paths (or a path after a URL placeholder) into one
        // mask, and stop before a single-character or flag-like token.
        const next = tokens[n][0].replace(LEAD_PUNCT_RE, "");
        if (
          isAbsolutePathStart(next) ||
          REL_KEY_PREFIX_RE.test(next) ||
          !isPathContinuation(tokens[n][0])
        ) {
          break;
        }
      }
      const rawEnd = (tokens[n].index ?? 0) + tokens[n][0].length;
      const raw = s.slice(start, rawEnd);
      if (raw.length > MAX_PATH_CHARS && n > i) break;

      // Trailing sentence punctuation and a :line:col suffix stay outside the mask.
      const clean = stripTrailingPathSuffix(raw);
      if (PATH_DELIM_RE.test(clean)) break;
      if (!isPathLike(clean)) continue;

      const next = tokens[n + 1];
      // A conjunction/preposition only belongs to the path when the next token
      // still looks like a path segment; before a reason or placeholder it is prose.
      if (isSoftPathWord(tokens[n][0]) && next) {
        const nextText = next[0].replace(LEAD_PUNCT_RE, "");
        if (nextText.startsWith("<") || isPathBoundary(next[0])) break;
      }
      chosenEnd = start + clean.length;

      const suffix = raw.slice(clean.length);
      // "path: reason" ends the path; "path:10:5" is a line/column suffix.
      const colonReason = suffix.startsWith(":") && !/^\d/.test(suffix.slice(1));
      const definite =
        hasFileExtension(clean) ||
        clean.endsWith("/") ||
        clean.endsWith("\\") ||
        colonReason ||
        (raw !== clean && (!next || isPathBoundary(next[0])));
      if (definite || !next || isPathBoundary(next[0])) {
        break;
      }
    }

    if (chosenEnd === -1) continue;
    out += `${s.slice(cursor, start)}<path>`;
    cursor = chosenEnd;
  }

  out += s.slice(cursor);
  return out;
}

const FILE_RE = new RegExp(
  `((?:[\\p{L}\\p{N}_-]+\\s+){0,5})([\\p{L}\\p{N}_-]+\\.(?:${USER_FILE_EXT}))\\b`,
  "giu",
);

const BOUNDARY_WORDS = new Set([
  "read",
  "write",
  "failed",
  "for",
  "in",
  "of",
  "with",
  "to",
  "from",
  "on",
  "at",
  "open",
  "stat",
  "unlink",
  "processing",
  "loading",
  "uploading",
  "parsing",
  "invalid",
  "bad",
  "missing",
  "found",
  "error",
  "enoent",
  "eacces",
  "eperm",
  "cannot",
  "could",
  "not",
  "fail",
  "fails",
  "warning",
  "info",
  "debug",
  "fatal",
  "critical",
  "trace",
  "copy",
  "move",
  "uploaded",
  "download",
  "downloading",
  "downloaded",
  "processed",
  "loaded",
  "parse",
  "parsed",
  "unexpected",
  "eof",
  "a",
  "an",
  "the",
  "is",
  "was",
  "are",
  "were",
  "by",
  "as",
]);

// Extra words that end a path when they follow it: "open /data/in failed",
// "open /data/in: no such file". Grammatical words are excluded so directory
// names such as "Photos and Videos" or "Trips to Japan" are not cut in half.
const SOFT_PATH_WORDS = new Set([
  "and",
  "or",
  "then",
  "but",
  "because",
  "while",
  "when",
  "which",
  "that",
  "for",
  "in",
  "of",
  "with",
  "to",
  "from",
  "on",
  "at",
  "by",
  "as",
  "the",
  "a",
  "an",
]);
const PATH_BOUNDARY_WORDS = new Set([
  ...[...BOUNDARY_WORDS].filter((word) => !SOFT_PATH_WORDS.has(word)),
  "returned",
  "exited",
  "spawned",
  "happened",
  "occurred",
  "refused",
  "timed",
  "out",
  "via",
  "after",
  "before",
  "during",
  "into",
  "onto",
  "over",
  "under",
  "again",
  "still",
  "already",
  "no",
  "permission",
  "denied",
  "exists",
  "exist",
  "timeout",
  "forbidden",
  "unavailable",
  "too",
  "many",
]);

function redactFilenameWithSpaces(_match: string, preceding: string): string {
  if (!preceding) return "<file>";

  const WORD_RE = /[\p{L}\p{N}_-]+/gu;
  let wordMatch: RegExpExecArray | null;
  let lastBoundaryEnd = -1;

  while ((wordMatch = WORD_RE.exec(preceding)) !== null) {
    if (BOUNDARY_WORDS.has(wordMatch[0].toLowerCase())) {
      lastBoundaryEnd = wordMatch.index + wordMatch[0].length;
    }
  }

  if (lastBoundaryEnd === -1) {
    return preceding + "<file>";
  }

  const spaceMatch = preceding.slice(lastBoundaryEnd).match(/^\s+/);
  const splitIndex = lastBoundaryEnd + (spaceMatch ? spaceMatch[0].length : 0);
  return preceding.slice(0, splitIndex) + "<file>";
}

const QUOTED_RE = /(['"])(.{24,}?)\1/g;
const HEX_RE = /\b[0-9a-fA-F]{16,}\b/g;
const MAX_LEN = 300;

export function redactMessage(message: unknown, opts?: { raw?: boolean }): string {
  let s = String(message ?? "").replace(CTRL_RE, " ");
  if (!opts?.raw) {
    s = s
      .replace(BLOB_RE, "<blob>")
      .replace(DATA_RE, "<data>")
      .replace(URL_RE, "<url>")
      .replace(QUOTED_PATH_RE, (match, prefix, q, body) =>
        isPublicRoute(body) ? match : `${prefix}${q}<path>${q}`,
      );
    s = redactAbsolutePaths(s);
    s = s
      .replace(PATH_RE, "<path>")
      .replace(RELKEY_RE, "<path>")
      .replace(IP_RE, "<ip>")
      .replace(IPV6_RE, "<ip>")
      .replace(EMAIL_RE, "<email>")
      .replace(QUOTED_RE, (_m, q) => `${q}<value>${q}`)
      .replace(HEX_RE, "<hex>")
      .replace(FILE_RE, redactFilenameWithSpaces);
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s;
}
