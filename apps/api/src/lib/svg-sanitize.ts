import { gunzipSync } from "node:zlib";
import { MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/shared";
import { env } from "../config.js";
import { type EmbeddedRasterType, readEmbeddedRasterSize } from "./embedded-raster.js";

/**
 * Characters that are XML syntax. A reference to one of them stays encoded:
 * decoding `&#34;` inside an attribute or `&#60;` in text would change the
 * markup and break a well-formed input (#5102). None of them can spell a URI
 * scheme, so the scheme checks lose nothing.
 */
const XML_SYNTAX_CHARS = new Set(['"', "'", "<", ">", "&"]);

function decodeReference(ref: string, codePoint: number): string {
  if (codePoint > 0x10ffff) return ref;
  const char = String.fromCodePoint(codePoint);
  return XML_SYNTAX_CHARS.has(char) ? ref : char;
}

/**
 * Decode common HTML/XML numeric character references (&#xNN; and &#NNN;)
 * so that obfuscated `javascript:` / `data:` URIs are caught by later regex passes.
 */
function decodeNumericEntities(input: string): string {
  return input
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (m, hex) => decodeReference(m, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => decodeReference(m, Number.parseInt(dec, 10)));
}

// Most removal steps below are written as scanners rather than single regexes
// on purpose. A pattern like `<x\b[^>]*>` or `<x\b[\s\S]*?<\/x>` restarts its
// scan from every candidate opening, so input with many openings and no
// terminator (`<set<set<set...`) costs O(n^2) or worse. Each scanner below
// looks at every character a bounded number of times.

/** Hard cap on stripUntilStable passes. Real SVGs settle in one or two. */
const MAX_STRIP_PASSES = 5;

/**
 * Apply removal steps repeatedly until the string stops changing, so that
 * nested or overlapping dangerous tags (e.g. `<scr<script>ipt>`) cannot survive
 * a single pass. Every step only removes text, so an unchanged length means a
 * stable string. Input that is still changing after MAX_STRIP_PASSES is
 * rejected: each pass costs a full scan, and deep re-forming nesting is an
 * attack shape, not a drawing.
 */
function stripUntilStable(input: string, ...steps: Array<(s: string) => string>): string {
  let out = input;
  for (let pass = 0; pass < MAX_STRIP_PASSES; pass++) {
    const before = out.length;
    for (const step of steps) out = step(out);
    if (out.length === before) return out;
  }
  throw svgLimitError("SVG nesting is too deep to sanitize");
}

/**
 * Remove every `open ... close` span, matching the earliest close after each
 * open, the way a global `open[\s\S]*?close` replace would. Both regexes must
 * carry the `g` flag. Once an open has no close after it, no later open can
 * have one either, so the scan stops there instead of retrying from each
 * remaining open.
 */
function stripPaired(input: string, open: RegExp, close: RegExp): string {
  let out = "";
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(input);
    if (!o) break;
    close.lastIndex = o.index + o[0].length;
    const c = close.exec(input);
    if (!c) break;
    out += input.slice(pos, o.index);
    pos = c.index + c[0].length;
  }
  return out + input.slice(pos);
}

/**
 * Remove tags the way a global `start[^>]*>` replace would: in each run from a
 * `<` to the next `>`, drop the text from the first `start` match through that
 * `>`, when `when` (if given) also matches from that point. A `<` with no `>`
 * after it can never close a tag, so the scan ends at the last `>`. Neither
 * regex may carry the `g` or `y` flag.
 */
function stripTags(input: string, start: RegExp, when?: RegExp): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const lt = input.indexOf("<", pos);
    if (lt === -1) break;
    const gt = input.indexOf(">", lt + 1);
    if (gt === -1) break;
    const tag = input.slice(lt, gt + 1);
    const m = start.exec(tag);
    out += input.slice(pos, lt);
    out += m && (!when || when.test(tag.slice(m.index))) ? tag.slice(0, m.index) : tag;
    pos = gt + 1;
  }
  return out + input.slice(pos);
}

