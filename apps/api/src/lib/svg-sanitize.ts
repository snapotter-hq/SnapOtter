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
 * Sanitize an SVG buffer to prevent XXE, SSRF, and script injection.
 * Throws if the SVG exceeds the maximum allowed size.
 */
export function sanitizeSvg(buffer: Buffer): Buffer {
  const maxSvgSize = env.MAX_SVG_SIZE_MB > 0 ? env.MAX_SVG_SIZE_MB * 1024 * 1024 : Infinity;
  if (buffer.length > maxSvgSize) {
    throw new Error(`SVG exceeds maximum size of ${env.MAX_SVG_SIZE_MB}MB`);
  }
  let svg = buffer.toString("utf-8");

  // ── Pre-processing: strip CDATA sections and decode numeric entities ──
  // CDATA sections can hide script content from regex-based checks.
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");
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

  // Remove DOCTYPE (XXE prevention, including internal subsets)
  svg = svg.replace(/<!DOCTYPE[^>[]*(?:\[[^\]]*\])?>/gi, "");
  // Remove XML processing instructions except <?xml version...?>
  svg = svg.replace(/<\?(?!xml\s)[^?]*\?>/gi, "");
  // Remove XInclude elements and namespace declarations
  svg = svg.replace(/<[^>]*xi:include[^>]*\/?>/gi, "");
  svg = svg.replace(/xmlns:xi\s*=\s*["'][^"']*["']/gi, "");

  // ── Strip dangerous elements ──
  // Remove script tags (including nested inside <svg>)
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/<script[^>]*\/>/gi, "");
  // Remove foreignObject elements (can embed arbitrary HTML)
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  svg = svg.replace(/<foreignObject[^>]*\/>/gi, "");
  // Remove iframe elements (non-SVG, can load external content)
  svg = svg.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  svg = svg.replace(/<iframe[^>]*\/>/gi, "");
  // Remove embed elements (non-SVG, can load external content)
  svg = svg.replace(/<embed[\s\S]*?<\/embed>/gi, "");
  svg = svg.replace(/<embed[^>]*\/>/gi, "");
  // Remove <set> elements (can inject attributes/URIs at runtime)
  svg = svg.replace(/<set[\s\S]*?<\/set>/gi, "");
  svg = svg.replace(/<set\b[^>]*\/>/gi, "");
  // Remove <animate> elements (can inject attributes/URIs at runtime)
  svg = svg.replace(/<animate[\s\S]*?<\/animate>/gi, "");
  svg = svg.replace(/<animate\b[^>]*\/>/gi, "");

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

  // ── Block dangerous URI schemes in href attributes ──
  svg = svg.replace(/xlink:href\s*=\s*["']https?:\/\//gi, 'xlink:href="data:,');
  svg = svg.replace(/href\s*=\s*["']https?:\/\//gi, 'href="data:,');
  svg = svg.replace(/href\s*=\s*["']javascript:/gi, 'href="data:,');
  // Block ALL data: URIs in href (not just data:text/html)
  svg = svg.replace(/href\s*=\s*["']data:/gi, 'href="data:,');
  svg = svg.replace(/href\s*=\s*["']file:/gi, 'href="data:,');

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

/**
 * Check whether a buffer looks like SVG content.
 * Examines the first 4KB for an <svg tag.
 */
export function isSvgBuffer(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString("utf-8").trim();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}
