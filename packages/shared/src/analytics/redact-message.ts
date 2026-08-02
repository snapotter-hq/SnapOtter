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
const PATH_RE = /(?:\/(?:Users|home|root|data|tmp|var|app|opt|mnt|srv)|[A-Za-z]:\\)[^\s"')]*/g;
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
const USER_FILE_EXT =
  "jpe?g|png|gif|webp|avif|heif?|tiff?|bmp|svg|raw|psd|mp4|mov|avi|mkv|webm|flv|wmv|m4v|mp3|wav|flac|aac|ogg|m4a|opus|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|epub|zip";
const FILE_RE = new RegExp(`[\\p{L}\\p{N}_-]{1,80}\\.(?:${USER_FILE_EXT})`, "giu");
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
      .replace(PATH_RE, "<path>")
      .replace(RELKEY_RE, "<path>")
      .replace(IP_RE, "<ip>")
      .replace(IPV6_RE, "<ip>")
      .replace(EMAIL_RE, "<email>")
      .replace(QUOTED_RE, (_m, q) => `${q}<value>${q}`)
      .replace(HEX_RE, "<hex>")
      .replace(FILE_RE, "<file>");
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s;
}