const DANGEROUS_HREF = /((?:xlink:)?href)\s*=\s*(?:(["'])\s*)?(?:javascript|data|file|https?):/gi;
const IMAGE_TAG = /^<(?:[A-Za-z_][\w.-]*:)?image[\t\n\f\r />]/;
const ATTRIBUTE_SEPARATOR = /[\t\n\f\r ]/;
// The whole attribute value, not a prefix: no MIME parameters, nothing after
// the payload. `image/svg+xml` is left out because it can carry script.
const RASTER_DATA_URI =
  /^[\t\n\f\r ]*data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\t\n\f\r ]*)$/i;

/**
 * True when the DANGEROUS_HREF match at `offset` in `tag` is a quoted `href`
 * or `xlink:href` whose entire value is a base64 PNG, JPEG, GIF or WebP that
 * really is that format and fits the remaining pixel budget, which it then
 * spends. Each value scan stops at the next quote of the same kind, so scans
 * for one quote kind never overlap.
 */
function keepRasterHref(
  tag: string,
  match: string,
  offset: number,
  quote: string | undefined,
  budget: { pixels: number },
): boolean {
  if (!quote || !ATTRIBUTE_SEPARATOR.test(tag[offset - 1] ?? "")) return false;
  const valueStart = offset + match.indexOf(quote) + 1;
  const valueEnd = tag.indexOf(quote, valueStart);
  if (valueEnd === -1) return false;
  const raster = RASTER_DATA_URI.exec(tag.slice(valueStart, valueEnd));
  if (!raster) return false;
  const type = raster[1].toLowerCase() as EmbeddedRasterType;
  const size = readEmbeddedRasterSize(type, Buffer.from(raster[2], "base64"));
  if (!size || size.width < 1 || size.height < 1) return false;
  if (size.width > MAX_RESIZE_OUTPUT_DIMENSION || size.height > MAX_RESIZE_OUTPUT_DIMENSION) {
    return false;
  }
  const pixels = size.width * size.height;
  if (pixels > budget.pixels) return false;
  budget.pixels -= pixels;
  return true;
}

function blockHrefSchemes(text: string, budget: { pixels: number } | null): string {
  return text.replace(
    DANGEROUS_HREF,
    (match, name: string, quote: string | undefined, offset: number) =>
      budget && keepRasterHref(text, match, offset, quote, budget)
        ? match
        : `${name}=${quote ?? ""}data:,`,
  );
}

/**
 * Index of the `>` that ends the tag opened at `lt`, or -1. Unlike stripTags
 * this skips a `>` inside a quoted attribute value, the way XML and HTML
 * parsers do, so `<a title=">" <image href=...>` reads as one <a> tag rather
 * than an <a> followed by an <image>. A quote only opens a value right after
 * `=`, as in HTML, where a stray quote elsewhere is a literal character.
 */
function tagEnd(input: string, lt: number): number {
  if (input.startsWith("<!--", lt)) {
    const close = input.indexOf("-->", lt + 4);
    return close === -1 ? -1 : close + 2;
  }
  let afterEquals = false;
  for (let i = lt + 1; i < input.length; i++) {
    const ch = input[i];
    if (ch === ">") return i;
    if ((ch === '"' || ch === "'") && afterEquals) {
      i = input.indexOf(ch, i + 1);
      if (i === -1) return -1;
      afterEquals = false;
    } else if (ch === "=") {
      afterEquals = true;
    } else if (!ATTRIBUTE_SEPARATOR.test(ch)) {
      afterEquals = false;
    }
  }
  return -1;
}

/**
 * Neutralize javascript:, data:, file: and http(s): in href / xlink:href,
 * except a base64 raster on an <image> tag. Logos exported from design tools
 * embed bitmaps that way, and blanking them left a hole in the render (#5101).
 * Segments always start at a `<` and end at a `>`, and a DANGEROUS_HREF match
 * never contains either, so splitting there finds exactly the matches a
 * whole-document replace would; it only adds knowing which tag each sits in.
 */
function neutralizeHrefSchemes(input: string): string {
  // Total pixels the embedded rasters of one SVG may declare. librsvg decodes
  // every one at full size and keeps it for the render, so without a budget a
  // couple of MB of small, highly compressed PNGs cost GBs of memory. Read here
  // rather than at module load, where a partial mock of @snapotter/shared in a
  // test that only imports this module transitively would throw.
  const budget = { pixels: MAX_RESIZE_OUTPUT_PIXELS };
  let out = "";
  let pos = 0;
  for (;;) {
    const lt = input.indexOf("<", pos);
    if (lt === -1) break;
    const gt = tagEnd(input, lt);
    if (gt === -1) break;
    const tag = input.slice(lt, gt + 1);
    out += blockHrefSchemes(input.slice(pos, lt), null);
    out += blockHrefSchemes(tag, IMAGE_TAG.test(tag) ? budget : null);
    pos = gt + 1;
  }
  return out + blockHrefSchemes(input.slice(pos), null);
}

/** Count matches of a `g` regex, stopping once the count passes `limit`. */
function countMatches(input: string, pattern: RegExp, limit: number): number {
  pattern.lastIndex = 0;
  let n = 0;
  while (n <= limit && pattern.exec(input)) n++;
  return n;
}

/**
 * Source for a whole `<!DOCTYPE ...>` declaration, including an internal
 * subset. Each `(?:[^...]|"[^"]*"|'[^']*')*` run skips double- and
 * single-quoted strings so a `>` or `]` inside a quoted value (an entity
 * value, a system id) does not terminate the match early and leave the rest
 * of the DOCTYPE behind. Kept as a string so it can be reused anchored (SVG
 * detection) and unanchored/global (sanitization) without sharing regex
 * lastIndex state.
 */
const DOCTYPE_SOURCE =
  "<!DOCTYPE\\b(?:[^>[\\]\"']|\"[^\"]*\"|'[^']*')*(?:\\[(?:[^\\]\"']|\"[^\"]*\"|'[^']*')*\\]\\s*)?>";
const DOCTYPE_PATTERN = new RegExp(DOCTYPE_SOURCE, "gi");

/**
 * Sanitize an SVG buffer to prevent XXE, SSRF, and script injection.
 * Throws if the SVG exceeds the maximum allowed size.
 */
const MAX_SVG_ELEMENTS = 5_000;

/**
 * A rejection of an SVG that is too large or too complex to sanitize. It
 * carries statusCode 400 so the HTTP error handler returns the reason as a
 * 4xx (not a generic 500) and skips Sentry. The BullMQ worker classifies by
 * error name, not statusCode, so its handling of a rejected tool input is
 * unchanged. Callers therefore let sanitizeSvg throw and get a clean 400 with
 * a message the user can act on, rather than a swallowed generic error.
 */
function svgLimitError(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

export function sanitizeSvg(buffer: Buffer): Buffer {
  const maxSvgSize = env.MAX_SVG_SIZE_MB > 0 ? env.MAX_SVG_SIZE_MB * 1024 * 1024 : Infinity;
  if (buffer.length > maxSvgSize) {
    throw svgLimitError(`SVG exceeds maximum size of ${env.MAX_SVG_SIZE_MB}MB`);
  }
  let svg = buffer.toString("utf-8");

  // ── Pre-processing: strip CDATA sections and decode numeric entities ──
  // CDATA sections can hide script content from regex-based checks.
  svg = stripPaired(svg, /<!\[CDATA\[/gi, /\]\]>/g);

  // Decode numeric entities so obfuscated URIs (e.g. &#106;avascript:) are visible.
  // Repeat until stable: one pass can assemble a new reference from characters
  // it just decoded (`&#&#49;06;` -> `&#106;`), which would leave a live
  // `javascript:` reference in the output. Each pass shortens the string.
  svg = stripUntilStable(svg, decodeNumericEntities);

  // `&#60;` stays encoded, so only raw openings reach the passes below.
  // An opening counts whether or not a `>` ever closes it: unterminated
  // openings are exactly what makes the later passes expensive.
  if (countMatches(svg, /<[A-Za-z_]/g, MAX_SVG_ELEMENTS) > MAX_SVG_ELEMENTS) {
    throw svgLimitError(`SVG exceeds maximum element count of ${MAX_SVG_ELEMENTS}`);
  }

  // ── Pre-processing: normalize whitespace/null bytes inside href values ──
  // Catches obfuscated schemes like "java\nscript:", "java\x00script:", "java\tscript:"
  // by stripping control characters (0x00-0x1F) and DEL (0x7F) from href attribute values.
  svg = svg.replace(/((?:xlink:)?href\s*=\s*["'])([^"']*)(["'])/gi, (_m, prefix, value, suffix) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-char stripping for security
    const cleaned = value.replace(/[\x00-\x1f\x7f]/g, "");
    return `${prefix}${cleaned}${suffix}`;
  });

  // Remove DOCTYPE (XXE prevention, including internal subsets). The subset
  // and external-id patterns skip over quoted strings so a '>' or ']' inside
  // a quoted entity value (e.g. `<!ENTITY z "]">`) cannot end the match early
  // and leave the rest of the DOCTYPE, entity declarations included, behind.
  // A document has at most one DOCTYPE. Refusing more keeps the regex to a
  // single start (many unterminated `<!DOCTYPE` would each rescan the rest of
  // the input), and repeating until stable stops a DOCTYPE that only forms once
  // an inner one is removed (`<!DOC<!DOCTYPE x>TYPE ...>`).
  if (countMatches(svg, /<!DOCTYPE\b/gi, 1) > 1) {
    throw svgLimitError("SVG contains more than one DOCTYPE");
  }
  svg = stripUntilStable(svg, (s) => s.replace(DOCTYPE_PATTERN, ""));
  // Remove XML processing instructions except <?xml version...?>
  svg = svg.replace(/<\?(?!xml\s)[^?]*\?>/gi, "");
  // Remove XInclude elements and namespace declarations
  svg = stripUntilStable(svg, (s) => stripTags(s, /</, /\bxi:include\b/i));
  svg = svg.replace(/xmlns:xi\s*=\s*["'][^"']*["']/gi, "");

  // ── Strip dangerous elements ──
  // For each dangerous element remove the paired form (with a whitespace-tolerant
  // end tag, e.g. `</script >`), the self-closing form, and any residual open or
  // close tag -- repeating until stable so nested or overlapping tags cannot
  // survive a single pass (foreignObject/iframe/embed can embed HTML; set/animate
  // can inject attributes/URIs at runtime).
  // animateTransform/animateMotion/animateColor are distinct element names (a
  // word boundary stops the "animate" pattern from matching them), and <handler>
  // is the SVG-Tiny event-handler element; all can carry runtime script/URIs.
  // `NS` is an optional namespace prefix (e.g. `x:` in `<x:script>` or `svg:`
  // in `<svg:foreignObject>`). librsvg honours a prefixed element the same as
  // the bare name, so the strip patterns must too; matching only the bare name
  // let `<x:script>` through.
  const NS = "(?:[A-Za-z_][\\w.-]*:)?";
  for (const tag of [
    "script",
    "foreignObject",
    "iframe",
    "embed",
    "set",
    "animate",
    "animateTransform",
    "animateMotion",
    "animateColor",
    "handler",
    "mpath",
  ]) {
    const open = new RegExp(`<${NS}${tag}\\b`, "gi");
    const openTag = new RegExp(`<${NS}${tag}\\b`, "i");
    const close = new RegExp(`<\\/${NS}${tag}\\s*>`, "gi");
    svg = stripUntilStable(
      svg,
      (s) => stripPaired(s, open, close),
      (s) => stripTags(s, openTag),
      (s) => s.replace(close, ""),
    );
  }

  // Remove event handlers (onload, onclick, onerror, etc.)
  // Replace both the attribute name and its value to prevent residual payloads.
  svg = svg.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, 'data-removed=""');
  svg = svg.replace(/\bon\w+\s*=\s*\S+/gi, 'data-removed=""');

  // ── Block <use> with external href (before generic href blocking) ──
  // `href` also matches the tail of `xlink:href`.
  svg = stripTags(svg, /<use\b/i, /href\s*=\s*["']https?:\/\//i);

  // ── Block <feImage> with external href (SSRF via SVG filter) ──
  svg = stripTags(svg, /<feImage\b/i, /href\s*=\s*["'](?:https?:\/\/|file:|data:)/i);

  // ── Block dangerous URI schemes in href / xlink:href ──
  // One pass covers javascript:, data:, file:, and http(s): on both `href` and
  // `xlink:href`, tolerating unquoted values and leading whitespace before the
  // scheme (browsers trim it) which the older per-scheme patterns missed. The
  // captures preserve the `xlink:` prefix and the opening quote the input used,
  // so the neutralized attribute stays well-formed: writing a fixed `"` here
  // left `href='...` unbalanced (#5056). Durable follow-up: replace this regex
  // sanitizer with an XML parse + allowlist, which is the real fix for regex
  // whack-a-mole. The one exception is a base64 raster on <image> (#5101).
  svg = neutralizeHrefSchemes(svg);

  // ── Block dangerous schemes in url() values ──
  // Keep the url()'s own quote, if any. Inserting one broke the enclosing
  // attribute: `fill="url(data:...)"` became `fill="url("data:,...)"` (#5056).
  // In both patterns the whitespace after the quote sits inside the optional
  // group, so two `\s*` runs are never adjacent and a long run of spaces
  // cannot be split two ways (that backtracking is quadratic). Named entities
  // and references to quotes are not decoded above, and an XML parser turns
  // `url(&quot;https://...` or `url(&#34;https://...` back into a quoted URL,
  // so those count as quotes here too.
  svg = svg.replace(
    /url\s*\(\s*(?:(["']|&quot;|&apos;|&#0*(?:34|39);|&#[xX]0*2[27];)\s*)?(?:https?:\/\/|file:|data:)/gi,
    "url($1data:,",
  );

  return Buffer.from(svg, "utf-8");
}

const MAX_SVGZ_DECOMPRESSED_SIZE = 50 * 1024 * 1024;

/**
 * Decompress an SVGZ (gzip-compressed SVG) buffer.
 * Returns the buffer unchanged if it is not gzip-compressed.
 * Throws on decompression bomb or invalid SVG content.
 */
export function decompressSvgz(buffer: Buffer): Buffer {
  if (buffer.length < 2 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
    return buffer;
  }
  const decompressed = gunzipSync(buffer, { maxOutputLength: MAX_SVGZ_DECOMPRESSED_SIZE });
  if (!isSvgBuffer(decompressed)) {
    throw new Error("SVGZ file does not contain valid SVG content after decompression");
  }
  return decompressed;
}

/**
 * True when an error thrown from decompressSvgz() or sanitizeSvg() is a client
 * input rejection (400) rather than an unexpected sanitizer crash (500):
 *  - statusCode === 400 from sanitizeSvg() size/element caps
 *  - Z_DATA_ERROR / Z_BUF_ERROR from malformed or truncated gzip streams
 *  - RangeError (ERR_BUFFER_TOO_LARGE) when gunzipSync hits MAX_SVGZ_DECOMPRESSED_SIZE,
 *    excluding V8 "Array buffer allocation failed" OOMs (#3675)
 */
export function isSvgzClientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (
    (err as { statusCode?: number }).statusCode === 400 ||
    (err as { code?: string }).code === "Z_DATA_ERROR" ||
    (err as { code?: string }).code === "Z_BUF_ERROR" ||
    (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ||
    (err instanceof RangeError && !err.message.startsWith("Array buffer allocation failed"))
  );
}

/**
 * True when an error thrown from decompressSvgz() or sanitizeSvg() on an image
 * intake path is a client SVG/SVGZ rejection (400) rather than an unexpected
 * runtime fault (500), including a gzip stream whose decompressed payload is
 * not SVG content.
 */
export function isSvgClientError(err: unknown): boolean {
  return (
    isSvgzClientError(err) ||
    (err instanceof Error && err.message.includes("SVGZ file does not contain"))
  );
}

const SVG_PROLOG_COMMENT = /^<!--[\s\S]*?-->\s*/;
const SVG_PROLOG_PI = /^<\?[\s\S]*?\?>\s*/;
const SVG_PROLOG_DOCTYPE = new RegExp(`^${DOCTYPE_SOURCE}\\s*`, "i");
// The first element must be an <svg>, optionally namespace-prefixed
// (`<svg:svg>`); the trailing `[\s/>]` stops it matching `<svgfoo>`.
const SVG_ROOT_ELEMENT = /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/i;

/** How far into a buffer isSvgBuffer() looks for the root element. */
export const SVG_SNIFF_BYTES = 4096;

/**
 * Check whether a buffer looks like SVG content.
 *
 * Examines the first 4KB. An SVG can open with an XML declaration, comments,
 * or a DOCTYPE before the root element, so those are stripped first and the
 * check keys off the FIRST element being an `<svg>`. Keying off a bare
 * substring instead would both miss a payload SVG whose first construct is a
 * DOCTYPE and misfire on an HTML document that merely embeds an inline `<svg>`.
 */
export function isSvgBuffer(buffer: Buffer): boolean {
  let start = 0;
  while (
    start < buffer.length &&
    (buffer[start] === 0x20 ||
      buffer[start] === 0x09 ||
      buffer[start] === 0x0a ||
      buffer[start] === 0x0d ||
      buffer[start] === 0x0c)
  ) {
    start++;
  }
  let head = buffer
    .subarray(start, start + SVG_SNIFF_BYTES)
    .toString("utf-8")
    .trim();
  let prev: string;
  do {
    prev = head;
    head = head
      .replace(SVG_PROLOG_COMMENT, "")
      .replace(SVG_PROLOG_PI, "")
      .replace(SVG_PROLOG_DOCTYPE, "");
  } while (head !== prev);
  return SVG_ROOT_ELEMENT.test(head);
}
