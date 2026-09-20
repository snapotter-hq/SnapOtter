import { gunzipSync } from "node:zlib";
import { env } from "../config.js";

/**
 * Decode common HTML/XML numeric character references (&#xNN; and &#NNN;)
 * so that obfuscated `javascript:` / `data:` URIs are caught by later regex passes.
 */
function decodeNumericEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
}

/**
 * Apply removal regexes repeatedly until the string stops changing, so that
 * nested or overlapping dangerous tags (e.g. `<scr<script>ipt>`) cannot survive
 * a single pass.
 */
function stripUntilStable(input: string, ...patterns: RegExp[]): string {
  let prev: string;
  let out = input;
  do {
    prev = out;
    for (const pattern of patterns) out = out.replace(pattern, "");
  } while (out !== prev);
  return out;
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
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");

  const elementCount = (svg.match(/<[a-zA-Z][^>]*\/?>/g) || []).length;
  if (elementCount > MAX_SVG_ELEMENTS) {
    throw svgLimitError(`SVG exceeds maximum element count of ${MAX_SVG_ELEMENTS}`);
  }
  // Decode numeric entities so obfuscated URIs (e.g. &#106;avascript:) are visible.
  svg = decodeNumericEntities(svg);

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
  svg = svg.replace(DOCTYPE_PATTERN, "");
  // Remove XML processing instructions except <?xml version...?>
  svg = svg.replace(/<\?(?!xml\s)[^?]*\?>/gi, "");
  // Remove XInclude elements and namespace declarations
  svg = stripUntilStable(svg, /<[^>]*\bxi:include\b[^>]*\/?>/gi);
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
    svg = stripUntilStable(
      svg,
      new RegExp(`<${NS}${tag}\\b[\\s\\S]*?<\\/${NS}${tag}\\s*>`, "gi"),
      new RegExp(`<${NS}${tag}\\b[^>]*>`, "gi"),
      new RegExp(`<\\/${NS}${tag}\\s*>`, "gi"),
    );
  }

  // Remove event handlers (onload, onclick, onerror, etc.)
  // Replace both the attribute name and its value to prevent residual payloads.
  svg = svg.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, 'data-removed=""');
  svg = svg.replace(/\bon\w+\s*=\s*\S+/gi, 'data-removed=""');

  // ── Block <use> with external href (before generic href blocking) ──
  svg = svg.replace(/<use\b[^>]*href\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi, "");
  svg = svg.replace(/<use\b[^>]*xlink:href\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi, "");

  // ── Block <feImage> with external href (SSRF via SVG filter) ──
  svg = svg.replace(/<feImage\b[^>]*href\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi, "");
  svg = svg.replace(/<feImage\b[^>]*xlink:href\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi, "");
  svg = svg.replace(/<feImage\b[^>]*href\s*=\s*["']file:[^"']*["'][^>]*\/?>/gi, "");
  svg = svg.replace(/<feImage\b[^>]*href\s*=\s*["']data:[^"']*["'][^>]*\/?>/gi, "");

  // ── Block dangerous URI schemes in href / xlink:href ──
  // One pass covers javascript:, data:, file:, and http(s): on both `href` and
  // `xlink:href`, tolerating unquoted values and leading whitespace before the
  // scheme (browsers trim it) which the older per-scheme patterns missed. The
  // capture preserves the `xlink:` prefix so the neutralized attribute stays
  // well-formed. Durable follow-up: replace this regex sanitizer with an XML
  // parse + allowlist, which is the real fix for regex whack-a-mole.
  svg = svg.replace(
    /((?:xlink:)?href)\s*=\s*(?:["']\s*)?(?:javascript|data|file|https?):/gi,
    '$1="data:,',
  );

  // ── Block dangerous schemes in url() values ──
  svg = svg.replace(/url\s*\(\s*["']?https?:\/\//gi, 'url("data:,');
  svg = svg.replace(/url\s*\(\s*["']?file:/gi, 'url("data:,');
  svg = svg.replace(/url\s*\(\s*["']?data:/gi, 'url("data:,');

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

const SVG_PROLOG_COMMENT = /^<!--[\s\S]*?-->\s*/;
const SVG_PROLOG_PI = /^<\?[\s\S]*?\?>\s*/;
const SVG_PROLOG_DOCTYPE = new RegExp(`^${DOCTYPE_SOURCE}\\s*`, "i");
// The first element must be an <svg>, optionally namespace-prefixed
// (`<svg:svg>`); the trailing `[\s/>]` stops it matching `<svgfoo>`.
const SVG_ROOT_ELEMENT = /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/i;

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
  let head = buffer.subarray(0, 4096).toString("utf-8").trim();
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
